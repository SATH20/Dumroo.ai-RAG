/**
 * Gemini client utilities with multi-model and multi-key fallback,
 * finishReason tracking, and thinking budget control.
 */

import { checkAnswerCompleteness } from "./completeness";

export const EMBED_MODEL = process.env.EMBED_MODEL || "gemini-embedding-2";
export const EMBED_DIM = parseInt(process.env.EMBED_DIM || "768", 10);

export function getApiKeys(): string[] {
  const primary = process.env.GEMINI_API_KEY || "";
  const backup1 = process.env.GEMINI_API_KEY_BACKUP || "";
  const backup2 = process.env.GEMINI_API_KEY_BACKUP_2 || "";
  const keys: string[] = [];
  for (const k of [primary, backup1, backup2]) {
    if (k && !keys.includes(k)) {
      keys.push(k);
    }
  }
  return keys;
}

export function getChatModels(): string[] {
  const envModels = process.env.GEMINI_CHAT_MODELS || process.env.GEMINI_CHAT_MODEL || "";
  const models = envModels
    .split(",")
    .map((m) => m.trim())
    .filter((m) => m && m !== "gemini-flash-latest");
  if (models.length > 0) return models;
  return ["gemini-3.5-flash", "gemini-flash-lite-latest", "gemini-3.1-flash-lite"];
}

// In-memory 10-minute cooldown cache for models that return 429
const modelCooldowns = new Map<string, number>();

export function isModelInCooldown(model: string): boolean {
  const expiresAt = modelCooldowns.get(model);
  if (!expiresAt) return false;
  if (Date.now() > expiresAt) {
    modelCooldowns.delete(model);
    return false;
  }
  return true;
}

export function markModel429(model: string) {
  const TEN_MINUTES = 10 * 60 * 1000;
  modelCooldowns.set(model, Date.now() + TEN_MINUTES);
  console.warn(`[Gemini Cooldown] Model ${model} marked 429; skipping for 10 minutes.`);
}

function buildGenerationConfig(model: string, maxTokens: number, temperature: number = 0.2) {
  const config: Record<string, any> = {
    temperature,
    maxOutputTokens: maxTokens,
  };
  if (
    (model.includes("thinking") || model.includes("2.5") || model.includes("3.5")) &&
    !model.includes("flash-lite-latest")
  ) {
    config.thinkingConfig = { thinkingBudget: 0 };
  }
  return config;
}

/**
 * Execute a fetch against Google Gemini API for embeddings.
 */
async function fetchEmbeddingWithKeyFallback(
  endpointPath: string,
  body: Record<string, unknown>
): Promise<Response> {
  const keys = getApiKeys();
  if (keys.length === 0) throw new Error("No GEMINI_API_KEY configured.");

  let lastError: Error | null = null;
  const maxCycles = 2;

  for (let cycle = 0; cycle < maxCycles; cycle++) {
    for (let i = 0; i < keys.length; i++) {
      const key = keys[i];
      const url = `https://generativelanguage.googleapis.com/v1beta/${endpointPath}?key=${key}`;
      try {
        const response = await fetch(url, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(body),
        });
        if (response.ok) return response;

        const errText = await response.text();
        console.warn(`[Gemini Embed] Key ${i + 1} failed [${response.status}]: ${errText.slice(0, 120)}`);
        if (response.status === 429 || response.status >= 500) {
          lastError = new Error(`Gemini Embed Error [${response.status}]: ${errText}`);
          await new Promise((r) => setTimeout(r, 1000 + Math.random() * 500));
          continue;
        }
        throw new Error(`Gemini Embed Error [${response.status}]: ${errText}`);
      } catch (err: unknown) {
        lastError = err instanceof Error ? err : new Error(String(err));
      }
    }
  }

  throw lastError || new Error("All Gemini keys failed for embedding.");
}

/**
 * Generate embedding for a search query using gemini-embedding-2.
 */
