// controllers/walletController.js
import { WalletService } from '../services/walletService.js';
import { Connection, PublicKey, LAMPORTS_PER_SOL, SystemProgram, Transaction } from '@solana/web3.js';
import { Transaction as TransactionModel } from '../Models/Transaction.js';

const connection = new Connection(process.env.SOLANA_RPC_URL || 'https://api.devnet.solana.com');

// ✅ Add this missing function
export async function getWalletBalance(req, res) {
  try {
    const publicKey = new PublicKey(req.params.publicKey);
    const balance = await connection.getBalance(publicKey);
    res.json({ balance: balance / LAMPORTS_PER_SOL });
  } catch (error) {
    console.error('getWalletBalance error:', error);
    res.status(500).json({ error: 'Failed to fetch balance' });
  }
}

export async function sendSol(req, res) {
  try {
    const { userId, toPublicKey, amount } = req.body;
    if (!userId || !toPublicKey || !amount)
      return res.status(400).json({ error: 'Missing required fields' });

    const keypair = await WalletService.getUserKeypair(userId);
    const toPub = new PublicKey(toPublicKey);

    const transaction = new Transaction().add(
      SystemProgram.transfer({
        fromPubkey: keypair.publicKey,
        toPubkey: toPub,
        lamports: amount * LAMPORTS_PER_SOL,
      })
    );

    const signature = await connection.sendTransaction(transaction, [keypair]);
    await connection.confirmTransaction(signature, 'confirmed');

    // ✅ Clean transaction tracking using helper
    await TransactionModel.createLog(userId, 'send', {
      solAmount: amount,
      signature,
      from: keypair.publicKey.toString(),
      to: toPublicKey,
      meta: { confirmed: true }
    });

    res.json({ success: true, signature });
  } catch (error) {
    console.error('sendSol error:', error);
    
    // ✅ Track failed transaction
    try {
      const keypair = await WalletService.getUserKeypair(req.body.userId);
      await TransactionModel.createLog(req.body.userId, 'send', {
        solAmount: req.body.amount,
        from: keypair.publicKey.toString(),
        to: req.body.toPublicKey,
        meta: { error: error.message, confirmed: false }
      });
    } catch (trackingError) {
      console.error('Failed to track failed transaction:', trackingError);
    }
    
    res.status(500).json({ error: 'Failed to send SOL' });
  }
}