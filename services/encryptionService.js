// services/encryptionService.js
import crypto from 'crypto';

let KEY = null;

/**
 * Initialize or get the encryption key
 * @returns {Buffer} Encryption key
 */
function getKey() {
  if (!KEY) {
    // Check if environment variable is available
    if (!process.env.WALLET_ENCRYPTION_KEY) {
      const error = new Error(
        'WALLET_ENCRYPTION_KEY environment variable is not set. ' +
        'Please add WALLET_ENCRYPTION_KEY to your .env file'
      );
      console.error('❌ Encryption Error:', error.message);
      throw error;
    }

    // Validate key length (should be at least 32 characters for AES-256)
    if (process.env.WALLET_ENCRYPTION_KEY.length < 32) {
      console.warn('⚠️  WALLET_ENCRYPTION_KEY is shorter than recommended 32 characters');
    }

    // Derive key using SHA-256
    KEY = crypto
      .createHash('sha256')
      .update(process.env.WALLET_ENCRYPTION_KEY)
      .digest();
    
    console.log('✅ Encryption service initialized successfully');
  }
  return KEY;
}

/**
 * Encrypt plain text (for private keys)
 * @param {string} text - Plain text to encrypt
 * @returns {object} Encrypted data { iv, data, tag }
 * @throws {Error} If text is empty or encryption fails
 */
export function encrypt(text) {
  if (!text || typeof text !== 'string') {
    throw new Error('Text to encrypt must be a non-empty string');
  }

  try {
    const key = getKey();
    const iv = crypto.randomBytes(12); // 12 bytes for GCM mode
    const cipher = crypto.createCipheriv('aes-256-gcm', key, iv);
    
    const encrypted = Buffer.concat([
      cipher.update(text, 'utf8'), 
      cipher.final()
    ]);
    
    const authTag = cipher.getAuthTag();

    return {
      iv: iv.toString('hex'),
      data: encrypted.toString('hex'),
      tag: authTag.toString('hex'),
    };
  } catch (error) {
    console.error('🔒 Encryption failed:', error.message);
    throw new Error(`Encryption failed: ${error.message}`);
  }
}

/**
 * Decrypt an encrypted object
 * @param {object} encryptedData - { iv, data, tag }
 * @returns {string} Decrypted text
 * @throws {Error} If decryption fails or data is invalid
 */
export function decrypt(encryptedData) {
  if (!encryptedData || 
      typeof encryptedData !== 'object' ||
      !encryptedData.iv || 
      !encryptedData.data || 
      !encryptedData.tag) {
    throw new Error('Invalid encrypted data format. Expected { iv, data, tag }');
  }

  try {
    const key = getKey();
    const iv = Buffer.from(encryptedData.iv, 'hex');
    const tag = Buffer.from(encryptedData.tag, 'hex');
    const encrypted = Buffer.from(encryptedData.data, 'hex');

    // Validate buffer lengths
    if (iv.length !== 12) {
      throw new Error('Invalid IV length');
    }
    if (tag.length !== 16) {
      throw new Error('Invalid authentication tag length');
    }

    const decipher = crypto.createDecipheriv('aes-256-gcm', key, iv);
    decipher.setAuthTag(tag);

    const decrypted = Buffer.concat([
      decipher.update(encrypted), 
      decipher.final()
    ]);
    
    return decrypted.toString('utf8');
  } catch (error) {
    console.error('🔓 Decryption failed:', error.message);
    
    // Provide more specific error messages
    if (error.message.includes('Unsupported state') || 
        error.message.includes('bad decrypt')) {
      throw new Error('Decryption failed: Invalid key or corrupted data');
    }
    
    throw new Error(`Decryption failed: ${error.message}`);
  }
}

/**
 * Test the encryption service (for development)
 * @returns {boolean} True if encryption/decryption works correctly
 */
export function testEncryption() {
  try {
    const testText = 'This is a test message';
    const encrypted = encrypt(testText);
    const decrypted = decrypt(encrypted);
    
    const success = decrypted === testText;
    console.log(`🔐 Encryption test: ${success ? 'PASSED' : 'FAILED'}`);
    return success;
  } catch (error) {
    console.error('🔐 Encryption test FAILED:', error.message);
    return false;
  }
}

// Optional: Initialize and test on import (for development)
if (process.env.NODE_ENV === 'development') {
  setTimeout(() => {
    console.log('🔐 Initializing encryption service test...');
    try {
      testEncryption();
    } catch (error) {
      console.error('🔐 Encryption service test failed on startup:', error.message);
    }
  }, 1000);
}