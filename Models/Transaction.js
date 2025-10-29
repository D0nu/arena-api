// models/Transaction.js
import mongoose from 'mongoose';

const txSchema = new mongoose.Schema({
  userId: { 
    type: mongoose.Schema.Types.ObjectId, 
    ref: 'User',
    required: true 
  },
  type: { 
    type: String, 
    enum: ['airdrop', 'buy-coins', 'send', 'receive', 'store-payment', 'wager', 'winning', 'refund'],
    required: true 
  },
  solAmount: {
    type: Number,
    default: 0
  },
  coinsAmount: {
    type: Number,
    default: 0
  },
  signature: {
    type: String,
    sparse: true // Allows null for non-blockchain transactions
  },
  from: String,
  to: String,
  meta: {
    type: Object,
    default: {}
  },
  createdAt: { 
    type: Date, 
    default: Date.now 
  }
}, {
  timestamps: true
});

// ✅ Performance optimization
txSchema.index({ userId: 1, createdAt: -1 });
txSchema.index({ signature: 1 }, { sparse: true });
txSchema.index({ type: 1 });

// ✅ Check if model already exists before creating
let Transaction;
try {
  // Try to get the existing model
  Transaction = mongoose.model('Transaction');
} catch {
  // If it doesn't exist, create it
  Transaction = mongoose.model('Transaction', txSchema);
}

// ✅ Helper function to avoid repetitive code
Transaction.createLog = async function(userId, type, data = {}) {
  try {
    const transaction = await this.create({
      userId,
      type,
      solAmount: data.solAmount || 0,
      coinsAmount: data.coinsAmount || 0,
      signature: data.signature || null,
      from: data.from || null,
      to: data.to || null,
      meta: data.meta || {}
    });
    
    return transaction;
  } catch (error) {
    console.error('Transaction.createLog error:', error);
    throw error;
  }
};

// ✅ Additional helper for common transaction patterns
Transaction.helpers = {
  // For airdrops
  airdrop: (userId, coinsAmount, meta = {}) => {
    return Transaction.createLog(userId, 'airdrop', {
      coinsAmount,
      meta
    });
  },
  
  // For coin purchases
  buyCoins: (userId, solAmount, coinsAmount, signature, meta = {}) => {
    return Transaction.createLog(userId, 'buy-coins', {
      solAmount,
      coinsAmount,
      signature,
      meta
    });
  },
  
  // For transfers between users
  transfer: (userId, from, to, coinsAmount, meta = {}) => {
    return Transaction.createLog(userId, 'send', {
      coinsAmount,
      from,
      to,
      meta
    });
  },
  
  // For wager transactions
  wager: (userId, coinsAmount, gameId, meta = {}) => {
    return Transaction.createLog(userId, 'wager', {
      coinsAmount,
      meta: { gameId, ...meta }
    });
  },
  
  // For winning payouts
  winning: (userId, coinsAmount, gameId, meta = {}) => {
    return Transaction.createLog(userId, 'winning', {
      coinsAmount,
      meta: { gameId, ...meta }
    });
  }
};

export { Transaction };