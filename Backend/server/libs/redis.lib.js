import Redis from "ioredis";
import logger from "../loggers/logger.js";

/**
 * Redis client singleton.
 *
 * Access via getRedis() — never import `redis` directly because the
 * `let` is reassigned after connectRedis() resolves and ES module
 * named bindings would capture the stale `undefined`.
 */

let _redis = null;
let _connected = false;

/* ───────────────────────────────────────────── connect ──── */

export const connectRedis = () =>
  new Promise((resolve) => {
    const url = process.env.REDIS_URL || "redis://localhost:6379";

    const client = new Redis(url, {
      maxRetriesPerRequest: 3,
      enableOfflineQueue: false,
      connectTimeout: 5000,
      retryStrategy: (times) => (times > 3 ? null : Math.min(times * 200, 1000)),
      lazyConnect: true,
    });

    // swallow errors during the connect race
    client.on("error", () => {});

    client
      .connect()
      .then(() => {
        _redis = client;
        _connected = true;

        // swap in real handlers now that we're live
        client.removeAllListeners("error");
        client.on("error", (e) => { _connected = false; logger.error("Redis error:", e.message); });
        client.on("close", ()  => { _connected = false; logger.warn("Redis connection closed"); });
        client.on("reconnecting", () => logger.info("Redis reconnecting…"));

        logger.info("🔴 Redis connected");
        resolve(_redis);
      })
      .catch((err) => {
        _connected = false;
        try { client.disconnect(false); } catch { /* noop */ }
        logger.warn(`⚠️  Redis unavailable (${err.message}) — cache & rate-limiting disabled`);
        _redis = _createNoOp();
        resolve(_redis);
      });
  });

/* ───────────────────────────────────────── accessors ──── */

export const getRedis        = () => _redis;
export const isRedisConnected = () => _connected;

export const disconnectRedis = async () => {
  if (_redis && _connected) { await _redis.quit(); _connected = false; logger.info("Redis disconnected"); }
};

/* ──────────────────────────────────── no-op fallback ──── */

function _createNoOp() {
  const n = () => Promise.resolve(null);
  return {
    get: n, set: n, del: n, setex: n, incr: n, expire: n, ttl: n,
    sadd: n, scard: n, hincrby: n, hgetall: () => Promise.resolve({}),
    exists: () => Promise.resolve(0),
    keys:   () => Promise.resolve([]),
    flushdb: n,
    pipeline: () => ({
      exec:   () => Promise.resolve([[null, 0], [null, 1]]),
      get()   { return this; },
      set()   { return this; },
      del()   { return this; },
      setex() { return this; },
      incr()  { return this; },
      expire(){ return this; },
    }),
    duplicate:  () => _createNoOp(),
    on:         () => {},
    quit:       n,
    disconnect: () => {},
    status:     "noop",
  };
}
