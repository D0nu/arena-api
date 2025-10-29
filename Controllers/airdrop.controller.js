// controllers/airdropController.js
import { User } from '../Models/User.js';
import { Connection, PublicKey, LAMPORTS_PER_SOL } from '@solana/web3.js';
import { COINS_PER_SOL } from '../services/solanaService.js';

const connection = new Connection(process.env.SOLANA_RPC_URL || 'https://api.devnet.solana.com');

// ✅ Claim devnet airdrop
export async function claimAirdrop(req, res) {
  try {
    const { userId, amount = 1 } = req.body;
    const user = await User.findById(userId);

    if (!user?.wallet?.publicKey) return res.status(404).json({ error: 'Wallet not found' });

    const publicKey = new PublicKey(user.wallet.publicKey);

    // cooldown (1 min for testing)
    const last = user.lastAirdropClaim;
    if (last && Date.now() - last.getTime() < 60 * 1000) {
      return res.status(429).json({ error: 'Cooldown active, try again soon.' });
    }

    const signature = await connection.requestAirdrop(publicKey, amount * LAMPORTS_PER_SOL);
    await connection.confirmTransaction(signature, 'confirmed');

    user.wallet.balance += amount;
    user.lastAirdropClaim = new Date();
    user.coinBalance += amount * COINS_PER_SOL;
    await user.save();

    res.json({
      success: true,
      signature,
      solAdded: amount,
      coinsAdded: amount * COINS_PER_SOL,
    });
  } catch (error) {
    console.error('claimAirdrop error:', error);
    res.status(500).json({ error: 'Airdrop failed' });
  }
}
