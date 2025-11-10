// User Model - FIXED VERSION
import mongoose from "mongoose";

// Character subdocument (unchanged)
const characterSchema = new mongoose.Schema({
  face: { type: String, default: "face1" },
  accessories: [String],
  name: { type: String, default: "" },
  colorScheme: { type: String, default: "purple" },
  achievements: [String],
  unlockedItems: [{
    itemId: String,
    itemType: { type: String, enum: ["avatar", "boost", "emote", "theme", 'face', 'accessory', 'skin', 'weapon'] },
    purchasedAt: { type: Date, default: Date.now },
    price: { type: Number, default: 0},
    name: String
  }],
  createdAt: { type: Date, default: Date.now },
  updatedAt: { type: Date, default: Date.now }
});

// Settings subdocument (unchanged)
const settingsSchema = new mongoose.Schema({
  theme: { type: String, enum: ["dark", "light"], default: "dark" },
  sound: { type: Boolean, default: true },
  musicVolume: { type: Number, default: 70 },
  notifications: { type: Boolean, default: true },
});

// Wallet subdocument for Solana (unchanged)
const walletSchema = new mongoose.Schema({
  publicKey: { 
    type: String, 
    unique: true, 
    sparse: true 
  },
  privateKey: { 
    type: Object, 
    select: false
  },
  balance: { type: Number, default: 0 },
  tokens: [{
    mint: String,
    symbol: String,
    balance: Number,
    name: String
  }],
  lastSynced: { type: Date, default: Date.now },
  isActive: { type: Boolean, default: true },
  isConnected: { type: Boolean, default: false },
  createdAt: { type: Date, default: Date.now }
});

// Arcade Profile subdocument (unchanged)
const arcadeProfileSchema = new mongoose.Schema({
  campaignId: String,
  arcadeId: String,
  rewardsEarned: { type: Number, default: 0 },
  level: { type: Number, default: 1 },
  xp: { type: Number, default: 0 },
  joinedAt: { type: Date, default: Date.now }
});

// Main User schema - FIXED: Standardize balance field
const userSchema = new mongoose.Schema({
  socketId: { type: String },
  username: { 
    type: String, 
    index: true
  },
  name: { type: String },
  email: { 
    type: String, 
    required: true, 
    unique: true
  },
  password: { type: String, required: true },

  lastCharacterUpdate: { type: Date, default: Date.now },

  // Solana Wallet Integration
  wallet: walletSchema,

  // ✅ FIXED: Use ONLY coinBalance for game coins (remove balance confusion)
  coinBalance: { type: Number, default: 1000 },
  totalCoinsSpent: { type: Number, default: 0 },
  totalCoinsEarned: { type: Number, default: 0 },
  
  // Game Stats (unchanged)
  gamesPlayed: { type: Number, default: 0 },
  gamesWon: { type: Number, default: 0 },
  totalScore: { type: Number, default: 0 },
  winStreak: { type: Number, default: 0 },
  bestWinStreak: { type: Number, default: 0 },
  averageScore: { type: Number, default: 0 },

  // Airdrop Tracking (unchanged)
  airdropsClaimed: [{
    provider: String,
    amount: Number,
    token: String,
    claimedAt: { type: Date, default: Date.now },
    transactionId: String
  }],
  lastAirdropClaim: Date,

  // Transaction History Reference (unchanged)
  transactions: [{ 
    type: mongoose.Schema.Types.ObjectId, 
    ref: 'Transaction' 
  }],

  // Arcade Integration (unchanged)
  arcadeProfile: arcadeProfileSchema,

  // Embedded subdocuments (unchanged)
  character: characterSchema,
  settings: settingsSchema,

  // System meta (unchanged)
  createdAt: { type: Date, default: Date.now },
  lastActive: { type: Date, default: Date.now },
  isVerified: { type: Boolean, default: false },
  isActive: { type: Boolean, default: true },
});

// Index definitions (unchanged)
userSchema.index({ email: 1 });
userSchema.index({ 'wallet.publicKey': 1 });
userSchema.index({ lastActive: -1 });
userSchema.index({ 'arcadeProfile.arcadeId': 1 });

// Virtual for win percentage (unchanged)
userSchema.virtual('winPercentage').get(function() {
  return this.gamesPlayed > 0 ? (this.gamesWon / this.gamesPlayed) * 100 : 0;
});

// Method to update game stats (unchanged)
userSchema.methods.updateGameStats = function(score, won = false) {
  this.gamesPlayed += 1;
  this.totalScore += score;
  this.averageScore = this.totalScore / this.gamesPlayed;
  
  if (won) {
    this.gamesWon += 1;
    this.winStreak += 1;
    this.bestWinStreak = Math.max(this.bestWinStreak, this.winStreak);
  } else {
    this.winStreak = 0;
  }
  
  this.lastActive = new Date();
  return this.save();
};

characterSchema.pre('save', function(next) {
  this.updatedAt = new Date();
  next();
});

// ✅ FIXED: Update coin balance method - use only coinBalance
userSchema.methods.updateCoins = function(amount, type = 'earned') {
  if (type === 'earned') {
    this.coinBalance += amount;
    this.totalCoinsEarned += amount;
  } else if (type === 'spent') {
    this.coinBalance -= amount;
    this.totalCoinsSpent += amount;
  }
  return this.save();
};

// Static method to find by wallet public key (unchanged)
userSchema.statics.findByPublicKey = function(publicKey) {
  return this.findOne({ 'wallet.publicKey': publicKey });
};

// Static method to get top players (unchanged)
userSchema.statics.getTopPlayers = function(limit = 10) {
  return this.find({ 'gamesPlayed': { $gt: 0 } })
    .sort({ 'gamesWon': -1, 'averageScore': -1 })
    .limit(limit)
    .select('username character gamesPlayed gamesWon averageScore winStreak');
};

// Pre-save middleware (unchanged)
userSchema.pre('save', function(next) {
  if (this.wallet && this.wallet.privateKey && this.isModified('wallet.privateKey')) {
    console.log('Private key updated for user:', this._id);
  }
  next();
});

// ✅ Check if model already exists
let User;
try {
  User = mongoose.model('User');
} catch {
  User = mongoose.model('User', userSchema);
}

export { User };