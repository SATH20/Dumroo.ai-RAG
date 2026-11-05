/**
 * Core Retrieval-Augmented Generation (RAG) Pipeline for NCERT Textbooks.
 * Incorporates LaTeX system prompt, follow-up chapter boosting, and cut-off detection.
 */

import { supabaseServer, STORAGE_BASE_URL } from "./supabase";
import { embedQuery, rewriteQuery, streamGeminiAnswer } from "./gemini";

export const DEFAULT_MIN_SIM = 0.60;
export const REFUSAL_TEXT = "This topic isn't covered in your textbooks.";

export interface HistoryMessage {
  role: "user" | "assistant";
  content: string;
  chapterIds?: string[];
  sources?: RagSource[];
}

export interface RagChunk {
  id: string;
  book_id: string;
  chapter_id: string;
  page_number: number;
  page_end: number;
  section_title: string;
  content: string;
  chunk_index: number;
  token_count: number;
  chapter_number?: number;
  chapter_title?: number | string;
  book_title?: string;
  book_part?: string | null;
  similarity?: number;
}

export interface RagSource {
  chapterId: string;
  subject: string;
  book: string;
  part: string | null;
  chapterNumber: number;
  chapterTitle: string;
  sectionTitle: string;
  pages: number[];
}

export interface RagImage {
  id: string;
  url: string;
  pageNumber: number;
  width: number;
  height: number;
  caption: string;
}

export interface RagPageImage {
  id: string;
  url: string;
  pageNumber: number;
  chapterNumber: number;
  chapterTitle: string;
}

export interface RagSectionExport {
  chapterTitle: string;
  sectionTitle: string;
  chunks: Array<{
    pageNumber: number;
    chunkIndex: number;
    content: string;
  }>;
}

export interface RagMetadata {
  standaloneQuery: string;
  differsMaterially?: boolean;
  modelUsed?: string;
  topSimilarity: number;
  sources: RagSource[];
  images: RagImage[];
  pageImages: RagPageImage[];
  sections: RagSectionExport[];
  webSources?: Array<{ title: string; url: string; content: string; score: number }>;
  refusal?: boolean;
}

interface SectionGroup {
  chapter_id: string;
  section_title: string;
  chapter_number: number;
  chapter_title: string;
  book_title: string;
  book_part: string | null;
  subject_name: string;
  maxSim: number;
  hitsCount: number;
  score: number;
  matchChunks: RagChunk[];
}

/**
 * Common stopwords and conversational query commands
 */
const QUERY_STOP_WORDS = new Set([
  "a", "about", "above", "after", "again", "against", "all", "am", "an", "and", "any", "are",
  "as", "at", "be", "because", "been", "before", "being", "below", "between", "both", "but", "by",
  "can", "could", "did", "do", "does", "doing", "down", "during", "each", "few", "for", "from",
  "further", "had", "has", "have", "having", "he", "her", "here", "him", "his", "how", "i", "if",
  "in", "into", "is", "it", "its", "let", "me", "more", "most", "my", "no", "nor", "not", "of",
  "off", "on", "once", "only", "or", "other", "ought", "our", "out", "over", "own", "same", "she",
  "should", "so", "some", "such", "than", "that", "the", "their", "them", "then", "there", "these",
  "they", "this", "those", "through", "to", "too", "under", "until", "up", "very", "was", "we",
  "were", "what", "when", "where", "which", "while", "who", "whom", "why", "with", "would", "you",
  "your", "yours", "give", "tell", "explain", "detail", "details", "example", "examples", "show",
  "describe", "please", "another", "work", "works"
]);

/**
 * Checks whether the rewritten query differs materially from the user's message
 * by introducing new context/entities from previous conversation turns.
 * If the user's question is already self-contained (e.g. topic switch), returns false.
 */
