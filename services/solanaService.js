// services/solanaService.js
import { Connection, PublicKey, LAMPORTS_PER_SOL } from '@solana/web3.js';

const connection = new Connection(process.env.SOLANA_RPC_URL || 'https://api.devnet.solana.com');

// Conversion rate
export const COINS_PER_SOL = 100000; // 0.01 SOL = 1000 coins

/**
 * Get balance of a public key in SOL
 */
export async function getBalance(publicKey) {
  const balance = await connection.getBalance(new PublicKey(publicKey));
  return balance / LAMPORTS_PER_SOL;
}

/**
 * Verify that a given signature sent the correct amount of SOL to the store wallet
 */
export async function verifySolTransfer(signature, expectedToPubkey, expectedLamports) {
  try {
    const tx = await connection.getTransaction(signature, { commitment: 'confirmed' });
    if (!tx || !tx.meta) return false;

    const accountKeys = tx.transaction.message.accountKeys.map((k) => k.toString());
    const idx = accountKeys.indexOf(expectedToPubkey);
    if (idx === -1) return false;

    const lamportDelta = tx.meta.postBalances[idx] - tx.meta.preBalances[idx];
    return lamportDelta === expectedLamports;
  } catch (error) {
    console.error('verifySolTransfer error:', error);
    return false;
  }
}

export { connection, LAMPORTS_PER_SOL };
