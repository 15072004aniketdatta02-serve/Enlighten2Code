import logger from "../loggers/logger.js";

/**
 * Webhook event handler registry.
 * Maps event types to handler functions.
 */
const eventHandlers = {
  // ─── Contest Events ─────────────────────────────────────
  "contest.started": async (data) => {
    logger.info(`🏁 Contest started: ${data.contestId || data.title}`);
    // Future: send push notifications, update status, etc.
  },

  "contest.ended": async (data) => {
    logger.info(`🏁 Contest ended: ${data.contestId || data.title}`);
    // Future: trigger final leaderboard calculation, send results
  },

  // ─── Submission Events ────────────────────────────────
  "submission.accepted": async (data) => {
    logger.info(`✅ Accepted submission from user ${data.userId} for problem ${data.problemId}`);
    // Future: trigger streak update, send congratulations notification
  },

  "submission.failed": async (data) => {
    logger.info(`❌ Failed submission from user ${data.userId} for problem ${data.problemId}`);
    // Future: trigger hint suggestion after N failures
  },

  // ─── Streak Events ────────────────────────────────────
  "streak.milestone": async (data) => {
    logger.info(`🔥 Streak milestone! User ${data.userId} reached ${data.streak} day streak`);
    // Future: send badge notification, update leaderboard
  },

  // ─── User Events ──────────────────────────────────────
  "user.registered": async (data) => {
    logger.info(`👤 New user registered: ${data.userId}`);
    // Future: send welcome email, assign onboarding tasks
  },

  "user.banned": async (data) => {
    logger.info(`🚫 User banned: ${data.userId}`);
    // Future: invalidate sessions, send notification
  },

  // ─── Review Events ────────────────────────────────────
  "review.due": async (data) => {
    logger.info(`📚 Review due reminder for user ${data.userId}`);
    // Future: send email/push notification about due reviews
  },
};

/**
 * Process a normalized webhook event.
 * @param {Object} webhookEvent - { type, data, timestamp, source }
 */
export const handleWebhookEvent = async (webhookEvent) => {
  const { type, data } = webhookEvent;

  const handler = eventHandlers[type];

  if (handler) {
    try {
      await handler(data);
      return { handled: true, type };
    } catch (error) {
      logger.error(`Webhook handler error for event '${type}':`, error);
      return { handled: false, type, error: error.message };
    }
  }

  logger.warn(`No handler registered for webhook event type: ${type}`);
  return { handled: false, type, reason: "No handler registered" };
};

/**
 * Register a custom webhook event handler at runtime.
 * @param {string} eventType
 * @param {Function} handler
 */
export const registerWebhookHandler = (eventType, handler) => {
  eventHandlers[eventType] = handler;
  logger.info(`Registered webhook handler for event: ${eventType}`);
};
