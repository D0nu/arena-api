import 'dotenv/config';  // ✅ This loads .env variables automatically
import { Connection, PublicKey, LAMPORTS_PER_SOL } from '@solana/web3.js';

const connection = new Connection("https://api.devnet.rpcpool.com");
const STORE_WALLET = process.env.STORE_WALLET;

async function main() {
  try {
    if (!STORE_WALLET) throw new Error("STORE_WALLET not set in .env!");
    
    const pubKey = new PublicKey(STORE_WALLET);
    console.log("Requesting 2 SOL to", pubKey.toBase58());

    const signature = await connection.requestAirdrop(pubKey, 2 * LAMPORTS_PER_SOL);
    await connection.confirmTransaction(signature, 'confirmed');

    console.log("✅ Airdrop successful! Signature:", signature);
  } catch (error) {
    console.error("❌ Airdrop failed:", error);
  }
}

main();
