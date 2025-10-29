// routes/walletRoutes.js
import express from 'express';
import { getWalletBalance, sendSol } from '../Controllers/wallet.controller.js';

const router = express.Router();

router.get('/balance/:publicKey', getWalletBalance);
router.post('/send', sendSol);

export default router;
