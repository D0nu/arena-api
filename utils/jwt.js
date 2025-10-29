import jwt from 'jsonwebtoken'; 
import { JWT_SECRET, JWT_EXPIRES_IN } from './jwtconfig.js'

export const generateToken = (user) => {
  return jwt.sign(
    { 
      userId: user._id.toString(),
      email: user.email 
    },
    JWT_SECRET,
    { expiresIn: JWT_EXPIRES_IN }
  );  
};

export const verifyToken = (token) => {
  return jwt.verify(token, JWT_SECRET);
};