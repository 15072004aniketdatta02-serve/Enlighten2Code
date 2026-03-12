import logger from "../loggers/logger.js";

const codingRooms = new Map();   // roomId → Map<socketId, {user, cursor, isTyping}>
const activeCalls = new Map();   // roomId → Set<socketId>

export const registerEventHandlers = (io, socket) => {
  const user = socket.user;
  logger.info(`🔌 ${user.name} (${user.id}) connected [${socket.id}]`);

  /* ── Room lifecycle ──────────────────────────────────────── */

  socket.on("room:join", ({ roomId }) => {
    if (!roomId) return;
    socket.join(roomId);
    if (!codingRooms.has(roomId)) codingRooms.set(roomId, new Map());
    codingRooms.get(roomId).set(socket.id, {
      user: { id: user.id, name: user.name, image: user.image },
      cursor: null, isTyping: false,
    });
    const members = [...codingRooms.get(roomId).values()].map((m) => m.user);
    io.to(roomId).emit("room:members", { roomId, members });
    logger.info(`${user.name} joined room ${roomId}`);
  });

  socket.on("room:leave", ({ roomId }) => handleLeaveRoom(io, socket, roomId));

  /* ── Collaborative coding ────────────────────────────────── */

  socket.on("code:change", ({ roomId, code, language }) => {
    if (!roomId) return;
    socket.to(roomId).emit("code:change", { code, language, userId: user.id, userName: user.name });
  });

  socket.on("cursor:move", ({ roomId, position }) => {
    if (!roomId) return;
    const room = codingRooms.get(roomId);
    if (room?.has(socket.id)) room.get(socket.id).cursor = position;
    socket.to(roomId).emit("cursor:move", { userId: user.id, userName: user.name, position });
  });

  socket.on("user:typing", ({ roomId, isTyping }) => {
    if (!roomId) return;
    const room = codingRooms.get(roomId);
    if (room?.has(socket.id)) room.get(socket.id).isTyping = isTyping;
    socket.to(roomId).emit("user:typing", { userId: user.id, userName: user.name, isTyping });
  });

  socket.on("chat:message", ({ roomId, message }) => {
    if (!roomId || !message) return;
    io.to(roomId).emit("chat:message", {
      userId: user.id, userName: user.name, userImage: user.image,
      message, timestamp: new Date().toISOString(),
    });
  });

  /* ── Contests ────────────────────────────────────────────── */

  socket.on("contest:join", ({ contestId }) => {
    if (!contestId) return;
    socket.join(`contest:${contestId}`);
  });

  /* ── Execution status ────────────────────────────────────── */

  socket.on("execution:start", ({ roomId }) => {
    if (!roomId) return;
    io.to(roomId).emit("execution:status", { userId: user.id, userName: user.name, status: "running" });
  });

  socket.on("execution:complete", ({ roomId, result }) => {
    if (!roomId) return;
    io.to(roomId).emit("execution:status", { userId: user.id, userName: user.name, status: "completed", result });
  });

  /* ═══════════════════════════════════════════════════════════
     WebRTC Signaling — Voice / Video / Screen Share
     ═══════════════════════════════════════════════════════════ */

  socket.on("webrtc:join-call", ({ roomId }) => {
    if (!roomId) return;
    if (!activeCalls.has(roomId)) activeCalls.set(roomId, new Set());
    const callers = activeCalls.get(roomId);

    // Tell new joiner about existing callers
    socket.emit("webrtc:existing-callers", {
      roomId,
      callers: [...callers].map((sid) => ({
        socketId: sid,
        user: codingRooms.get(roomId)?.get(sid)?.user || { id: "?", name: "Unknown" },
      })),
    });

    callers.add(socket.id);
    socket.to(roomId).emit("webrtc:user-joined-call", {
      socketId: socket.id,
      user: { id: user.id, name: user.name, image: user.image },
    });
    _broadcastCallerList(io, roomId);
    logger.info(`📞 ${user.name} joined call in ${roomId}`);
  });

  socket.on("webrtc:offer", ({ roomId, targetSocketId, offer }) => {
    if (!roomId || !targetSocketId || !offer) return;
    io.to(targetSocketId).emit("webrtc:offer", {
      roomId, fromSocketId: socket.id,
      fromUser: { id: user.id, name: user.name, image: user.image }, offer,
    });
  });

  socket.on("webrtc:answer", ({ roomId, targetSocketId, answer }) => {
    if (!roomId || !targetSocketId || !answer) return;
    io.to(targetSocketId).emit("webrtc:answer", {
      roomId, fromSocketId: socket.id,
      fromUser: { id: user.id, name: user.name, image: user.image }, answer,
    });
  });

  socket.on("webrtc:ice-candidate", ({ roomId, targetSocketId, candidate }) => {
    if (!roomId || !targetSocketId || !candidate) return;
    io.to(targetSocketId).emit("webrtc:ice-candidate", {
      roomId, fromSocketId: socket.id, candidate,
    });
  });

  socket.on("webrtc:leave-call", ({ roomId }) => _handleLeaveCall(io, socket, roomId));

  socket.on("webrtc:toggle-media", ({ roomId, audio, video }) => {
    if (!roomId) return;
    socket.to(roomId).emit("webrtc:media-status", {
      socketId: socket.id, userId: user.id, userName: user.name, audio, video,
    });
  });

  socket.on("webrtc:screen-share", ({ roomId, isSharing }) => {
    if (!roomId) return;
    socket.to(roomId).emit("webrtc:screen-share", {
      socketId: socket.id, userId: user.id, userName: user.name, isSharing,
    });
    logger.info(`🖥️  ${user.name} ${isSharing ? "started" : "stopped"} screen share in ${roomId}`);
  });

  /* ── Disconnect ──────────────────────────────────────────── */

  socket.on("disconnect", () => {
    for (const [rid, room] of codingRooms.entries()) {
      if (room.has(socket.id)) handleLeaveRoom(io, socket, rid);
    }
    for (const [rid, callers] of activeCalls.entries()) {
      if (callers.has(socket.id)) _handleLeaveCall(io, socket, rid);
    }
    logger.info(`🔌 ${user.name} disconnected`);
  });
};

