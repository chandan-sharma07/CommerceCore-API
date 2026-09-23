const bcrypt = require('bcryptjs');
const jwt = require('jsonwebtoken');
const crypto = require('crypto');
const config = require('../../config');
const AppError = require('../../core/AppError');
const { logger } = require('../../core/logger');
const { User, RefreshToken } = require('../../models/mysql');

/**
 * Hash a token
 * @param {string} token 
 * @returns {string} Hashed token
 */
const hashToken = (token) => crypto.createHash('sha256').update(token).digest('hex');

/**
 * Generate access token
 * @param {Object} user 
 * @returns {string} Access token
 */
const generateAccessToken = (user) => {
  return jwt.sign(
    { id: user.id, email: user.email, role: user.role },
    config.jwt.accessSecret,
    { expiresIn: config.jwt.accessExpiry }
  );
};

/**
 * Generate refresh token
 * @returns {string} Refresh token
 */
const generateRefreshToken = () => crypto.randomBytes(40).toString('hex');

/**
 * Parse expiry string to milliseconds
 * @param {string} str 
 * @returns {number} Milliseconds
 */
const parseExpiry = (str) => {
  const match = str.match(/^(\d+)([smhd])$/);
  if (!match) return 7 * 24 * 60 * 60 * 1000; // default 7 days
  const val = parseInt(match[1], 10);
  const unit = match[2];
  let multiplier = 1000;
  if (unit === 'm') multiplier *= 60;
  else if (unit === 'h') multiplier *= 3600;
  else if (unit === 'd') multiplier *= 86400;
  return val * multiplier;
};

/**
 * Register a new user
 */
const register = async ({ name, email, password }) => {
  const existing = await User.findOne({ where: { email } });
  if (existing) {
    throw new AppError('Email already registered', 409, 'DUPLICATE_EMAIL');
  }

  const password_hash = await bcrypt.hash(password, 12);
  const user = await User.create({ name, email, password_hash });

  const accessToken = generateAccessToken(user);
  const refreshToken = generateRefreshToken();
  const tokenHash = hashToken(refreshToken);
  
  const expiryMs = parseExpiry(config.jwt.refreshExpiry);
  const expiresAt = new Date(Date.now() + expiryMs);

  await RefreshToken.create({
    user_id: user.id,
    token_hash: tokenHash,
    expires_at: expiresAt
  });

  logger.info(`User registered: ${email}`);

  return {
    user: { id: user.id, name: user.name, email: user.email, role: user.role },
    accessToken,
    refreshToken
  };
};

/**
 * Login a user
 */
const login = async ({ email, password }) => {
  const user = await User.findOne({ where: { email } });
  if (!user) {
    throw new AppError('Invalid credentials', 401, 'INVALID_CREDENTIALS');
  }

  const isMatch = await bcrypt.compare(password, user.password_hash);
  if (!isMatch) {
    logger.warn(`Failed login attempt for: ${email}`);
    throw new AppError('Invalid credentials', 401, 'INVALID_CREDENTIALS');
  }

  const accessToken = generateAccessToken(user);
  const refreshToken = generateRefreshToken();
  const tokenHash = hashToken(refreshToken);
  
  const expiryMs = parseExpiry(config.jwt.refreshExpiry);
  const expiresAt = new Date(Date.now() + expiryMs);

  await RefreshToken.create({
    user_id: user.id,
    token_hash: tokenHash,
    expires_at: expiresAt
  });

  logger.info(`User logged in: ${email}`);

  return {
    user: { id: user.id, name: user.name, email: user.email, role: user.role },
    accessToken,
    refreshToken
  };
};

/**
 * Refresh tokens
 */
const refreshToken = async (oldRefreshToken) => {
  const tokenHash = hashToken(oldRefreshToken);
  
  const tokenRecord = await RefreshToken.findOne({ where: { token_hash: tokenHash } });
  if (!tokenRecord) {
    throw new AppError('Invalid refresh token', 401, 'INVALID_REFRESH_TOKEN');
  }

  if (tokenRecord.expires_at < new Date()) {
    await tokenRecord.destroy();
    throw new AppError('Refresh token expired', 401, 'REFRESH_TOKEN_EXPIRED');
  }

  const user = await User.findByPk(tokenRecord.user_id);
  if (!user) {
    throw new AppError('User not found', 401, 'INVALID_REFRESH_TOKEN');
  }

  // Rotate token: delete old one
  await tokenRecord.destroy();

  const newAccessToken = generateAccessToken(user);
  const newRefreshToken = generateRefreshToken();
  const newTokenHash = hashToken(newRefreshToken);
  
  const expiryMs = parseExpiry(config.jwt.refreshExpiry);
  const expiresAt = new Date(Date.now() + expiryMs);

  await RefreshToken.create({
    user_id: user.id,
    token_hash: newTokenHash,
    expires_at: expiresAt
  });

  return {
    accessToken: newAccessToken,
    refreshToken: newRefreshToken
  };
};

/**
 * Logout a user
 */
const logout = async (token) => {
  const tokenHash = hashToken(token);
  await RefreshToken.destroy({ where: { token_hash: tokenHash } });
  logger.info('User logged out');
  return true;
};

module.exports = {
  register,
  login,
  refreshToken,
  logout
};
