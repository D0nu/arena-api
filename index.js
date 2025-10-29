import dotenv from 'dotenv';
import express from 'express';
import http from 'http';
import { Server } from 'socket.io';
import mongoose from 'mongoose';
import cors from 'cors';
import cookieParser from 'cookie-parser';

import authRoutes from './Routes/auth.route.js';
import userRoutes from './Routes/user.route.js';
import walletRoutes from './Routes/wallet.route.js';
import storeRoutes from './Routes/store.route.js';
import airdropRoutes from './Routes/airdrop.route.js';
import { socketConnection } from './Sockets/socketConnection.js';








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


if (process.env.NODE_ENV !== 'production') {
  try {
    dotenv.config({ path: '.env.local' });
    console.log('🔧 .env.local loaded (if exists)');
  } catch (e) {
    // .env.local doesn't exist, that's fine
  }
}


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

Object.entries(optionalEnvVars).forEach(([key, defaultValue]) => {
  if (!process.env[key]) {
    process.env[key] = defaultValue;
    console.log(`🔧 Set default for ${key}: ${defaultValue}`);
  }
});


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


const app = express();
const server = http.createServer(app);


const corsOptions = {
  origin: function (origin, callback) {

    if (!origin) return callback(null, true);
    

    const allowedOrigins = [
      'https://arenaclient.vercel.app',
      'https://arenaclient.vercel.app/',
      'http://localhost:5173',
      'http://localhost:5173/'
    ];

    if (allowedOrigins.includes(origin)) {
      callback(null, true);
    } else {

      const normalizedOrigin = origin.endsWith('/') ? origin.slice(0, -1) : origin;
      const normalizedWithSlash = normalizedOrigin + '/';
      
      if (allowedOrigins.includes(normalizedOrigin) || allowedOrigins.includes(normalizedWithSlash)) {
        callback(null, true);
      } else {
        console.log('❌ CORS blocked for origin:', origin);
        callback(new Error('Not allowed by CORS'));
      }
    }
  },
  credentials: true,
  methods: ["GET", "POST", "PUT", "DELETE", "OPTIONS", "PATCH"],
  allowedHeaders: ["Content-Type", "Authorization", "Cookie", "X-Requested-With"],
  exposedHeaders: ["Set-Cookie"]
};

console.log(`🔗 CORS configured for: ${process.env.CLIENT_URL}`);

app.use(cors(corsOptions));
app.use(express.json());
app.use(cookieParser());


app.options('*', cors(corsOptions));


const MONGODB_URI = process.env.MONGODB_URI || 'mongodb://localhost:27017/airdrop-arena';

mongoose.connect(MONGODB_URI)
  .then(() => {
    console.log('✅ Connected to MongoDB');
    
  
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


app.use('/api/auth', authRoutes);
app.use('/api/user', userRoutes);
app.use('/api/wallet', walletRoutes);
app.use('/api/store', storeRoutes);
app.use('/api/airdrop', airdropRoutes);


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

app.get('/', (req, res) => {
  res.json({ 
    message: 'Game Backend API is running',
    version: '1.0.0',
    environment: process.env.NODE_ENV,
    mode: process.env.NODE_ENV === 'production' ? 'PRODUCTION' : 'DEVELOPMENT',
    client_url: process.env.CLIENT_URL
  });
});


const io = new Server(server, {
  cors: {
    origin: function (origin, callback) {
      const allowedOrigins = [
        'https://arenaclient.vercel.app',
        'https://arenaclient.vercel.app/',
        'http://localhost:5173',
        'http://localhost:5173/'
      ];
      
      if (!origin || allowedOrigins.includes(origin)) {
        callback(null, true);
      } else {
        const normalizedOrigin = origin.endsWith('/') ? origin.slice(0, -1) : origin;
        if (allowedOrigins.includes(normalizedOrigin) || allowedOrigins.includes(normalizedOrigin + '/')) {
          callback(null, true);
        } else {
          callback(new Error('Not allowed by CORS'));
        }
      }
    },
    credentials: true,
    methods: ["GET", "POST"]
  },
  connectionStateRecovery: {
    maxDisconnectionDuration: 2 * 60 * 1000, // 2 minutes
    skipMiddlewares: true
  }
});

socketConnection(io);


app.use('*', (req, res) => {
  res.status(404).json({
    error: 'Route not found',
    path: req.originalUrl,
    method: req.method,
    environment: process.env.NODE_ENV
  });
});


app.use((err, req, res, next) => {
  console.error('🚨 Unhandled error:', err);
  
  res.status(500).json({
    error: 'Internal server error',
    message: process.env.NODE_ENV === 'development' ? err.message : 'Something went wrong',
    environment: process.env.NODE_ENV
  });
});


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


const PORT = process.env.PORT || 5001;

server.listen(PORT, '0.0.0.0', () => {
  console.log('\n🎉 ======= SERVER STARTED =======');
  console.log(`🚀 Server running on port ${PORT}`);
  console.log(`🌍 Environment: ${process.env.NODE_ENV}`);
  console.log(`🔗 Client URL: ${process.env.CLIENT_URL}`);
  console.log(`📊 MongoDB: ${mongoose.connection.readyState === 1 ? 'Connected' : 'Disconnected'}`);
  console.log(`🏠 API URL: http://localhost:${PORT}`);
  console.log(`❤️  Health check: http://localhost:${PORT}/api/health`);
});