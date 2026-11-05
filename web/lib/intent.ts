/**
 * web/lib/intent.ts
 * Cheap rule-based and lightweight LLM intent classifier for student chat.
 */

import { streamGeminiAnswer } from "./gemini";

export type UserIntent = "QUESTION" | "PERSONAL" | "SMALL_TALK" | "OTHER";

const SMALL_TALK_REGEX =
  /^(hi|hello|hey|good\s+(morning|afternoon|evening)|howdy|greetings|sup|what'?s\s+up|yo|thanks|thank\s+you|thx|ty|many\s+thanks|ok|okay|k|alright|cool|great|awesome|got\s+it|understood|sure|bye|goodbye|cya|see\s+ya|have\s+a\s+good\s+day|who\s+are\s+you|what\s+can\s+you\s+do|help|what\s+is\s+your\s+name)[.!?\s]*$/i;

const PERSONAL_STATEMENT_REGEX =
  /^(i\s+find|i\s+struggle\s+with|i\s+prefer|i\s+have\s+exams?|my\s+exams?|i['’]m\s+(weak|bad|good|slow)\s+at|i\s+don['’]t\s+understand|i['’]m\s+confused\s+by|i\s+hate|i\s+love)\b/i;

const QUESTION_PREFIX_REGEX =
  /^(what|why|how|when|where|which|who|explain|define|derive|calculate|prove|describe|give\s+(me\s+)?(an?\s+)?example|tell\s+me\s+about|can\s+you\s+explain|difference\s+between|is\s+there|are\s+there)\b/i;

/**
 * Classify a user's message into QUESTION, PERSONAL, SMALL_TALK, or OTHER.
 * Uses cheap local regex rules first, falling back to a tiny LLM classification when ambiguous.
 */
export async function classifyIntent(message: string): Promise<UserIntent> {
  const trimmed = message.trim();
  if (!trimmed) return "OTHER";

  // 1. Fast Rule: Small Talk
  if (SMALL_TALK_REGEX.test(trimmed)) {
    return "SMALL_TALK";
  }

  // 2. Fast Rule: Personal Statement
  // e.g. "I find integration hard", "I prefer short answers", "I have exams in March"
  if (PERSONAL_STATEMENT_REGEX.test(trimmed) && !trimmed.endsWith("?")) {
    return "PERSONAL";
  }

  // 3. Fast Rule: Question
  // e.g. "What is a set?", "explain hybridisation", "give me an example"
  if (QUESTION_PREFIX_REGEX.test(trimmed) || (trimmed.endsWith("?") && trimmed.split(/\s+/).length >= 3)) {
    return "QUESTION";
  }

  // 4. Academic topic names without question marks (e.g. "binomial theorem", "photosynthesis", "Newton's second law")
  // Short phrases (< 6 words) that don't start with "I" are almost always study topics / questions
  if (trimmed.split(/\s+/).length <= 5 && !/^[iI]\b/.test(trimmed)) {
    return "QUESTION";
  }

  // 5. Tiny LLM call for ambiguous messages
  try {
    const prompt = `Classify this student's message into exactly ONE category:
- QUESTION: Asking about academic/study concepts, textbook topics, formulas, or explanations.
- PERSONAL: A statement about the student themselves (e.g. "I find integration hard", "I prefer short answers", "I have exams in March").
- SMALL_TALK: Casual greetings, thanks, acknowledgments (e.g. "hi", "ok", "thanks").
- OTHER: Unrelated or non-academic statements.

Student Message: "${trimmed}"

Category (one word only: QUESTION, PERSONAL, SMALL_TALK, or OTHER):`;

    let result = "";
    for await (const chunk of streamGeminiAnswer(
      "You are a strict one-word intent classifier. Output only QUESTION, PERSONAL, SMALL_TALK, or OTHER.",
      prompt,
      { checkCompleteness: false }
    )) {
      result += chunk.delta;
    }

    const clean = result.trim().toUpperCase().replace(/[^A-Z_]/g, "");
    if (clean.includes("PERSONAL")) return "PERSONAL";
    if (clean.includes("SMALL_TALK")) return "SMALL_TALK";
    if (clean.includes("QUESTION")) return "QUESTION";
    if (clean.includes("OTHER")) return "OTHER";
  } catch (err) {
    console.warn("Intent classification LLM call failed, defaulting to QUESTION:", err);
  }

  return "QUESTION";
}

/**
 * Extract topic name from a personal statement (e.g. "I find integration hard" -> "integration")
 */
export function extractTopicFromPersonalStatement(statement: string): string {
  const s = statement.trim();
  const m1 = s.match(/i\s+find\s+([^.!?]+?)(?:\s+(?:hard|difficult|confusing|tough|challenging))?[.!?]*$/i);
  if (m1 && m1[1]) {
    return m1[1].replace(/\s+(?:hard|difficult|confusing|tough|challenging)$/i, "").trim();
  }
  const m2 = s.match(/i\s+struggle\s+with\s+([^.!?]+)/i);
  if (m2 && m2[1]) {
    return m2[1].replace(/\s+(?:hard|difficult|confusing|tough|challenging)$/i, "").trim();
  }
  const m3 = s.match(/i['’]m\s+(?:weak|bad|confused)\s+(?:at|with|by|about)\s+([^.!?]+)/i);
  if (m3 && m3[1]) {
    return m3[1].trim();
  }
  return "";
}

/**
 * Generate a friendly response for SMALL_TALK (no sources)
 */
export function getSmallTalkReply(message: string): string {
  const lower = message.toLowerCase().trim();
  if (/^(hi|hello|hey|good\s+(morning|afternoon|evening)|howdy|greetings)/i.test(lower)) {
    return "Hello! How can I help you with your Class 11 NCERT studies today?";
  }
  if (/^(thanks|thank\s+you|thx|ty|many\s+thanks)/i.test(lower)) {
    return "You're very welcome! Feel free to ask whenever you have more questions from your textbooks.";
  }
  if (/^(ok|okay|k|alright|cool|great|awesome|got\s+it|understood|sure)/i.test(lower)) {
    return "Great! What concept or question would you like to look at next?";
  }
  return "Hello! I am your NCERT Class 11 tutor. What would you like to learn today?";
}

/**
 * Generate a warm, personalized response for PERSONAL statements (no sources, no refusal card)
 * If the topic is in allowed books: offer "Want me to explain <topic> from your textbooks?"
 * If it's not (e.g. integration): say it's not in their Class 11 syllabus.
 */
export async function getPersonalReply(
  statement: string,
  allowedSubjectIds?: string[]
): Promise<string> {
  const topic = extractTopicFromPersonalStatement(statement);
  if (topic) {
    let topicFound = false;
    try {
      const { embedQuery } = await import("./gemini");
      const { supabaseServer } = await import("./supabase");
      const emb = await embedQuery(topic);
      const rpcArgs: any = {
        query_embedding: emb,
        k: 3,
      };
      if (allowedSubjectIds && allowedSubjectIds.length > 0) {
        rpcArgs.subject_ids = allowedSubjectIds;
      }
      const { data: hits } = await supabaseServer.rpc("match_chunks", rpcArgs);
      if (hits && hits.length > 0 && hits[0].similarity >= 0.65) {
        topicFound = true;
      }
    } catch (err) {
      console.warn("Failed to check topic coverage for personal statement:", err);
    }

    if (topicFound) {
      return `I understand that ${topic} can be challenging! Want me to explain ${topic} from your textbooks?`;
    } else {
      return `I understand that ${topic} can feel challenging! However, ${topic} is part of the Class 12 syllabus, so it isn't in your Class 11 syllabus. Let me know if you would like help with any of your Class 11 topics!`;
    }
  }

  const lower = statement.toLowerCase();
  if (lower.includes("short answer") || lower.includes("concise") || lower.includes("bullet point")) {
    return "Understood! I will keep my explanations concise, clear, and focused on key NCERT concepts.";
  }
  if (lower.includes("exam") || lower.includes("test")) {
    return "All the best with your upcoming exams! Which Class 11 topics or chapters would you like to review first?";
  }
  return "Thank you for sharing that with me! I've noted your preference. What topic from your Class 11 textbooks would you like to explore today?";
}
