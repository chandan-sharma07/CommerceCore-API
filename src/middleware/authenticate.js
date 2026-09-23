const jwt = require('jsonwebtoken');
const AppError = require('../core/AppError');
const config = require('../config');

/**
 * Middleware to authenticate requests via JWT access token
 * @param {Object} req - Express request object
 * @param {Object} res - Express response object
 * @param {Function} next - Express next middleware function
 */
module.exports = async (req, res, next) => {
  try {
    const authHeader = req.headers.authorization;
    if (!authHeader || !authHeader.startsWith('Bearer ')) {
      throw new AppError('Access token is required', 401, 'UNAUTHORIZED');
    }

    const token = authHeader.split(' ')[1];
    
    if (!token) {
      throw new AppError('Access token is required', 401, 'UNAUTHORIZED');
    }

    const decoded = jwt.verify(token, config.jwt.accessSecret);
    
    req.user = {
      id: decoded.id,
      email: decoded.email,
      role: decoded.role
    };
    
    next();
  } catch (err) {
    if (err.name === 'JsonWebTokenError') {
      next(new AppError('Invalid token', 401, 'INVALID_TOKEN'));
    } else if (err.name === 'TokenExpiredError') {
      next(new AppError('Token expired', 401, 'TOKEN_EXPIRED'));
    } else {
      next(err);
    }
  }
};
