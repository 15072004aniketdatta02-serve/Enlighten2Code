import { db } from "../database/dbconfig.js";
import {
  getLanguageName,
  pollBatchResults,
  submitBatch,
} from "../libs/judge0.lib.js";
import { enqueueExecution, isQueueReady } from "../libs/bullmq.lib.js";
import { produceEvent, KAFKA_TOPICS } from "../libs/kafka.lib.js";
import logger from "../loggers/logger.js";

export const executeCode = async (req, res) => {
  try {
    const { source_code, language_id, stdin, expected_outputs, problemId } =
      req.body;

    const userId = req.user.id;

    // Validate test cases
    if (
      !Array.isArray(stdin) ||
      stdin.length === 0 ||
      !Array.isArray(expected_outputs) ||
      expected_outputs.length !== stdin.length
    ) {
      return res.status(400).json({ error: "Invalid or Missing test cases" });
    }

    /* ─── BullMQ path (async) ─────────────────────────────── */
    if (isQueueReady()) {
      const job = await enqueueExecution({
        source_code, language_id, stdin, expected_outputs, problemId, userId,
      });
      return res.status(202).json({
        success: true,
        message: "Execution queued — listen for execution:result via Socket.io",
        jobId: job.jobId,
      });
    }

    /* ─── Direct path (fallback when Redis / BullMQ offline) ── */

    const submissions = stdin.map((input) => ({
      source_code,
      language_id,
      stdin: input,
    }));

    const submitResponse = await submitBatch(submissions);
    const tokens = submitResponse.map((r) => r.token);
    const results = await pollBatchResults(tokens);

    let allPassed = true;
    const detailedResults = results.map((result, i) => {
      const stdout = result.stdout?.trim();
      const expected_output = expected_outputs[i]?.trim();
      const passed = stdout === expected_output;

      if (!passed) allPassed = false;

      return {
        testCase: i + 1,
        passed,
        stdout,
        expected: expected_output,
        stderr: result.stderr || null,
        compile_output: result.compile_output || null,
        status: result.status.description,
        memory: result.memory ? `${result.memory} KB` : undefined,
        time: result.time ? `${result.time} s` : undefined,
      };
    });

    // store submission summary
    const submission = await db.submission.create({
      data: {
        userId,
        problemId,
        sourceCode: source_code,
        language: getLanguageName(language_id),
        stdin: stdin.join("\n"),
        stdout: JSON.stringify(detailedResults.map((r) => r.stdout)),
        stderr: detailedResults.some((r) => r.stderr)
          ? JSON.stringify(detailedResults.map((r) => r.stderr))
          : null,
        compileOutput: detailedResults.some((r) => r.compile_output)
          ? JSON.stringify(detailedResults.map((r) => r.compile_output))
          : null,
        status: allPassed ? "Accepted" : "Wrong Answer",
        memory: detailedResults.some((r) => r.memory)
          ? JSON.stringify(detailedResults.map((r) => r.memory))
          : null,
        time: detailedResults.some((r) => r.time)
          ? JSON.stringify(detailedResults.map((r) => r.time))
          : null,
      },
    });

    if (allPassed) {
      await db.problemSolved.upsert({
        where: { userId_problemId: { userId, problemId } },
        update: {},
        create: { userId, problemId },
      });
    }

    const testCaseResults = detailedResults.map((result) => ({
      submissionId: submission.id,
      testCase: result.testCase,
      passed: result.passed,
      stdout: result.stdout,
      expected: result.expected,
      stderr: result.stderr,
      compileOutput: result.compile_output,
      status: result.status,
      memory: result.memory,
      time: result.time,
    }));

    await db.testCaseResult.createMany({ data: testCaseResults });

    const submissionWithTestCase = await db.submission.findUnique({
      where: { id: submission.id },
      include: { testCases: true },
    });

    /* ── Kafka events (fire-and-forget) ─────────────────────── */
    const evtType = allPassed ? "submission.accepted" : "submission.failed";
    produceEvent(KAFKA_TOPICS.SUBMISSION_EVENTS, userId, {
      type: evtType, userId, problemId,
      submissionId: submission.id,
      language: getLanguageName(language_id),
      timestamp: new Date().toISOString(),
    }).catch(() => {});

    produceEvent(KAFKA_TOPICS.ANALYTICS_EVENTS, userId, {
      type: "submission.created", userId,
      data: { language: getLanguageName(language_id), status: allPassed ? "Accepted" : "Wrong Answer", problemId },
    }).catch(() => {});

    res.status(200).json({
      success: true,
      message: "Code Executed Successfully!",
      submission: submissionWithTestCase,
    });
  } catch (error) {
    logger.error("Error executing code:", error.message);
    res.status(500).json({ error: "Failed to execute code" });
  }
};