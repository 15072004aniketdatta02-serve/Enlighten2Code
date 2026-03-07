import logger from "../loggers/logger.js";

/**
 * Active coding rooms: Map<roomId, Map<socketId, { user, cursor, isTyping }>>
 */
const codingRooms = new Map();

/**
 * Register all socket event handlers on a connected (and authenticated) socket.
 */
export const registerEventHandlers = (io, socket) => {
  const user = socket.user;
  logger.info(`🔌 User ${user.name} (${user.id}) connected via socket ${socket.id}`);

  // ─── JOIN CODING ROOM ───────────────────────────────────
  socket.on("room:join", ({ roomId }) => {
    if (!roomId) return;

    socket.join(roomId);

    if (!codingRooms.has(roomId)) {
      codingRooms.set(roomId, new Map());
    }

    codingRooms.get(roomId).set(socket.id, {
      user: { id: user.id, name: user.name, image: user.image },
      cursor: null,
      isTyping: false,
    });

    // Notify room members
    const members = Array.from(codingRooms.get(roomId).values()).map((m) => m.user);
    io.to(roomId).emit("room:members", { roomId, members });

    logger.info(`User ${user.name} joined room ${roomId}`);
  });

  // ─── LEAVE CODING ROOM ──────────────────────────────────
  socket.on("room:leave", ({ roomId }) => {
    handleLeaveRoom(io, socket, roomId);
  });

  // ─── CODE CHANGE ────────────────────────────────────────
  socket.on("code:change", ({ roomId, code, language }) => {
    if (!roomId) return;

    // Broadcast to everyone in the room except the sender
    socket.to(roomId).emit("code:change", {
      code,
      language,
      userId: user.id,
      userName: user.name,
    });
  });

  // ─── CURSOR MOVE ────────────────────────────────────────
  socket.on("cursor:move", ({ roomId, position }) => {
    if (!roomId) return;

    const room = codingRooms.get(roomId);
    if (room && room.has(socket.id)) {
      room.get(socket.id).cursor = position;
    }

    socket.to(roomId).emit("cursor:move", {
      userId: user.id,
      userName: user.name,
      position,
    });
  });

  // ─── TYPING INDICATOR ──────────────────────────────────
  socket.on("user:typing", ({ roomId, isTyping }) => {
    if (!roomId) return;

    const room = codingRooms.get(roomId);
    if (room && room.has(socket.id)) {
      room.get(socket.id).isTyping = isTyping;
    }

    socket.to(roomId).emit("user:typing", {
      userId: user.id,
      userName: user.name,
      isTyping,
    });
  });

  // ─── CHAT MESSAGE IN ROOM ──────────────────────────────
  socket.on("chat:message", ({ roomId, message }) => {
    if (!roomId || !message) return;

    io.to(roomId).emit("chat:message", {
      userId: user.id,
      userName: user.name,
      userImage: user.image,
      message,
      timestamp: new Date().toISOString(),
    });
  });

  // ─── CONTEST LEADERBOARD UPDATE ────────────────────────
  socket.on("contest:join", ({ contestId }) => {
    if (!contestId) return;
    socket.join(`contest:${contestId}`);
    logger.info(`User ${user.name} joined contest room ${contestId}`);
  });

  // ─── CODE EXECUTION STATUS (real-time feedback) ────────
  socket.on("execution:start", ({ roomId }) => {
    if (!roomId) return;
    io.to(roomId).emit("execution:status", {
      userId: user.id,
      userName: user.name,
      status: "running",
    });
  });

  socket.on("execution:complete", ({ roomId, result }) => {
    if (!roomId) return;
    io.to(roomId).emit("execution:status", {
      userId: user.id,
      userName: user.name,
      status: "completed",
      result,
    });
  });

  // ─── DISCONNECT ─────────────────────────────────────────
  socket.on("disconnect", () => {
    // Clean up from all rooms
    for (const [roomId, room] of codingRooms.entries()) {
      if (room.has(socket.id)) {
        handleLeaveRoom(io, socket, roomId);
      }
    }
    logger.info(`🔌 User ${user.name} disconnected`);
  });
};

/**
 * Helper: remove a user from a room and notify remaining members.
 */
function handleLeaveRoom(io, socket, roomId) {
  if (!roomId) return;

  socket.leave(roomId);

  const room = codingRooms.get(roomId);
  if (room) {
    room.delete(socket.id);

    if (room.size === 0) {
      codingRooms.delete(roomId);
    } else {
      const members = Array.from(room.values()).map((m) => m.user);
      io.to(roomId).emit("room:members", { roomId, members });
    }
  }

  logger.info(`User ${socket.user.name} left room ${roomId}`);
}

/**
 * Broadcast a contest leaderboard update to all users in a contest room.
 * Called from the contest controller after a successful submission.
 */
export const broadcastContestLeaderboard = (io, contestId, leaderboard) => {
  io.to(`contest:${contestId}`).emit("contest:leaderboard-update", {
    contestId,
    leaderboard,
    timestamp: new Date().toISOString(),
  });
};

export { codingRooms };
