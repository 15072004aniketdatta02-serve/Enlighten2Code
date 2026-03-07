import { db } from "../database/dbconfig.js";
import logger from "../loggers/logger.js";
import { SR_INTERVALS } from "../utils/constants.js";

// ─── SCHEDULE REVIEW ────────────────────────────────────────
export const scheduleReview = async (req, res) => {
  try {
    const { problemId } = req.body;
    const userId = req.user.id;

    if (!problemId) {
      return res.status(400).json({ error: "problemId is required" });
    }

    // Ensure the problem exists
    const problem = await db.problem.findUnique({ where: { id: problemId } });
    if (!problem) {
      return res.status(404).json({ error: "Problem not found" });
    }

    // Check if already scheduled
    const existing = await db.reviewSchedule.findUnique({
      where: { userId_problemId: { userId, problemId } },
    });

    if (existing) {
      return res.status(409).json({
        error: "Review already scheduled for this problem",
        nextReviewAt: existing.nextReviewAt,
      });
    }

    // First review: after SR_INTERVALS[0] days (1 day)
    const nextReviewAt = new Date();
    nextReviewAt.setDate(nextReviewAt.getDate() + SR_INTERVALS[0]);

    const schedule = await db.reviewSchedule.create({
      data: {
        userId,
        problemId,
        nextReviewAt,
        intervalIndex: 0,
        reviewCount: 0,
      },
      include: {
        problem: { select: { id: true, title: true, difficulty: true, tags: true } },
      },
    });

    res.status(201).json({
      success: true,
      message: "Review scheduled successfully",
      schedule,
    });
  } catch (error) {
    logger.error("Error scheduling review:", error);
    res.status(500).json({ error: "Failed to schedule review" });
  }
};

// ─── GET DUE REVIEWS ────────────────────────────────────────
export const getDueReviews = async (req, res) => {
  try {
    const userId = req.user.id;
    const now = new Date();

    const dueReviews = await db.reviewSchedule.findMany({
      where: {
        userId,
        nextReviewAt: { lte: now },
      },
      include: {
        problem: {
          select: {
            id: true,
            title: true,
            difficulty: true,
            tags: true,
            description: true,
          },
        },
      },
      orderBy: { nextReviewAt: "asc" },
    });

    // Also get upcoming reviews (next 7 days)
    const sevenDaysLater = new Date();
    sevenDaysLater.setDate(sevenDaysLater.getDate() + 7);

    const upcomingReviews = await db.reviewSchedule.findMany({
      where: {
        userId,
        nextReviewAt: { gt: now, lte: sevenDaysLater },
      },
      include: {
        problem: {
          select: { id: true, title: true, difficulty: true, tags: true },
        },
      },
      orderBy: { nextReviewAt: "asc" },
    });

    res.status(200).json({
      success: true,
      message: "Due reviews fetched successfully",
      data: {
        due: dueReviews,
        upcoming: upcomingReviews,
        dueCount: dueReviews.length,
      },
    });
  } catch (error) {
    logger.error("Error fetching due reviews:", error);
    res.status(500).json({ error: "Failed to fetch due reviews" });
  }
};

// ─── MARK REVIEWED ──────────────────────────────────────────
export const markReviewed = async (req, res) => {
  try {
    const { id } = req.params;
    const { quality } = req.body; // 1-5 self-assessment of how well remembered
    const userId = req.user.id;

    const schedule = await db.reviewSchedule.findUnique({ where: { id } });

    if (!schedule) {
      return res.status(404).json({ error: "Review schedule not found" });
    }

    if (schedule.userId !== userId) {
      return res.status(403).json({ error: "Not your review" });
    }

    // SM-2 inspired: if quality >= 3, advance interval; else reset
    let newIntervalIndex;
    if (quality && quality < 3) {
      // Reset to beginning (forgot it)
      newIntervalIndex = 0;
    } else {
      // Advance to next interval
      newIntervalIndex = Math.min(
        schedule.intervalIndex + 1,
        SR_INTERVALS.length - 1
      );
    }

    const nextReviewAt = new Date();
    nextReviewAt.setDate(nextReviewAt.getDate() + SR_INTERVALS[newIntervalIndex]);

    const updated = await db.reviewSchedule.update({
      where: { id },
      data: {
        lastReviewedAt: new Date(),
        nextReviewAt,
        intervalIndex: newIntervalIndex,
        reviewCount: { increment: 1 },
      },
      include: {
        problem: { select: { id: true, title: true, difficulty: true } },
      },
    });

    res.status(200).json({
      success: true,
      message: "Review marked successfully",
      data: {
        schedule: updated,
        nextInterval: SR_INTERVALS[newIntervalIndex],
        nextReviewAt,
      },
    });
  } catch (error) {
    logger.error("Error marking review:", error);
    res.status(500).json({ error: "Failed to mark review" });
  }
};

// ─── GET REVIEW HISTORY ─────────────────────────────────────
export const getReviewHistory = async (req, res) => {
  try {
    const userId = req.user.id;

    const reviews = await db.reviewSchedule.findMany({
      where: { userId },
      include: {
        problem: {
          select: { id: true, title: true, difficulty: true, tags: true },
        },
      },
      orderBy: { updatedAt: "desc" },
    });

    // Summary stats
    const totalScheduled = reviews.length;
    const totalReviewed = reviews.filter((r) => r.reviewCount > 0).length;
    const mastered = reviews.filter(
      (r) => r.intervalIndex >= SR_INTERVALS.length - 2
    ).length;

    res.status(200).json({
      success: true,
      message: "Review history fetched successfully",
      data: {
        reviews,
        stats: {
          totalScheduled,
          totalReviewed,
          mastered,
          totalReviewsSessions: reviews.reduce((sum, r) => sum + r.reviewCount, 0),
        },
      },
    });
  } catch (error) {
    logger.error("Error fetching review history:", error);
    res.status(500).json({ error: "Failed to fetch review history" });
  }
};
