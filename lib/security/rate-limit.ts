import { Ratelimit } from "@upstash/ratelimit";
import { Redis } from "@upstash/redis";

type LimitResult = {
  success: boolean;
  limit: number;
  remaining: number;
  reset: number;
  retryAfterSeconds: number;
};

type InMemoryBucket = {
  count: number;
  resetAt: number;
};

const inMemoryStore = new Map<string, InMemoryBucket>();

let upstashRedis: Redis | null = null;
let checkOrderIpLimiter: Ratelimit | null = null;
let submitOrderPhoneLimiter: Ratelimit | null = null;

function hasUpstashConfig() {
  return Boolean(
    process.env.UPSTASH_REDIS_REST_URL && process.env.UPSTASH_REDIS_REST_TOKEN
  );
}

function getRedisClient() {
  if (!hasUpstashConfig()) {
    return null;
  }

  if (!upstashRedis) {
    upstashRedis = Redis.fromEnv();
  }

  return upstashRedis;
}

function getCheckOrderLimiter() {
  const redis = getRedisClient();
  if (!redis) {
    return null;
  }

  if (!checkOrderIpLimiter) {
    checkOrderIpLimiter = new Ratelimit({
      redis,
      limiter: Ratelimit.fixedWindow(5, "1 m"),
      prefix: "rl:check-order:ip",
      analytics: false,
    });
  }

  return checkOrderIpLimiter;
}

function getSubmitOrderLimiter() {
  const redis = getRedisClient();
  if (!redis) {
    return null;
  }

  if (!submitOrderPhoneLimiter) {
    submitOrderPhoneLimiter = new Ratelimit({
      redis,
      limiter: Ratelimit.fixedWindow(3, "1 h"),
      prefix: "rl:submit-order:phone",
      analytics: false,
    });
  }

  return submitOrderPhoneLimiter;
}

function toRetryAfterSeconds(resetAtMs: number) {
  const deltaMs = Math.max(0, resetAtMs - Date.now());
  return Math.max(1, Math.ceil(deltaMs / 1000));
}

function runInMemoryLimit(key: string, limit: number, windowMs: number): LimitResult {
  const now = Date.now();
  const bucket = inMemoryStore.get(key);

  if (!bucket || bucket.resetAt <= now) {
    const resetAt = now + windowMs;
    inMemoryStore.set(key, { count: 1, resetAt });
    return {
      success: true,
      limit,
      remaining: Math.max(0, limit - 1),
      reset: resetAt,
      retryAfterSeconds: toRetryAfterSeconds(resetAt),
    };
  }

  bucket.count += 1;
  inMemoryStore.set(key, bucket);

  return {
    success: bucket.count <= limit,
    limit,
    remaining: Math.max(0, limit - bucket.count),
    reset: bucket.resetAt,
    retryAfterSeconds: toRetryAfterSeconds(bucket.resetAt),
  };
}

export async function limitCheckOrderByIp(ip: string): Promise<LimitResult> {
  const limiter = getCheckOrderLimiter();
  if (!limiter) {
    return runInMemoryLimit(`check-order:${ip}`, 5, 60_000);
  }

  const result = await limiter.limit(ip);
  return {
    success: result.success,
    limit: result.limit,
    remaining: result.remaining,
    reset: result.reset,
    retryAfterSeconds: toRetryAfterSeconds(result.reset),
  };
}

export async function limitOrderSubmitByPhone(
  normalizedPhone: string
): Promise<LimitResult> {
  const limiter = getSubmitOrderLimiter();
  if (!limiter) {
    return runInMemoryLimit(`submit-order:${normalizedPhone}`, 3, 3_600_000);
  }

  const result = await limiter.limit(normalizedPhone);
  return {
    success: result.success,
    limit: result.limit,
    remaining: result.remaining,
    reset: result.reset,
    retryAfterSeconds: toRetryAfterSeconds(result.reset),
  };
}

export function attachRateLimitHeaders(
  response: Response,
  limitResult: LimitResult
): Response {
  response.headers.set("X-RateLimit-Limit", String(limitResult.limit));
  response.headers.set("X-RateLimit-Remaining", String(limitResult.remaining));
  response.headers.set("X-RateLimit-Reset", String(limitResult.reset));

  if (!limitResult.success) {
    response.headers.set("Retry-After", String(limitResult.retryAfterSeconds));
  }

  return response;
}
