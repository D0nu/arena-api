import jwt from 'jsonwebtoken';
import { User } from '../Models/User.js';
import { JWT_SECRET } from '../utils/jwtconfig.js';

export const authMiddleware = async (req, res, next) => {
  try {
    // Get token from cookies first
    let token = req.cookies.auth_token;
    
    // If no cookie token, check Authorization header (fallback)
    if (!token && req.headers.authorization) {
      const authHeader = req.headers.authorization;
      if (authHeader && authHeader.startsWith('Bearer ')) {
        token = authHeader.split(' ')[1];
      }
    }

    console.log('🔐 Auth check - Token present:', !!token);

    if (!token) {
      console.log('❌ No token found');
      return res.status(401).json({ message: 'No authentication token found' });
    }

    // Verify JWT token
    console.log('🔐 Verifying token...', token, JWT_SECRET);
    const decoded = jwt.verify(token, JWT_SECRET);
    console.log('✅ Token decoded successfully, user ID:', decoded.userId);
    
    // Extract user ID
    const userId = decoded.userId;
    if (!userId) {
      console.log('❌ No user ID in token');
      return res.status(401).json({ message: 'Invalid token structure' });
    }

    // Find user in database
    const user = await User.findById(userId).select('-password');
    if (!user) {
      console.log('❌ User not found for ID:', userId);
      return res.status(401).json({ message: 'User not found' });
    }

    console.log('✅ User authenticated:', user.email);
    req.user = user;
    next();
    
  } catch (error) {
    console.error('🔴 Auth middleware error:', error.message);
    console.error('🔴 Error name:', error.name);
    
    if (error.name === 'JsonWebTokenError') {
      return res.status(401).json({ message: 'Invalid token' });
    }
    if (error.name === 'TokenExpiredError') {
      return res.status(401).json({ message: 'Token expired' });
    }
    
    res.status(401).json({ message: 'Authentication failed' });
  }
};