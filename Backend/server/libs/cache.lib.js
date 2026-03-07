import { getRedis, isRedisConnected } from "./redis.lib.js";
import logger from "../loggers/logger.js";

/**
 * Redis-backed cache helpers.
 * Every function is a no-op when Redis is unavailable.
 */

export const cacheGet = async (key) => {
  if (!isRedisConnected()) return null;
  try {
    const d = await getRedis().get(key);
    return d ? JSON.parse(d) : null;
  } catch (e) { logger.error(`cacheGet[${key}]:`, e.message); return null; }
};

export const cacheSet = async (key, value, ttl = 300) => {
  if (!isRedisConnected()) return;
  try { await getRedis().setex(key, ttl, JSON.stringify(value)); }
  catch (e) { logger.error(`cacheSet[${key}]:`, e.message); }
};

export const cacheDelete = async (...keys) => {
  if (!isRedisConnected() || !keys.length) return;
  try { await getRedis().del(...keys); }
  catch (e) { logger.error("cacheDelete:", e.message); }
};

export const cacheInvalidatePattern = async (pattern) => {
  if (!isRedisConnected()) return;
  try {
    const keys = await getRedis().keys(pattern);
    if (keys.length) { await getRedis().del(...keys); }
  } catch (e) { logger.error(`cacheInvalidate[${pattern}]:`, e.message); }
};

/**
 * Express middleware — caches JSON responses for GET requests.
 * @param {number} ttl  Seconds to cache (default 300)
 * @param {(req)=>string} keyFn  Optional custom key builder
 */
export const cacheMiddleware = (ttl = 300, keyFn) => async (req, res, next) => {
  if (!isRedisConnected()) return next();

  const key = keyFn ? keyFn(req) : `c:${req.originalUrl}:${req.user?.id || "a"}`;

  try {
    const hit = await getRedis().get(key);
    if (hit) return res.status(200).json({ ...JSON.parse(hit), _cached: true });
  } catch { /* miss */ }

  const _json = res.json.bind(res);
  res.json = (body) => {
    if (res.statusCode >= 200 && res.statusCode < 300)
      getRedis().setex(key, ttl, JSON.stringify(body)).catch(() => {});
    return _json(body);
  };
  next();
};
