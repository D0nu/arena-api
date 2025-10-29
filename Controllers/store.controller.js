// controllers/storeController.js
import { User } from '../Models/User.js';
import { verifySolTransfer, COINS_PER_SOL } from '../services/solanaService.js';
import { LAMPORTS_PER_SOL } from '@solana/web3.js';

const STORE_ITEMS = {
  coins: {
    '1000_coins': { solCost: 0.01, coins: 1000 },
    '5000_coins': { solCost: 0.05, coins: 5000 },
    '10000_coins': { solCost: 0.1, coins: 10000 },
    '25000_coins': { solCost: 0.25, coins: 25000 },
  },
  boosts: {
    'double_points_5': { coinCost: 200, uses: 5, type: 'double-points' },
  },
  viewerItems: {
    'spawn_obstacle': { coinCost: 120, effect: 'spawn-obstacle' },
  },
};

// ✅ Purchase coins with SOL
export async function buyCoins(req, res) {
  try {
    const { userId, solAmount, signature } = req.body;
    if (!userId || !solAmount || !signature)
      return res.status(400).json({ error: 'Missing required fields' });

    const expectedLamports = Math.round(solAmount * LAMPORTS_PER_SOL);
    const verified = await verifySolTransfer(signature, process.env.STORE_WALLET, expectedLamports);

    if (!verified) return res.status(400).json({ error: 'Transaction not verified' });

    const coinsToAdd = Math.floor(solAmount * COINS_PER_SOL);
    const user = await User.findById(userId);

    user.coinBalance += coinsToAdd;
    await user.save();

    res.json({
      success: true,
      coinsAdded: coinsToAdd,
      newBalance: user.coinBalance,
    });
  } catch (error) {
    console.error('buyCoins error:', error);
    res.status(500).json({ error: 'Coin purchase failed' });
  }
}

// ✅ Get store inventory
export async function getInventory(req, res) {
  try {
    res.json({ success: true, inventory: STORE_ITEMS });
  } catch (error) {
    console.error('getInventory error:', error);
    res.status(500).json({ error: 'Failed to fetch store inventory' });
  }
}
