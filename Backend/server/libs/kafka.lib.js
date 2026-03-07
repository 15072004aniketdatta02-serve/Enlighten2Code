import { Kafka, logLevel, Partitioners } from "kafkajs";
import logger from "../loggers/logger.js";

/**
 * Kafka client — producer + consumer factory.
 * Uses Promise.race with 5 s timeout so a dead broker doesn't block startup.
 */

let kafka, producer;
let _ready = false;
const _consumers = [];

export const KAFKA_TOPICS = {
  SUBMISSION_EVENTS:   "submission-events",
  ANALYTICS_EVENTS:    "analytics-events",
  NOTIFICATION_EVENTS: "notification-events",
  CONTEST_EVENTS:      "contest-events",
};

/* suppress noisy kafkajs output */
const _logCreator = () => ({ level, log }) => {
  // Ignore connection errors during the initial 5s race to avoid console spam
  if (log.message.includes("Connection error") || log.message.includes("Failed to connect")) return;
  
  if (level === logLevel.ERROR) logger.error(`[Kafka] ${log.message}`);
  else if (level === logLevel.WARN) logger.warn(`[Kafka] ${log.message}`);
};

/* ─────────────────────────────── connect ─────────────────── */

export const connectKafka = async () => {
  const brokers = (process.env.KAFKA_BROKERS || "localhost:9092").split(",").map((b) => b.trim());

  try {
    kafka = new Kafka({
      clientId: "enlighten2code",
      brokers,
      logLevel: logLevel.WARN,
      logCreator: _logCreator,
      retry: { initialRetryTime: 300, retries: 3 },
    });

    producer = kafka.producer({ 
      allowAutoTopicCreation: true,
      createPartitioner: Partitioners.LegacyPartitioner 
    });

    await Promise.race([
      producer.connect(),
      new Promise((_, rej) => setTimeout(() => rej(new Error("Kafka connect timed out (5 s)")), 5000)),
    ]);

    _ready = true;
    logger.info(`📨 Kafka producer connected (${brokers.join(", ")})`);
  } catch (e) {
    _ready = false;
    if (producer) { try { await producer.disconnect(); } catch {} producer = null; }
    logger.warn(`⚠️  Kafka unavailable (${e.message}) — event streaming disabled`);
  }
};

/* ─────────────────────────────── produce ─────────────────── */

export const produceEvent = async (topic, key, value) => {
  if (!_ready) return;
  try {
    await producer.send({
      topic,
      messages: [{
        key: String(key),
        value: JSON.stringify({ ...value, _meta: { ts: new Date().toISOString(), svc: "enlighten2code" } }),
      }],
    });
  } catch (e) { logger.error(`Kafka produce[${topic}]:`, e.message); }
};

/* ─────────────────────────────── consume ─────────────────── */

export const createConsumer = async (groupId, topic, handler) => {
  if (!kafka || !_ready) return null;
  try {
    const c = kafka.consumer({ groupId });
    await Promise.race([
      c.connect(),
      new Promise((_, rej) => setTimeout(() => rej(new Error("Consumer connect timed out")), 5000)),
    ]);
    await c.subscribe({ topic, fromBeginning: false });
    await c.run({
      eachMessage: async ({ message }) => {
        try {
          await handler({
            key:   message.key?.toString(),
            value: JSON.parse(message.value.toString()),
            ts:    message.timestamp,
          });
        } catch (err) { logger.error(`Kafka consumer[${groupId}/${topic}]:`, err.message); }
      },
    });
    _consumers.push(c);
    logger.info(`📥 Kafka consumer '${groupId}' → '${topic}'`);
    return c;
  } catch (e) { logger.warn(`⚠️  Kafka consumer '${groupId}' skipped: ${e.message}`); return null; }
};

/* ─────────────────────────────── lifecycle ───────────────── */

export const disconnectKafka = async () => {
  for (const c of _consumers) await c.disconnect().catch(() => {});
  if (producer && _ready) await producer.disconnect().catch(() => {});
  _ready = false;
  logger.info("Kafka disconnected");
};

export const isKafkaReady = () => _ready;
