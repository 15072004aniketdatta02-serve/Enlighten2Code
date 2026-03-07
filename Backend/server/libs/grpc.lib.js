import grpc from "@grpc/grpc-js";
import protoLoader from "@grpc/proto-loader";
import path from "path";
import { fileURLToPath } from "url";
import { enqueueExecution, getJobStatus, isQueueReady } from "./bullmq.lib.js";
import { submitBatch, pollBatchResults, getLanguageName } from "./judge0.lib.js";
import { db } from "../database/dbconfig.js";
import logger from "../loggers/logger.js";

/**
 * gRPC server for code execution.
 * Provides an RPC interface for CLI tools and microservices.
 * Port defaults to GRPC_PORT (50051).
 */

const __filename = fileURLToPath(import.meta.url);
const __dirname  = path.dirname(__filename);

let grpcServer = null;

/* ──────────────────────────────── handlers ───────────────── */

const executeHandler = async (call, callback) => {
  const { source_code, language_id, stdin, expected_outputs, problem_id, user_id } = call.request;

  if (!source_code || !language_id || !stdin?.length) {
    return callback({ code: grpc.status.INVALID_ARGUMENT, message: "Missing required fields" });
  }

  try {
    // If BullMQ is available, queue the job
    if (isQueueReady()) {
      const result = await enqueueExecution({
        source_code, language_id, stdin, expected_outputs,
        problemId: problem_id, userId: user_id,
      });
      return callback(null, {
        success: true,
        job_id: result.jobId,
        message: "Job queued — poll GetStatus for result",
      });
    }

    // Fallback: direct execution
    const submissions = stdin.map((input) => ({ source_code, language_id, stdin: input }));
    const submitResp  = await submitBatch(submissions);
    const tokens      = submitResp.map((r) => r.token);
    const results     = await pollBatchResults(tokens);

    let allPassed = true;
    results.forEach((r, i) => {
      if (r.stdout?.trim() !== expected_outputs[i]?.trim()) allPassed = false;
    });

    const submission = await db.submission.create({
      data: {
        userId: user_id, problemId: problem_id,
        sourceCode: source_code,
        language: getLanguageName(language_id),
        stdin: stdin.join("\n"),
        stdout: JSON.stringify(results.map((r) => r.stdout?.trim())),
        status: allPassed ? "Accepted" : "Wrong Answer",
      },
    });

    callback(null, {
      success: true,
      job_id: submission.id,
      message: allPassed ? "All tests passed" : "Some tests failed",
    });
  } catch (err) {
    logger.error("gRPC Execute error:", err.message);
    callback({ code: grpc.status.INTERNAL, message: err.message });
  }
};

const getStatusHandler = async (call, callback) => {
  const { job_id } = call.request;
  if (!job_id) return callback({ code: grpc.status.INVALID_ARGUMENT, message: "job_id required" });

  try {
    const status = await getJobStatus(job_id);
    if (!status) return callback({ code: grpc.status.NOT_FOUND, message: "Job not found" });

    callback(null, {
      job_id: status.jobId,
      state:  status.state,
      progress: status.progress || 0,
      result: status.result ? JSON.stringify(status.result) : "",
      error:  status.error || "",
    });
  } catch (err) {
    callback({ code: grpc.status.INTERNAL, message: err.message });
  }
};

const healthHandler = (_call, callback) => {
  callback(null, { status: "SERVING" });
};

/* ───────────────────────────── start / stop ──────────────── */

export const startGrpcServer = () => {
  const port = process.env.GRPC_PORT || 50051;

  try {
    const protoPath = path.join(__dirname, "..", "protos", "codeExecution.proto");
    const pkgDef    = protoLoader.loadSync(protoPath, {
      keepCase: true,
      longs: String,
      enums: String,
      defaults: true,
      oneofs: true,
    });
    const proto = grpc.loadPackageDefinition(pkgDef).enlighten2code;

    grpcServer = new grpc.Server();

    grpcServer.addService(proto.CodeExecutionService.service, {
      Execute: executeHandler,
      GetStatus: getStatusHandler,
    });

    grpcServer.addService(proto.HealthService.service, {
      Check: healthHandler,
    });

    grpcServer.bindAsync(
      `0.0.0.0:${port}`,
      grpc.ServerCredentials.createInsecure(),
      (err) => {
        if (err) {
          logger.warn(`⚠️  gRPC failed to bind on port ${port}: ${err.message}`);
          grpcServer = null;
          return;
        }
        logger.info(`🔗 gRPC server listening on port ${port}`);
      }
    );
  } catch (err) {
    logger.warn(`⚠️  gRPC init failed: ${err.message}`);
    grpcServer = null;
  }
};

export const stopGrpcServer = () => {
  if (grpcServer) {
    grpcServer.forceShutdown();
    logger.info("gRPC server stopped");
  }
};
