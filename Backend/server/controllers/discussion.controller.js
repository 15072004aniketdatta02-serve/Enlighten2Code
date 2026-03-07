import { db } from "../database/dbconfig.js";
import logger from "../loggers/logger.js";

// ─── CREATE DISCUSSION ──────────────────────────────────────
export const createDiscussion = async (req, res) => {
  try {
    const { title, content, problemId } = req.body;
    const userId = req.user.id;

    if (!title || !content || !problemId) {
      return res.status(400).json({ error: "title, content, and problemId are required" });
    }

    const problem = await db.problem.findUnique({ where: { id: problemId } });
    if (!problem) {
      return res.status(404).json({ error: "Problem not found" });
    }

    const discussion = await db.discussion.create({
      data: { title, content, problemId, userId },
      include: {
        user: { select: { id: true, name: true, image: true } },
      },
    });

    res.status(201).json({
      success: true,
      message: "Discussion created successfully",
      discussion,
    });
  } catch (error) {
    logger.error("Error creating discussion:", error);
    res.status(500).json({ error: "Failed to create discussion" });
  }
};

// ─── GET DISCUSSIONS FOR PROBLEM ────────────────────────────
export const getDiscussions = async (req, res) => {
  try {
    const { problemId } = req.params;

    const discussions = await db.discussion.findMany({
      where: { problemId },
      include: {
        user: { select: { id: true, name: true, image: true } },
        _count: { select: { replies: true, votes: true } },
        votes: true,
      },
      orderBy: [{ isPinned: "desc" }, { createdAt: "desc" }],
    });

    // Calculate vote scores
    const discussionsWithScores = discussions.map((d) => {
      const upvotes = d.votes.filter((v) => v.voteType === "UPVOTE").length;
      const downvotes = d.votes.filter((v) => v.voteType === "DOWNVOTE").length;
      const { votes, ...rest } = d;
      return { ...rest, upvotes, downvotes, score: upvotes - downvotes };
    });

    res.status(200).json({
      success: true,
      message: "Discussions fetched successfully",
      discussions: discussionsWithScores,
    });
  } catch (error) {
    logger.error("Error fetching discussions:", error);
    res.status(500).json({ error: "Failed to fetch discussions" });
  }
};

// ─── GET DISCUSSION BY ID ───────────────────────────────────
export const getDiscussionById = async (req, res) => {
  try {
    const { id } = req.params;

    const discussion = await db.discussion.findUnique({
      where: { id },
      include: {
        user: { select: { id: true, name: true, image: true } },
        votes: true,
        replies: {
          include: {
            user: { select: { id: true, name: true, image: true } },
            votes: true,
            children: {
              include: {
                user: { select: { id: true, name: true, image: true } },
                votes: true,
              },
            },
          },
          where: { parentId: null }, // top-level replies only
          orderBy: { createdAt: "asc" },
        },
      },
    });

    if (!discussion) {
      return res.status(404).json({ error: "Discussion not found" });
    }

    // Calculate vote scores for discussion and replies
    const upvotes = discussion.votes.filter((v) => v.voteType === "UPVOTE").length;
    const downvotes = discussion.votes.filter((v) => v.voteType === "DOWNVOTE").length;

    const repliesWithScores = discussion.replies.map((r) => {
      const rUp = r.votes.filter((v) => v.voteType === "UPVOTE").length;
      const rDown = r.votes.filter((v) => v.voteType === "DOWNVOTE").length;
      const { votes: rVotes, children, ...rRest } = r;

      const childrenWithScores = children.map((c) => {
        const cUp = c.votes.filter((v) => v.voteType === "UPVOTE").length;
        const cDown = c.votes.filter((v) => v.voteType === "DOWNVOTE").length;
        const { votes: cVotes, ...cRest } = c;
        return { ...cRest, upvotes: cUp, downvotes: cDown, score: cUp - cDown };
      });

      return { ...rRest, upvotes: rUp, downvotes: rDown, score: rUp - rDown, children: childrenWithScores };
    });

    const { votes, replies, ...rest } = discussion;
    res.status(200).json({
      success: true,
      message: "Discussion fetched successfully",
      discussion: {
        ...rest,
        upvotes,
        downvotes,
        score: upvotes - downvotes,
        replies: repliesWithScores,
      },
    });
  } catch (error) {
    logger.error("Error fetching discussion:", error);
    res.status(500).json({ error: "Failed to fetch discussion" });
  }
};

