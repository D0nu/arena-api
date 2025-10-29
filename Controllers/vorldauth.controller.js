import { User } from "../Models/User.js";
import { VorldService } from "../services/vorldService.js";
import { WalletService } from "../services/walletService.js";
import { generateToken } from "../utils/jwt.js";
import crypto from 'crypto';

// ✅ Updated to match the exact pattern from your example
export const vorldLogin = async (req, res) => {
  try {
    const { accessToken } = req.body;
    
    if (!accessToken) {
      return res.status(400).json({ message: "Missing Vorld access token" });
    }

    // Step 1: Verify Vorld token
    const vorldResp = await VorldService.verifyVorldToken(accessToken);
    if (!vorldResp?.data?.user) {
      return res.status(401).json({ message: "Invalid Vorld token" });
    }
    
    const vorldUser = vorldResp.data.user;

    // Step 2: Find or create user
    const user = await findOrCreateUser(vorldUser);

    // Step 3: Generate JWT token
    const token = generateToken(user);

    // Step 4: Set HTTP-only cookie
    res.cookie("auth_token", token, { 
      httpOnly: true,
      secure: process.env.NODE_ENV === 'production', // Use secure in production
      sameSite: "lax",
      maxAge: 7 * 24 * 60 * 60 * 1000 // 7 days
    });

    // Step 5: Return user data (sanitized)
    res.json({
      user: {
        id: user._id,
        name: user.name,
        email: user.email,
        wallet: user.wallet,
        coinBalance: user.coinBalance,
        isVerified: user.isVerified,
        avatar: user.avatar
      }
    });

  } catch (error) {
    console.error('❌ Vorld login error:', error);
    res.status(500).json({ message: "Internal server error during Vorld login" });
  }
};

// ✅ Helper function matching your pattern
const findOrCreateUser = async (vorldUser) => {
  try {
    // Try to find existing user by email
    let user = await User.findOne({ email: vorldUser.email });
    
    if (!user) {
      // Create new user if doesn't exist
      user = new User({
        name: vorldUser.username || vorldUser.name || "VorldUser",
        email: vorldUser.email,
        password: crypto.randomBytes(16).toString("hex"), // Random password for security
        isVerified: true, // Vorld users are pre-verified
        avatar: vorldUser.avatar || null,
        authProvider: 'vorld' // Track auth source
      });
      
      await user.save();
      
      // Create wallet for new user
      await WalletService.createWalletForUser(user._id);
      
      console.log(`✅ New Vorld user created: ${user.email}`);
    } else {
      console.log(`✅ Existing Vorld user logged in: ${user.email}`);
    }
    
    return user;
  } catch (error) {
    console.error('❌ Error in findOrCreateUser:', error);
    throw error;
  }
};