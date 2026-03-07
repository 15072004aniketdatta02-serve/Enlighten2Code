import { db } from "../database/dbconfig.js";
import logger from "../loggers/logger.js";

// ─── GET DASHBOARD ──────────────────────────────────────────
export const getDashboard = async (req, res) => {
  try {
    const userId = req.user.id;

    // Total problems solved
    const totalSolved = await db.problemSolved.count({
      where: { userId },
    });

    // Solved by difficulty
    const solvedByDifficulty = await db.problemSolved.findMany({
      where: { userId },
      include: { problem: { select: { difficulty: true } } },
    });

    const difficultyBreakdown = { EASY: 0, MEDIUM: 0, HARD: 0 };
    solvedByDifficulty.forEach((ps) => {
      difficultyBreakdown[ps.problem.difficulty]++;
    });

    // Total submissions & acceptance rate
    const totalSubmissions = await db.submission.count({ where: { userId } });
    const acceptedSubmissions = await db.submission.count({
      where: { userId, status: "Accepted" },
    });
    const acceptanceRate =
      totalSubmissions > 0
        ? ((acceptedSubmissions / totalSubmissions) * 100).toFixed(1)
        : 0;

    // Solved by tag (topic strength)
    const solvedProblems = await db.problemSolved.findMany({
      where: { userId },
      include: { problem: { select: { tags: true } } },
    });

    const tagCounts = {};
    solvedProblems.forEach((ps) => {
      ps.problem.tags.forEach((tag) => {
        tagCounts[tag] = (tagCounts[tag] || 0) + 1;
      });
    });

    // Submissions per language
    const submissionsByLanguage = await db.submission.groupBy({
      by: ["language"],
      where: { userId },
      _count: { id: true },
    });

    const languageBreakdown = {};
    submissionsByLanguage.forEach((s) => {
      languageBreakdown[s.language] = s._count.id;
    });

    // Total problems on platform
    const totalProblems = await db.problem.count();

    res.status(200).json({
      success: true,
      message: "Dashboard fetched successfully",
      data: {
        totalSolved,
        totalProblems,
        difficultyBreakdown,
        totalSubmissions,
        acceptedSubmissions,
        acceptanceRate: parseFloat(acceptanceRate),
        tagCounts,
        languageBreakdown,
      },
    });
  } catch (error) {
    logger.error("Error fetching dashboard:", error);
    res.status(500).json({ error: "Failed to fetch dashboard data" });
  }
};

// ─── GET STREAK ─────────────────────────────────────────────
export const getStreak = async (req, res) => {
  try {
    const userId = req.user.id;

    // Get all submissions grouped by date
    const submissions = await db.submission.findMany({
      where: { userId },
      select: { createdAt: true },
      orderBy: { createdAt: "asc" },
    });

    // Build date → count map for heatmap
    const dateMap = {};
    submissions.forEach((s) => {
      const dateKey = s.createdAt.toISOString().split("T")[0];
      dateMap[dateKey] = (dateMap[dateKey] || 0) + 1;
    });

    // Calculate current streak
    let currentStreak = 0;
    let maxStreak = 0;
    let tempStreak = 0;

    const today = new Date();
    today.setHours(0, 0, 0, 0);

    for (let i = 0; i < 365; i++) {
      const d = new Date(today);
      d.setDate(d.getDate() - i);
      const key = d.toISOString().split("T")[0];

      if (dateMap[key]) {
        tempStreak++;
        if (i === 0 || currentStreak > 0) currentStreak = tempStreak;
      } else {
        if (i === 0) currentStreak = 0; // no submission today
        maxStreak = Math.max(maxStreak, tempStreak);
        tempStreak = 0;
      }
    }
    maxStreak = Math.max(maxStreak, tempStreak);

    res.status(200).json({
      success: true,
      message: "Streak data fetched successfully",
      data: {
        currentStreak,
        maxStreak,
        totalActiveDays: Object.keys(dateMap).length,
        heatmap: dateMap,
      },
    });
  } catch (error) {
    logger.error("Error fetching streak:", error);
    res.status(500).json({ error: "Failed to fetch streak data" });
  }
};

// ─── GET TOPIC STRENGTH ─────────────────────────────────────
export const getTopicStrength = async (req, res) => {
  try {
    const userId = req.user.id;

    // All submissions with their problem tags
    const submissions = await db.submission.findMany({
      where: { userId },
      include: { problem: { select: { tags: true } } },
    });

    const tagStats = {};
    submissions.forEach((s) => {
      s.problem.tags.forEach((tag) => {
        if (!tagStats[tag]) tagStats[tag] = { total: 0, accepted: 0 };
        tagStats[tag].total++;
        if (s.status === "Accepted") tagStats[tag].accepted++;
      });
    });

    // Convert to array with success rate
    const topicStrength = Object.entries(tagStats)
      .map(([tag, stats]) => ({
        tag,
        total: stats.total,
        accepted: stats.accepted,
        successRate:
          stats.total > 0
            ? parseFloat(((stats.accepted / stats.total) * 100).toFixed(1))
            : 0,
      }))
      .sort((a, b) => b.successRate - a.successRate);

    res.status(200).json({
      success: true,
      message: "Topic strength fetched successfully",
      data: topicStrength,
    });
  } catch (error) {
    logger.error("Error fetching topic strength:", error);
    res.status(500).json({ error: "Failed to fetch topic strength" });
  }
};

// ─── GET SUBMISSION HEATMAP ─────────────────────────────────
export const getSubmissionHeatmap = async (req, res) => {
  try {
    const userId = req.user.id;

    // Get last 365 days of submissions
    const oneYearAgo = new Date();
    oneYearAgo.setFullYear(oneYearAgo.getFullYear() - 1);

    const submissions = await db.submission.findMany({
      where: {
        userId,
        createdAt: { gte: oneYearAgo },
      },
      select: { createdAt: true, status: true },
    });

    const heatmap = {};
    submissions.forEach((s) => {
      const dateKey = s.createdAt.toISOString().split("T")[0];
      if (!heatmap[dateKey]) {
        heatmap[dateKey] = { total: 0, accepted: 0 };
      }
      heatmap[dateKey].total++;
      if (s.status === "Accepted") heatmap[dateKey].accepted++;
    });

    res.status(200).json({
      success: true,
      message: "Submission heatmap fetched successfully",
      data: heatmap,
    });
  } catch (error) {
    logger.error("Error fetching submission heatmap:", error);
    res.status(500).json({ error: "Failed to fetch submission heatmap" });
  }
};
