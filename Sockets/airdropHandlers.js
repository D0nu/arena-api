import { User } from '../Models/User.js';
import { Transaction } from '../Models/Transaction.js';
import { VorldService } from '../services/vorldService.js';

// Vorld Airdrop Arcade API integration
async function verifyVorldAirdrop(vorldAppId, userId) {
  try {
    console.log('🎯 Verifying Vorld airdrop for app:', vorldAppId, 'user:', userId);
    
    // Use your VorldService to claim airdrop
    const airdropResult = await VorldService.claimAirdrop(vorldAppId, userId);
    
    if (airdropResult.success) {
      return {
        valid: true,
        amount: airdropResult.coins || 500, // Default 500 coins if not specified
        transactionId: airdropResult.transactionId || 'vorld_tx_' + Date.now(),
        message: airdropResult.message || 'Vorld airdrop claimed successfully!'
      };
    } else {
      return { 
        valid: false, 
        error: airdropResult.error || 'Vorld service error' 
      };
    }
  } catch (error) {
    console.error('Vorld airdrop verification failed:', error);
    return { 
      valid: false, 
      error: error.message 
    };
  }
}

// Mock VorldService implementation (create this if it doesn't exist)
class MockVorldService {
  static async claimAirdrop(appId, userId) {
    // This is a mock implementation - replace with actual Vorld API call
    console.log(`🔐 Mock Vorld API call - App: ${appId}, User: ${userId}`);
    
    // Simulate API delay
    await new Promise(resolve => setTimeout(resolve, 1000));
    
    // Simulate successful airdrop 80% of the time
    if (Math.random() > 0.2) {
      const amounts = [100, 200, 300, 500, 750, 1000];
      const randomAmount = amounts[Math.floor(Math.random() * amounts.length)];
      
      return {
        success: true,
        coins: randomAmount,
        transactionId: 'vorld_' + Date.now(),
        message: `Claimed ${randomAmount} Vorld coins!`
      };
    } else {
      return {
        success: false,
        error: 'Airdrop not available at this time'
      };
    }
  }
}

// Use mock service if real one isn't available
const VorldServiceToUse = VorldService || MockVorldService;

