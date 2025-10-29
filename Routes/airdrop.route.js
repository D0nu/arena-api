// routes/airdropRoutes.js
import express from 'express';
import { claimAirdrop } from '../Controllers/airdrop.controller.js';
import { authMiddleware } from '../Middleware/auth.middleware.js';

const router = express.Router();

router.post('/claim', authMiddleware, claimAirdrop);

export default router;
