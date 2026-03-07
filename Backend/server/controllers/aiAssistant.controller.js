import { db } from "../database/dbconfig.js";
import logger from "../loggers/logger.js";

// ─── Helper: Call AI API (OpenAI/Gemini-compatible) ─────────
const callAI = async (systemPrompt, userPrompt) => {
  const apiKey = process.env.AI_API_KEY;
  const apiUrl =
    process.env.AI_API_URL || "https://api.openai.com/v1/chat/completions";
  const model = process.env.AI_MODEL || "gpt-3.5-turbo";

  if (!apiKey) {
    return {
      success: false,
      message:
        "AI service not configured. Set AI_API_KEY in your environment variables.",
    };
  }

  try {
    const response = await fetch(apiUrl, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${apiKey}`,
      },
      body: JSON.stringify({
        model,
        messages: [
          { role: "system", content: systemPrompt },
          { role: "user", content: userPrompt },
        ],
        temperature: 0.7,
        max_tokens: 1500,
      }),
    });

    const data = await response.json();

    if (!response.ok) {
      logger.error("AI API error:", data);
      return { success: false, message: "AI service error" };
    }

    return {
      success: true,
      content: data.choices?.[0]?.message?.content || "No response generated",
    };
  } catch (error) {
    logger.error("AI API call failed:", error);
    return { success: false, message: "Failed to reach AI service" };
  }
};

// ─── GET HINT ───────────────────────────────────────────────
export const getHint = async (req, res) => {
  try {
    const { problemId } = req.body;
    const userId = req.user.id;

    if (!problemId) {
      return res.status(400).json({ error: "problemId is required" });
    }

    const problem = await db.problem.findUnique({ where: { id: problemId } });
    if (!problem) {
      return res.status(404).json({ error: "Problem not found" });
    }

    // Count user's failed attempts to determine hint level
    const failedAttempts = await db.submission.count({
      where: { userId, problemId, status: { not: "Accepted" } },
    });

    const hintLevel = Math.min(failedAttempts, 3); // 0-3 progressive hints

    const systemPrompt = `You are a coding mentor on a competitive programming platform. 
You give progressive hints — never the full solution. 
Hint Level: ${hintLevel}/3
- Level 0: Nudge the student toward the right approach (one sentence).
- Level 1: Suggest the data structure or algorithm category.
- Level 2: Provide a step-by-step outline (no code).
- Level 3: Give pseudocode with key steps.

NEVER give the complete working solution code.`;

    const userPrompt = `
Problem Title: ${problem.title}
Problem Description: ${problem.description}
Constraints: ${problem.constraints}
Difficulty: ${problem.difficulty}
Tags: ${problem.tags.join(", ")}

The student has failed ${failedAttempts} time(s). Give a Level ${hintLevel} hint.`;

    const aiResult = await callAI(systemPrompt, userPrompt);

    if (!aiResult.success) {
      // Fallback: return problem's built-in hints if available
      if (problem.hints) {
        return res.status(200).json({
          success: true,
          message: "Hint fetched (built-in)",
          data: { hint: problem.hints, source: "built-in", hintLevel },
        });
      }
      return res.status(503).json({ error: aiResult.message });
    }

    res.status(200).json({
      success: true,
      message: "Hint generated successfully",
      data: {
        hint: aiResult.content,
        source: "ai",
        hintLevel,
        failedAttempts,
      },
    });
  } catch (error) {
    logger.error("Error generating hint:", error);
    res.status(500).json({ error: "Failed to generate hint" });
  }
};

// ─── REVIEW CODE ────────────────────────────────────────────
export const reviewCode = async (req, res) => {
  try {
    const { submissionId } = req.body;
    const userId = req.user.id;

    if (!submissionId) {
      return res.status(400).json({ error: "submissionId is required" });
    }

    const submission = await db.submission.findUnique({
      where: { id: submissionId },
      include: { problem: { select: { title: true, tags: true, difficulty: true } } },
    });

    if (!submission) {
      return res.status(404).json({ error: "Submission not found" });
    }

    if (submission.userId !== userId) {
      return res.status(403).json({ error: "You can only review your own submissions" });
    }

    const systemPrompt = `You are a senior software engineer reviewing code submitted to a competitive programming platform.

Provide a structured code review covering:
1. **Time Complexity** — Big-O analysis
2. **Space Complexity** — Big-O analysis
3. **Code Quality** — variable naming, readability, structure
4. **Edge Cases** — any missed edge cases
5. **Optimization** — potential improvements
6. **Overall Rating** — /10

Be constructive and educational. Format with markdown.`;

    const userPrompt = `
Problem: ${submission.problem.title} (${submission.problem.difficulty})
Tags: ${submission.problem.tags.join(", ")}
Language: ${submission.language}
Status: ${submission.status}

Code:
\`\`\`
${submission.sourceCode}
\`\`\``;

    const aiResult = await callAI(systemPrompt, userPrompt);

    if (!aiResult.success) {
      return res.status(503).json({ error: aiResult.message });
    }

    res.status(200).json({
      success: true,
      message: "Code review generated successfully",
      data: {
        review: aiResult.content,
        submissionId,
        language: submission.language,
        status: submission.status,
      },
    });
  } catch (error) {
    logger.error("Error generating code review:", error);
    res.status(500).json({ error: "Failed to generate code review" });
  }
};

// ─── EXPLAIN SOLUTION ───────────────────────────────────────
export const explainSolution = async (req, res) => {
  try {
    const { problemId } = req.body;

    if (!problemId) {
      return res.status(400).json({ error: "problemId is required" });
    }

    const problem = await db.problem.findUnique({ where: { id: problemId } });
    if (!problem) {
      return res.status(404).json({ error: "Problem not found" });
    }

    // Use editorial if available
    if (problem.editorial) {
      return res.status(200).json({
        success: true,
        message: "Explanation fetched (editorial)",
        data: { explanation: problem.editorial, source: "editorial" },
      });
    }

    const systemPrompt = `You are a competitive programming tutor explaining solutions.

Provide a clear, step-by-step explanation including:
1. **Intuition** — Why this approach works  
2. **Algorithm** — Step-by-step breakdown  
3. **Dry Run** — Walk through an example  
4. **Complexity Analysis** — Time and Space  
5. **Common Mistakes** — What to watch out for  

Use markdown formatting. Be educational but concise.`;

    const userPrompt = `
Problem: ${problem.title}
Description: ${problem.description}
Difficulty: ${problem.difficulty}
Tags: ${problem.tags.join(", ")}
Constraints: ${problem.constraints}

Explain the optimal approach to solve this problem.`;

    const aiResult = await callAI(systemPrompt, userPrompt);

    if (!aiResult.success) {
      return res.status(503).json({ error: aiResult.message });
    }

    res.status(200).json({
      success: true,
      message: "Explanation generated successfully",
      data: { explanation: aiResult.content, source: "ai" },
    });
  } catch (error) {
    logger.error("Error generating explanation:", error);
    res.status(500).json({ error: "Failed to generate explanation" });
  }
};
