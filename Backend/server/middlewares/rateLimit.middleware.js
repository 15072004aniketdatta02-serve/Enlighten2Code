import { getRedis, isRedisConnected } from "../libs/redis.lib.js";
import logger from "../loggers/logger.js";

/**
 * Redis-backed sliding-window rate limiter.
 * Sets X-RateLimit-* headers. Skips silently when Redis is down.
 */
export const rateLimiter = ({
  windowMs = 60_000,
  maxRequests = 100,
  keyPrefix = "rl",
  message = "Too many requests — please slow down",
  keyGenerator,
} = {}) => async (req, res, next) => {
  if (!isRedisConnected()) return next();

  try {
    const id  = keyGenerator ? keyGenerator(req) : (req.user?.id || req.ip);
    const key = `${keyPrefix}:${req.path}:${id}`;
    const win = Math.ceil(windowMs / 1000);

    const pipe = getRedis().pipeline();
    pipe.incr(key);
    pipe.expire(key, win);
    const results = await pipe.exec();

    const count     = results[0][1];
    const remaining = Math.max(0, maxRequests - count);

    res.set({
      "X-RateLimit-Limit":     String(maxRequests),
      "X-RateLimit-Remaining": String(remaining),
      "X-RateLimit-Reset":     String(Math.ceil(Date.now() / 1000) + win),
    });

    if (count > maxRequests) {
      logger.warn(`Rate limit: ${id} on ${req.method} ${req.path} (${count}/${maxRequests})`);
      return res.status(429).json({ success: false, error: message, retryAfter: win });
    }

    next();
  } catch (e) {
    logger.error("Rate limiter error:", e.message);
    next(); // let request through on failure
  }
};

/* ─── Pre-configured limiters ────────────────────────────── */

export const rateLimiters = {
  general:   rateLimiter({ windowMs: 60_000,       maxRequests: 100, keyPrefix: "rl:api" }),
  execution: rateLimiter({ windowMs: 60_000,       maxRequests: 20,  keyPrefix: "rl:exec" }),
  ai:        rateLimiter({ windowMs: 3_600_000,    maxRequests: 10,  keyPrefix: "rl:ai" }),
  auth:      rateLimiter({ windowMs: 15 * 60_000,  maxRequests: 10,  keyPrefix: "rl:auth", message: "Too many login attempts", keyGenerator: (r) => r.ip }),
  contest:   rateLimiter({ windowMs: 60_000,       maxRequests: 30,  keyPrefix: "rl:contest" }),
};
