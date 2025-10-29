import jwt from "jsonwebtoken";
import { User } from "../Models/User.js";
import { gameHandlers } from "./gameHandlers.js";
import { airdropHandlers } from "./airdropHandlers.js";
import { roomHandlers } from "./roomHandlers.js";
import { characterHandlers } from "./characterHandlers.js";
import { JWT_SECRET } from "../utils/jwtconfig.js";

if (!JWT_SECRET) {
  console.error("❌ JWT_SECRET not defined! Socket authentication will fail.");
}

const activeRooms = new Map();

// Utility: safe emit
const safeEmit = (socket, event, data) => {
  try {
    socket.emit(event, JSON.parse(JSON.stringify(data)));
  } catch (err) {
    console.error(`🔴 Error emitting ${event}:`, err.message);
    socket.emit("error", { message: `Failed to send ${event} data` });
  }
};

// Utility: safe broadcast
const safeBroadcast = (io, room, event, data) => {
  try {
    io.to(room).emit(event, JSON.parse(JSON.stringify(data)));
  } catch (err) {
    console.error(`🔴 Error broadcasting ${event} to room ${room}:`, err.message);
  }
};

export const socketConnection = (io) => {
  // Socket.IO config
  io.engine.maxHttpBufferSize = 1e8;
  io.engine.pingTimeout = 60000;
  io.engine.pingInterval = 25000;

io.use(async (socket, next) => {
  try {
    const token = socket.handshake.auth?.token?.trim();
    if (!token) return next(new Error("Authentication required"));

    const decoded = jwt.verify(token, JWT_SECRET);
    if (!decoded?.userId) return next(new Error("Invalid token structure"));

    const user = await User.findById(decoded.userId).select("-password");
    if (!user) return next(new Error("User not found"));

    socket.user = user;
    socket.userId = user._id.toString();
    console.log(`✅ Socket authenticated for user: ${user.name} (${socket.id})`);
    next();
  } catch (err) {
    console.error("🔴 Socket authentication failed:", err.message);
    next(new Error("Authentication failed"));
  }
});


  io.on("connection", async (socket) => {
    console.log(`✅ User ${socket.user.name} connected (${socket.id})`);

    // Save socketId
    socket.user.socketId = socket.id;
    socket.user.lastActive = new Date();
    await socket.user.save();

    safeEmit(socket, "authenticated", { user: socket.user, message: "Successfully authenticated" });

    const handlerUtils = { safeEmit, safeBroadcast };

    roomHandlers(io, socket, activeRooms, handlerUtils);
    gameHandlers(io, socket, activeRooms, handlerUtils);
    airdropHandlers(io, socket, handlerUtils);
    characterHandlers(io, socket, handlerUtils);

    socket.on("disconnect", async (reason) => {
      console.log(`❌ ${socket.user.name} disconnected:`, reason);

      // Remove player from rooms
      for (const [roomCode, room] of activeRooms.entries()) {
        const index = room.players.findIndex((p) => p.id === socket.user._id.toString());
        if (index !== -1) {
          room.players.splice(index, 1);
          if (room.players.length === 0) {
            activeRooms.delete(roomCode);
          } else {
            safeBroadcast(io, roomCode, "room-updated", room);
          }
          break;
        }
      }

      socket.user.socketId = null;
      await socket.user.save();
    });

    socket.on("error", (err) => console.error(`🔴 Socket error for ${socket.user.name}:`, err));
  });

  io.engine.on("connection_error", (err) => {
    console.error("🔴 IO Engine connection error:", err);
  });
};

export { activeRooms, safeEmit, safeBroadcast };
