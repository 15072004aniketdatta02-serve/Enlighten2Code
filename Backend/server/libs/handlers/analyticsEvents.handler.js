import { createConsumer, KAFKA_TOPICS } from "../kafka.lib.js";
import { getRedis, isRedisConnected } from "../redis.lib.js";
import logger from "../../loggers/logger.js";

/**
 * Consumes analytics events — aggregates DAU and per-language stats into Redis.
 */
export const startAnalyticsConsumer = async () => {
  await createConsumer("analytics-aggregator", KAFKA_TOPICS.ANALYTICS_EVENTS, async ({ value }) => {
    const { type, userId, data } = value;
    if (!isRedisConnected()) return;
    const r = getRedis();

    try {
      const today = new Date().toISOString().split("T")[0];

      if (type === "user.active") {
        await r.sadd(`analytics:dau:${today}`, userId);
        await r.expire(`analytics:dau:${today}`, 172800);
      }

      if (type === "submission.created") {
        const lang = data?.language || "unknown";
        await r.hincrby("analytics:submissions:byLanguage", lang, 1);
        await r.incr(`analytics:submissions:daily:${today}`);
        await r.expire(`analytics:submissions:daily:${today}`, 172800);
      }

      if (type === "problem.solved") {
        await r.incr("analytics:problems:totalSolved");
        await r.hincrby("analytics:problems:solvedByDifficulty", data?.difficulty || "UNKNOWN", 1);
      }
    } catch (e) { logger.error("Analytics consumer error:", e.message); }
  });
};
