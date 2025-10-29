import { Connection, PublicKey, LAMPORTS_PER_SOL } from "@solana/web3.js";

const connection = new Connection("https://api.devnet.solana.com");
const STORE_WALLET = process.env.STORE_WALLET;

async function main() {
  try {
    const pubKey = new PublicKey(STORE_WALLET);
    const balanceLamports = await connection.getBalance(pubKey);
    console.log(`💰 Store wallet balance: ${balanceLamports / LAMPORTS_PER_SOL} SOL`);
  } catch (error) {
    console.error("❌ Failed to fetch balance:", error);
  }
}

main();
