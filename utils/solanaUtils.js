import { Connection, Keypair, SystemProgram, Transaction, sendAndConfirmTransaction, PublicKey, LAMPORTS_PER_SOL } from '@solana/web3.js';
import bs58 from 'bs58';

// Solana transfer function
export async function transferSol(fromPrivateKey, toAddress, amount) {
  try {
    console.log(`📤 Initiating SOL transfer: ${amount} SOL to ${toAddress}`);
    
    // Validate inputs
    if (!fromPrivateKey || !toAddress || !amount) {
      throw new Error('Missing required parameters for SOL transfer');
    }

    if (amount <= 0) {
      throw new Error('Transfer amount must be greater than 0');
    }

    // Initialize connection (use mainnet for production)
    const connection = new Connection(
      process.env.SOLANA_RPC_URL || 'https://api.mainnet-beta.solana.com',
      'confirmed'
    );

    // Convert private key from base58 string to Keypair
    const fromKeypair = Keypair.fromSecretKey(bs58.decode(fromPrivateKey));
    const fromPublicKey = fromKeypair.publicKey;
    const toPublicKey = new PublicKey(toAddress);

    console.log(`🔑 From: ${fromPublicKey.toBase58()}`);
    console.log(`🎯 To: ${toPublicKey.toBase58()}`);
    console.log(`💰 Amount: ${amount} SOL`);

    // Check balances before transfer
    const fromBalance = await connection.getBalance(fromPublicKey);
    const toBalance = await connection.getBalance(toPublicKey);
    
    const fromBalanceSOL = fromBalance / LAMPORTS_PER_SOL;
    const toBalanceSOL = toBalance / LAMPORTS_PER_SOL;

    console.log(`💳 From balance: ${fromBalanceSOL} SOL`);
    console.log(`💳 To balance: ${toBalanceSOL} SOL`);

    // Validate sufficient balance
    const transferAmountLamports = Math.floor(amount * LAMPORTS_PER_SOL);
    
    if (fromBalance < transferAmountLamports) {
      throw new Error(`Insufficient balance. Available: ${fromBalanceSOL} SOL, Required: ${amount} SOL`);
    }

    // Check if we're leaving enough for transaction fees
    const transactionFeeBuffer = 5000; // lamports (0.000005 SOL)
    if (fromBalance < transferAmountLamports + transactionFeeBuffer) {
      throw new Error('Insufficient balance for transfer + transaction fees');
    }

    // Create transfer transaction
    const transaction = new Transaction().add(
      SystemProgram.transfer({
        fromPubkey: fromPublicKey,
        toPubkey: toPublicKey,
        lamports: transferAmountLamports,
      })
    );

    // Get recent blockhash
    const { blockhash } = await connection.getRecentBlockhash();
    transaction.recentBlockhash = blockhash;
    transaction.feePayer = fromPublicKey;

    // Sign and send transaction
    console.log('⏳ Signing and sending transaction...');
    const signature = await sendAndConfirmTransaction(
      connection,
      transaction,
      [fromKeypair],
      {
        commitment: 'confirmed',
        preflightCommitment: 'confirmed'
      }
    );

    console.log(`✅ Transaction confirmed: ${signature}`);
    
    // Verify the transfer
    const newFromBalance = await connection.getBalance(fromPublicKey);
    const newToBalance = await connection.getBalance(toPublicKey);
    
    const newFromBalanceSOL = newFromBalance / LAMPORTS_PER_SOL;
    const newToBalanceSOL = newToBalance / LAMPORTS_PER_SOL;

    console.log(`📊 Transfer verification:`);
    console.log(`   From new balance: ${newFromBalanceSOL} SOL`);
    console.log(`   To new balance: ${newToBalanceSOL} SOL`);
    console.log(`   Expected From: ${fromBalanceSOL - amount} SOL`);
    console.log(`   Expected To: ${toBalanceSOL + amount} SOL`);

    // Return transaction details
    return {
      success: true,
      signature: signature,
      from: fromPublicKey.toBase58(),
      to: toAddress,
      amount: amount,
      amountLamports: transferAmountLamports,
      fromBalanceBefore: fromBalanceSOL,
      fromBalanceAfter: newFromBalanceSOL,
      toBalanceBefore: toBalanceSOL,
      toBalanceAfter: newToBalanceSOL,
      explorerUrl: `https://solscan.io/tx/${signature}`
    };

  } catch (error) {
    console.error('❌ SOL transfer failed:', error.message);
    
    return {
      success: false,
      error: error.message,
      from: fromPrivateKey ? Keypair.fromSecretKey(bs58.decode(fromPrivateKey)).publicKey.toBase58() : 'unknown',
      to: toAddress,
      amount: amount
    };
  }
}

// Enhanced version with fee calculation and retry logic
export async function transferSolWithRetry(fromPrivateKey, toAddress, amount, maxRetries = 3) {
  let lastError;
  
  for (let attempt = 1; attempt <= maxRetries; attempt++) {
    try {
      console.log(`🔄 Transfer attempt ${attempt}/${maxRetries}`);
      
      const result = await transferSol(fromPrivateKey, toAddress, amount);
      
      if (result.success) {
        return result;
      }
      
      lastError = result.error;
      
      // Wait before retry (exponential backoff)
      if (attempt < maxRetries) {
        const delay = Math.min(1000 * Math.pow(2, attempt - 1), 10000); // Max 10 seconds
        console.log(`⏳ Retrying in ${delay}ms...`);
        await new Promise(resolve => setTimeout(resolve, delay));
      }
      
    } catch (error) {
      lastError = error.message;
      
      if (attempt < maxRetries) {
        const delay = Math.min(1000 * Math.pow(2, attempt - 1), 10000);
        console.log(`⏳ Retrying in ${delay}ms...`);
        await new Promise(resolve => setTimeout(resolve, delay));
      }
    }
  }
  
  throw new Error(`All transfer attempts failed. Last error: ${lastError}`);
}

// Utility to check wallet balance
export async function getWalletBalance(publicKey) {
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
export async function checkStoreWalletBalance() {
  const STORE_WALLET_SECRET_KEY = process.env.STORE_WALLET_SECRET_KEY;
  const storeWallet = Keypair.fromSecretKey(bs58.decode(STORE_WALLET_SECRET_KEY));
  const balance = await getWalletBalance(storeWallet.publicKey);
  
  console.log(`🏦 Store wallet balance: ${balance} SOL`);
  return balance;
}