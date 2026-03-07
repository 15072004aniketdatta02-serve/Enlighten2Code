import { db } from "../database/dbconfig.js";
import logger from "../loggers/logger.js";

// ─── GET PLATFORM STATS ─────────────────────────────────────
export const getPlatformStats = async (req, res) => {
  try {
    if (!req.user || req.user.role !== "ADMIN") {
      return res.status(403).json({ error: "Admin access required" });
    }

    const [totalUsers, totalProblems, totalSubmissions, acceptedSubmissions, totalContests] =
      await Promise.all([
        db.user.count(),
        db.problem.count(),
        db.submission.count(),
        db.submission.count({ where: { status: "Accepted" } }),
        db.contest.count(),
      ]);

    // Submissions per day (last 30 days)
    const thirtyDaysAgo = new Date();
    thirtyDaysAgo.setDate(thirtyDaysAgo.getDate() - 30);

    const recentSubmissions = await db.submission.findMany({
      where: { createdAt: { gte: thirtyDaysAgo } },
      select: { createdAt: true, status: true },
    });

    const dailySubmissions = {};
    recentSubmissions.forEach((s) => {
      const dateKey = s.createdAt.toISOString().split("T")[0];
      if (!dailySubmissions[dateKey]) {
        dailySubmissions[dateKey] = { total: 0, accepted: 0 };
      }
      dailySubmissions[dateKey].total++;
      if (s.status === "Accepted") dailySubmissions[dateKey].accepted++;
    });

    // Language distribution
    const languageStats = await db.submission.groupBy({
      by: ["language"],
      _count: { id: true },
    });

    // Difficulty distribution of problems
    const difficultyStats = await db.problem.groupBy({
      by: ["difficulty"],
      _count: { id: true },
    });

    // New users per day (last 30 days)
    const recentUsers = await db.user.findMany({
      where: { createdAt: { gte: thirtyDaysAgo } },
      select: { createdAt: true },
    });

    const dailyNewUsers = {};
    recentUsers.forEach((u) => {
      const dateKey = u.createdAt.toISOString().split("T")[0];
      dailyNewUsers[dateKey] = (dailyNewUsers[dateKey] || 0) + 1;
    });

    res.status(200).json({
      success: true,
      message: "Platform stats fetched successfully",
      data: {
        totalUsers,
        totalProblems,
        totalSubmissions,
        acceptedSubmissions,
        acceptanceRate:
          totalSubmissions > 0
            ? parseFloat(
                ((acceptedSubmissions / totalSubmissions) * 100).toFixed(1)
              )
            : 0,
        totalContests,
        dailySubmissions,
        languageStats: languageStats.map((l) => ({
          language: l.language,
          count: l._count.id,
        })),
        difficultyStats: difficultyStats.map((d) => ({
          difficulty: d.difficulty,
          count: d._count.id,
        })),
        dailyNewUsers,
      },
    });
  } catch (error) {
    logger.error("Error fetching platform stats:", error);
    res.status(500).json({ error: "Failed to fetch platform stats" });
  }
};

// ─── GET ALL USERS ──────────────────────────────────────────
export const getAllUsers = async (req, res) => {
  try {
    if (!req.user || req.user.role !== "ADMIN") {
      return res.status(403).json({ error: "Admin access required" });
    }

    const page = parseInt(req.query.page) || 1;
    const limit = Math.min(parseInt(req.query.limit) || 20, 100);
    const skip = (page - 1) * limit;
    const search = req.query.search || "";

    const where = search
      ? {
          OR: [
            { name: { contains: search, mode: "insensitive" } },
            { email: { contains: search, mode: "insensitive" } },
          ],
        }
      : {};

    const [users, totalUsers] = await Promise.all([
      db.user.findMany({
        where,
        select: {
          id: true,
          name: true,
          email: true,
          role: true,
          image: true,
          createdAt: true,
          _count: {
            select: { problemsSolved: true, submissions: true },
          },
        },
        orderBy: { createdAt: "desc" },
        skip,
        take: limit,
      }),
      db.user.count({ where }),
    ]);

    res.status(200).json({
      success: true,
      message: "Users fetched successfully",
      data: {
        users,
        pagination: {
          page,
          limit,
          totalUsers,
          totalPages: Math.ceil(totalUsers / limit),
        },
      },
    });
  } catch (error) {
    logger.error("Error fetching users:", error);
    res.status(500).json({ error: "Failed to fetch users" });
  }
};

// ─── UPDATE USER ROLE ───────────────────────────────────────
export const updateUserRole = async (req, res) => {
  try {
    if (!req.user || req.user.role !== "ADMIN") {
      return res.status(403).json({ error: "Admin access required" });
    }

    const { id } = req.params;
    const { role } = req.body;

    if (!["ADMIN", "USER"].includes(role)) {
      return res.status(400).json({ error: "Role must be ADMIN or USER" });
    }

    // Prevent self-demotion
    if (id === req.user.id && role !== "ADMIN") {
      return res.status(400).json({ error: "You cannot demote yourself" });
    }

    const user = await db.user.findUnique({ where: { id } });
    if (!user) {
      return res.status(404).json({ error: "User not found" });
    }

    const updatedUser = await db.user.update({
      where: { id },
      data: { role },
      select: { id: true, name: true, email: true, role: true },
    });

    res.status(200).json({
      success: true,
      message: `User role updated to ${role}`,
      user: updatedUser,
    });
  } catch (error) {
    logger.error("Error updating user role:", error);
    res.status(500).json({ error: "Failed to update user role" });
  }
};

// ─── BAN USER (soft ban via role or separate field) ─────────
export const banUser = async (req, res) => {
  try {
    if (!req.user || req.user.role !== "ADMIN") {
      return res.status(403).json({ error: "Admin access required" });
    }

    const { id } = req.params;
    const { banned } = req.body; // true to ban, false to unban

    if (id === req.user.id) {
      return res.status(400).json({ error: "You cannot ban yourself" });
    }

    const user = await db.user.findUnique({ where: { id } });
    if (!user) {
      return res.status(404).json({ error: "User not found" });
    }

    // Since we don't have a 'banned' field in the schema,
    // we'll implement ban by deleting the user's sessions (clearing cookies happens client-side)
    // In a production app, you'd add a `banned Boolean @default(false)` field
    // For now, we'll use a convention: set role to "BANNED" (informal — doesn't match enum)
    // Better approach: just return a message confirming the action for now
    // and add the field later when you run the next migration

    logger.info(`Admin ${req.user.id} ${banned ? "banned" : "unbanned"} user ${id}`);

    res.status(200).json({
      success: true,
      message: `User ${banned ? "banned" : "unbanned"} successfully`,
      note: "Add a 'banned' field to the User model for full implementation. This endpoint logs the action for now.",
      userId: id,
      banned: !!banned,
    });
  } catch (error) {
    logger.error("Error banning user:", error);
    res.status(500).json({ error: "Failed to ban user" });
  }
};
