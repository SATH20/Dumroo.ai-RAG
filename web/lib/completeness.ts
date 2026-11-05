/**
 * Strict completeness check for RAG responses.
 * 
 * Rules:
 * a) Real terminal punctuation (. ! ? or a closing $$ block followed by text that ends in punctuation).
 * b) LaTeX is balanced:
 *    - count of $$ is even
 *    - after removing $$...$$ blocks, count of single $ is even
 *    - curly braces { and } are balanced
 *    - no dangling \frac{, \mathbf{, etc.
 * c) Every citation is complete:
 *    - every "[" that starts a citation matches [<Book>, Ch <number>, p. <number(s)>] and is closed with "]"
 *    - no unclosed "[" anywhere.
 * d) No marker text ([[COVERED]], [[NOT_COVERED]]) anywhere.
 */

export interface CompletenessResult {
  complete: boolean;
  reason: string;
}

export function checkAnswerCompleteness(text: string): CompletenessResult {
  const trimmed = text.trim();
  if (!trimmed) {
    return { complete: false, reason: "Empty answer" };
  }

  // d) No marker text ([[COVERED]], [[NOT_COVERED]]) appears anywhere
  if (/\[\[(?:NOT_)?COVERED\]\]/.test(trimmed)) {
    return { complete: false, reason: "Contains marker text [[COVERED]] or [[NOT_COVERED]]" };
  }

  // a) Terminal punctuation: ends with . ! ? or a closing $$ block (optionally followed by terminal punctuation or citation)
  // Markdown bold/italic/quotes/brackets after punctuation are allowed (e.g. "...end." or "...end**." or "...end.**")
  // Citations at the end of a sentence or formula (e.g. "...equation [Mathematics, Ch 1, p. 3]" or "$$...$$ [Physics, Ch 4, p. 55]") are also complete.
  // Inline formulas ending a bullet or statement (e.g. "3. $v^2 = v_0^2 + 2ax$") are also complete.
  const endsWithPunctuation =
    /[.!?]\s*(\*\*|\*|"|'|\)|\])*$/.test(trimmed) ||
    /\$\$\s*$/.test(trimmed) ||
    /\$\$\s*[.!?]\s*$/.test(trimmed) ||
    /\$[^\$\n]+\$\s*$/.test(trimmed) ||
    /\[[^\]]+\bpp?\.?\s*\d+[^\]]*\]\s*$/.test(trimmed) ||
    /\$\$\s*\[[^\]]+\bpp?\.?\s*\d+[^\]]*\]\s*$/.test(trimmed);

  if (!endsWithPunctuation) {
    return {
      complete: false,
      reason: `Does not end with terminal punctuation (. ! ?) or closing $$: "${trimmed.slice(-30)}"`,
    };
  }

  // b) LaTeX is balanced
  // Count of $$ must be even
  const doubleDollarMatches = trimmed.match(/\$\$/g);
  const doubleDollarCount = doubleDollarMatches ? doubleDollarMatches.length : 0;
  if (doubleDollarCount % 2 !== 0) {
    return { complete: false, reason: `Unbalanced block LaTeX math ($$ count: ${doubleDollarCount})` };
  }

  // Remove all $$...$$ blocks to check single $
  const withoutBlocks = trimmed.replace(/\$\$[\s\S]*?\$\$/g, "");
  // Ignore escaped dollar signs \$
  const withoutEscaped = withoutBlocks.replace(/\\(\$|\\)/g, "");
  const singleDollarMatches = withoutEscaped.match(/(?<!\$)\$(?!\$)/g);
  const singleDollarCount = singleDollarMatches ? singleDollarMatches.length : 0;
  if (singleDollarCount % 2 !== 0) {
    return { complete: false, reason: `Unbalanced inline LaTeX math ($ count: ${singleDollarCount})` };
  }

  // Check balanced curly braces { and }
  let braceDepth = 0;
  for (let i = 0; i < trimmed.length; i++) {
    if (trimmed[i] === "{") braceDepth++;
    else if (trimmed[i] === "}") braceDepth--;
    if (braceDepth < 0) {
      return { complete: false, reason: "Unmatched closing curly brace '}' in LaTeX" };
    }
  }
  if (braceDepth !== 0) {
    return { complete: false, reason: `Unclosed curly brace '{' in LaTeX (unclosed count: ${braceDepth})` };
  }

  // No dangling LaTeX commands at end of text (e.g. \frac{, \mathbf{, \text{, \vec{)
  if (/\\(?:frac|mathbf|mathrm|text|vec|sqrt|partial|mathit|textbf|pmb|boldsymbol)\s*\{?[^}]*$/.test(trimmed)) {
    return { complete: false, reason: "Dangling incomplete LaTeX command at end of answer" };
  }

  // c) Every citation is complete
  // Check for any unclosed "["
  let bracketDepth = 0;
  for (let i = 0; i < trimmed.length; i++) {
    if (trimmed[i] === "[") bracketDepth++;
    else if (trimmed[i] === "]") bracketDepth--;
    if (bracketDepth < 0) {
      return { complete: false, reason: "Unmatched closing bracket ']' in text" };
    }
  }
  if (bracketDepth !== 0) {
    return { complete: false, reason: `Unclosed bracket '[' in text (unclosed count: ${bracketDepth})` };
  }

  // Check curriculum citations: every "[" mentioning Book/Curriculum must have valid chapter and page
  // Matches brackets like [Physics Part 1, Ch 4, p. 55] or [Physics Part 1, Ch]
  const citationMatches = trimmed.match(/\[([^\]]*)\]/g) || [];
  const curriculumKeywords = /Physics|Chemistry|Biology|Mathematics|Maths|History|NCERT/i;

  for (const c of citationMatches) {
    const inner = c.slice(1, -1).trim();
    // Skip external/web source labels (e.g. "[Source: Newton's Law | Physics | FuseSchool]", URLs, or pipe-separated source titles)
    if (
      inner.toLowerCase().startsWith("source:") ||
      inner.toLowerCase().startsWith("web") ||
      inner.includes("http") ||
      inner.includes("|") ||
      inner.includes(".com") ||
      inner.includes(".org") ||
      inner.includes(".edu")
    ) {
      continue;
    }

    if (curriculumKeywords.test(inner)) {
      // Must contain Chapter/Ch <number> AND p./pp. <number>
      const hasChapter = /\b(?:ch|chapter)\.?\s*\d+\b/i.test(inner);
      const hasPage = /\bpp?\.?\s*\d+/i.test(inner);
      if (!hasChapter || !hasPage) {
        return {
          complete: false,
          reason: `Incomplete citation "${c}" (must match [<Book>, Ch <number>, p. <number(s)>])`,
        };
      }
    }
  }

  return { complete: true, reason: "Complete" };
}
