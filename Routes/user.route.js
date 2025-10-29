import express from 'express';
import { authMiddleware } from '../Middleware/auth.middleware.js';
import { 
  updateProfile, 
  saveCharacter, 
  updateSettings, 
  purchaseItem, 
  getCharacter 
} from '../Controllers/user.controller.js';

const router = express.Router();

// Profile routes
router.put('/update', authMiddleware, updateProfile);

// Character routes
router.put('/character', authMiddleware, saveCharacter);
router.post('/character/purchase', authMiddleware, purchaseItem);
router.get('/character', authMiddleware, getCharacter);

// Settings routes
router.put('/settings', authMiddleware, updateSettings);

export default router;