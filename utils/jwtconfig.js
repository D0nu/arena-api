
const JWT_SECRET = process.env.JWT_SECRET || 'fallback-secret-for-development-only';
const JWT_EXPIRES_IN = process.env.JWT_EXPIRES_IN || '7d';

console.log('🔐 JWT Configuration:');
console.log('   Environment JWT_SECRET:', process.env.JWT_SECRET ? '✅ Set' : '❌ Not set');
console.log('   Using JWT_SECRET:', JWT_SECRET ? `✅ (${JWT_SECRET.length} chars)` : '❌ Missing');
console.log('   Expires in:', JWT_EXPIRES_IN);

if (!JWT_SECRET) {
  console.error('❌ CRITICAL: No JWT secret available!');
}

export { JWT_SECRET, JWT_EXPIRES_IN };