export function airdropHandlers(io, socket, { safeEmit, safeBroadcast, removeCircularReferences }) {
  
  // ============================
  // 🎯 Vorld Airdrop Claims
  // ============================
  socket.on('claim-airdrop', async (data) => {
    try {
      const { userId, vorldAppId, gameId } = data;
      
      console.log('🎯 Airdrop claim request:', { userId, vorldAppId, gameId });

      if (!vorldAppId) {
        safeEmit(socket, 'airdrop-error', { 
          message: 'Vorld app ID is required' 
        });
        return;
      }

      // Find user by ID (preferred) or socket ID
      let user = userId 
        ? await User.findById(userId)
        : await User.findOne({ socketId: socket.id });

      if (!user) {
        console.log('❌ User not found for airdrop claim');
        safeEmit(socket, 'airdrop-error', { message: 'User not found' });
        return;
      }

      // Check if user already claimed airdrop recently (optional cooldown)
      const lastClaim = user.lastAirdropClaim;
      const cooldownPeriod = 24 * 60 * 60 * 1000; // 24 hours
      
      if (lastClaim && (Date.now() - new Date(lastClaim).getTime()) < cooldownPeriod) {
        safeEmit(socket, 'airdrop-error', { 
          message: 'Airdrop already claimed today. Try again tomorrow!' 
        });
        return;
      }

      // Verify with Vorld API
      const vorldVerification = await verifyVorldAirdrop(vorldAppId, user._id.toString());
      
      if (!vorldVerification.valid) {
        safeEmit(socket, 'airdrop-error', { 
          message: vorldVerification.error || 'Vorld airdrop verification failed' 
        });
        return;
      }

      // Process successful airdrop
      const previousBalance = user.coinBalance;
      const airdropAmount = vorldVerification.amount;
      
      user.coinBalance += airdropAmount;
      user.totalCoinsEarned += airdropAmount;
      user.airdropClaimed = true;
      user.lastAirdropClaim = new Date();
      
      // Track airdrop history
      if (!user.airdropsClaimed) user.airdropsClaimed = [];
      
      user.airdropsClaimed.push({
        provider: 'vorld_arcade',
        appId: vorldAppId,
        amount: airdropAmount,
        token: 'ARCADE_COINS',
        claimedAt: new Date(),
        transactionId: vorldVerification.transactionId
      });
      
      await user.save();

      // Log transaction
      await Transaction.helpers.airdrop(
        user._id,
        airdropAmount,
        { 
          provider: 'vorld_arcade',
          appId: vorldAppId,
          transactionId: vorldVerification.transactionId,
          previousBalance,
          newBalance: user.coinBalance
        }
      );

      console.log('✅ Airdrop claimed successfully:', {
        user: user.email,
        amount: airdropAmount,
        newBalance: user.coinBalance
      });

      // Notify user
      safeEmit(socket, 'airdrop-received', { 
        amount: airdropAmount, 
        newBalance: user.coinBalance,
        transactionId: vorldVerification.transactionId,
        message: vorldVerification.message || `🎉 You received ${airdropAmount} coins from Vorld Airdrop!`
      });

      // Broadcast to game if applicable
      if (gameId) {
        safeBroadcast(io, gameId, 'airdrop-claimed', {
          userId: user._id,
          username: user.name,
          amount: airdropAmount,
          timestamp: new Date()
        });
      }

    } catch (error) {
      console.error('❌ Airdrop claim error:', error);
      safeEmit(socket, 'airdrop-error', { 
        error: 'Failed to claim airdrop: ' + error.message 
      });
    }
  });

  // ============================
  // Coin Purchase (Simplified - no wallet needed)
  // ============================
  socket.on('coin-purchase', async (data) => {
    try {
      const { amount, userId, newBalance } = data;

      if (!amount || amount <= 0) {
        safeEmit(socket, 'purchase-failed', { error: 'Invalid amount' });
        return;
      }

      const user = userId 
        ? await User.findById(userId)
        : await User.findOne({ socketId: socket.id });

      if (!user) {
        safeEmit(socket, 'purchase-failed', { error: 'User not found' });
        return;
      }

      const previousBalance = user.coinBalance;
      user.coinBalance = newBalance;
      user.totalCoinsEarned += amount;
      await user.save();

      // Log transaction
      await Transaction.helpers.buyCoins(
        user._id,
        0, // No real money transaction in this simplified version
        amount,
        'in_app_purchase_' + Date.now(),
        { 
          previousBalance,
          newBalance: user.coinBalance,
          source: 'in_app_purchase' 
        }
      );
      
      safeEmit(socket, 'coin-balance-update', user.coinBalance);
      safeEmit(socket, 'purchase-success', { 
        amount, 
        newBalance: user.coinBalance,
        transactionId: 'in_app_purchase_' + Date.now()
      });

      console.log('✅ Coin purchase processed:', {
        user: user.email,
        amount: amount,
        newBalance: user.coinBalance
      });

    } catch (error) {
      console.error('❌ Coin purchase error:', error);
      safeEmit(socket, 'purchase-failed', { error: error.message });
    }
  });

  // ============================
  // Viewer Interactions
  // ============================
  socket.on('viewer-interaction', async (data) => {
    try {
      const { interactionId, gameId, cost, targetPlayer, userId } = data;

      // Find user
      const user = userId 
        ? await User.findById(userId)
        : await User.findOne({ socketId: socket.id });

      if (!user) {
        safeEmit(socket, 'viewer-interaction-result', {
          success: false,
          message: 'User not found',
          cost: cost
        });
        return;
      }

      // Check balance
      if (user.coinBalance < cost) {
        safeEmit(socket, 'viewer-interaction-result', {
          success: false,
          message: 'Insufficient coins',
          cost: cost
        });
        return;
      }

      // Deduct coins
      const previousBalance = user.coinBalance;
      user.coinBalance -= cost;
      user.totalCoinsSpent += cost;
      await user.save();

      // Log transaction
      await Transaction.helpers.spendCoins(
        user._id,
        cost,
        'viewer_interaction',
        {
          interactionId,
          gameId,
          targetPlayer,
          previousBalance,
          newBalance: user.coinBalance
        }
      );

      // Broadcast interaction to game
      if (gameId) {
        safeBroadcast(io, gameId, 'viewer-interaction-applied', {
          interactionId,
          targetPlayer,
          userId: user._id,
          username: user.name,
          cost,
          timestamp: new Date()
        });
      }

      // Send success response
      safeEmit(socket, 'viewer-interaction-result', {
        success: true,
        message: `Successfully used ${cost} coins for interaction!`,
        cost: cost,
        newBalance: user.coinBalance,
        interactionName: interactionId
      });

      console.log('✅ Viewer interaction processed:', {
        user: user.email,
        interaction: interactionId,
        cost: cost,
        targetPlayer: targetPlayer
      });

    } catch (error) {
      console.error('❌ Viewer interaction error:', error);
      safeEmit(socket, 'viewer-interaction-result', {
        success: false,
        message: 'Interaction failed: ' + error.message,
        cost: data.cost
      });
    }
  });

  // ============================
  // Get Viewer Balance
  // ============================
  socket.on('get-viewer-balance', async (data) => {
    try {
      const { userId } = data || {};

      const user = userId 
        ? await User.findById(userId)
        : await User.findOne({ socketId: socket.id });

      if (user) {
        safeEmit(socket, 'coin-balance-update', user.coinBalance);
      }
    } catch (error) {
      console.error('❌ Get balance error:', error);
    }
  });
}