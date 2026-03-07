import { db } from "../../database/dbconfig.js";
import { createConsumer, KAFKA_TOPICS } from "../kafka.lib.js";
import logger from "../../loggers/logger.js";

/**
 * Consumes submission events — streak milestones + hint triggers.
 */
export const startSubmissionConsumer = async () => {
  await createConsumer("submission-processor", KAFKA_TOPICS.SUBMISSION_EVENTS, async ({ value }) => {
    const { type, userId, problemId } = value;

    if (type === "submission.accepted") {
      try {
        const total = await db.problemSolved.count({ where: { userId } });
        const milestones = [10, 25, 50, 100, 250, 500];
        if (milestones.includes(total)) {
          logger.info(`🏆 User ${userId} hit milestone: ${total} problems solved`);
        }
      } catch (e) { logger.error("Submission consumer streak error:", e.message); }
    }

    if (type === "submission.failed") {
      try {
        const fails = await db.submission.count({
          where: { userId, problemId, status: { not: "Accepted" }, createdAt: { gte: new Date(Date.now() - 3600000) } },
        });
        if (fails >= 3) logger.info(`💡 User ${userId}: ${fails} failures on ${problemId} — hint eligible`);
      } catch (e) { logger.error("Submission consumer failure-track error:", e.message); }
    }
  });
};
