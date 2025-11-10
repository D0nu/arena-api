import mongoose from 'mongoose';

const transactionSchema = new mongoose.Schema({
  amount: { type: Number, required: true }, // Coin amount
  solAmount: { type: Number, required: true }, // SOL amount
  type: { 
    type: String, 
    required: true,
    enum: ['house_fee', 'purchase', 'refund', 'transfer_to_main', 'transfer_failed', 'withdrawal']
  },
  roomCode: String,
  toAddress: String, // For transfers
  signature: String, // Transaction signature
  explorerUrl: String, // Solscan URL
  conversionRate: Number, // coins per SOL
  error: String, // For failed transfers
  description: String,
  timestamp: { type: Date, default: Date.now }
});

const storeWalletSchema = new mongoose.Schema({
  balance: { type: Number, default: 0 }, // Total coins
  solBalance: { type: Number, default: 0 }, // Current SOL balance
  totalCoinsEarned: { type: Number, default: 0 }, // Lifetime coins
  totalSolEarned: { type: Number, default: 0 }, // Lifetime SOL
  totalTransferred: { type: Number, default: 0 }, // Total SOL transferred to main wallet
  mainWalletAddress: { 
    type: String, 
    default: 'C15eFWuTezWVrEEog3vserFaj44bYT98EpNo9ShFKQWq' 
  },
  conversionRate: { type: Number, default: 100000 }, // 100,000 coins = 1 SOL
  transferThreshold: { type: Number, default: 0.1 }, // Auto-transfer threshold
  transactions: [transactionSchema],
  lastUpdated: { type: Date, default: Date.now }
});

export const StoreWallet = mongoose.model('StoreWallet', storeWalletSchema);