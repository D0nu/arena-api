import mongoose from "mongoose";

// Character subdocument
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

// Settings subdocument
const settingsSchema = new mongoose.Schema({
  theme: { type: String, enum: ["dark", "light"], default: "dark" },
  sound: { type: Boolean, default: true },
  musicVolume: { type: Number, default: 70 },
  notifications: { type: Boolean, default: true },
});

// Wallet subdocument for Solana (Enhanced)
const walletSchema = new mongoose.Schema({
  publicKey: { 
    type: String, 
    unique: true, 
    sparse: true 
    // REMOVED: index: true (causes duplicate with schema.index below)
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

// Arcade Profile subdocument
const arcadeProfileSchema = new mongoose.Schema({
  campaignId: String,
  arcadeId: String,
  rewardsEarned: { type: Number, default: 0 },
  level: { type: Number, default: 1 },
  xp: { type: Number, default: 0 },
  joinedAt: { type: Date, default: Date.now }
});

// Main User schema
const userSchema = new mongoose.Schema({
  socketId: { type: String },
  username: { 
    type: String, 
    index: true // This is fine - no duplicate for username
  },
  name: { type: String },
  email: { 
    type: String, 
    required: true, 
    unique: true 
    // REMOVED: index: true (causes duplicate with schema.index below)
  },
  password: { type: String, required: true },

   lastCharacterUpdate: { type: Date, default: Date.now },

  // Solana Wallet Integration
  wallet: walletSchema,

  // Game Economy
  coinBalance: { type: Number, default: 1000 },
  totalCoinsSpent: { type: Number, default: 0 },
  totalCoinsEarned: { type: Number, default: 0 },
  
  // Game Stats
  gamesPlayed: { type: Number, default: 0 },
  gamesWon: { type: Number, default: 0 },
  totalScore: { type: Number, default: 0 },
  winStreak: { type: Number, default: 0 },
  bestWinStreak: { type: Number, default: 0 },
  averageScore: { type: Number, default: 0 },

  // Airdrop Tracking
  airdropsClaimed: [{
    provider: String,
    amount: Number,
    token: String,
    claimedAt: { type: Date, default: Date.now },
    transactionId: String
  }],
  lastAirdropClaim: Date,

  // Transaction History Reference
  transactions: [{ 
    type: mongoose.Schema.Types.ObjectId, 
    ref: 'Transaction' 
  }],

  // Arcade Integration
  arcadeProfile: arcadeProfileSchema,

  // Embedded subdocuments
  character: characterSchema,
  settings: settingsSchema,

  // System meta
  createdAt: { type: Date, default: Date.now },
  lastActive: { type: Date, default: Date.now },
  isVerified: { type: Boolean, default: false },
  isActive: { type: Boolean, default: true },
});

// ✅ SINGLE index definitions (no duplicates)
userSchema.index({ email: 1 });
userSchema.index({ 'wallet.publicKey': 1 });
userSchema.index({ lastActive: -1 });
userSchema.index({ 'arcadeProfile.arcadeId': 1 });
// Note: username index is already defined inline above

// Virtual for win percentage
userSchema.virtual('winPercentage').get(function() {
  return this.gamesPlayed > 0 ? (this.gamesWon / this.gamesPlayed) * 100 : 0;
});

// Method to update game stats
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

// Method to update coin balance
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

// Static method to find by wallet public key
userSchema.statics.findByPublicKey = function(publicKey) {
  return this.findOne({ 'wallet.publicKey': publicKey });
};

// Static method to get top players
userSchema.statics.getTopPlayers = function(limit = 10) {
  return this.find({ 'gamesPlayed': { $gt: 0 } })
    .sort({ 'gamesWon': -1, 'averageScore': -1 })
    .limit(limit)
    .select('username character gamesPlayed gamesWon averageScore winStreak');
};

// Pre-save middleware
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