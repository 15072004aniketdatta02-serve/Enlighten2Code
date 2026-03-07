import crypto from "crypto";
import logger from "../loggers/logger.js";

/**
 * Verify incoming webhook signatures using HMAC-SHA256.
 * The webhook provider must sign the payload with the shared secret.
 *
 * Expected headers:
 *   - x-webhook-signature: HMAC-SHA256 hex digest of the raw body
 *
 * Set WEBHOOK_SECRET in your .env file.
 */
export const verifyWebhookSignature = (req, res, next) => {
  const secret = process.env.WEBHOOK_SECRET;

  if (!secret) {
    logger.warn("WEBHOOK_SECRET not set — skipping signature verification");
    return next();
  }

  const signature = req.headers["x-webhook-signature"];

  if (!signature) {
    logger.warn("Webhook received without signature header");
    return res.status(401).json({ error: "Missing webhook signature" });
  }

  try {
    const rawBody = JSON.stringify(req.body);
    const expectedSignature = crypto
      .createHmac("sha256", secret)
      .update(rawBody)
      .digest("hex");

    const isValid = crypto.timingSafeEqual(
      Buffer.from(signature),
      Buffer.from(expectedSignature)
    );

    if (!isValid) {
      logger.warn("Webhook signature verification failed");
      return res.status(403).json({ error: "Invalid webhook signature" });
    }

    next();
  } catch (error) {
    logger.error("Webhook verification error:", error);
    return res.status(500).json({ error: "Webhook verification failed" });
  }
};