export async function embedQuery(text: string): Promise<number[]> {
  const endpoint = `models/${EMBED_MODEL}:embedContent`;
  const body = {
    content: { parts: [{ text }] },
    taskType: "RETRIEVAL_QUERY",
    outputDimensionality: EMBED_DIM,
  };

  const res = await fetchEmbeddingWithKeyFallback(endpoint, body);
  const data = await res.json();
  const values = data?.embedding?.values;
  if (!Array.isArray(values) || values.length === 0) {
    throw new Error(`Invalid embedding response: ${JSON.stringify(data).slice(0, 120)}`);
  }
  return values;
}

/**
 * Execute a chat call trying ordered models, and for each model trying all keys on 429/503.
 */
async function fetchChatWithModelAndKeyFallback(
  pathSuffix: string,
  buildBody: (model: string) => Record<string, unknown>
): Promise<{ response: Response; modelUsed: string }> {
  const models = getChatModels();
  const keys = getApiKeys();

  let lastError: Error | null = null;

  for (const model of models) {
    if (isModelInCooldown(model)) {
      console.log(`[Gemini] Skipping ${model} (10m 429 cooldown active)`);
      continue;
    }
    let allKeys429 = true;
    for (let i = 0; i < keys.length; i++) {
      const key = keys[i];
      const url = `https://generativelanguage.googleapis.com/v1beta/models/${model}:${pathSuffix}${
        pathSuffix.includes("?") ? "&" : "?"
      }key=${key}`;

      const body = buildBody(model);

      try {
        const controller = new AbortController();
        const timeoutId = setTimeout(() => controller.abort(), 15000); // 15s TTFB timeout

        const response = await fetch(url, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(body),
          signal: controller.signal,
        });
        clearTimeout(timeoutId); // Headers received: clear timeout so stream is never aborted

        if (response.ok) {
          console.log(`[Gemini] Answered request using model: ${model} on key ${i + 1}/${keys.length}`);
          return { response, modelUsed: model };
        }

        const errText = await response.text();
        console.warn(
          `[Gemini Fallback] Model ${model} on key ${i + 1}/${keys.length} returned [${response.status}]: ${errText.slice(
            0,
            120
          )}`
        );

        if (response.status === 503) {
          allKeys429 = false;
          lastError = new Error(`Gemini [503] ${model}: ${errText}`);
          continue; // Try next key, then next model
        }

        if (response.status === 429) {
          lastError = new Error(`Gemini [429] ${model}: ${errText}`);
          continue; // Quota exhausted on this key, try next key
        }

        allKeys429 = false;
        // For non-fallback client errors (e.g. 400, 404), move to next model
        lastError = new Error(`Gemini [${response.status}] ${model}: ${errText}`);
        break;
      } catch (err: unknown) {
        allKeys429 = false;
        lastError = err instanceof Error ? err : new Error(String(err));
        const isAbort = (err instanceof Error && err.name === "AbortError") || String(err).includes("aborted");
        console.warn(
          `[Gemini Fallback] ${isAbort ? "TTFB Timeout (15s)" : "Exception"} with model ${model} key ${i + 1}/${keys.length}: ${lastError.message}`
        );
        continue; // Fall back to next key/model on real timeout or network failure
      }
    }
    if (allKeys429 && keys.length > 0) {
      markModel429(model);
    }
  }

  throw lastError || new Error("All configured Gemini chat models and keys failed.");
}

/**
 * Rewrite question into a self-contained search query if history exists.
 */
