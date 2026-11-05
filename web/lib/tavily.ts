/**
 * web/lib/tavily.ts
 * Tavily Web Search client for Teacher Chat.
 */

export interface TavilySearchResult {
  title: string;
  url: string;
  content: string;
  score: number;
}

export async function searchTavily(query: string, maxResults: number = 4): Promise<TavilySearchResult[]> {
  const apiKey = process.env.TAVILY_API_KEY;
  if (!apiKey) {
    console.warn("TAVILY_API_KEY is not set.");
    return [];
  }

  try {
    const response = await fetch("https://api.tavily.com/search", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        api_key: apiKey,
        query,
        search_depth: "basic",
        max_results: maxResults,
        include_answer: false,
      }),
    });

    if (!response.ok) {
      const errText = await response.text();
      console.warn(`Tavily search failed [${response.status}]: ${errText.slice(0, 150)}`);
      return [];
    }

    const data = await response.json();
    const seenUrls = new Set<string>();
    const deduped: TavilySearchResult[] = [];

    for (const r of data.results || []) {
      const rawUrl = (r.url || "").trim();
      if (!rawUrl) continue;
      const normUrl = rawUrl.replace(/\/+$/, "");
      if (seenUrls.has(normUrl)) continue;
      seenUrls.add(normUrl);

      deduped.push({
        title: r.title || "Web Resource",
        url: rawUrl,
        content: r.content || "",
        score: r.score || 0,
      });
    }

    return deduped;
  } catch (err) {
    console.error("Tavily search error:", err);
    return [];
  }
}
