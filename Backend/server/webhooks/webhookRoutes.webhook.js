import express from "express";
import { verifyWebhookSignature } from "./webhookVerifier.webhook.js";
import { preprocessWebhook } from "./webhookPreproccessor.webhook.js";
import { handleWebhookEvent } from "./webhookHandlers.webhook.js";
import logger from "../loggers/logger.js";

const webhookRouter = express.Router();

/**
 * POST /api/v1/webhooks/ingest
 *
 * Main webhook ingestion endpoint.
 * Flow: verify signature → preprocess payload → route to handler.
 */
webhookRouter.post(
  "/ingest",
  verifyWebhookSignature,
  preprocessWebhook,
  async (req, res) => {
    try {
      const result = await handleWebhookEvent(req.webhookEvent);

      if (result.handled) {
        return res.status(200).json({
          success: true,
          message: `Webhook event '${result.type}' processed successfully`,
        });
      }

      return res.status(200).json({
        success: true,
        message: `Webhook event '${result.type}' received but no handler registered`,
        warning: result.reason,
      });
    } catch (error) {
      logger.error("Webhook processing error:", error);
      return res.status(500).json({ error: "Webhook processing failed" });
    }
  }
);

/**
 * GET /api/v1/webhooks/health
 *
 * Webhook health check endpoint — useful for provider setup.
 */
webhookRouter.get("/health", (req, res) => {
  res.status(200).json({
    success: true,
    message: "Webhook endpoint is healthy",
    timestamp: new Date().toISOString(),
  });
});

export default webhookRouter;
