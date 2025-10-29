import dotenv from 'dotenv';
import express from 'express';
import http from 'http';
import { Server } from 'socket.io';
import mongoose from 'mongoose';
import cors from 'cors';
import cookieParser from 'cookie-parser';
import jwt from 'jsonwebtoken';

import authRoutes from './routes/auth.route.js';
import userRoutes from './routes/user.route.js';
import walletRoutes from './routes/wallet.route.js';
import storeRoutes from './routes/store.route.js';
import airdropRoutes from './routes/airdrop.route.js';
import { socketConnection } from './sockets/socketConnection.js';

// ----------------- Environment Configuration -----------------
// Determine environment and load appropriate .env file
const envFile = process.env.NODE_ENV === 'production' ? '.env.production' : '.env.development';

console.log(`🌍 Loading environment: ${process.env.NODE_ENV || 'development'}`);
console.log(`📁 Environment file: ${envFile}`);

// Load environment-specific file
const envResult = dotenv.config({ path: envFile });

if (envResult.error) {
  console.warn(`⚠️  Could not load ${envFile}, using system environment variables`);
} else {
  console.log(`✅ Successfully loaded ${envFile}`);
}

// Also load .env.local if it exists (for local overrides)
if (process.env.NODE_ENV !== 'production') {
  try {
    dotenv.config({ path: '.env.local' });
    console.log('🔧 .env.local loaded (if exists)');
  } catch (e) {
    // .env.local doesn't exist, that's fine
  }
}

// ----------------- Environment Validation & Defaults -----------------
const requiredEnvVars = [
  'MONGODB_URI',
  'JWT_SECRET', 
  'WALLET_ENCRYPTION_KEY',
  'STORE_WALLET',
  'VORLD_APP_ID'
];

const optionalEnvVars = {
  'NODE_ENV': 'development',
  'PORT': process.env.NODE_ENV === 'production' ? '10000' : '5001',
  'CLIENT_URL': process.env.NODE_ENV === 'production' ? 'https://arenaclient.vercel.app' : 'http://localhost:5173',
  'SOLANA_RPC_URL': 'https://api.devnet.solana.com',
  'ARENA_WS_URL': 'wss://vorld-arena-server.onrender.com',
  'ARENA_SERVER_URL': 'wss://airdrop-arcade.onrender.com',
  'GAME_API_URL': 'https://airdrop-arcade.onrender.com/api'
};

// Check required environment variables
const missingEnvVars = requiredEnvVars.filter(key => !process.env[key]);

if (missingEnvVars.length > 0) {
  console.error('❌ MISSING REQUIRED ENVIRONMENT VARIABLES:', missingEnvVars);
  
  if (process.env.NODE_ENV === 'production') {
    console.error('💥 Production requires all environment variables. Exiting...');
    process.exit(1);
  } else {
    console.warn('⚠️  Development mode: Using placeholder values for missing variables');
    // Set placeholder values for development
    missingEnvVars.forEach(key => {
      process.env[key] = `DEV_PLACEHOLDER_${key}`;
    });
  }
}

// Set defaults for optional environment variables
Object.entries(optionalEnvVars).forEach(([key, defaultValue]) => {
  if (!process.env[key]) {
    process.env[key] = defaultValue;
    console.log(`🔧 Set default for ${key}: ${defaultValue}`);
  }
});

// ----------------- Environment Debug -----------------
console.log('\n=== ENVIRONMENT CONFIGURATION ===');
console.log(`🔐 NODE_ENV: ${process.env.NODE_ENV}`);
console.log(`🔐 PORT: ${process.env.PORT}`);
console.log(`🔐 CLIENT_URL: ${process.env.CLIENT_URL}`);
console.log(`🔐 MONGODB_URI: ${process.env.MONGODB_URI ? '✅ loaded' : '❌ missing'}`);
console.log(`🔐 JWT_SECRET: ${process.env.JWT_SECRET ? '✅ loaded' : '❌ missing'}`);
console.log(`🔐 WALLET_ENCRYPTION_KEY: ${process.env.WALLET_ENCRYPTION_KEY ? '✅ loaded' : '❌ missing'}`);
console.log(`🔐 STORE_WALLET: ${process.env.STORE_WALLET ? '✅ loaded' : '❌ missing'}`);
console.log(`🔐 VORLD_APP_ID: ${process.env.VORLD_APP_ID ? '✅ loaded' : '❌ missing'}`);
console.log(`🔐 SOLANA_RPC_URL: ${process.env.SOLANA_RPC_URL}`);
console.log(`🔐 ARENA_WS_URL: ${process.env.ARENA_WS_URL}`);
console.log('=================================\n');

