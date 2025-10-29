// routes/storeRoutes.js
import express from 'express';
import { buyCoins, getInventory } from '../controllers/store.controller.js';

const router = express.Router();

router.post('/buy-coins', buyCoins);
router.get('/inventory', getInventory);

export default router;
