import { db } from "../database/dbconfig.js";
import logger from "../loggers/logger.js";
import {
  getJudge0LanguageId,
  pollBatchResults,
  submitBatch,
  getLanguageName,
} from "../libs/judge0.lib.js";

// ─── CREATE CONTEST (Admin) ─────────────────────────────────
export const createContest = async (req, res) => {
  try {
    if (!req.user || req.user.role !== "ADMIN") {
      return res.status(403).json({ error: "Only admins can create contests" });
    }

    const { title, description, startTime, endTime, problemIds } = req.body;

    if (!title || !startTime || !endTime) {
      return res.status(400).json({ error: "title, startTime, and endTime are required" });
    }

    if (new Date(endTime) <= new Date(startTime)) {
      return res.status(400).json({ error: "endTime must be after startTime" });
    }

    const contest = await db.contest.create({
      data: {
        title,
        description,
        startTime: new Date(startTime),
        endTime: new Date(endTime),
        createdBy: req.user.id,
        problems: problemIds?.length
          ? {
              create: problemIds.map((problemId, index) => ({
                problemId,
                order: index,
              })),
            }
          : undefined,
      },
      include: {
        problems: { include: { problem: { select: { id: true, title: true, difficulty: true } } } },
      },
    });

    res.status(201).json({
      success: true,
      message: "Contest created successfully",
      contest,
    });
  } catch (error) {
    logger.error("Error creating contest:", error);
    res.status(500).json({ error: "Failed to create contest" });
  }
};

// ─── GET ALL CONTESTS ───────────────────────────────────────
export const getAllContests = async (req, res) => {
  try {
    const now = new Date();

    const contests = await db.contest.findMany({
      include: {
        _count: { select: { registrations: true, problems: true } },
      },
      orderBy: { startTime: "desc" },
    });

    // Add status field
    const contestsWithStatus = contests.map((c) => ({
      ...c,
      status:
        now < c.startTime ? "UPCOMING" : now > c.endTime ? "ENDED" : "ACTIVE",
    }));

    res.status(200).json({
      success: true,
      message: "Contests fetched successfully",
      contests: contestsWithStatus,
    });
  } catch (error) {
    logger.error("Error fetching contests:", error);
    res.status(500).json({ error: "Failed to fetch contests" });
  }
};

// ─── GET CONTEST BY ID ──────────────────────────────────────
export const getContestById = async (req, res) => {
  try {
    const { id } = req.params;
    const now = new Date();

    const contest = await db.contest.findUnique({
      where: { id },
      include: {
        problems: {
          include: {
            problem: {
              select: {
                id: true,
                title: true,
                difficulty: true,
                tags: true,
                description: true,
                examples: true,
                constraints: true,
                codeSnippet: true,
                testCases: true,
              },
            },
          },
          orderBy: { order: "asc" },
        },
        registrations: {
          where: { userId: req.user.id },
        },
        _count: { select: { registrations: true } },
      },
    });

    if (!contest) {
      return res.status(404).json({ error: "Contest not found" });
    }

    const status =
      now < contest.startTime
        ? "UPCOMING"
        : now > contest.endTime
        ? "ENDED"
        : "ACTIVE";

    res.status(200).json({
      success: true,
      message: "Contest fetched successfully",
      contest: {
        ...contest,
        status,
        isRegistered: contest.registrations.length > 0,
      },
    });
  } catch (error) {
    logger.error("Error fetching contest:", error);
    res.status(500).json({ error: "Failed to fetch contest" });
  }
};

// ─── REGISTER FOR CONTEST ───────────────────────────────────
export const registerForContest = async (req, res) => {
  try {
    const { id } = req.params;
    const userId = req.user.id;

    const contest = await db.contest.findUnique({ where: { id } });
    if (!contest) {
      return res.status(404).json({ error: "Contest not found" });
    }

    if (new Date() > contest.endTime) {
      return res.status(400).json({ error: "Contest has already ended" });
    }

    // Check if already registered
    const existing = await db.contestRegistration.findUnique({
      where: { contestId_userId: { contestId: id, userId } },
    });

    if (existing) {
      return res.status(409).json({ error: "Already registered for this contest" });
    }

    const registration = await db.contestRegistration.create({
      data: { contestId: id, userId },
    });

    res.status(201).json({
      success: true,
      message: "Registered for contest successfully",
      registration,
    });
  } catch (error) {
    logger.error("Error registering for contest:", error);
    res.status(500).json({ error: "Failed to register for contest" });
  }
};

