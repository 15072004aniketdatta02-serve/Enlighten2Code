import { db } from "../database/dbconfig.js";
import logger from "../loggers/logger.js";

// ─── GET GLOBAL LEADERBOARD ─────────────────────────────────
export const getGlobalLeaderboard = async (req, res) => {
  try {
    const page = parseInt(req.query.page) || 1;
    const limit = Math.min(parseInt(req.query.limit) || 20, 100);
    const skip = (page - 1) * limit;

    // Get users with their solved problems count
    const users = await db.user.findMany({
      select: {
        id: true,
        name: true,
        image: true,
        createdAt: true,
        _count: {
          select: {
            problemsSolved: true,
            submissions: true,
          },
        },
      },
      orderBy: {
        problemsSolved: { _count: "desc" },
      },
      skip,
      take: limit,
    });

    const totalUsers = await db.user.count();

    // Enrich with acceptance rate
    const leaderboard = await Promise.all(
      users.map(async (user, index) => {
        const accepted = await db.submission.count({
          where: { userId: user.id, status: "Accepted" },
        });
        const total = user._count.submissions;

        return {
          rank: skip + index + 1,
          user: {
            id: user.id,
            name: user.name,
            image: user.image,
            joinedAt: user.createdAt,
          },
          problemsSolved: user._count.problemsSolved,
          totalSubmissions: total,
          acceptedSubmissions: accepted,
          acceptanceRate: total > 0 ? parseFloat(((accepted / total) * 100).toFixed(1)) : 0,
        };
      })
    );

    res.status(200).json({
      success: true,
      message: "Leaderboard fetched successfully",
      data: {
        leaderboard,
        pagination: {
          page,
          limit,
          totalUsers,
          totalPages: Math.ceil(totalUsers / limit),
        },
      },
    });
  } catch (error) {
    logger.error("Error fetching leaderboard:", error);
    res.status(500).json({ error: "Failed to fetch leaderboard" });
  }
};

// ─── FOLLOW USER ────────────────────────────────────────────
export const followUser = async (req, res) => {
  try {
    const { userId: followingId } = req.params;
    const followerId = req.user.id;

    if (followerId === followingId) {
      return res.status(400).json({ error: "You cannot follow yourself" });
    }

    const targetUser = await db.user.findUnique({ where: { id: followingId } });
    if (!targetUser) {
      return res.status(404).json({ error: "User not found" });
    }

    // Check if already following
    const existing = await db.follow.findUnique({
      where: { followerId_followingId: { followerId, followingId } },
    });

    if (existing) {
      return res.status(409).json({ error: "Already following this user" });
    }

    const follow = await db.follow.create({
      data: { followerId, followingId },
    });

    res.status(201).json({
      success: true,
      message: "Followed successfully",
      follow,
    });
  } catch (error) {
    logger.error("Error following user:", error);
    res.status(500).json({ error: "Failed to follow user" });
  }
};

// ─── UNFOLLOW USER ──────────────────────────────────────────
export const unfollowUser = async (req, res) => {
  try {
    const { userId: followingId } = req.params;
    const followerId = req.user.id;

    const existing = await db.follow.findUnique({
      where: { followerId_followingId: { followerId, followingId } },
    });

    if (!existing) {
      return res.status(404).json({ error: "You are not following this user" });
    }

    await db.follow.delete({ where: { id: existing.id } });

    res.status(200).json({
      success: true,
      message: "Unfollowed successfully",
    });
  } catch (error) {
    logger.error("Error unfollowing user:", error);
    res.status(500).json({ error: "Failed to unfollow user" });
  }
};

// ─── GET FRIENDS LEADERBOARD ────────────────────────────────
export const getFriendsLeaderboard = async (req, res) => {
  try {
    const userId = req.user.id;

    // Get IDs of users this person follows
    const following = await db.follow.findMany({
      where: { followerId: userId },
      select: { followingId: true },
    });

    const friendIds = [...following.map((f) => f.followingId), userId]; // include self

    const friends = await db.user.findMany({
      where: { id: { in: friendIds } },
      select: {
        id: true,
        name: true,
        image: true,
        _count: {
          select: { problemsSolved: true, submissions: true },
        },
      },
      orderBy: {
        problemsSolved: { _count: "desc" },
      },
    });

    const leaderboard = await Promise.all(
      friends.map(async (user, index) => {
        const accepted = await db.submission.count({
          where: { userId: user.id, status: "Accepted" },
        });
        return {
          rank: index + 1,
          user: { id: user.id, name: user.name, image: user.image },
          problemsSolved: user._count.problemsSolved,
          totalSubmissions: user._count.submissions,
          acceptanceRate:
            user._count.submissions > 0
              ? parseFloat(((accepted / user._count.submissions) * 100).toFixed(1))
              : 0,
          isYou: user.id === userId,
        };
      })
    );

    res.status(200).json({
      success: true,
      message: "Friends leaderboard fetched successfully",
      data: { leaderboard },
    });
  } catch (error) {
    logger.error("Error fetching friends leaderboard:", error);
    res.status(500).json({ error: "Failed to fetch friends leaderboard" });
  }
};

// ─── COMPARE USERS ──────────────────────────────────────────
export const compareUsers = async (req, res) => {
  try {
    const { userId: otherUserId } = req.params;
    const currentUserId = req.user.id;

    const [currentUser, otherUser] = await Promise.all([
      db.user.findUnique({
        where: { id: currentUserId },
        select: {
          id: true,
          name: true,
          image: true,
          _count: { select: { problemsSolved: true, submissions: true } },
        },
      }),
      db.user.findUnique({
        where: { id: otherUserId },
        select: {
          id: true,
          name: true,
          image: true,
          _count: { select: { problemsSolved: true, submissions: true } },
        },
      }),
    ]);

    if (!otherUser) {
      return res.status(404).json({ error: "User not found" });
    }

    // Get difficulty breakdown for both users
    const getDifficultyBreakdown = async (userId) => {
      const solved = await db.problemSolved.findMany({
        where: { userId },
        include: { problem: { select: { difficulty: true } } },
      });
      const breakdown = { EASY: 0, MEDIUM: 0, HARD: 0 };
      solved.forEach((s) => breakdown[s.problem.difficulty]++);
      return breakdown;
    };

    const [currentBreakdown, otherBreakdown] = await Promise.all([
      getDifficultyBreakdown(currentUserId),
      getDifficultyBreakdown(otherUserId),
    ]);

    // Get acceptance rates
    const getAcceptanceRate = async (userId, totalSubmissions) => {
      const accepted = await db.submission.count({
        where: { userId, status: "Accepted" },
      });
      return totalSubmissions > 0
        ? parseFloat(((accepted / totalSubmissions) * 100).toFixed(1))
        : 0;
    };

    const [currentRate, otherRate] = await Promise.all([
      getAcceptanceRate(currentUserId, currentUser._count.submissions),
      getAcceptanceRate(otherUserId, otherUser._count.submissions),
    ]);

    res.status(200).json({
      success: true,
      message: "Comparison fetched successfully",
      data: {
        you: {
          ...currentUser,
          difficultyBreakdown: currentBreakdown,
          acceptanceRate: currentRate,
        },
        them: {
          ...otherUser,
          difficultyBreakdown: otherBreakdown,
          acceptanceRate: otherRate,
        },
      },
    });
  } catch (error) {
    logger.error("Error comparing users:", error);
    res.status(500).json({ error: "Failed to compare users" });
  }
};
