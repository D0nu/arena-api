// generateStoreWallet.js
import { Keypair } from '@solana/web3.js';
import bs58 from 'bs58';

const keypair = Keypair.generate();

console.log('Public Key:', keypair.publicKey.toBase58());
console.log('Private Key (save safely!):', bs58.encode(keypair.secretKey));
