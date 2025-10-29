import dotenv from 'dotenv';
import express from 'express';
import http from 'http';
import { Server } from 'socket.io';
import mongoose from 'mongoose';
import cors from 'cors';
import cookieParser from 'cookie-parser';
import jwt from 'jsonwebtoken';

import authRoutes from './Routes/auth.route.js';
import userRoutes from './Routes/user.route.js';
import walletRoutes from './Routes/wallet.route.js';
import storeRoutes from './Routes/store.route.js';
import airdropRoutes from './Routes/airdrop.route.js';
import { socketConnection } from './Sockets/socketConnection.js';


dotenv.config();

// ----------------- Environment Debug -----------------
console.log('🔐 NODE_ENV:', process.env.NODE_ENV);
console.log('🔐 JWT_SECRET:', process.env.JWT_SECRET ? '*** loaded ***' : 'NOT FOUND');
console.log('🔐 MONGODB_URI:', process.env.MONGODB_URI ? 'loaded' : 'NOT FOUND');
console.log('🔐 CLIENT_URL:', process.env.CLIENT_URL);

// ----------------- Express Setup -----------------
const app = express();
const server = http.createServer(app);

const corsOptions = {
  origin: process.env.CLIENT_URL || "http://localhost:5173",
  credentials: true,
  methods: ["GET", "POST", "PUT", "DELETE", "OPTIONS"],
  allowedHeaders: ["Content-Type", "Authorization", "Cookie"]
};

app.use(cors(corsOptions));
app.use(express.json());
app.use(cookieParser());

// ----------------- MongoDB -----------------
const MONGODB_URI = process.env.MONGODB_URI || 'mongodb://localhost:27017/airdrop-arena';
mongoose.connect(MONGODB_URI)
  .then(() => console.log('✅ Connected to MongoDB'))
  .catch(err => console.error('MongoDB connection error:', err));

// ----------------- Routes -----------------
app.use('/api/auth', authRoutes);
app.use('/api/user', userRoutes);
app.use('/api/wallet', walletRoutes);
app.use('/api/store', storeRoutes);
app.use('/api/airdrop', airdropRoutes);

app.get('/api/health', (req, res) => {
  res.json({ 
    status: 'OK', 
    timestamp: new Date().toISOString(),
    environment: process.env.NODE_ENV,
   message: 'Airdrop Arena Server Running' });
});

app.get('/', (req, res) => {
  res.json({ 
    message: 'Game Backend API is running',
    version: '1.0.0',
    environment: process.env.NODE_ENV
  });
});
// ----------------- Socket.IO Setup -----------------
const io = new Server(server, {
  cors: corsOptions,
  // Connection recovery like in server.js
  connectionStateRecovery: {
    maxDisconnectionDuration: 2 * 60 * 1000, // 2 minutes
    skipMiddlewares: true
  }
});


socketConnection(io);

// ----------------- Start Server -----------------
const PORT = process.env.PORT || 5001;

server.listen(PORT, '0.0.0.0', () => {
  console.log(`🚀 Server running on port ${PORT}`);
  console.log(`🌍 Environment: ${process.env.NODE_ENV}`);
});