export function queryDiffersMaterially(
  userQuestion: string,
  rewrittenQuery: string,
  history: HistoryMessage[] = []
): boolean {
  if (!history || history.length === 0) return false;

  const qClean = userQuestion.toLowerCase().trim().replace(/[?!.,;:"']/g, "");
  const rClean = rewrittenQuery.toLowerCase().trim().replace(/[?!.,;:"']/g, "");

  // If the query is returned unchanged or almost unchanged, it was already self-contained
  if (qClean === rClean) return false;

  const tokenize = (text: string) =>
    text
      .split(/\s+/)
      .map((w) => w.replace(/[^a-z0-9]/g, ""))
      .filter((w) => w.length > 2 && !QUERY_STOP_WORDS.has(w));

  const qTokens = new Set(tokenize(qClean));
  const rTokens = tokenize(rClean);

  // If the user's question has no substantive content tokens (e.g. "give me an example"),
  // then any substantive rewritten query represents added context.
  if (qTokens.size === 0 && rTokens.length > 0) {
    return true;
  }

  // Tokens in rewritten query that were NOT in user question
  const addedTokens = rTokens.filter((t) => !qTokens.has(t));
  if (addedTokens.length === 0) {
    return false;
  }

  // Check if added tokens match terms in the previous conversation history
  const historyText = history
    .map((h) => `${h.content} ${h.sources?.map((s) => `${s.book} ${s.chapterTitle}`).join(" ") || ""}`)
    .join(" ")
    .toLowerCase();
  const historyTokens = new Set(tokenize(historyText));

  const addedFromHistory = addedTokens.filter((t) => historyTokens.has(t));
  return addedFromHistory.length > 0;
}

/**
 * Filter and prioritize chunks within a section up to 10 chunks, restoring to page order.
 */
function capSectionChunks(allChunks: RagChunk[], matchChunks: RagChunk[], maxChunks: number = 10): RagChunk[] {
  if (allChunks.length <= maxChunks) {
    return allChunks;
  }

  const chunkMap = new Map<number, RagChunk>();
  allChunks.forEach((c) => chunkMap.set(c.chunk_index, c));

  const sortedMatches = [...matchChunks].sort((a, b) => (b.similarity || 0) - (a.similarity || 0));
  const indicesToKeep = new Set<number>();

  for (const m of sortedMatches) {
    if (indicesToKeep.size >= maxChunks) break;
    indicesToKeep.add(m.chunk_index);
    if (indicesToKeep.size < maxChunks && chunkMap.has(m.chunk_index - 1)) {
      indicesToKeep.add(m.chunk_index - 1);
    }
    if (indicesToKeep.size < maxChunks && chunkMap.has(m.chunk_index + 1)) {
      indicesToKeep.add(m.chunk_index + 1);
    }
  }

  if (indicesToKeep.size < maxChunks && sortedMatches.length > 0) {
    const topIdx = sortedMatches[0].chunk_index;
    for (let offset = 2; offset <= 5 && indicesToKeep.size < maxChunks; offset++) {
      if (chunkMap.has(topIdx - offset)) indicesToKeep.add(topIdx - offset);
      if (indicesToKeep.size < maxChunks && chunkMap.has(topIdx + offset)) {
        indicesToKeep.add(topIdx + offset);
      }
    }
  }

  return allChunks
    .filter((c) => indicesToKeep.has(c.chunk_index))
    .sort((a, b) => a.page_number - b.page_number || a.chunk_index - b.chunk_index);
}

/**
 * Log query outcome to query_logs table (safe error handling if table or columns are pending).
 */
export async function logQuery(params: {
  subjectId: string | null;
  query: string;
  chapterIds: string[];
  sectionTitles: string[];
  answered: boolean;
  topSimilarity: number;
  userId?: string | null;
  chatId?: string | null;
  isDemo?: boolean;
}) {
  try {
    const payload: any = {
      subject_id: params.subjectId,
      query: params.query,
      chapter_ids: params.chapterIds,
      section_titles: params.sectionTitles,
      answered: params.answered,
      top_similarity: params.topSimilarity,
      user_id: params.userId || null,
      chat_id: params.chatId || null,
      created_at: new Date().toISOString(),
    };
    if (params.isDemo) {
      payload.is_demo = true;
    }
    const { error } = await supabaseServer.from("query_logs").insert(payload);
    if (error && error.message?.includes("is_demo")) {
      delete payload.is_demo;
      await supabaseServer.from("query_logs").insert(payload);
    }
  } catch (err) {
    console.warn("Could not write to query_logs (table may need creation):", err);
  }
}

interface ChapterMention {
  subjectName?: string;
  part?: string;
  chapterNumber: number;
}

function parseChapterMention(query: string): ChapterMention | null {
  const q = query.toLowerCase();

  // Match chapter number (e.g. "chapter 4", "ch 4", "chapter 11", "ch. 11")
  const chMatch = q.match(/\b(?:chapter|ch\.?)\s*(\d+)\b/i);
  if (!chMatch) return null;
  const chapterNumber = parseInt(chMatch[1], 10);

  // Match subject
  let subjectName: string | undefined = undefined;
  if (/\b(?:physics|phys)\b/i.test(q)) subjectName = "physics";
  else if (/\b(?:chem|chemistry)\b/i.test(q)) subjectName = "chemistry";
  else if (/\b(?:bio|biology)\b/i.test(q)) subjectName = "biology";
  else if (/\b(?:math|maths|mathematics)\b/i.test(q)) subjectName = "maths";
  else if (/\b(?:history|hist)\b/i.test(q)) subjectName = "history";

  // Match part
  let part: string | undefined = undefined;
  if (/\bpart\s*(?:1|i)\b/i.test(q)) part = "Part 1";
  else if (/\bpart\s*(?:2|ii)\b/i.test(q)) part = "Part 2";

  return { subjectName, part, chapterNumber };
}

async function loadChapterChunksEvenly(chapterId: string): Promise<RagChunk[]> {
  const { data: rawChunks, error } = await supabaseServer
    .from("chunks")
    .select("id, chapter_id, section_title, page_number, page_end, chunk_index, token_count, content")
    .eq("chapter_id", chapterId)
    .order("chunk_index", { ascending: true });

  if (error || !rawChunks || rawChunks.length === 0) return [];

  const chunks = rawChunks as RagChunk[];
  const totalTokens = chunks.reduce((acc, c) => acc + (c.token_count || Math.ceil(c.content.length / 4)), 0);

  if (totalTokens <= 8000) {
    return chunks;
  }

  // Sample evenly across all chunks to fit ~8,000 tokens
  const avgTokens = Math.max(1, Math.round(totalTokens / chunks.length));
  const targetCount = Math.min(chunks.length, Math.max(4, Math.floor(8000 / avgTokens)));

  const selectedIndices = new Set<number>();
  for (let i = 0; i < targetCount; i++) {
    const idx = Math.floor((i * (chunks.length - 1)) / (targetCount - 1));
    selectedIndices.add(idx);
  }

  const sampled = Array.from(selectedIndices)
    .sort((a, b) => a - b)
    .map((idx) => chunks[idx]);

  let accum = 0;
  const result: RagChunk[] = [];
  for (const c of sampled) {
    const t = c.token_count || Math.ceil(c.content.length / 4);
    if (accum + t > 8500) break;
    accum += t;
    result.push(c);
  }

  return result;
}

/**
 * Execute the RAG retrieval pipeline and return context, metadata, and stream generator.
 */
export async function runRagPipeline({
  question,
  subjectIds,
  history = [],
  minSim = DEFAULT_MIN_SIM,
  userId,
  chatId,
  webSearch = false,
  isTeacher = false,
}: {
  question: string;
  subjectIds?: string[];
  history?: HistoryMessage[];
  minSim?: number;
  userId?: string | null;
  chatId?: string | null;
  webSearch?: boolean;
  isTeacher?: boolean;
}) {
  // Step 1: Standalone query rewrite
  const standaloneQuery = await rewriteQuery(question, history);
  const differsMaterially = queryDiffersMaterially(question, standaloneQuery, history);
  console.log(`[RAG Retrieval] Question: "${question}" | Rewritten: "${standaloneQuery}" | Added Context (differsMaterially): ${differsMaterially}`);

  // Step 1b: Optional Tavily Web Search (for Teacher Chat)
  let webSources: Array<{ title: string; url: string; content: string; score: number }> = [];
  if (webSearch) {
    try {
      const { searchTavily } = await import("./tavily");
      webSources = await searchTavily(standaloneQuery || question, 4);
      console.log(`[Tavily Search] Retrieved ${webSources.length} web sources for: "${standaloneQuery || question}"`);
    } catch (e) {
      console.warn("Tavily web search error:", e);
    }
  }

  // Step 1c: Direct Chapter Requests (e.g. "summarize Physics Part 1 chapter 4", "make a 5-question quiz on Biology chapter 11")
  const chMention = parseChapterMention(question) || parseChapterMention(standaloneQuery);
  let directChapterMatched: any = null;

  if (chMention) {
    const { data: candidateChapters } = await supabaseServer
      .from("chapters")
      .select("id, number, title, book_id, books:book_id (id, title, part, subject_id, subjects:subject_id (id, name))")
      .eq("number", chMention.chapterNumber);

    if (Array.isArray(candidateChapters) && candidateChapters.length > 0) {
      let filtered = candidateChapters;
      if (chMention.subjectName) {
        filtered = filtered.filter((c: any) =>
          c.books?.subjects?.name?.toLowerCase().includes(chMention.subjectName!)
        );
      }
      if (chMention.part) {
        filtered = filtered.filter((c: any) =>
          c.books?.part?.toLowerCase().includes(chMention.part!.toLowerCase())
        );
      }
      if (subjectIds && subjectIds.length > 0) {
        filtered = filtered.filter((c: any) =>
          subjectIds.includes(c.books?.subject_id)
        );
      }

      if (filtered.length === 1) {
        directChapterMatched = filtered[0];
      } else if (filtered.length > 1 && (chMention.subjectName || isTeacher)) {
        directChapterMatched = filtered[0];
      }
    }
  }

  if (directChapterMatched) {
    const chapterChunks = await loadChapterChunksEvenly(directChapterMatched.id);
    const pages = Array.from(new Set(chapterChunks.map((c) => c.page_number))).sort((a, b) => a - b);
    const bookTitle = directChapterMatched.books?.title || "NCERT";
    const bookPart = directChapterMatched.books?.part || null;
    const subjectName = directChapterMatched.books?.subjects?.name || "";

    const sources: RagSource[] = [
      {
        chapterId: directChapterMatched.id,
        subject: subjectName,
        book: bookTitle,
        part: bookPart,
        chapterNumber: directChapterMatched.number,
        chapterTitle: directChapterMatched.title,
        sectionTitle: `Full Chapter (${pages.length > 0 ? `pp. ${pages[0]}-${pages[pages.length - 1]}` : "Entire Chapter"})`,
        pages,
      },
    ];

    const sectionsExport: RagSectionExport[] = [
      {
        chapterTitle: directChapterMatched.title,
        sectionTitle: "Full Chapter Content",
        chunks: chapterChunks.map((c) => ({
          pageNumber: c.page_number,
          chunkIndex: c.chunk_index,
          content: c.content,
        })),
      },
    ];

    const images: RagImage[] = [];
    const pageImages: RagPageImage[] = [];
    if (pages.length > 0) {
      const { data: rawImages } = await supabaseServer
        .from("images")
        .select("id, page_number, storage_path, width, height, chapter_id")
        .eq("chapter_id", directChapterMatched.id)
        .in("page_number", pages.slice(0, 10))
        .limit(8);

      (rawImages || []).forEach((img: any) => {
        images.push({
          id: img.id,
          url: `${STORAGE_BASE_URL}/${img.storage_path}`,
          pageNumber: img.page_number,
          width: img.width,
          height: img.height,
          caption: `Page ${img.page_number}`,
        });
      });

      const { data: rawPageImages } = await supabaseServer
        .from("page_images")
        .select("id, page_number, storage_path, chapter_id")
        .eq("chapter_id", directChapterMatched.id)
        .in("page_number", pages.slice(0, 6))
        .order("page_number", { ascending: true });

      (rawPageImages || []).forEach((pi: any) => {
        pageImages.push({
          id: pi.id,
          url: `${STORAGE_BASE_URL}/${pi.storage_path}`,
          pageNumber: pi.page_number,
          chapterNumber: directChapterMatched.number,
          chapterTitle: directChapterMatched.title,
        });
      });
    }

    const metadata: RagMetadata = {
      standaloneQuery,
      differsMaterially,
      topSimilarity: 1.0,
      sources,
      images,
      pageImages,
      sections: sectionsExport,
      webSources,
      refusal: false,
    };

    const contextString = chapterChunks
      .map((c) => {
        const partStr = bookPart ? ` ${bookPart}` : "";
        return `[Source: ${bookTitle}${partStr}, Ch ${directChapterMatched.number} (${directChapterMatched.title}), p. ${c.page_number}]\n${c.content}`;
      })
      .join("\n\n---\n\n");

    const systemPrompt = `You are an expert high school tutor assisting students and teachers with their NCERT curriculum.
Answer strictly from the provided textbook chapter excerpts. Do NOT use outside knowledge or speculations.

COVERAGE RULE:
- Your response's VERY FIRST line must be [[COVERED]].
- Starting on the next line, provide a thorough, accurate response addressing the user's request (e.g. summary, quiz questions, explanations) strictly based on the provided chapter excerpts.
- Cite EVERY claim, summary point, equation, or quiz question/answer with an exact page citation referencing the source, for example [${bookTitle}${bookPart ? ` ${bookPart}` : ""}, Ch ${directChapterMatched.number}, p. Y].
- Write all mathematical and scientific formulas in LaTeX: use inline $...$ for inline formulas and variables (e.g. $F = ma$), and standalone $$...$$ on their own line for key equations.
- Always finish every sentence and formula completely. Never leave equations or sentences half-written.`;

    const userPrompt = `Textbook Context for Chapter ${directChapterMatched.number}: ${directChapterMatched.title} (${bookTitle}${bookPart ? ` ${bookPart}` : ""}):
====================================
${contextString}
====================================

Request: ${question}`;

    async function* directChapterStream(): AsyncIterable<{
      type: "meta" | "token" | "refusal" | "cutoff" | "done";
      data: any;
    }> {
      yield { type: "meta", data: metadata };

      const MARKER_REGEX = /\[\[(?:NOT_)?COVERED\]\]\s*/g;
      const llmStream = streamGeminiAnswer(systemPrompt, userPrompt);
      let buffer = "";
      let decisionMade = false;
      let isCutoff = false;
      let modelUsed: string | undefined = undefined;
      let lastFinishReason: string | undefined = undefined;
      let continuationRan = false;

      for await (const chunk of llmStream) {
        if (chunk.modelUsed && !modelUsed) modelUsed = chunk.modelUsed;
        if (chunk.isCutoff) isCutoff = true;
        if (chunk.finishReason) lastFinishReason = chunk.finishReason;
        if (chunk.continuationRan) continuationRan = true;
        const text = chunk.delta;
        if (!text) continue;

        if (!decisionMade) {
          buffer += text;
          if (buffer.includes("[[COVERED]]")) {
            decisionMade = true;
            const clean = buffer.replace(MARKER_REGEX, "");
            if (clean) yield { type: "token", data: { delta: clean } };
          } else if (buffer.length >= 200) {
            decisionMade = true;
            const clean = buffer.replace(MARKER_REGEX, "");
            if (clean) yield { type: "token", data: { delta: clean } };
          }
        } else {
          const clean = text.replace(MARKER_REGEX, "");
          if (clean) yield { type: "token", data: { delta: clean } };
        }
      }

      if (!decisionMade && buffer) {
        const clean = buffer.replace(MARKER_REGEX, "");
        if (clean) yield { type: "token", data: { delta: clean } };
      }

      await logQuery({
        subjectId: directChapterMatched.books?.subject_id || null,
        query: standaloneQuery,
        chapterIds: [directChapterMatched.id],
        sectionTitles: ["Full Chapter"],
        answered: true,
        topSimilarity: 1.0,
        userId,
        chatId,
      });

      if (isCutoff) {
        yield { type: "cutoff", data: { message: "Answer was cut off, regenerate", cutoff: true } };
      }
      yield { type: "done", data: { answered: true, cutoff: isCutoff, modelUsed, finishReason: lastFinishReason, continuationRan } };
    }

    return {
      standaloneQuery,
      topSimilarity: 1.0,
      refusal: false,
      metadata,
      stream: directChapterStream(),
    };
  }

  // Extract previous chapter IDs from history if available
  const previousChapterIds: string[] = [];
  if (history && history.length > 0) {
    for (let i = history.length - 1; i >= 0; i--) {
      const msg = history[i];
      if (msg.role === "assistant") {
        if (msg.chapterIds && msg.chapterIds.length > 0) {
          previousChapterIds.push(...msg.chapterIds);
          break;
        }
        if (msg.sources && msg.sources.length > 0) {
          msg.sources.forEach((s) => {
            if (s.chapterId) previousChapterIds.push(s.chapterId);
          });
          if (previousChapterIds.length > 0) break;
        }
      }
    }
  }

  // Step 2: Embed query & match chunks
  const queryEmbedding = await embedQuery(standaloneQuery);
  const { data: matchedChunks, error: matchError } = await supabaseServer.rpc("match_chunks", {
    query_embedding: queryEmbedding,
    subject_ids: subjectIds && subjectIds.length > 0 ? subjectIds : null,
    k: 25,
  });

  if (matchError) {
    throw new Error(`match_chunks RPC failed: ${matchError.message}`);
  }

  let hits: RagChunk[] = (matchedChunks || []) as RagChunk[];
  const topSimilarity = hits.length > 0 ? hits[0].similarity || 0 : 0;

  // Step 3: Refusal if top similarity < minSim (unless web search yielded results)
  if ((topSimilarity < minSim || hits.length === 0) && (!webSearch || webSources.length === 0)) {
    let unEnrolledRefusal: string | null = null;

    // Check if question scores >= 0.70 in an un-enrolled subject
    if (subjectIds && subjectIds.length > 0) {
      const { data: allSubjects } = await supabaseServer.from("subjects").select("id, name");
      if (allSubjects && allSubjects.length > 0) {
        const allowedSet = new Set(subjectIds);
        const unEnrolledSubjects = allSubjects.filter((s) => !allowedSet.has(s.id));
        if (unEnrolledSubjects.length > 0) {
          const unEnrolledIds = unEnrolledSubjects.map((s) => s.id);
          const { data: otherHits } = await supabaseServer.rpc("match_chunks", {
            query_embedding: queryEmbedding,
            subject_ids: unEnrolledIds,
            k: 1,
          });
          const otherTopHit = Array.isArray(otherHits) && otherHits.length > 0 ? otherHits[0] : null;
          if (otherTopHit && (otherTopHit.similarity || 0) >= 0.70) {
            let foundSubjName = "";
            const { data: bookRow } = await supabaseServer
              .from("books")
              .select("subject_id, subjects:subject_id (name)")
              .eq("id", otherTopHit.book_id)
              .single();
            const rawSubj = (bookRow as any)?.subjects?.name || "";
            if (rawSubj) {
              foundSubjName = rawSubj.charAt(0).toUpperCase() + rawSubj.slice(1);
            } else {
              foundSubjName = otherTopHit.book_title || "another subject";
            }
            unEnrolledRefusal = `This topic is in ${foundSubjName}, which isn't part of your groups.`;
          }
        }
      }
    }

    let refusalMessage = unEnrolledRefusal || REFUSAL_TEXT;
    if (!unEnrolledRefusal && topSimilarity >= 0.60 && hits.length > 0) {
      const candidateTitles = Array.from(
        new Set(hits.slice(0, 3).map((h) => h.chapter_title).filter(Boolean))
      );
      if (candidateTitles.length > 0) {
        refusalMessage += `\n\nClosest topics in your books: ${candidateTitles.join(", ")}`;
      }
    }

    await logQuery({
      subjectId: subjectIds && subjectIds.length === 1 ? subjectIds[0] : null,
      query: standaloneQuery,
      chapterIds: [],
      sectionTitles: [],
      answered: false,
      topSimilarity,
      userId,
      chatId,
    });

    return {
      standaloneQuery,
      topSimilarity,
      refusal: true,
      refusalReason: unEnrolledRefusal ? "UNENROLLED_GROUP" : "LOW_SIMILARITY",
      refusalText: refusalMessage,
      metadata: {
        standaloneQuery,
        differsMaterially,
        modelUsed: "none (min_sim refusal)",
        topSimilarity,
        sources: [],
        images: [],
        pageImages: [],
        sections: [],
        refusal: true,
      } as RagMetadata,
      stream: null,
    };
  }

  // Fetch subject map for subject names
  const { data: subjectRows } = await supabaseServer.from("subjects").select("id, name");
  const subjectMap = new Map<string, string>();
  ((subjectRows as Array<{ id: string; name: string }>) || []).forEach((s) => subjectMap.set(s.id, s.name));

  // Step 4: Textbook Section Matching & Chunk Retrieval
  // Only retrieve and populate textbook sections/images if topSimilarity >= minSim
  const hasTextbookMatch = topSimilarity >= minSim && hits.length > 0;

  const allSelectedChunks: RagChunk[] = [];
  const sources: RagSource[] = [];
  const sectionsExport: RagSectionExport[] = [];
  const finalChunks: RagChunk[] = [];
  const images: RagImage[] = [];
  const pageImages: RagPageImage[] = [];
  let topSections: SectionGroup[] = [];

  if (hasTextbookMatch) {
    const groupMap = new Map<string, SectionGroup>();
    for (const h of hits) {
      const key = `${h.chapter_id}:::${h.section_title}`;
      if (!groupMap.has(key)) {
        groupMap.set(key, {
          chapter_id: h.chapter_id,
          section_title: h.section_title,
          chapter_number: h.chapter_number || 0,
          chapter_title: String(h.chapter_title || ""),
          book_title: h.book_title || "NCERT",
          book_part: h.book_part || null,
          subject_name: "",
          maxSim: h.similarity || 0,
          hitsCount: 1,
          score: 0,
          matchChunks: [h],
        });
      } else {
        const g = groupMap.get(key)!;
        g.hitsCount += 1;
        g.maxSim = Math.max(g.maxSim, h.similarity || 0);
        g.matchChunks.push(h);
      }
    }

    // Calculate score = max similarity + 0.05 * hitsCount
    // Apply +0.15 follow-up chapter boost ONLY when the rewriter had to add context (differsMaterially is true).
    const prevChapterSet = new Set(previousChapterIds);
    const sortedGroups = Array.from(groupMap.values()).map((g) => {
      let boost = 0;
      if (differsMaterially && prevChapterSet.has(g.chapter_id)) {
        boost = 0.15;
      }
      g.score = g.maxSim + boost + 0.05 * g.hitsCount;
      return g;
    });
    sortedGroups.sort((a, b) => b.score - a.score);

    topSections = sortedGroups.slice(0, 2);

    for (const sec of topSections) {
      const { data: rawSectionChunks, error: secErr } = await supabaseServer.rpc("get_section", {
        p_chapter_id: sec.chapter_id,
        p_section_title: sec.section_title,
      });

      if (secErr) {
        console.warn(`get_section failed for chapter ${sec.chapter_id}: ${secErr.message}`);
        continue;
      }

      const secChunks = (rawSectionChunks || []).map((sc: any) => ({
        ...sc,
        chapter_number: sec.chapter_number,
        chapter_title: sec.chapter_title,
        book_title: sec.book_title,
        book_part: sec.book_part,
      })) as RagChunk[];

      const capped = capSectionChunks(secChunks, sec.matchChunks, 10);
      allSelectedChunks.push(...capped);

      const pages = Array.from(new Set(capped.map((c) => c.page_number))).sort((a, b) => a - b);
      sources.push({
        chapterId: sec.chapter_id,
        subject: sec.subject_name || sec.book_title.toLowerCase(),
        book: sec.book_title,
        part: sec.book_part,
        chapterNumber: sec.chapter_number,
        chapterTitle: sec.chapter_title,
        sectionTitle: sec.section_title,
        pages,
      });

      sectionsExport.push({
        chapterTitle: sec.chapter_title,
        sectionTitle: sec.section_title,
        chunks: capped.map((c) => ({
          pageNumber: c.page_number,
          chunkIndex: c.chunk_index,
          content: c.content,
        })),
      });
    }

    // Cap total context around 8,000 tokens
    let tokenAccumulator = 0;
    for (const c of allSelectedChunks) {
      const tokens = c.token_count || Math.ceil(c.content.length / 4);
      if (tokenAccumulator + tokens > 8000) break;
      tokenAccumulator += tokens;
      finalChunks.push(c);
    }

    // Step 5: Images & Page Images
    const selectedPages = Array.from(new Set(finalChunks.flatMap((c) => [c.page_number, c.page_end])));
    const selectedChapterIds = Array.from(new Set(finalChunks.map((c) => c.chapter_id)));

    if (selectedChapterIds.length > 0 && selectedPages.length > 0) {
      const { data: rawImages } = await supabaseServer
        .from("images")
        .select("id, page_number, storage_path, width, height, chapter_id")
        .in("chapter_id", selectedChapterIds)
        .in("page_number", selectedPages);

      const pageSimilarityMap = new Map<number, number>();
      for (const c of finalChunks) {
        const existing = pageSimilarityMap.get(c.page_number) || 0;
        const sim = c.similarity || topSections[0]?.maxSim || 0.7;
        if (sim > existing) pageSimilarityMap.set(c.page_number, sim);
      }

      const sortedRawImages = ((rawImages as Array<any>) || []).sort((a: any, b: any) => {
        const simA = pageSimilarityMap.get(a.page_number) || 0;
        const simB = pageSimilarityMap.get(b.page_number) || 0;
        return simB - simA;
      });

      images.push(
        ...sortedRawImages.slice(0, 8).map((img: any) => ({
          id: img.id,
          url: `${STORAGE_BASE_URL}/${img.storage_path}`,
          pageNumber: img.page_number,
          width: img.width,
          height: img.height,
          caption: `Page ${img.page_number}`,
        }))
      );

      const { data: rawPageImages } = await supabaseServer
        .from("page_images")
        .select("id, page_number, storage_path, chapter_id")
        .in("chapter_id", selectedChapterIds)
        .in("page_number", selectedPages)
        .order("page_number", { ascending: true });

      const chapterMap = new Map<string, { number: number; title: string }>();
      topSections.forEach((s) => chapterMap.set(s.chapter_id, { number: s.chapter_number, title: s.chapter_title }));

      pageImages.push(
        ...((rawPageImages as Array<any>) || []).map((pi: any) => {
          const ch = chapterMap.get(pi.chapter_id) || { number: 0, title: "" };
          return {
            id: pi.id,
            url: `${STORAGE_BASE_URL}/${pi.storage_path}`,
            pageNumber: pi.page_number,
            chapterNumber: ch.number,
            chapterTitle: ch.title,
          };
        })
      );
    }
  }

  const metadata: RagMetadata = {
    standaloneQuery,
    differsMaterially,
    topSimilarity,
    sources,
    images,
    pageImages,
    sections: sectionsExport,
    webSources,
    refusal: false,
  };

  // Step 6: Format Context & System Prompt with LaTeX rules
  const contextString = finalChunks
    .map((c) => {
      const partStr = c.book_part ? ` ${c.book_part}` : "";
      return `[Source: ${c.book_title}${partStr}, Ch ${c.chapter_number} (${c.chapter_title}), p. ${c.page_number}]\n${c.content}`;
    })
    .join("\n\n---\n\n");

  let webContextString = "";
  if (webSources && webSources.length > 0) {
    webContextString = `\n\nWeb Search Context (Current Web Information via Tavily):\n====================================\n${webSources
      .map((w) => `[Source: ${w.title}](${w.url})\n${w.content}`)
      .join("\n\n")}\n====================================\n`;
  }

  const systemPrompt = `You are an expert high school tutor assisting students and teachers with their NCERT curriculum.
${
  webSources && webSources.length > 0
    ? hasTextbookMatch
      ? `You must organize your answer into two clearly separated, headed sections:

## NCERT Curriculum Explanation
Explain the core concepts strictly using the provided NCERT textbook excerpts. Cite every statement and equation with [Book, Ch X, p. Y]. Do NOT blend external web information into this section.

## Supplementary Context from the Web
Provide any broader perspective, modern applications, or supplementary context drawn from the Web Search Context. Reference web findings clearly.`
      : "The question is not covered in the Class 11 NCERT textbooks. Answer the question thoroughly, clearly, and accurately using the provided Web Search Context. State clearly at the beginning of your explanation that this topic is outside the Class 11 NCERT curriculum."
    : "Answer ONLY using the provided textbook context. Do NOT use outside knowledge, speculations, or assumptions."
}

COVERAGE RULE:
- Your response's VERY FIRST line must be either [[COVERED]] or [[NOT_COVERED]].
- If the question is answered by either the NCERT textbook excerpts or the Web Search Context, your VERY FIRST line MUST be [[COVERED]].
- If the question asks about non-academic topics, recipes/cooking (e.g. pasta), general coding, sports, or anything not covered in the textbook excerpts, your VERY FIRST line MUST be [[NOT_COVERED]].
- If neither the textbook excerpts nor the web search context provide information to answer the question, your VERY FIRST line must be [[NOT_COVERED]].
- Starting on the next line, provide a clear, student-friendly explanation with headings and bullet points where helpful.
- Write all mathematical and scientific formulas in LaTeX: use inline $...$ for inline formulas and variables (e.g. $F = ma$, $\\Delta p$), and standalone $$...$$ on their own line for key equations or multi-line derivations.
- Always finish every sentence and formula completely. Never leave equations or sentences half-written.
${hasTextbookMatch ? "- In the NCERT Curriculum section, every claim or formula MUST have an in-line citation referencing the source, for example [Physics Part 1, Ch 4, p. 54] or [Mathematics, Ch 7, p. 129]." : ""}`;

  let conversationContext = "";
  if (history && history.length > 0) {
    const recent = history
      .slice(-4)
      .map((m) => `${m.role === "user" ? "User" : "Tutor"}: ${m.content.slice(0, 300)}`)
      .join("\n\n");
    conversationContext = `Recent Conversation:\n${recent}\n\n`;
  }

  const querySuffix = differsMaterially && standaloneQuery.toLowerCase() !== question.toLowerCase()
    ? ` (Context: ${standaloneQuery})`
    : "";

  const userPrompt = `${conversationContext}Textbook Context:
====================================
${contextString || (webSources.length > 0 ? "No relevant textbook match found in NCERT curriculum. Rely on Web Search Context below." : "No relevant textbook excerpts found.")}
====================================${webContextString}

Question: ${question}${querySuffix}`;

  // Step 7: Stream & Buffer First 400 Chars for Refusal Verification & Marker Stripping
  async function* responseStream(): AsyncIterable<{
    type: "meta" | "token" | "refusal" | "cutoff" | "done";
    data: any;
  }> {
    yield { type: "meta", data: metadata };

    const MARKER_REGEX = /\[\[(?:NOT_)?COVERED\]\]\s*/g;
    const llmStream = streamGeminiAnswer(systemPrompt, userPrompt);
    let buffer = "";
    let decisionMade = false;
    let isCovered = false;
    let isCutoff = false;
    let modelUsed: string | undefined = undefined;

    let lastFinishReason: string | undefined = undefined;
    let continuationRan = false;

    for await (const chunk of llmStream) {
      if (chunk.modelUsed && !modelUsed) {
        modelUsed = chunk.modelUsed;
      }
      if (chunk.isCutoff) {
        isCutoff = true;
      }
      if (chunk.finishReason) {
        lastFinishReason = chunk.finishReason;
      }
      if (chunk.continuationRan) {
        continuationRan = true;
      }
      const text = chunk.delta;
      if (!text) continue;

      if (!decisionMade) {
        buffer += text;

        if (buffer.includes("[[NOT_COVERED]]")) {
          isCovered = false;
          decisionMade = true;
          break; // Stop immediately, do not yield any tokens to user on refusal!
        } else if (buffer.includes("[[COVERED]]")) {
          isCovered = true;
          decisionMade = true;
          const cleanInitial = buffer.replace(MARKER_REGEX, "");
          if (cleanInitial) {
            yield { type: "token", data: { delta: cleanInitial } };
          }
        } else if (buffer.length >= 400) {
          // If 400 characters passed without marker, decide coverage:
          // If webSearch is ON with results, or if textbook similarity is high, consider covered
          isCovered = (webSearch && webSources.length > 0) || topSimilarity >= 0.65;
          decisionMade = true;
          if (!isCovered) {
            break;
          }
          const cleanInitial = buffer.replace(MARKER_REGEX, "");
          if (cleanInitial) {
            yield { type: "token", data: { delta: cleanInitial } };
          }
        }
      } else {
        const clean = text.replace(MARKER_REGEX, "");
        if (clean) {
          yield { type: "token", data: { delta: clean } };
        }
      }
    }

    // Stream finished; if decision wasn't reached yet (short stream < 400 chars):
    if (!decisionMade) {
      if (buffer.includes("[[NOT_COVERED]]")) {
        isCovered = false;
      } else if (buffer.includes("[[COVERED]]")) {
        isCovered = true;
      } else {
        isCovered = (webSearch && webSources.length > 0) || topSimilarity >= 0.65;
      }
      decisionMade = true;

      if (isCovered) {
        const cleanInitial = buffer.replace(MARKER_REGEX, "");
        if (cleanInitial) {
          yield { type: "token", data: { delta: cleanInitial } };
        }
      }
    }

    if (!isCovered) {
      metadata.sources = [];
      metadata.images = [];
      metadata.pageImages = [];
      metadata.sections = [];
      metadata.refusal = true;

      await logQuery({
        subjectId: subjectIds && subjectIds.length === 1 ? subjectIds[0] : null,
        query: standaloneQuery,
        chapterIds: [],
        sectionTitles: [],
        answered: false,
        topSimilarity,
        userId,
        chatId,
      });

      let refusalMessage = REFUSAL_TEXT;
      if (topSimilarity >= 0.60 && topSections.length > 0) {
        const candidateTitles = Array.from(
          new Set(topSections.map((s) => s.chapter_title).filter(Boolean))
        );
        if (candidateTitles.length > 0) {
          refusalMessage += `\n\nClosest topics in your books: ${candidateTitles.join(", ")}`;
        }
      }

      yield { type: "refusal", data: { message: refusalMessage } };
      yield { type: "done", data: { answered: false, modelUsed } };
    } else {
      // Log CITED chapters (from sources) rather than just retrieved
      const citedChapterIds = Array.from(new Set(sources.map((s) => s.chapterId)));
      let effectiveSubjectId = subjectIds && subjectIds.length === 1 ? subjectIds[0] : null;
      if (!effectiveSubjectId && citedChapterIds.length > 0) {
        try {
          const { data: chRow } = await supabaseServer
            .from("chapters")
            .select("book_id, books:book_id (subject_id)")
            .eq("id", citedChapterIds[0])
            .maybeSingle();
          effectiveSubjectId = (chRow as any)?.books?.subject_id || null;
        } catch {}
      }

      await logQuery({
        subjectId: effectiveSubjectId,
        query: standaloneQuery,
        chapterIds: citedChapterIds,
        sectionTitles: topSections.map((s) => s.section_title),
        answered: true,
        topSimilarity,
        userId,
        chatId,
      });

      if (isCutoff) {
        yield { type: "cutoff", data: { message: "Answer was cut off, regenerate", cutoff: true } };
      }

      yield { type: "done", data: { answered: true, cutoff: isCutoff, modelUsed, finishReason: lastFinishReason, continuationRan } };
    }
  }

  return {
    standaloneQuery,
    topSimilarity,
    refusal: false,
    metadata,
    stream: responseStream(),
  };
}
