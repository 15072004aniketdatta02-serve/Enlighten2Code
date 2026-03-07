import logger from "../loggers/logger.js";

/**
 * Webhook preprocessor middleware.
 * Normalizes incoming webhook payloads into a standard internal format.
 *
 * Attaches req.webhookEvent with:
 *   - type: string (event type)
 *   - data: object (event payload)
 *   - timestamp: ISO string
 *   - source: string (webhook provider)
 */
export const preprocessWebhook = (req, res, next) => {
  try {
    const body = req.body;
    const source = req.headers["x-webhook-source"] || "internal";

    // Normalize the payload into a standard format
    const webhookEvent = {
      type: body.event || body.type || body.action || "unknown",
      data: body.data || body.payload || body,
      timestamp: body.timestamp || new Date().toISOString(),
      source,
      rawHeaders: {
        deliveryId: req.headers["x-webhook-delivery-id"] || null,
        source: source,
      },
    };

    req.webhookEvent = webhookEvent;

    logger.info(
      `📨 Webhook received: type=${webhookEvent.type}, source=${source}`
    );

    next();
  } catch (error) {
    logger.error("Webhook preprocessing error:", error);
    return res.status(400).json({ error: "Invalid webhook payload" });
  }
};