// ─── SUBMIT CONTEST SOLUTION ────────────────────────────────
export const submitContestSolution = async (req, res) => {
  try {
    const { id: contestId } = req.params;
    const { problemId, source_code, language_id } = req.body;
    const userId = req.user.id;

    // Validate contest exists and is active
    const contest = await db.contest.findUnique({ where: { id: contestId } });
    if (!contest) {
      return res.status(404).json({ error: "Contest not found" });
    }

    const now = new Date();
    if (now < contest.startTime) {
      return res.status(400).json({ error: "Contest has not started yet" });
    }
    if (now > contest.endTime) {
      return res.status(400).json({ error: "Contest has already ended" });
    }

    // Check registration
    const registration = await db.contestRegistration.findUnique({
      where: { contestId_userId: { contestId, userId } },
    });
    if (!registration) {
      return res.status(403).json({ error: "You are not registered for this contest" });
    }

    // Get problem test cases
    const problem = await db.problem.findUnique({ where: { id: problemId } });
    if (!problem) {
      return res.status(404).json({ error: "Problem not found" });
    }

    const testcases = problem.testCases;

    // Submit to Judge0
    const submissions = testcases.map(({ input, output }) => ({
      source_code,
      language_id,
      stdin: input,
      expected_output: output,
    }));

    const submitResponse = await submitBatch(submissions);
    const tokens = submitResponse.map((r) => r.token);
    const results = await pollBatchResults(tokens);

    const allPassed = results.every((r) => r.status.id === 3);
    const timeTaken = Math.floor((now - contest.startTime) / 1000);

    const contestSubmission = await db.contestSubmission.create({
      data: {
        contestId,
        userId,
        problemId,
        sourceCode: source_code,
        language: getLanguageName(language_id),
        status: allPassed ? "Accepted" : "Wrong Answer",
        points: allPassed ? 100 : 0,
        timeTaken,
      },
    });

    res.status(200).json({
      success: true,
      message: "Contest solution submitted successfully",
      submission: contestSubmission,
      allPassed,
    });
  } catch (error) {
    logger.error("Error submitting contest solution:", error);
    res.status(500).json({ error: "Failed to submit contest solution" });
  }
};

// ─── GET CONTEST LEADERBOARD ────────────────────────────────
export const getContestLeaderboard = async (req, res) => {
  try {
    const { id: contestId } = req.params;

    const contest = await db.contest.findUnique({ where: { id: contestId } });
    if (!contest) {
      return res.status(404).json({ error: "Contest not found" });
    }

    // Get all accepted submissions, grouped by user
    const submissions = await db.contestSubmission.findMany({
      where: { contestId, status: "Accepted" },
      include: {
        user: { select: { id: true, name: true, image: true } },
      },
      orderBy: { createdAt: "asc" },
    });

    // Build leaderboard: rank by total points, then by earliest solve time
    const userMap = {};
    submissions.forEach((s) => {
      if (!userMap[s.userId]) {
        userMap[s.userId] = {
          user: s.user,
          totalPoints: 0,
          problemsSolved: 0,
          lastAcceptedAt: s.createdAt,
          solvedProblemIds: new Set(),
        };
      }
      // Only count first accepted submission per problem
      if (!userMap[s.userId].solvedProblemIds.has(s.problemId)) {
        userMap[s.userId].totalPoints += s.points;
        userMap[s.userId].problemsSolved++;
        userMap[s.userId].solvedProblemIds.add(s.problemId);
        userMap[s.userId].lastAcceptedAt = s.createdAt;
      }
    });

    const leaderboard = Object.values(userMap)
      .map(({ solvedProblemIds, ...rest }) => rest) // remove Set from response
      .sort((a, b) => {
        if (b.totalPoints !== a.totalPoints) return b.totalPoints - a.totalPoints;
        return a.lastAcceptedAt - b.lastAcceptedAt; // earlier is better
      })
      .map((entry, index) => ({ rank: index + 1, ...entry }));

    res.status(200).json({
      success: true,
      message: "Leaderboard fetched successfully",
      leaderboard,
    });
  } catch (error) {
    logger.error("Error fetching contest leaderboard:", error);
    res.status(500).json({ error: "Failed to fetch contest leaderboard" });
  }
};

// ─── DELETE CONTEST (Admin) ─────────────────────────────────
export const deleteContest = async (req, res) => {
  try {
    if (!req.user || req.user.role !== "ADMIN") {
      return res.status(403).json({ error: "Only admins can delete contests" });
    }

    const { id } = req.params;
    const contest = await db.contest.findUnique({ where: { id } });
    if (!contest) {
      return res.status(404).json({ error: "Contest not found" });
    }

    await db.contest.delete({ where: { id } });

    res.status(200).json({
      success: true,
      message: "Contest deleted successfully",
    });
  } catch (error) {
    logger.error("Error deleting contest:", error);
    res.status(500).json({ error: "Failed to delete contest" });
  }
};
