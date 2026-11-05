import fs from "fs";
import path from "path";

// Load environment variables from web/.env.local
const envPath = path.resolve("web/.env.local");
if (fs.existsSync(envPath)) {
  const lines = fs.readFileSync(envPath, "utf-8").split("\n");
  for (const line of lines) {
    const trimmed = line.trim();
    if (!trimmed || trimmed.startsWith("#")) continue;
    const eqIdx = trimmed.indexOf("=");
    if (eqIdx > 0) {
      const k = trimmed.slice(0, eqIdx).trim();
      const v = trimmed.slice(eqIdx + 1).trim();
      process.env[k] = v;
    }
  }
}

import { getChatModels, getApiKeys } from "../web/lib/gemini";

const questions = [
  "What is a set?",
  "Newton's second law",
  "photosynthesis",
];

interface DiagResult {
  question: string;
  model: string;
  keyLabel: string;
  httpStatus: number | string;
  ttftMs: number | string;
  totalTimeMs: number | string;
  notes: string;
}

async function probeModelKey(
  question: string,
  model: string,
  key: string,
  keyLabel: string
): Promise<DiagResult> {
  const url = `https://generativelanguage.googleapis.com/v1beta/models/${model}:streamGenerateContent?alt=sse&key=${key}`;
  const promptBody = {
    contents: [{ parts: [{ text: `Answer in 2-3 concise sentences: ${question}` }] }],
    generationConfig: {
      temperature: 0.2,
      maxOutputTokens: 256,
      ...(model.includes("thinking") || model.includes("2.5") ? { thinkingConfig: { thinkingBudget: 0 } } : {}),
    },
  };

  const t0 = Date.now();
  let firstTokenTime: number | null = null;
  let totalTime: number | null = null;
  let receivedText = "";
  let httpStatus: number | string = 0;

  try {
    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), 15000); // 15s TTFB timeout

    const res = await fetch(url, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(promptBody),
      signal: controller.signal,
    });
    clearTimeout(timeoutId); // Headers arrived: clear TTFB timeout

    httpStatus = res.status;

    if (!res.ok) {
      const errText = await res.text();
      let msg = "";
      try {
        const parsed = JSON.parse(errText);
        msg = parsed?.error?.message || errText.slice(0, 80);
      } catch {
        msg = errText.slice(0, 80);
      }
      return {
        question,
        model,
        keyLabel,
        httpStatus,
        ttftMs: "N/A",
        totalTimeMs: Date.now() - t0,
        notes: msg.slice(0, 60),
      };
    }

    if (!res.body) {
      return {
        question,
        model,
        keyLabel,
        httpStatus,
        ttftMs: "N/A",
        totalTimeMs: Date.now() - t0,
        notes: "No response body",
      };
    }

    const reader = res.body.getReader();
    const decoder = new TextDecoder();
    let buffer = "";

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
          const candidate = parsed?.candidates?.[0];
          const text = candidate?.content?.parts?.[0]?.text;
          if (text) {
            if (firstTokenTime === null) {
              firstTokenTime = Date.now() - t0;
            }
            receivedText += text;
          }
        } catch {}
      }
    }

    totalTime = Date.now() - t0;
    const snippet = receivedText.trim().replace(/\n/g, " ").slice(0, 40);

    return {
      question,
      model,
      keyLabel,
      httpStatus,
      ttftMs: firstTokenTime !== null ? firstTokenTime : "N/A",
      totalTimeMs: totalTime,
      notes: snippet ? `OK ("${snippet}...")` : "OK (empty body)",
    };
  } catch (err: any) {
    const isAbort = err?.name === "AbortError" || String(err).includes("aborted");
    return {
      question,
      model,
      keyLabel,
      httpStatus: isAbort ? "TIMEOUT" : "ERR",
      ttftMs: "N/A",
      totalTimeMs: Date.now() - t0,
      notes: isAbort ? "TTFB timeout > 15s" : err.message?.slice(0, 60) || "Fetch exception",
    };
  }
}

async function runDiagnosis() {
  const models = getChatModels();
  const keys = getApiKeys();

  console.log("=========================================================================================");
  console.log("DIAGNOSTIC TEST: MODELS & KEYS PERFORMANCE (HTTP STATUS, TTFT, TOTAL TIME)");
  console.log(`Configured Models: ${models.join(", ")}`);
  console.log(`Configured Keys Count: ${keys.length} (Key values concealed)`);
  console.log("=========================================================================================\n");

  const results: DiagResult[] = [];

  for (const q of questions) {
    console.log(`\nTesting Question: "${q}"...`);
    for (const model of models) {
      for (let i = 0; i < keys.length; i++) {
        const key = keys[i];
        const keyLabel = `Key ${i + 1}`;
        process.stdout.write(`  [${model} on ${keyLabel}] -> `);
        const res = await probeModelKey(q, model, key, keyLabel);
        console.log(`Status: ${res.httpStatus} | TTFT: ${typeof res.ttftMs === "number" ? res.ttftMs + "ms" : res.ttftMs} | Total: ${res.totalTimeMs}ms | ${res.notes}`);
        results.push(res);
        // Small pause between probes
        await new Promise((r) => setTimeout(r, 400));
      }
    }
  }

  console.log("\n=========================================================================================");
  console.log("DIAGNOSTIC RESULTS SUMMARY TABLE");
  console.log("=========================================================================================");
  console.table(
    results.map((r) => ({
      Question: r.question,
      Model: r.model,
      Key: r.keyLabel,
      Status: r.httpStatus,
      TTFT: typeof r.ttftMs === "number" ? `${r.ttftMs}ms` : r.ttftMs,
      Total: `${r.totalTimeMs}ms`,
      Notes: r.notes.length > 45 ? r.notes.slice(0, 42) + "..." : r.notes,
    }))
  );
}

runDiagnosis().catch(console.error);
