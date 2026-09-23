const { logger } = require('../core/logger');
const { sendError } = require('../core/responseHandler');
const AppError = require('../core/AppError');
const config = require('../config');

/**
 * Global error handling middleware
 * @param {Error} err - The error object
 * @param {Object} req - Express request object
 * @param {Object} res - Express response object
 * @param {Function} next - Express next middleware function
 */
module.exports = (err, req, res, next) => {
  let error = err;

  // Handle Sequelize validation errors
  if (error.name === 'SequelizeValidationError') {
    const details = error.errors.map((e) => ({ field: e.path, message: e.message }));
    error = new AppError('Validation Error', 400, 'VALIDATION_ERROR');
    error.details = details;
  }
  
  // Handle Sequelize unique constraint errors
  if (error.name === 'SequelizeUniqueConstraintError') {
    const message = error.errors && error.errors.length > 0 ? `Duplicate field: ${error.errors[0].path}` : 'Duplicate entry';
    error = new AppError(message, 409, 'DUPLICATE_ERROR');
  }

  // Handle Mongoose validation errors
  if (error.name === 'ValidationError') {
    error = new AppError('Validation Error', 400, 'VALIDATION_ERROR');
  }

  // Handle Zod errors
  if (error.name === 'ZodError') {
    const details = error.errors.map((e) => ({ field: e.path.join('.'), message: e.message }));
    error = new AppError('Validation Error', 400, 'VALIDATION_ERROR');
    error.details = details;
  }

  // Handle JWT errors
  if (error.name === 'JsonWebTokenError') {
    error = new AppError('Invalid token', 401, 'INVALID_TOKEN');
  }
  
  if (error.name === 'TokenExpiredError') {
    error = new AppError('Token expired', 401, 'TOKEN_EXPIRED');
  }

  if (error instanceof AppError && error.isOperational) {
    if (config.nodeEnv === 'development') {
      error.details = error.details || {};
      error.details.stack = error.stack;
    }
    return sendError(res, error);
  }

  // Log non-operational error full stack
  logger.error('Non-operational error:', error);

  // Generic 500 error for unhandled exceptions
  const genericError = new AppError('Internal Server Error', 500, 'INTERNAL_ERROR', false);
  if (config.nodeEnv === 'development') {
    genericError.details = { stack: error.stack };
  }
  return sendError(res, genericError);
};
