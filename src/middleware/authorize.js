const AppError = require('../core/AppError');

/**
 * Middleware to authorize requests based on user roles
 * @param {...string} roles - Allowed roles
 * @returns {Function} Express middleware function
 */
module.exports = (...roles) => {
  return (req, res, next) => {
    if (!req.user) {
      return next(new AppError('Authentication required', 401, 'UNAUTHORIZED'));
    }

    if (!roles.includes(req.user.role)) {
      return next(new AppError('Insufficient permissions', 403, 'FORBIDDEN'));
    }

    next();
  };
};