// ----------------- Express Setup -----------------
const app = express();
const server = http.createServer(app);

// CORS configuration based on environment
const corsOptions = {
  origin: process.env.CLIENT_URL,
  credentials: true,
  methods: ["GET", "POST", "PUT", "DELETE", "OPTIONS"],
  allowedHeaders: ["Content-Type", "Authorization", "Cookie"]
};

console.log(`🔗 CORS configured for: ${corsOptions.origin}`);

app.use(cors(corsOptions));
app.use(express.json());
app.use(cookieParser());

// ----------------- MongoDB -----------------
const MONGODB_URI = process.env.MONGODB_URI || 'mongodb://localhost:27017/airdrop-arena';

// MongoDB connection with better error handling
mongoose.connect(MONGODB_URI)
  .then(() => {
    console.log('✅ Connected to MongoDB');
    
    // Check if we're using placeholder (development)
    if (MONGODB_URI.includes('DEV_PLACEHOLDER')) {
      console.warn('⚠️  Using placeholder MongoDB URI - database operations will fail');
    }
  })
  .catch(err => {
    console.error('❌ MongoDB connection error:', err.message);
    
    if (process.env.NODE_ENV === 'production') {
      console.error('💥 Production requires MongoDB. Exiting...');
      process.exit(1);
    } else {
      console.warn('⚠️  Development mode: Continuing without MongoDB connection');
    }
  });

// ----------------- Routes -----------------
app.use('/api/auth', authRoutes);
app.use('/api/user', userRoutes);
app.use('/api/wallet', walletRoutes);
app.use('/api/store', storeRoutes);
app.use('/api/airdrop', airdropRoutes);

// Health check endpoint
app.get('/api/health', (req, res) => {
  const dbStatus = mongoose.connection.readyState === 1 ? 'connected' : 'disconnected';
  
  res.json({ 
    status: 'OK', 
    timestamp: new Date().toISOString(),
    environment: process.env.NODE_ENV,
    database: dbStatus,
    client_url: process.env.CLIENT_URL,
    message: 'Airdrop Arena Server Running'
  });
});

// Root endpoint
app.get('/', (req, res) => {
  res.json({ 
    message: 'Game Backend API is running',
    version: '1.0.0',
    environment: process.env.NODE_ENV,
    mode: process.env.NODE_ENV === 'production' ? 'PRODUCTION' : 'DEVELOPMENT',
    client_url: process.env.CLIENT_URL
  });
});

// ----------------- Socket.IO Setup -----------------
const io = new Server(server, {
  cors: corsOptions,
  connectionStateRecovery: {
    maxDisconnectionDuration: 2 * 60 * 1000, // 2 minutes
    skipMiddlewares: true
  }
});

socketConnection(io);

// ----------------- Error Handling -----------------
// 404 handler
app.use('*', (req, res) => {
  res.status(404).json({
    error: 'Route not found',
    path: req.originalUrl,
    method: req.method,
    environment: process.env.NODE_ENV
  });
});

// Global error handler
app.use((err, req, res, next) => {
  console.error('🚨 Unhandled error:', err);
  
  res.status(500).json({
    error: 'Internal server error',
    message: process.env.NODE_ENV === 'development' ? err.message : 'Something went wrong',
    environment: process.env.NODE_ENV
  });
});

// ----------------- Graceful Shutdown -----------------
process.on('SIGINT', async () => {
  console.log('\n🔻 Received SIGINT. Shutting down gracefully...');
  await mongoose.connection.close();
  server.close(() => {
    console.log('✅ Server closed');
    process.exit(0);
  });
});

process.on('SIGTERM', async () => {
  console.log('\n🔻 Received SIGTERM. Shutting down gracefully...');
  await mongoose.connection.close();
  server.close(() => {
    console.log('✅ Server closed');
    process.exit(0);
  });
});

// ----------------- Start Server -----------------
const PORT = process.env.PORT || 5001;

server.listen(PORT, '0.0.0.0', () => {
  console.log('\n🎉 ======= SERVER STARTED =======');
  console.log(`🚀 Server running on port ${PORT}`);
  console.log(`🌍 Environment: ${process.env.NODE_ENV}`);
  console.log(`🔗 Client URL: ${process.env.CLIENT_URL}`);
  console.log(`📊 MongoDB: ${mongoose.connection.readyState === 1 ? 'Connected' : 'Disconnected'}`);
  console.log(`🏠 API URL: http://localhost:${PORT}`);
  console.log(`❤️  Health check: http://localhost:${PORT}/api/health`);
  console.log('================================\n');
});

