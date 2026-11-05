import { NextRequest } from "next/server";
import { createServerClient } from "@supabase/ssr";
import { runRagPipeline } from "@/lib/rag";
import { checkRateLimit } from "@/lib/rateLimit";
import { supabaseServer } from "@/lib/supabase";
import { extractStudentFacts, updateRollingSummary } from "@/lib/memory";
import { classifyIntent, getSmallTalkReply, getPersonalReply } from "@/lib/intent";
import { checkAnswerCompleteness } from "@/lib/completeness";
import { continueAnswer } from "@/lib/gemini";

export const maxDuration = 60;

function getClientIdentifier(req: Request, userId?: string | null): string {
  if (userId && typeof userId === "string" && userId.trim()) {
    return `user:${userId.trim()}`;
  }
  const authHeader = req.headers.get("authorization");
  if (authHeader && authHeader.startsWith("Bearer ")) {
    const token = authHeader.slice(7).trim();
    if (token) return `token:${token.slice(0, 32)}`;
  }
  const forwarded = req.headers.get("x-forwarded-for");
  if (forwarded) {
    const ip = forwarded.split(",")[0].trim();
    if (ip) return `ip:${ip}`;
  }
  const realIp = req.headers.get("x-real-ip");
  if (realIp) return `ip:${realIp.trim()}`;
  return "ip:anonymous";
}