export async function rewriteQuery(
  question: string,
  history: Array<{ role: string; content: string; chapterIds?: string[] }>
): Promise<string> {
  if (!history || history.length === 0) {
    return question.trim();
  }

  const historyLines = history
    .slice(-6)
    .map((m) => `${m.role === "user" ? "Student" : "Assistant"}: ${m.content.slice(0, 600)}`)
    .join("\n\n");

  const prompt = `You are an expert search query optimizer for high school textbook retrieval across Physics, Chemistry, Biology, Mathematics, and History.

Rules:
1. TOPIC SWITCHES & SELF-CONTAINED QUESTIONS:
If the user's message is ALREADY a self-contained question or introduces a new topic (e.g. "what is a set", "explain hybridisation", "how does photosynthesis work", "Newton's second law", "what is momentum"), you MUST return the user's question UNCHANGED. NEVER append, prepend, or combine previous conversation topics into a question about a different subject or concept.

2. CONVERSATIONAL FOLLOW-UPS:
ONLY if the user's message is an incomplete follow-up that cannot be understood without the conversation history (e.g. "give me an example", "give another example", "explain it more", "why does this happen", "explain the light reaction in more detail"), rewrite it to include the specific topic from the conversation history (e.g. "Newton's second law examples", "examples of sets in mathematics", "photosynthesis light reaction").

Do NOT answer the question. Do NOT include markdown, explanations, or quotes. Output ONLY the standalone search query.

Conversation History:
${historyLines}

User's Last Message: ${question}

Standalone Query:`;

  try {
    const { response } = await fetchChatWithModelAndKeyFallback("generateContent", (model) => ({
      contents: [{ parts: [{ text: prompt }] }],
      generationConfig: buildGenerationConfig(model, 80, 0.0),
    }));

    const data = await response.json();
    const parts = data?.candidates?.[0]?.content?.parts;
    const candidateText = Array.isArray(parts)
      ? parts.map((p: any) => p?.text || "").join("").trim()
      : "";
    if (candidateText && candidateText.length > 2) {
      const rewritten = candidateText.replace(/^["']|["']$/g, "").trim();
      console.log(`[Query Rewriter] Original: "${question}" -> Rewritten: "${rewritten}"`);
      return rewritten;
    }
  } catch (err) {
    console.warn("Failed to rewrite query with LLM, falling back to original:", err);
  }

  return question.trim();
}

export interface StreamEventChunk {
  delta: string;
  finishReason?: string;
  isCutoff?: boolean;
  modelUsed?: string;
  continuationRan?: boolean;
}

/**
 * Removes boundary overlap between the end of base text and the start of continuation text.
 */
export function removeOverlap(base: string, continuation: string): string {
  const maxOverlap = Math.min(base.length, continuation.length, 120);
  for (let len = maxOverlap; len >= 3; len--) {
    if (base.endsWith(continuation.slice(0, len))) {
      return continuation.slice(len);
    }
  }
  return continuation;
}

/**
 * Stream answer from Gemini with multi-model fallback, in-stream error handling,
 * finishReason tracking, and strict completeness-based continuation.
 */
export async function* streamGeminiAnswer(
  systemInstruction: string,
  userPrompt: string
): AsyncIterable<StreamEventChunk> {
  const { response, modelUsed } = await fetchChatWithModelAndKeyFallback("streamGenerateContent?alt=sse", (model) => ({
    systemInstruction: { parts: [{ text: systemInstruction }] },
    contents: [{ parts: [{ text: userPrompt }] }],
    generationConfig: buildGenerationConfig(model, 4096, 0.2),
  }));

  if (!response.body) {
    throw new Error("No response body available for streaming from Gemini.");
  }

  const reader = response.body.getReader();
  const decoder = new TextDecoder();
  let buffer = "";
  let fullGeneratedText = "";
  let lastFinishReason: string | undefined = undefined;
  let continuationRan = false;

  while (true) {
    const { done, value } = await reader.read();
    if (done) break;

    buffer += decoder.decode(value, { stream: true });
    const lines = buffer.split("\n");
    buffer = lines.pop() || "";

    for (const line of lines) {
      const trimmed = line.trim();
      if (!trimmed.startsWith("data:")) continue;

      const jsonStr = trimmed.slice(5).trim();
      if (!jsonStr) continue;

      try {
        const parsed = JSON.parse(jsonStr);
        if (parsed?.error) {
          console.warn(`[Gemini Stream] In-stream SSE error: ${parsed.error.code} - ${parsed.error.message}`);
          lastFinishReason = parsed.error.status || `ERROR_${parsed.error.code}`;
          if (parsed.error.code === 429 || parsed.error.code === 503) {
            markModel429(modelUsed);
          }
          break;
        }

        const candidate = parsed?.candidates?.[0];
        const parts = candidate?.content?.parts;
        let text = "";
        if (Array.isArray(parts)) {
          for (const p of parts) {
            if (p?.text) text += p.text;
          }
        }
        if (candidate?.finishReason) {
          lastFinishReason = candidate.finishReason;
        }
        if (text) {
          fullGeneratedText += text;
          yield { delta: text, modelUsed };
        }
      } catch (e) {
        // partial json, continue
      }
    }
  }

  console.log(`[Gemini Stream] Model ${modelUsed} finished with finishReason: ${lastFinishReason || "NONE"}`);

  // Strip initial protocol marker before checking response completeness
  const cleanInitialForCheck = fullGeneratedText.replace(/^\s*\[\[(?:NOT_)?COVERED\]\]\s*/i, "");
  const initialCheck = checkAnswerCompleteness(cleanInitialForCheck);
  let isCutoff = lastFinishReason !== "STOP" || !initialCheck.complete;

  // If cut off, ended mid-sentence, or ended without STOP, attempt continuation
  if (isCutoff) {
    continuationRan = true;
    console.warn(
      `[Gemini Stream] Incomplete response detected (finishReason: ${
        lastFinishReason || "NONE"
      }, reason: ${initialCheck.reason}). Attempting continuation...`
    );
    try {
      const { response: contResponse, modelUsed: contModel } = await fetchChatWithModelAndKeyFallback(
        "streamGenerateContent?alt=sse",
        (model) => ({
          systemInstruction: {
            parts: [
              {
                text: "You are an expert academic tutor continuing an ongoing NCERT explanation. Output ONLY the immediate continuation of the text. Do NOT repeat any words or sentences from the previous response. Do NOT output [[COVERED]], [[NOT_COVERED]], greetings, or intro tags. Complete all unfinished sentences, LaTeX formulas, and citations with full accuracy.",
              },
            ],
          },
          contents: [
            { role: "user", parts: [{ text: userPrompt }] },
            { role: "model", parts: [{ text: fullGeneratedText }] },
            {
              role: "user",
              parts: [
                {
                  text: "Continue your response immediately from where you stopped. Do NOT repeat anything. Do NOT output [[COVERED]] or [[NOT_COVERED]]. Finish all sentences, formulas, and citations completely.",
                },
              ],
            },
          ],
          generationConfig: buildGenerationConfig(model, 2048, 0.2),
        })
      );

      if (contResponse.body) {
        const contReader = contResponse.body.getReader();
        let contBuffer = "";
        let contFinishReason: string | undefined = undefined;
        let isFirstContText = true;

        while (true) {
          const { done, value } = await contReader.read();
          if (done) break;
          contBuffer += decoder.decode(value, { stream: true });
          const contLines = contBuffer.split("\n");
          contBuffer = contLines.pop() || "";

          for (const line of contLines) {
            const trimmed = line.trim();
            if (!trimmed.startsWith("data:")) continue;
            const jsonStr = trimmed.slice(5).trim();
            if (!jsonStr) continue;
            try {
              const parsed = JSON.parse(jsonStr);
              if (parsed?.error) {
                console.warn(`[Gemini Continuation] In-stream SSE error: ${parsed.error.code}`);
                contFinishReason = parsed.error.status || `ERROR_${parsed.error.code}`;
                if (parsed.error.code === 429 || parsed.error.code === 503) {
                  markModel429(contModel);
                }
                break;
              }

              const candidate = parsed?.candidates?.[0];
              const parts = candidate?.content?.parts;
              let text = "";
              if (Array.isArray(parts)) {
                for (const p of parts) {
                  if (p?.text) text += p.text;
                }
              }
              if (candidate?.finishReason) contFinishReason = candidate.finishReason;
              if (text) {
                if (isFirstContText) {
                  text = removeOverlap(fullGeneratedText, text);
                  isFirstContText = false;
                }
                if (text) {
                  fullGeneratedText += text;
                  yield { delta: text, modelUsed: contModel, continuationRan: true };
                }
              }
            } catch {}
          }
        }
        if (contFinishReason) lastFinishReason = contFinishReason;
      }
    } catch (contErr) {
      console.error("[Gemini Continuation] Failed continuation attempt:", contErr);
    }
  }

  // If continuation ran but left an unclosed inline math delimiter across the splice point, balance it
  if (continuationRan) {
    const preCheck = checkAnswerCompleteness(fullGeneratedText.replace(/^\s*\[\[(?:NOT_)?COVERED\]\]\s*/i, ""));
    if (!preCheck.complete && preCheck.reason.includes("Unbalanced inline LaTeX math")) {
      const citeMatch = fullGeneratedText.match(/(\s*\[[^\]]+\]\s*\.?)$/);
      if (citeMatch) {
        const idx = fullGeneratedText.lastIndexOf(citeMatch[0]);
        const repaired = fullGeneratedText.slice(0, idx).trimEnd() + "$ " + citeMatch[0].trimStart();
        if (checkAnswerCompleteness(repaired.replace(/^\s*\[\[(?:NOT_)?COVERED\]\]\s*/i, "")).complete) {
          fullGeneratedText = repaired;
        }
      } else {
        const repaired = fullGeneratedText.trimEnd() + "$";
        if (checkAnswerCompleteness(repaired.replace(/^\s*\[\[(?:NOT_)?COVERED\]\]\s*/i, "")).complete) {
          fullGeneratedText = repaired;
        }
      }
    }
  }

  // Pure verification check without artificial token injection
  const cleanFinalForCheck = fullGeneratedText.replace(/^\s*\[\[(?:NOT_)?COVERED\]\]\s*/i, "");
  const finalCheck = checkAnswerCompleteness(cleanFinalForCheck);
  isCutoff = !finalCheck.complete;
  console.log(
    `[Gemini Stream] Final completeness check: complete=${finalCheck.complete}, reason="${finalCheck.reason}", finishReason=${
      lastFinishReason || "NONE"
    }`
  );
  yield { delta: "", finishReason: lastFinishReason, isCutoff, modelUsed, continuationRan };
}

/**
 * One-shot continuation call for safety net in API route.
 */
export async function continueAnswer(userPrompt: string, existingText: string): Promise<string> {
  const { response } = await fetchChatWithModelAndKeyFallback("generateContent", (model) => ({
    systemInstruction: {
      parts: [
        {
          text: "You are an expert academic tutor continuing an ongoing NCERT explanation. Output ONLY the immediate continuation of the text to complete any unfinished sentences, LaTeX formulas, or citations. Do NOT repeat any words. Do NOT output [[COVERED]] or [[NOT_COVERED]]. Write in valid LaTeX.",
        },
      ],
    },
    contents: [
      { role: "user", parts: [{ text: userPrompt }] },
      { role: "model", parts: [{ text: existingText }] },
      {
        role: "user",
        parts: [
          {
            text: "Continue your response immediately from where you stopped. Finish all unfinished sentences, formulas, and citations completely. Do NOT repeat previous words.",
          },
        ],
      },
    ],
    generationConfig: buildGenerationConfig(model, 1024, 0.2),
  }));

  const data = await response.json();
  const parts = data?.candidates?.[0]?.content?.parts;
  const rawText = Array.isArray(parts) ? parts.map((p: any) => p?.text || "").join("") : "";
  return removeOverlap(existingText, rawText);
}
