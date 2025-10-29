// handlers/characterHandlers.js
import { User } from '../Models/User.js';

// ✅ Enhanced Socket handler for saving character
export const characterHandlers = (io, socket, { safeEmit, safeBroadcast, removeCircularReferences }) => {
  
  // ✅ Save character configuration
  socket.on('save-character', async (characterData) => {
    try {
      console.log('💾 Saving character data:', characterData);
      
      const user = await User.findById(socket.user._id);
      if (!user) {
        return safeEmit(socket, 'character-save-error', { 
          message: 'User not found' 
        });
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
      }

      // Update character data
      user.character = {
        ...user.character,
        ...characterData,
        updatedAt: new Date()
      };

      user.lastCharacterUpdate = new Date();
      await user.save();
      
      console.log('✅ Character saved successfully for user:', user.name);
      
      safeEmit(socket, 'character-saved', { 
        success: true, 
        character: user.character 
      });
      
    } catch (error) {
      console.error('❌ Save character socket error:', error);
      safeEmit(socket, 'character-save-error', { 
        message: 'Failed to save character' 
      });
    }
  });

  // ✅ Purchase items
  socket.on('purchase-item', async (purchaseData) => {
    try {
      console.log('🛒 Purchase request:', purchaseData);
      
      const { itemId, itemType, price } = purchaseData;
      const user = await User.findById(socket.user._id);
      
      if (!user) {
        return safeEmit(socket, 'purchase-result', { 
          success: false, 
          message: 'User not found' 
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

      // Check ownership
      const alreadyOwned = user.character.unlockedItems?.some(
        item => item.itemId === itemId
      );

      if (alreadyOwned) {
        console.log('❌ Item already owned:', itemId);
        return safeEmit(socket, 'purchase-result', { 
          success: false, 
          message: 'You already own this item' 
        });
      }

      // Check coins
      if (user.coinBalance < price) {
        console.log('❌ Insufficient coins:', user.coinBalance, 'needed:', price);
        return safeEmit(socket, 'purchase-result', { 
          success: false, 
          message: 'Insufficient coins' 
        });
      }

      // Process purchase
      user.coinBalance -= price;
      
      // Ensure unlockedItems array exists
      if (!user.character.unlockedItems) {
        user.character.unlockedItems = [];
      }

      const itemName = getItemName(itemId, itemType);
      
      user.character.unlockedItems.push({
        itemId,
        itemType,
        price,
        purchasedAt: new Date(),
        name: itemName
      });

      await user.save();

      console.log('✅ Purchase successful for user:', user.name, 'item:', itemName);

      safeEmit(socket, 'purchase-result', {
        success: true,
        message: 'Item purchased successfully',
        newBalance: user.coinBalance,
        unlockedItem: { 
          itemId, 
          itemType, 
          name: itemName 
        }
      });

    } catch (error) {
      console.error('❌ Purchase item socket error:', error);
      safeEmit(socket, 'purchase-result', { 
        success: false, 
        message: 'Purchase failed' 
      });
    }
  });

  // ✅ Get character data
  socket.on('get-character', async () => {
    try {
      const user = await User.findById(socket.user._id).select('character coinBalance');
      
      if (!user) {
        return safeEmit(socket, 'character-data-error', { 
          message: 'User not found' 
        });
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

      safeEmit(socket, 'character-data', {
        character: user.character,
        coinBalance: user.coinBalance
      });

    } catch (error) {
      console.error('❌ Get character error:', error);
      safeEmit(socket, 'character-data-error', { 
        message: 'Failed to get character data' 
      });
    }
  });

  // ✅ Equip/Unequip items
  socket.on('equip-item', async ({ itemId, itemType }) => {
    try {
      const user = await User.findById(socket.user._id);
      
      if (!user || !user.character) {
        return safeEmit(socket, 'equip-error', { 
          message: 'Character not found' 
        });
      }

      // Check if user owns the item
      const ownsItem = user.character.unlockedItems?.some(
        item => item.itemId === itemId
      );

      if (!ownsItem && !isFreeItem(itemId, itemType)) {
        return safeEmit(socket, 'equip-error', { 
          message: 'You do not own this item' 
        });
      }

      if (itemType === 'face') {
        // Equip face
        user.character.face = itemId;
      } else if (itemType === 'accessory') {
        // Handle accessory - remove others of same type first
        const accessory = getAccessoryById(itemId);
        if (accessory) {
          const filtered = user.character.accessories.filter((id) => {
            const acc = getAccessoryById(id);
            return !acc || acc.type !== accessory.type;
          });
          user.character.accessories = [...filtered, itemId];
        }
      }

      await user.save();

      safeEmit(socket, 'item-equipped', {
        success: true,
        itemId,
        itemType,
        character: user.character
      });

    } catch (error) {
      console.error('❌ Equip item error:', error);
      safeEmit(socket, 'equip-error', { 
        message: 'Failed to equip item' 
      });
    }
  });

  // ✅ Unequip items
  socket.on('unequip-item', async ({ itemId, itemType }) => {
    try {
      const user = await User.findById(socket.user._id);
      
      if (!user || !user.character) {
        return safeEmit(socket, 'unequip-error', { 
          message: 'Character not found' 
        });
      }

      if (itemType === 'face') {
        // Can't unequip face, set to default
        user.character.face = "face1";
      } else if (itemType === 'accessory') {
        // Remove specific accessory
        user.character.accessories = user.character.accessories.filter(id => id !== itemId);
      }

      await user.save();

      safeEmit(socket, 'item-unequipped', {
        success: true,
        itemId,
        itemType,
        character: user.character
      });

    } catch (error) {
      console.error('❌ Unequip item error:', error);
      safeEmit(socket, 'unequip-error', { 
        message: 'Failed to unequip item' 
      });
    }
  });

  console.log('✅ Character handlers registered for socket:', socket.id);
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

// ✅ Helper function to check if item is free
const isFreeItem = (itemId, itemType) => {
  const freeItems = {
    face: ["face1", "face2"],
    accessory: []
  };
  return freeItems[itemType]?.includes(itemId) || false;
};

// ✅ Helper function to get accessory by ID
const getAccessoryById = (itemId) => {
  const accessories = {
    "glasses1": { type: "glasses" },
    "glasses2": { type: "glasses" },
    "hat1": { type: "hat" },
    "hat2": { type: "hat" },
    "hat3": { type: "hat" },
    "mask1": { type: "mask" },
    "mask2": { type: "mask" },
    "earring": { type: "ear" }
  };
  return accessories[itemId];
};