export async function POST(req: NextRequest) {
  try {
    const body = await req.json();
    const { question, subjectIds, history, chatId, userId: bodyUserId, webSearch } = body;

    // 1. Resolve authenticated user from session cookie or fallback body
    const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL || "";
    const supabaseKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY || process.env.SUPABASE_SERVICE_ROLE_KEY || "";

    const ssrClient = createServerClient(supabaseUrl, supabaseKey, {
      cookies: {
        getAll() {
          return req.cookies.getAll();
        },
        setAll() {},
      },
    });

    const { data: authData } = await ssrClient.auth.getUser();
    let authUser = authData?.user || null;
    if (!authUser) {
      const authHeader = req.headers.get("authorization");
      if (authHeader && authHeader.startsWith("Bearer ")) {
        const token = authHeader.slice(7).trim();
        const { data: tokenData } = await supabaseServer.auth.getUser(token);
        authUser = tokenData?.user || null;
      }
    }
    const activeUserId = authUser?.id || bodyUserId || null;

    // 2. Rate Limit check
    const clientId = getClientIdentifier(req, activeUserId);
    const rateCheck = checkRateLimit(clientId);

    if (!rateCheck.allowed) {
      const waitMinutes = Math.max(1, Math.ceil(rateCheck.resetMs / 60000));
      return new Response(
        JSON.stringify({
          error: `You've asked 20 questions in the last 10 minutes. Please take a short break and try again in ${waitMinutes} minute${waitMinutes > 1 ? "s" : ""}.`,
          rateLimited: true,
        }),
        {
          status: 429,
          headers: { "Content-Type": "application/json" },
        }
      );
    }

    if (!question || typeof question !== "string" || !question.trim()) {
      return new Response(JSON.stringify({ error: "question is required" }), {
        status: 400,
        headers: { "Content-Type": "application/json" },
      });
    }

    // 3. Compute allowed subject_ids server-side
    let allowedSubjectIds: string[] = [];
    let isTeacher = false;

    if (activeUserId) {
      const { data: profile } = await supabaseServer
        .from("profiles")
        .select("role")
        .eq("id", activeUserId)
        .maybeSingle();

      isTeacher = profile?.role === "teacher" || authUser?.user_metadata?.role === "teacher";

      if (isTeacher) {
        const { data: allSubj } = await supabaseServer.from("subjects").select("id");
        allowedSubjectIds = (allSubj || []).map((s) => s.id);
      } else {
        const { data: members } = await supabaseServer
          .from("group_members")
          .select(`group_id, groups:group_id (subject_id)`)
          .eq("student_id", activeUserId);

        const subSet = new Set<string>();
        if (Array.isArray(members)) {
          for (const m of members as any[]) {
            const sid = m.groups?.subject_id;
            if (sid) subSet.add(sid);
          }
        }
        allowedSubjectIds = Array.from(subSet);
      }
    }

    // Compute effective subjectIds: IGNORE client-sent subjectIds outside allowed set
    let effectiveSubjectIds: string[] | undefined = undefined;
    if (allowedSubjectIds.length > 0) {
      if (Array.isArray(subjectIds) && subjectIds.length > 0) {
        const filtered = subjectIds.filter((id: string) => allowedSubjectIds.includes(id));
        effectiveSubjectIds = filtered.length > 0 ? filtered : allowedSubjectIds;
      } else {
        effectiveSubjectIds = allowedSubjectIds;
      }
    } else if (Array.isArray(subjectIds)) {
      effectiveSubjectIds = subjectIds;
    }

    // 4. Multi-chat: handle chat persistence & auto-title
    let activeChatId = chatId || null;
    let rollingSummary = "";

    if (activeUserId && activeChatId) {
      const { data: chatRow } = await supabaseServer
        .from("chats")
        .select("id, title, summary")
        .eq("id", activeChatId)
        .eq("user_id", activeUserId)
        .maybeSingle();

      if (chatRow) {
        rollingSummary = chatRow.summary || "";
        // Auto-title from first question (max 6 words) if title is still default
        if (chatRow.title === "New Chat" || !chatRow.title) {
          const autoTitle = question.trim().split(/\s+/).slice(0, 6).join(" ");
          await supabaseServer
            .from("chats")
            .update({ title: autoTitle, updated_at: new Date().toISOString() })
            .eq("id", activeChatId);
        }

        // Persist user message
        await supabaseServer.from("messages").insert({
          chat_id: activeChatId,
          role: "user",
          content: question.trim(),
        });
      }
    }

    // 5. Fetch student cross-chat facts for personalized pedagogical tone
    let studentFacts: string[] = [];
    if (activeUserId) {
      const { data: memoryRow } = await supabaseServer
        .from("user_memory")
        .select("facts")
        .eq("user_id", activeUserId)
        .maybeSingle();
      if (Array.isArray(memoryRow?.facts)) {
        studentFacts = memoryRow.facts;
      }
    }

    // Prepare history: rolling summary (if present) + last messages
    let enrichedHistory = Array.isArray(history) ? [...history] : [];
    if (rollingSummary && enrichedHistory.length > 0) {
      enrichedHistory = [
        { role: "system", content: `Context Summary of earlier discussion: ${rollingSummary}` },
        ...enrichedHistory.slice(-8),
      ];
    }

    // 6. Intent routing before retrieval
    const intent = await classifyIntent(question.trim());
    const encoder = new TextEncoder();

    if (intent === "SMALL_TALK") {
      const reply = getSmallTalkReply(question.trim());
      let updatedFacts = studentFacts;
      if (activeUserId) {
        updatedFacts = await extractStudentFacts(question.trim(), studentFacts);
        if (updatedFacts.length > studentFacts.length) {
          await supabaseServer.from("user_memory").upsert(
            { user_id: activeUserId, facts: updatedFacts, updated_at: new Date().toISOString() },
            { onConflict: "user_id" }
          );
        }
        if (activeChatId) {
          await supabaseServer.from("messages").insert({
            chat_id: activeChatId,
            role: "assistant",
            content: reply,
            sources: [],
            images: [],
            page_images: [],
            sections: [],
          });
        }
      }

      const stream = new ReadableStream({
        start(controller) {
          controller.enqueue(
            encoder.encode(
              `event: meta\ndata: ${JSON.stringify({ sources: [], images: [], pageImages: [], sections: [], refusal: false })}\n\n` +
              `event: token\ndata: ${JSON.stringify({ delta: reply })}\n\n` +
              `event: done\ndata: ${JSON.stringify({ answered: true, facts: updatedFacts, modelUsed: "local" })}\n\n`
            )
          );
          controller.close();
        },
      });

      return new Response(stream, {
        headers: {
          "Content-Type": "text/event-stream; charset=utf-8",
          "Cache-Control": "no-cache, no-transform",
          "Connection": "keep-alive",
        },
      });
    }

    if (intent === "PERSONAL") {
      const reply = await getPersonalReply(question.trim(), effectiveSubjectIds);
      let updatedFacts = studentFacts;
      if (activeUserId) {
        updatedFacts = await extractStudentFacts(question.trim(), studentFacts);
        if (updatedFacts.length > studentFacts.length) {
          await supabaseServer.from("user_memory").upsert(
            { user_id: activeUserId, facts: updatedFacts, updated_at: new Date().toISOString() },
            { onConflict: "user_id" }
          );
        }
        if (activeChatId) {
          await supabaseServer.from("messages").insert({
            chat_id: activeChatId,
            role: "assistant",
            content: reply,
            sources: [],
            images: [],
            page_images: [],
            sections: [],
          });
        }
      }

      const stream = new ReadableStream({
        start(controller) {
          controller.enqueue(
            encoder.encode(
              `event: meta\ndata: ${JSON.stringify({ sources: [], images: [], pageImages: [], sections: [], refusal: false })}\n\n` +
              `event: token\ndata: ${JSON.stringify({ delta: reply })}\n\n` +
              `event: done\ndata: ${JSON.stringify({ answered: true, facts: updatedFacts, modelUsed: "local" })}\n\n`
            )
          );
          controller.close();
        },
      });

      return new Response(stream, {
        headers: {
          "Content-Type": "text/event-stream; charset=utf-8",
          "Cache-Control": "no-cache, no-transform",
          "Connection": "keep-alive",
        },
      });
    }

    if (intent === "OTHER" && !webSearch) {
      const refusalText = "This topic isn't covered in your NCERT textbooks. Please ask questions related to your Class 11 curriculum.";
      let updatedFacts = studentFacts;
      if (activeUserId) {
        updatedFacts = await extractStudentFacts(question.trim(), studentFacts);
        if (updatedFacts.length > studentFacts.length) {
          await supabaseServer.from("user_memory").upsert(
            { user_id: activeUserId, facts: updatedFacts, updated_at: new Date().toISOString() },
            { onConflict: "user_id" }
          );
        }
        if (activeChatId) {
          await supabaseServer.from("messages").insert({
            chat_id: activeChatId,
            role: "assistant",
            content: refusalText,
            sources: [],
            images: [],
            page_images: [],
            sections: [],
          });
        }
      }

      const stream = new ReadableStream({
        start(controller) {
          controller.enqueue(
            encoder.encode(
              `event: meta\ndata: ${JSON.stringify({ sources: [], images: [], pageImages: [], sections: [], refusal: true })}\n\n` +
              `event: refusal\ndata: ${JSON.stringify({ message: refusalText })}\n\n` +
              `event: done\ndata: ${JSON.stringify({ answered: false, facts: updatedFacts, modelUsed: "local" })}\n\n`
            )
          );
          controller.close();
        },
      });

      return new Response(stream, {
        headers: {
          "Content-Type": "text/event-stream; charset=utf-8",
          "Cache-Control": "no-cache, no-transform",
          "Connection": "keep-alive",
        },
      });
    }

    // 7. Execute RAG Pipeline for QUESTION intent
    const result = await runRagPipeline({
      question: question.trim(),
      subjectIds: effectiveSubjectIds,
      history: enrichedHistory,
      userId: activeUserId,
      chatId: activeChatId,
      webSearch: !!webSearch,
      isTeacher,
    });

    if (result.refusal) {
      let updatedFacts = studentFacts;
      if (activeUserId) {
        updatedFacts = await extractStudentFacts(question.trim(), studentFacts);
        if (updatedFacts.length > studentFacts.length) {
          await supabaseServer.from("user_memory").upsert(
            { user_id: activeUserId, facts: updatedFacts, updated_at: new Date().toISOString() },
            { onConflict: "user_id" }
          );
        }
      }

      // If refusal and chat exists, persist refusal message without sources/figures
      if (activeChatId) {
        await supabaseServer.from("messages").insert({
          chat_id: activeChatId,
          role: "assistant",
          content: result.refusalText,
          sources: [],
          images: [],
          page_images: [],
          sections: [],
        });
      }

      const stream = new ReadableStream({
        start(controller) {
          controller.enqueue(
            encoder.encode(
              `event: meta\ndata: ${JSON.stringify({
                ...result.metadata,
                sources: [],
                images: [],
                pageImages: [],
                sections: [],
                refusal: true,
              })}\n\n` +
              `event: refusal\ndata: ${JSON.stringify({ message: result.refusalText })}\n\n` +
              `event: done\ndata: ${JSON.stringify({ answered: false, facts: updatedFacts })}\n\n`
            )
          );
          controller.close();
        },
      });

      return new Response(stream, {
        headers: {
          "Content-Type": "text/event-stream; charset=utf-8",
          "Cache-Control": "no-cache, no-transform",
          "Connection": "keep-alive",
        },
      });
    }

    let assistantFullText = "";
    const meta = result.metadata;

    const stream = new ReadableStream({
      async start(controller) {
        try {
          for await (const evt of result.stream!) {
            if (evt.type === "token") {
              assistantFullText += evt.data.delta;
              controller.enqueue(encoder.encode(`event: ${evt.type}\ndata: ${JSON.stringify(evt.data)}\n\n`));
            } else if (evt.type === "cutoff") {
              // Defer cutoff evaluation to done-handler safety net
              continue;
            } else if (evt.type === "done") {
              let isCutoff = !!evt.data.cutoff;

              // Safety net: check completeness on answered responses with non-empty text
              if (evt.data.answered !== false && assistantFullText.trim().length > 0) {
                const initialCheck = checkAnswerCompleteness(assistantFullText);
                if (!initialCheck.complete) {
                  console.warn(
                    `[Ask Route Safety Net] Incomplete response at stream done (${initialCheck.reason}). Triggering safety net continuation...`
                  );
                  try {
                    const extra = await continueAnswer(question.trim(), assistantFullText);
                    if (extra && extra.trim().length > 0) {
                      assistantFullText += extra;
                      controller.enqueue(
                        encoder.encode(`event: token\ndata: ${JSON.stringify({ delta: extra })}\n\n`)
                      );
                    }
                  } catch (contErr) {
                    console.error("[Ask Route Safety Net] Error in continuation:", contErr);
                  }
                  const finalCheck = checkAnswerCompleteness(assistantFullText);
                  if (!finalCheck.complete) {
                    isCutoff = true;
                    controller.enqueue(
                      encoder.encode(
                        `event: cutoff\ndata: ${JSON.stringify({
                          message: "Answer was cut off, regenerate",
                          cutoff: true,
                        })}\n\n`
                      )
                    );
                  } else {
                    isCutoff = false;
                  }
                }
              }

              // Extract student facts before emitting done event so facts are delivered immediately
              let updatedFacts = studentFacts;
              if (activeUserId) {
                try {
                  updatedFacts = await extractStudentFacts(question.trim(), studentFacts);
                  if (updatedFacts.length > studentFacts.length) {
                    await supabaseServer.from("user_memory").upsert(
                      {
                        user_id: activeUserId,
                        facts: updatedFacts,
                        updated_at: new Date().toISOString(),
                      },
                      { onConflict: "user_id" }
                    );
                  }
                } catch (e) {
                  console.warn("Memory extraction error during stream completion:", e);
                }
              }
              const donePayload = { ...evt.data, cutoff: isCutoff, facts: updatedFacts };
              controller.enqueue(encoder.encode(`event: done\ndata: ${JSON.stringify(donePayload)}\n\n`));
            } else {
              controller.enqueue(encoder.encode(`event: ${evt.type}\ndata: ${JSON.stringify(evt.data)}\n\n`));
            }
          }

          // Strip any residual [[COVERED]] or [[NOT_COVERED]] markers from text before database insertion
          const cleanFullText = assistantFullText.replace(/\[\[(?:NOT_)?COVERED\]\]\s*/g, "").trim();

          // After stream completes, handle background persistence & summaries
          if (activeUserId && activeChatId) {
            const msgPayload: any = {
              chat_id: activeChatId,
              role: "assistant",
              content: cleanFullText,
              sources: meta.sources || [],
              images: meta.images || [],
              page_images: meta.pageImages || [],
              sections: meta.sections || [],
            };
            if (meta.webSources && meta.webSources.length > 0) {
              msgPayload.web_sources = meta.webSources;
            }

            let { error: msgErr } = await supabaseServer.from("messages").insert(msgPayload);
            if (msgErr && msgErr.message?.includes("web_sources")) {
              delete msgPayload.web_sources;
              await supabaseServer.from("messages").insert(msgPayload);
            }

            await supabaseServer
              .from("chats")
              .update({ updated_at: new Date().toISOString() })
              .eq("id", activeChatId);

            // Per-chat rolling summary: if chat has > 10 messages, update summary in background
            const { count } = await supabaseServer
              .from("messages")
              .select("id", { count: "exact", head: true })
              .eq("chat_id", activeChatId);

            if (count && count > 10) {
              const { data: recentMsgs } = await supabaseServer
                .from("messages")
                .select("role, content")
                .eq("chat_id", activeChatId)
                .order("created_at", { ascending: false })
                .limit(8);

              if (recentMsgs) {
                updateRollingSummary(rollingSummary, recentMsgs.reverse())
                  .then((updatedSum) => {
                    return supabaseServer
                      .from("chats")
                      .update({ summary: updatedSum })
                      .eq("id", activeChatId);
                  })
                  .catch((err) => console.warn("Failed background summary update:", err));
              }
            }
          }
        } catch (err: any) {
          console.error("Streaming error in /api/ask:", err);
          controller.enqueue(
            encoder.encode(
              `event: error\ndata: ${JSON.stringify({
                message: "The tutor is busy right now, please try again",
                retryable: true,
              })}\n\n`
            )
          );
        } finally {
          controller.close();
        }
      },
    });

    return new Response(stream, {
      headers: {
        "Content-Type": "text/event-stream; charset=utf-8",
        "Cache-Control": "no-cache, no-transform",
        "Connection": "keep-alive",
      },
    });
  } catch (err: any) {
    console.error("Error in /api/ask handler:", err);
    return new Response(JSON.stringify({ error: err.message || "Internal server error" }), {
      status: 500,
      headers: { "Content-Type": "application/json" },
    });
  }
}