/* ─── helpers ────────────────────────────────────────────── */

function handleLeaveRoom(io, socket, roomId) {
  if (!roomId) return;
  socket.leave(roomId);
  const room = codingRooms.get(roomId);
  if (room) {
    room.delete(socket.id);
    if (!room.size) codingRooms.delete(roomId);
    else io.to(roomId).emit("room:members", { roomId, members: [...room.values()].map((m) => m.user) });
  }
  logger.info(`${socket.user.name} left room ${roomId}`);
}

function _handleLeaveCall(io, socket, roomId) {
  if (!roomId) return;
  const callers = activeCalls.get(roomId);
  if (callers) {
    callers.delete(socket.id);
    if (!callers.size) activeCalls.delete(roomId);
  }
  socket.to(roomId).emit("webrtc:user-left-call", {
    socketId: socket.id, userId: socket.user.id, userName: socket.user.name,
  });
  _broadcastCallerList(io, roomId);
  logger.info(`📞 ${socket.user.name} left call in ${roomId}`);
}

function _broadcastCallerList(io, roomId) {
  const callers = activeCalls.get(roomId);
  if (!callers) return;
  const roomData = codingRooms.get(roomId);
  io.to(roomId).emit("webrtc:caller-list", {
    roomId,
    callers: [...callers].map((sid) => ({
      socketId: sid,
      user: roomData?.get(sid)?.user || { id: "?", name: "Unknown" },
    })),
  });
}

export const broadcastContestLeaderboard = (io, contestId, leaderboard) => {
  io.to(`contest:${contestId}`).emit("contest:leaderboard-update", {
    contestId, leaderboard, timestamp: new Date().toISOString(),
  });
};

export { codingRooms, activeCalls };
