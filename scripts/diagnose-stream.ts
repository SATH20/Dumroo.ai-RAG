import fs from "fs";
import path from "path";

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
      if (!process.env[k]) process.env[k] = v;
    }
  }
}

async function testModel(model: string) {
  const key = process.env.GEMINI_API_KEY;
  const url = `https://generativelanguage.googleapis.com/v1beta/models/${model}:streamGenerateContent?alt=sse&key=${key}`;

  console.log(`Testing streamGenerateContent on ${model}...`);
  const res = await fetch(url, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      contents: [{ parts: [{ text: "Explain Newton's second law." }] }],
      generationConfig: { maxOutputTokens: 1024, temperature: 0.2 }
    })
  });

  console.log("Response status:", res.status);
  if (!res.ok) {
    console.log("Error body:", await res.text());
    return;
  }
  const reader = res.body?.getReader();
  const decoder = new TextDecoder();
  let buffer = "";
  let finalFinishReason: string | null = null;
  let fullText = "";

  while (true) {
    const { done, value } = await reader!.read();
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
        if (parsed.error) console.log("SSE In-Stream Error:", parsed.error);
        const text = parsed?.candidates?.[0]?.content?.parts?.[0]?.text || "";
        fullText += text;
        const fr = parsed?.candidates?.[0]?.finishReason;
        if (fr) finalFinishReason = fr;
      } catch (e) {}
    }
  }

  console.log(`Model: ${model} -> Text length: ${fullText.length}, finishReason: ${finalFinishReason}`);
}

async function main() {
  await testModel("gemini-3.8-flash");
}

main().catch(console.error);
