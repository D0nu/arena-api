import jwt from 'jsonwebtoken';
import bcrypt from 'bcryptjs';
import { User } from '../Models/User.js';
import { generateToken } from '../utils/jwt.js';
import { WalletService } from '../services/walletService.js'
import { JWT_SECRET } from '../utils/jwtconfig.js'; 


export const getMe = async (req, res) => {
  try {
    const user = req.user;
    
     console.log("🔑 Using JWT_SECRET:", JWT_SECRET === 'fallback-secret-for-development-only' ? 'FALLBACK' : 'ENV_VAR');

    
    const token = jwt.sign(
      { userId: user._id },
     JWT_SECRET,
      { expiresIn: '7d' }
    );

 console.log("✅ Token generated successfully for user:", user.email);


    res.json({
      user: {
        id: user._id,
        name: user.name,
        email: user.email,
        coinBalance: user.coinBalance,
        wallet: user.wallet,
        createdAt: user.createdAt
      },
      token
    });

  } catch (error) {
    console.error('GetMe error:', error);
    res.status(500).json({ message: 'Error fetching user profile' });
  }
};


export const signup = async (req, res) => {
  try {
    const { name, email, password } = req.body;

    if (!email || !password) {
      return res.status(400).json({ message: 'Email and password required' });
    }

    if (password.length < 6) {
      return res.status(400).json({ message: 'Password must be at least 6 characters' });
    }

    const existing = await User.findOne({ email });
    if (existing) {
      return res.status(400).json({ message: 'User already exists' });
    }

    const hashed = await bcrypt.hash(password, 10);
    const user = new User({
      name,
      email,
      password: hashed,
      coinBalance: 1000,
    });

    await user.save();

    await WalletService.createWalletForUser(user._id);

    // Fetch updated user with wallet
    const updatedUser = await User.findById(user._id);

        const token = jwt.sign(
          { userId: user._id },
          JWT_SECRET,
          { expiresIn: '7d' }
        );

    // Cookie settings
    res.cookie('auth_token', token, {
      httpOnly: true,
      secure: false,
      sameSite: 'lax', 
      maxAge: 7 * 24 * 60 * 60 * 1000,
    });
    
    res.status(201).json({ 
      user: {
        id: updatedUser._id,
        name: updatedUser.name,
        email: updatedUser.email,
        coinBalance: updatedUser.coinBalance,
        wallet: updatedUser.wallet,
      }, 
      token 
    });
  } catch (error) {
    console.error('Signup error:', error);
    res.status(500).json({ message: 'Signup failed' });
  }
};

export const login = async (req, res) => {
  try {
    const { email, password } = req.body;

    const user = await User.findOne({ email });
    if (!user) {
      return res.status(400).json({ message: 'User not found' });
    }

    const valid = await bcrypt.compare(password, user.password);
    if (!valid) {
      return res.status(400).json({ message: 'Invalid password' });
    }

        const token = jwt.sign(
      { userId: user._id },
      JWT_SECRET,
      { expiresIn: '7d' }
    );

    // Cookie settings
    res.cookie('auth_token', token, {
      httpOnly: true,
      secure: false,
      sameSite: 'lax',
      maxAge: 7 * 24 * 60 * 60 * 1000,
    });

    res.json({ 
      user: {
        id: user._id,
        name: user.name,
        email: user.email,
        coinBalance: user.coinBalance
      }, 
      token 
    });
  } catch (error) {
    console.error('Login error:', error);
    res.status(500).json({ message: 'Login failed' });
  }
};

export const logout = (req, res) => {
  res.clearCookie('auth_token');
  res.json({ message: 'Logged out successfully' });
};



