import logger from "../loggers/logger.js";
import { pollBatchResults, submitBatch } from "../libs/judge0.lib.js";

// ─── RUN CODE (Playground — No DB storage) ──────────────────
export const runCode = async (req, res) => {
  try {
    const { source_code, language_id, stdin } = req.body;

    if (!source_code || !language_id) {
      return res
        .status(400)
        .json({ error: "source_code and language_id are required" });
    }

    // stdin can be a single string or an array of inputs
    const inputs = Array.isArray(stdin) ? stdin : [stdin || ""];

    // Prepare submissions for Judge0
    const submissions = inputs.map((input) => ({
      source_code,
      language_id,
      stdin: input,
    }));

    // Submit to Judge0
    const submitResponse = await submitBatch(submissions);
    const tokens = submitResponse.map((r) => r.token);

    // Poll for results
    const results = await pollBatchResults(tokens);

    // Format results
    const formattedResults = results.map((result, i) => ({
      testCase: i + 1,
      stdout: result.stdout?.trim() || null,
      stderr: result.stderr || null,
      compile_output: result.compile_output || null,
      status: result.status.description,
      memory: result.memory ? `${result.memory} KB` : null,
      time: result.time ? `${result.time} s` : null,
      exitCode: result.exit_code,
    }));

    res.status(200).json({
      success: true,
      message: "Code executed successfully",
      results: formattedResults,
    });
  } catch (error) {
    logger.error("Error running code:", error);
    res.status(500).json({ error: "Failed to run code" });
  }
};
