import { createConsumer, KAFKA_TOPICS } from "../kafka.lib.js";
import { getIO } from "../../Sockets/socketManager.socket.js";
import logger from "../../loggers/logger.js";

/**
 * Consumes notification events — pushes real-time notifications via Socket.io.
 */
export const startNotificationConsumer = async () => {
  await createConsumer("notification-dispatcher", KAFKA_TOPICS.NOTIFICATION_EVENTS, async ({ value }) => {
    const { type, userId, data } = value;

    let io;
    try { io = getIO(); } catch { return; }

    const ts = new Date().toISOString();

    const notifications = {
      "notification.achievement":      { type: "achievement",      title: data?.title || "Achievement Unlocked! 🏆", message: data?.message },
      "notification.contest.started":  { type: "contest_started",  title: `Contest Started: ${data?.title}`, room: `contest:${data?.contestId}` },
      "notification.contest.ended":    { type: "contest_ended",    title: `Contest Ended: ${data?.title}`,   room: `contest:${data?.contestId}` },
      "notification.review.due":       { type: "review_due",       title: "📚 Review Due!", message: `${data?.count || "Some"} problems due` },
      "notification.social.followed":  { type: "social",           title: "New Follower! 👥", message: `${data?.followerName} followed you` },
    };

    const notif = notifications[type];
    if (!notif) return;

    const payload = { targetUserId: userId, ...notif, timestamp: ts };

    if (notif.room) {
      io.to(notif.room).emit("notification", payload);
    } else {
      io.emit("notification", payload);
    }
  });
};
