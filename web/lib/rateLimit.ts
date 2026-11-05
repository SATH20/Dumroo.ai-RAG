/**
 * In-memory sliding-window rate limiter for Dumroo RAG.
 * Limit: max 20 questions per 10 minutes per user/IP.
 */

const WINDOW_MS = 10 * 60 * 1000; // 10 minutes
const MAX_REQUESTS = 20;

// Map of client identifier -> array of request timestamps (epoch ms)
const rateLimitMap = new Map<string, number[]>();

// Clean up expired entries every 60 seconds to avoid unbounded memory growth
if (typeof setInterval !== "undefined") {
  const cleanupTimer = setInterval(() => {
    const now = Date.now();
    for (const [key, timestamps] of rateLimitMap.entries()) {
      const valid = timestamps.filter((t) => now - t < WINDOW_MS);
      if (valid.length === 0) {
        rateLimitMap.delete(key);
      } else {
        rateLimitMap.set(key, valid);
      }
    }
  }, 60 * 1000);

  if (cleanupTimer.unref) {
    cleanupTimer.unref();
  }
}

export interface RateLimitResult {
  allowed: boolean;
  remaining: number;
  resetMs: number;
}

export function checkRateLimit(clientId: string): RateLimitResult {
  const now = Date.now();
  const timestamps = rateLimitMap.get(clientId) || [];

  // Filter timestamps within the 10-minute sliding window
  const validTimestamps = timestamps.filter((t) => now - t < WINDOW_MS);

  if (validTimestamps.length >= MAX_REQUESTS) {
    const oldest = validTimestamps[0];
    const resetMs = Math.max(0, WINDOW_MS - (now - oldest));
    return {
      allowed: false,
      remaining: 0,
      resetMs,
    };
  }

  validTimestamps.push(now);
  rateLimitMap.set(clientId, validTimestamps);

  return {
    allowed: true,
    remaining: MAX_REQUESTS - validTimestamps.length,
    resetMs: WINDOW_MS,
  };
}