// ─── REPLY TO DISCUSSION ────────────────────────────────────
export const replyToDiscussion = async (req, res) => {
  try {
    const { id: discussionId } = req.params;
    const { content, parentId } = req.body;
    const userId = req.user.id;

    if (!content) {
      return res.status(400).json({ error: "content is required" });
    }

    const discussion = await db.discussion.findUnique({ where: { id: discussionId } });
    if (!discussion) {
      return res.status(404).json({ error: "Discussion not found" });
    }

    // If parentId is provided, verify it exists
    if (parentId) {
      const parentReply = await db.discussionReply.findUnique({ where: { id: parentId } });
      if (!parentReply) {
        return res.status(404).json({ error: "Parent reply not found" });
      }
    }

    const reply = await db.discussionReply.create({
      data: { content, discussionId, userId, parentId },
      include: {
        user: { select: { id: true, name: true, image: true } },
      },
    });

    res.status(201).json({
      success: true,
      message: "Reply added successfully",
      reply,
    });
  } catch (error) {
    logger.error("Error replying to discussion:", error);
    res.status(500).json({ error: "Failed to reply to discussion" });
  }
};

// ─── VOTE ON DISCUSSION OR REPLY ────────────────────────────
export const voteOnDiscussion = async (req, res) => {
  try {
    const { id } = req.params;
    const { voteType, replyId } = req.body;
    const userId = req.user.id;

    if (!["UPVOTE", "DOWNVOTE"].includes(voteType)) {
      return res.status(400).json({ error: "voteType must be UPVOTE or DOWNVOTE" });
    }

    if (replyId) {
      // Vote on a reply
      const existingVote = await db.vote.findUnique({
        where: { userId_replyId: { userId, replyId } },
      });

      if (existingVote) {
        if (existingVote.voteType === voteType) {
          // Remove vote (toggle off)
          await db.vote.delete({ where: { id: existingVote.id } });
          return res.status(200).json({ success: true, message: "Vote removed" });
        }
        // Change vote
        const updated = await db.vote.update({
          where: { id: existingVote.id },
          data: { voteType },
        });
        return res.status(200).json({ success: true, message: "Vote updated", vote: updated });
      }

      const vote = await db.vote.create({
        data: { userId, voteType, replyId },
      });
      return res.status(201).json({ success: true, message: "Voted successfully", vote });
    } else {
      // Vote on discussion
      const discussionId = id;
      const existingVote = await db.vote.findUnique({
        where: { userId_discussionId: { userId, discussionId } },
      });

      if (existingVote) {
        if (existingVote.voteType === voteType) {
          await db.vote.delete({ where: { id: existingVote.id } });
          return res.status(200).json({ success: true, message: "Vote removed" });
        }
        const updated = await db.vote.update({
          where: { id: existingVote.id },
          data: { voteType },
        });
        return res.status(200).json({ success: true, message: "Vote updated", vote: updated });
      }

      const vote = await db.vote.create({
        data: { userId, voteType, discussionId },
      });
      return res.status(201).json({ success: true, message: "Voted successfully", vote });
    }
  } catch (error) {
    logger.error("Error voting:", error);
    res.status(500).json({ error: "Failed to vote" });
  }
};

// ─── DELETE DISCUSSION ──────────────────────────────────────
export const deleteDiscussion = async (req, res) => {
  try {
    const { id } = req.params;
    const userId = req.user.id;

    const discussion = await db.discussion.findUnique({ where: { id } });
    if (!discussion) {
      return res.status(404).json({ error: "Discussion not found" });
    }

    // Only the author or admin can delete
    if (discussion.userId !== userId && req.user.role !== "ADMIN") {
      return res.status(403).json({ error: "You can only delete your own discussions" });
    }

    await db.discussion.delete({ where: { id } });

    res.status(200).json({
      success: true,
      message: "Discussion deleted successfully",
    });
  } catch (error) {
    logger.error("Error deleting discussion:", error);
    res.status(500).json({ error: "Failed to delete discussion" });
  }
};
