import { Queue, Worker } from "bullmq";
import { getRedis, isRedisConnected } from "./redis.lib.js";
import { submitBatch, pollBatchResults, getLanguageName } from "./judge0.lib.js";
import { produceEvent, KAFKA_TOPICS } from "./kafka.lib.js";
import { getIO } from "../Sockets/socketManager.socket.js";
import { db } from "../database/dbconfig.js";
import logger from "../loggers/logger.js";

/**
 * BullMQ code-execution queue.
 * Offloads Judge0 calls to a background worker so the HTTP request
 * returns immediately with a job ID. The client polls or listens
 * via Socket.io for the result.
 *
 * Falls back to direct (synchronous) execution when Redis is unavailable.
 */

let executionQueue = null;
let executionWorker = null;

const QUEUE_NAME = "code-execution";

/* ─────────────────────────────── initialise ──────────────── */

export const initQueues = () => {
  if (!isRedisConnected()) {
    logger.warn("⚠️  BullMQ skipped — Redis not available (direct execution only)");
    return;
  }

  const sharedRedis = getRedis();

  // BullMQ Workers use blocking commands (BRPOPLPUSH) which require
  // maxRetriesPerRequest: null.  Create a dedicated connection by
  // duplicating the shared client and overriding the blocking options.
  const connection = sharedRedis.duplicate({
    maxRetriesPerRequest: null,
    enableOfflineQueue:   true,
  });

  connection.on("error", (err) =>
    logger.error(`BullMQ Redis error: ${err.message}`)
  );

  // ── Queue ──────────────────────────────────────────────────
  executionQueue = new Queue(QUEUE_NAME, {
    connection,
    defaultJobOptions: {
      attempts: 2,
      backoff: { type: "exponential", delay: 3000 },
      removeOnComplete: { count: 500 },  // keep last 500 completed
      removeOnFail:     { count: 200 },  // keep last 200 failed
    },
  });

  // ── Worker ─────────────────────────────────────────────────
  executionWorker = new Worker(
    QUEUE_NAME,
    async (job) => {
      const { source_code, language_id, stdin, expected_outputs, problemId, userId } = job.data;

      logger.info(`⚙️  [BullMQ] Processing job ${job.id} for user ${userId}`);

      // 1. Submit to Judge0
      const submissions = stdin.map((input) => ({ source_code, language_id, stdin: input }));
      const submitResp  = await submitBatch(submissions);
      const tokens      = submitResp.map((r) => r.token);

      await job.updateProgress(30);

      // 2. Poll results
      const results = await pollBatchResults(tokens);
      await job.updateProgress(70);

      // 3. Analyse
      let allPassed = true;
      const detailed = results.map((r, i) => {
        const stdout   = r.stdout?.trim();
        const expected = expected_outputs[i]?.trim();
        const passed   = stdout === expected;
        if (!passed) allPassed = false;
        return {
          testCase: i + 1, passed, stdout, expected,
          stderr: r.stderr || null,
          compile_output: r.compile_output || null,
          status: r.status.description,
          memory: r.memory ? `${r.memory} KB` : undefined,
          time:   r.time   ? `${r.time} s`   : undefined,
        };
      });

      // 4. Persist
      const submission = await db.submission.create({
        data: {
          userId, problemId,
          sourceCode: source_code,
          language: getLanguageName(language_id),
          stdin: stdin.join("\n"),
          stdout: JSON.stringify(detailed.map((r) => r.stdout)),
          stderr:  detailed.some((r) => r.stderr)  ? JSON.stringify(detailed.map((r) => r.stderr))  : null,
          compileOutput: detailed.some((r) => r.compile_output) ? JSON.stringify(detailed.map((r) => r.compile_output)) : null,
          status: allPassed ? "Accepted" : "Wrong Answer",
          memory: detailed.some((r) => r.memory) ? JSON.stringify(detailed.map((r) => r.memory)) : null,
          time:   detailed.some((r) => r.time)   ? JSON.stringify(detailed.map((r) => r.time))   : null,
        },
      });

      if (allPassed) {
        await db.problemSolved.upsert({
          where:  { userId_problemId: { userId, problemId } },
          update: {},
          create: { userId, problemId },
        });
      }

      await db.testCaseResult.createMany({
        data: detailed.map((r) => ({
          submissionId: submission.id,
          testCase: r.testCase, passed: r.passed,
          stdout: r.stdout,   expected: r.expected,
          stderr: r.stderr,   compileOutput: r.compile_output,
          status: r.status,   memory: r.memory, time: r.time,
        })),
      });

      const full = await db.submission.findUnique({
        where:   { id: submission.id },
        include: { testCases: true },
      });

      await job.updateProgress(100);

      // 5. Kafka events (fire-and-forget)
      const evtType = allPassed ? "submission.accepted" : "submission.failed";
      produceEvent(KAFKA_TOPICS.SUBMISSION_EVENTS, userId, {
        type: evtType, userId, problemId,
        submissionId: submission.id,
        status: allPassed ? "Accepted" : "Wrong Answer",
        language: getLanguageName(language_id),
        timestamp: new Date().toISOString(),
      }).catch(() => {});

      produceEvent(KAFKA_TOPICS.ANALYTICS_EVENTS, userId, {
        type: "submission.created", userId,
        data: { language: getLanguageName(language_id), status: allPassed ? "Accepted" : "Wrong Answer", problemId },
      }).catch(() => {});

      return { success: true, submission: full };
    },
    {
      connection,
      concurrency: 5,          // process up to 5 jobs in parallel
      limiter: { max: 20, duration: 60_000 },  // max 20 jobs per minute
    }
  );

  // Worker lifecycle events
  executionWorker.on("completed", (job, result) => {
    // Push result to the user via Socket.io
    try {
      const io = getIO();
      io.emit("execution:result", {
        jobId: job.id,
        userId: job.data.userId,
        result,
      });
    } catch { /* Socket.io not up */ }

    logger.info(`✅ [BullMQ] Job ${job.id} completed`);
  });

  executionWorker.on("failed", (job, err) => {
    try {
      const io = getIO();
      io.emit("execution:result", {
        jobId: job?.id,
        userId: job?.data?.userId,
        error: err.message,
      });
    } catch { /* ignore */ }

    logger.error(`❌ [BullMQ] Job ${job?.id} failed: ${err.message}`);
  });

  executionWorker.on("progress", (job, progress) => {
    try {
      const io = getIO();
      io.emit("execution:progress", {
        jobId: job.id,
        userId: job.data.userId,
        progress,
      });
    } catch { /* ignore */ }
  });

  logger.info("📦 BullMQ code-execution queue + worker initialised");
};

/* ──────────────────────────────── enqueue ────────────────── */

/**
 * Enqueue a code-execution job. Returns jobId for polling.
 * @returns {{ jobId: string }} or null if BullMQ is unavailable
 */
export const enqueueExecution = async (data) => {
  if (!executionQueue) return null;

  const job = await executionQueue.add("execute", data, {
    priority: data.priority || 1,
  });

  return { jobId: job.id };
};

/**
 * Get job status by ID.
 */
export const getJobStatus = async (jobId) => {
  if (!executionQueue) return null;

  const job = await executionQueue.getJob(jobId);
  if (!job) return null;

  const state    = await job.getState();
  const progress = job.progress;

  return {
    jobId: job.id,
    state,       // waiting | active | completed | failed | delayed
    progress,
    result: state === "completed" ? job.returnvalue : undefined,
    error:  state === "failed"    ? job.failedReason : undefined,
  };
};

/* ─────────────────────────────── shutdown ────────────────── */

export const shutdownQueues = async () => {
  if (executionWorker) await executionWorker.close();
  if (executionQueue)  await executionQueue.close();
  logger.info("BullMQ shut down");
};

export const isQueueReady = () => !!executionQueue;
