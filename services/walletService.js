// services/walletService.js
import { Keypair } from '@solana/web3.js';
import bs58 from 'bs58';
import { encrypt, decrypt } from './encryptionService.js';
import { User } from '../Models/User.js';

export const WalletService = {
  /**
   * Create a new Solana wallet for a user, encrypt the private key, and give 500 test coins.
   */
  async createWalletForUser(userId) {
    const keypair = Keypair.generate();
    const privateKeyEncoded = bs58.encode(keypair.secretKey);

    const encrypted = encrypt(privateKeyEncoded);
    const user = await User.findById(userId);

    user.wallet = {
      publicKey: keypair.publicKey.toBase58(),
      privateKey: JSON.stringify(encrypted),
      balance: 0,
      tokens: [],
      isActive: true,
      createdAt: new Date(),
    };

    // Free 500 coins for test
    user.coinBalance = (user.coinBalance || 0) + 1000;

    await user.save();
    return user.wallet;
  },

  /**
   * Retrieve and decrypt a user's keypair for transactions.
   */
  async getUserKeypair(userId) {
    const user = await User.findById(userId).select('wallet.privateKey wallet.publicKey');
    if (!user || !user.wallet) throw new Error('Wallet not found');

    const decryptedPrivateKey = decrypt(JSON.parse(user.wallet.privateKey));
    const secretKey = bs58.decode(decryptedPrivateKey);
    return Keypair.fromSecretKey(secretKey);
  },
};
