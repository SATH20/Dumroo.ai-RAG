/**
 * web/lib/memory.ts
 * Cross-chat student memory extraction & Per-chat rolling summary utilities.
 */

import { streamGeminiAnswer } from "./gemini";

export function extractDurableFactDirect(message: string): string | null {
  const trimmed = message.trim();

  // Sensitive check
  const lower = trimmed.toLowerCase();
  if (
    lower.includes("password") ||
    lower.includes("phone") ||
    lower.includes("address") ||
    lower.includes("health") ||
    lower.includes("hospital") ||
    lower.includes("doctor")
  ) {
    return null;
  }

  // "I find integration hard" / "I find calculus difficult"
  const m1 = trimmed.match(/^i\s+find\s+([^.!?]+?)\s+(hard|difficult|confusing|tough|challenging)/i);
  if (m1) {
    const topic = m1[1].trim();
    return `finds ${topic} hard`;
  }

  // "I struggle with organic chemistry"
  const m2 = trimmed.match(/^i\s+struggle\s+with\s+([^.!?]+)/i);
  if (m2) {
    return `struggles with ${m2[1].trim()}`;
  }

  // "I prefer short answers"
  const m3 = trimmed.match(/^i\s+prefer\s+([^.!?]+)/i);
  if (m3) {
    return `prefers ${m3[1].trim()}`;
  }

  // "I have exams in March" / "My exams are in March"
  const m4 = trimmed.match(/^(?:i\s+have\s+exams?|my\s+exams?\s+are)\s+in\s+([a-zA-Z]+)/i);
  if (m4) {
    return `exams in ${m4[1].trim()}`;
  }

  // "I'm weak at maths"
  const m5 = trimmed.match(/^i['’]m\s+(?:weak|bad)\s+at\s+([^.!?]+)/i);
  if (m5) {
    return `struggles with ${m5[1].trim()}`;
  }

  return null;
}

/**
 * Extract durable facts ABOUT THE STUDENT from an interaction.
 * Rules:
 * - Only facts about the student's learning style, difficulties, goals, preferences (e.g. "finds integration hard", "prefers short answers", "exam in March").
 * - NEVER store textbook content, scientific definitions, or sensitive information (passwords, health, family, phone numbers).
 * - Max 20 facts, deduped.
 */
export async function extractStudentFacts(
  userMessage: string,
  existingFacts: string[] = []
): Promise<string[]> {
  // 1. Fast, deterministic rule-based extraction for common personal declarations
  const directFact = extractDurableFactDirect(userMessage);
  if (directFact) {
    const lower = directFact.toLowerCase();
    const isDuplicate = existingFacts.some(
      (f) => f.toLowerCase() === lower || lower.includes(f.toLowerCase()) || f.toLowerCase().includes(lower)
    );
    if (isDuplicate) return existingFacts;
    return [...existingFacts, directFact].slice(-20);
  }

  // 2. LLM-based extraction for subtle or non-standard statements
  const prompt = `You are an AI assistant tracking learning profile facts about a high school student.
Analyze the student's message and determine if it reveals any durable, long-term personal learning preference, difficulty, or goal.

Strict Rules:
- Extract ONLY durable facts ABOUT THE STUDENT (e.g. "finds integration hard", "struggles with organic chemistry formulas", "prefers bullet points", "preparing for exams in March").
- Do NOT extract textbook content, facts about science/history/math, greetings, or ephemeral questions (e.g. "wants an example of Newton's law" is NOT a durable fact).
- NEVER store sensitive personal data (health, family, contact details, passwords, location).
- If no new durable student learning fact is revealed, reply with "NONE".
- If a new fact is revealed, output ONLY the single short fact statement (e.g. "finds integration hard").

Existing known facts:
${existingFacts.length > 0 ? existingFacts.map((f) => `- ${f}`).join("\n") : "None"}

Student message: "${userMessage}"

Extracted fact (or NONE):`;

  try {
    let output = "";
    for await (const chunk of streamGeminiAnswer(
      "You extract only durable student learning profile facts. Output only the fact or NONE.",
      prompt,
      { checkCompleteness: false }
    )) {
      output += chunk.delta;
    }

    console.log(`[Memory Extraction] Raw LLM output: "${output}"`);
    let clean = output.trim().replace(/^["']|["']$/g, "").replace(/^[-*]\s*/, "").replace(/NONE\.?$/i, "").trim();
    if (!clean || clean.toUpperCase() === "NONE" || clean.toUpperCase().startsWith("NONE") || clean.length < 4 || clean.length > 120) {
      console.log(`[Memory Extraction] Clean output rejected: "${clean}"`);
      return existingFacts;
    }

    // Check for sensitive or disallowed keywords
    const lower = clean.toLowerCase();
    if (
      lower.includes("password") ||
      lower.includes("phone") ||
      lower.includes("address") ||
      lower.includes("health") ||
      lower.includes("hospital") ||
      lower.includes("doctor")
    ) {
      return existingFacts;
    }

    // Deduplicate against existing facts
    const isDuplicate = existingFacts.some(
      (f) => f.toLowerCase() === lower || lower.includes(f.toLowerCase()) || f.toLowerCase().includes(lower)
    );

    if (isDuplicate) return existingFacts;

    const updated = [...existingFacts, clean];
    return updated.slice(-20); // Cap at max 20 facts
  } catch (err) {
    console.warn("Failed to extract student facts:", err);
    return existingFacts;
  }
}

/**
 * Update rolling summary for a chat when message count exceeds 10.
 */
export async function updateRollingSummary(
  existingSummary: string,
  messages: Array<{ role: string; content: string }>
): Promise<string> {
  const recentLines = messages
    .slice(-6)
    .map((m) => `${m.role === "user" ? "Student" : "Tutor"}: ${m.content.slice(0, 200)}`)
    .join("\n");

  const prompt = `Summarize the key academic concepts and topics covered in this conversation in 2-3 concise sentences.
Existing summary: ${existingSummary || "None"}
Recent discussion:
${recentLines}

Updated concise summary:`;

  try {
    let summary = "";
    for await (const chunk of streamGeminiAnswer(
      "You are a concise academic conversation summarizer. Output only the updated 2-3 sentence summary.",
      prompt,
      { checkCompleteness: false }
    )) {
      summary += chunk.delta;
    }
    return summary.trim() || existingSummary;
  } catch (err) {
    console.warn("Failed to update rolling summary:", err);
    return existingSummary;
  }
}
