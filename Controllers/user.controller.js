import { User } from '../Models/User.js';
import bcrypt from 'bcryptjs';

export const updateProfile = async (req, res) => {
  try {
    const { name, password } = req.body;
    const user = req.user;

    if (name) user.name = name;
    if (password) user.password = await bcrypt.hash(password, 10);

    await user.save();
    res.json({ message: 'Profile updated', user });
  } catch (error) {
    res.status(500).json({ message: 'Update failed' });
  }
};

// ✅ Enhanced Save Character with proper validation
export const saveCharacter = async (req, res) => {
  try {
    const { character } = req.body;
    const userId = req.user._id;

    if (!character) {
      return res.status(400).json({ message: "Character data required" });
    }

    const user = await User.findByIdAndUpdate(
      userId,
      { 
        character: character,
        lastCharacterUpdate: new Date()
      },
      { new: true }
    );

    if (!user) {
      return res.status(404).json({ message: "User not found" });
    }

    res.json({
      message: "Character saved successfully",
      character: user.character
    });

  } catch (error) {
    console.error("❌ Save character error:", error);
    res.status(500).json({ message: "Failed to save character" });
  }
};

// ✅ Purchase item and add to unlocked items
export const purchaseItem = async (req, res) => {
  try {
    const { itemId, itemType, price } = req.body;
    const userId = req.user._id;

    if (!itemId || !itemType || price === undefined) {
      return res.status(400).json({ message: "Missing required fields" });
    }

    const user = await User.findById(userId);
    if (!user) {
      return res.status(404).json({ message: "User not found" });
    }

    // Check if user already owns the item
    const alreadyOwned = user.character?.unlockedItems?.some(
      item => item.itemId === itemId
    );

    if (alreadyOwned) {
      return res.status(400).json({ 
        message: "You already own this item",
        success: false 
      });
    }

    // Check if user has enough coins
    if (user.coinBalance < price) {
      return res.status(400).json({ 
        message: "Insufficient coins",
        success: false 
      });
    }

    // Ensure character exists
    if (!user.character) {
      user.character = {
        face: "face1",
        accessories: [],
        name: "",
        colorScheme: "purple",
        achievements: [],
        unlockedItems: []
      };
    }

    // Ensure unlockedItems array exists
    if (!user.character.unlockedItems) {
      user.character.unlockedItems = [];
    }

    // Deduct coins and add to unlocked items
    user.coinBalance -= price;
    
    // Add item to unlocked items
    user.character.unlockedItems.push({
      itemId,
      itemType,
      price,
      purchasedAt: new Date(),
      name: getItemName(itemId, itemType)
    });

    await user.save();

    res.json({
      success: true,
      message: "Item purchased successfully",
      newBalance: user.coinBalance,
      unlockedItem: {
        itemId,
        itemType,
        price
      }
    });

  } catch (error) {
    console.error("❌ Purchase item error:", error);
    res.status(500).json({ 
      message: "Failed to purchase item",
      success: false 
    });
  }
};

// ✅ Get user's character data
export const getCharacter = async (req, res) => {
  try {
    const userId = req.user._id;
    const user = await User.findById(userId).select('character coinBalance');

    if (!user) {
      return res.status(404).json({ message: "User not found" });
    }

    // Ensure character object exists
    if (!user.character) {
      user.character = {
        face: "face1",
        accessories: [],
        name: "",
        colorScheme: "purple",
        achievements: [],
        unlockedItems: []
      };
      await user.save();
    }

    res.json({
      character: user.character,
      coinBalance: user.coinBalance
    });

  } catch (error) {
    console.error("❌ Get character error:", error);
    res.status(500).json({ message: "Failed to get character data" });
  }
};

export const updateSettings = async (req, res) => {
  try {
    const user = req.user;
    const { theme, sound, musicVolume } = req.body;

    if (theme) user.settings.theme = theme;
    if (sound !== undefined) user.settings.sound = sound;
    if (musicVolume !== undefined) user.settings.musicVolume = musicVolume;

    await user.save();
    res.json({ message: "Settings updated", settings: user.settings });
  } catch (error) {
    res.status(500).json({ message: "Failed to update settings" });
  }
};

// ✅ Helper function to get item name
const getItemName = (itemId, itemType) => {
  const items = {
    face: {
      "face1": "Happy",
      "face2": "Cool", 
      "face3": "Cowboy",
      "face4": "Thinker",
      "face5": "Mischievous",
      "face6": "Alien",
      "face7": "Robot",
      "face8": "Cat"
    },
    accessory: {
      "glasses1": "Glasses",
      "glasses2": "Sunglasses",
      "hat1": "Cap",
      "hat2": "Top Hat", 
      "hat3": "Crown",
      "mask1": "Mask",
      "mask2": "Theater",
      "earring": "Earring"
    }
  };

  return items[itemType]?.[itemId] || itemId;
};