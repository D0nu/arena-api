import express from 'express';
import { signup, login, getMe, logout } from '../Controllers/auth.controller.js';
import { authMiddleware } from '../Middleware/auth.middleware.js';
import { vorldLogin } from '../Controllers/vorldauth.controller.js';

const router = express.Router();

router.post('/signup', signup);
router.post('/login', login);
router.post('/logout', authMiddleware, logout);
router.get('/me', authMiddleware, getMe);
router.post("/vorld-login", vorldLogin);

export default router;
