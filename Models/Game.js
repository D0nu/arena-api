// Models/Game.js - KEEP YOUR EXISTING STRUCTURE, JUST UPDATE VALIDATION
import mongoose from "mongoose";

const playerSchema = new mongoose.Schema({
  socketId: { type: String, required: true },
  walletAddress: String,
  character: {
    face: String,
    accessories: [String],
  },
  joinedAt: { type: Date, default: Date.now },
});

const gameSchema = new mongoose.Schema({
  // ✅ ADD: Room code for tracking
  roomCode: { type: String, required: true, unique: true },
  
  // Game Mode (for different styles of play)
  mode: {
    type: String,
    enum: ["question-vs-question", "game-vs-game", "question-vs-game", "questions-only", "games-only"], // ✅ ADD new modes
    required: true,
  },

  // Game Topic (used by question generator)
  topic: {
    type: String,
    enum: ["solana", "music", "sports", "movies", "history", "fashion"],
    required: false,
    default: "music"
  },

  // Optional mini game attached
  miniGame: {
    type: String,
    enum: [
      "basketball",
      "cup-toss",
      "darts",
      "coin-cascade",
      "target-takedown",
      "balance-beam",
    ],
  },

  maxPlayers: { type: Number, required: true, min: 2, max: 10 },

  // ✅ ADD: Player count for room settings
  playerCount: { type: Number, required: true },

  // Core participants - UPDATE to match your room structure
  players: [{
    id: String,
    name: String,
    avatar: String,
    team: String,
    socketId: String,
    isOwner: Boolean,
    isReady: Boolean
  }],

  // Creator / Host - MAKE OPTIONAL or set default
  creator: { type: String, default: "system" }, // ✅ ADD default

  // Game Status
  status: {
    type: String,
    enum: ["waiting", "starting", "active", "playing", "finished", "cancelled"], // ✅ ADD cancelled
    default: "waiting",
  },

  // Questions (used in question-based modes)
  questions: [
    {
      topic: String,
      question: String,
      options: [String],
      correctAnswer: String, // ✅ CHANGE from Number to String
      difficulty: String,
    },
  ],

  // Current round index
  currentRound: { type: Number, default: 0 },

  // Scores: { socketId: scoreValue } - UPDATE for team play
  scores: {
    type: Map,
    of: Number,
    default: {},
  },

  // ✅ ADD: Team scores
  teamScores: {
    A: { type: Number, default: 0 },
    B: { type: Number, default: 0 }
  },

  // Dice result for mini-games (optional)
  diceResult: mongoose.Schema.Types.Mixed,

  // Final winner
  winner: String,

  // Viewer engagement (optional for streaming/interactive mode)
  viewerInteractions: [
    {
      type: { type: String },
      data: mongoose.Schema.Types.Mixed,
      timestamp: { type: Date, default: Date.now },
    },
  ],

  // Lifecycle timestamps
  createdAt: { type: Date, default: Date.now },
  startedAt: Date,
  finishedAt: Date,
}, {
  timestamps: true // ✅ ADD timestamps
});

export const Game = mongoose.model('Game', gameSchema);