import fs from "fs";

let content = fs.readFileSync("web/lib/gemini.ts", "utf8");

// Remove rewind snippet
const rewindSnippet = `    // Rewind dangling bracket or math cut off mid-stream
    const lastOpenBracket = fullGeneratedText.lastIndexOf("[");
    const lastCloseBracket = fullGeneratedText.lastIndexOf("]");
    if (lastOpenBracket > lastCloseBracket) {
      fullGeneratedText = fullGeneratedText.slice(0, lastOpenBracket).trimEnd();
    }
    const dollarMatches = fullGeneratedText.replace(/\\$\\$[\\s\\S]*?\\$\\$/g, "").match(/\\$/g);
    if (dollarMatches && dollarMatches.length % 2 !== 0) {
      const lastDollar = fullGeneratedText.lastIndexOf("$");
      if (lastDollar >= 0) {
        fullGeneratedText = fullGeneratedText.slice(0, lastDollar).trimEnd();
      }
    }\n\n`;

content = content.replace(rewindSnippet, "").replace(rewindSnippet.replace(/\n/g, "\r\n"), "");

fs.writeFileSync("web/lib/gemini.ts", content, "utf8");
console.log("Cleaned rewind from web/lib/gemini.ts");
