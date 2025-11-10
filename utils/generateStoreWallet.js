// generateStoreWallet.js
import { Keypair } from '@solana/web3.js';
import bs58 from 'bs58';

const keypair = Keypair.generate();

console.log('Public Key:', keypair.publicKey.toBase58());
console.log('Private Key (save safely!):', bs58.encode(keypair.secretKey));

// Utility to check wallet balance
async function getWalletBalance(publicKey) {
  try {
    const connection = new Connection(
      process.env.SOLANA_RPC_URL || 'https://api.mainnet-beta.solana.com',
      'confirmed'
    );
    
    const balance = await connection.getBalance(new PublicKey(publicKey));
    return balance / LAMPORTS_PER_SOL;
  } catch (error) {
    console.error('Error getting wallet balance:', error);
    return 0;
  }
}

// Check store wallet balance
async function checkStoreWalletBalance() {
  const STORE_WALLET_SECRET_KEY = process.env.STORE_WALLET_SECRET_KEY;
  const storeWallet = Keypair.fromSecretKey(bs58.decode(STORE_WALLET_SECRET_KEY));
  const balance = await getWalletBalance(storeWallet.publicKey);
  
  console.log(`🏦 Store wallet balance: ${balance} SOL`);
  return balance;
}