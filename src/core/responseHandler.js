/**
 * Sends a standardized success response.
 * @param {object} res - Express response object
 * @param {object} options - Response options
 * @param {any} options.data - The response data
 * @param {number} options.statusCode - HTTP status code
 * @param {object} options.meta - Additional metadata
 */
const sendSuccess = (res, { data = null, statusCode = 200, meta = {} } = {}) => {
  res.status(statusCode).json({
    success: true,
    data,
    error: null,
    meta: {
      timestamp: new Date().toISOString(),
      ...meta
    }
  });
};

/**
 * Sends a standardized error response.
 * @param {object} res - Express response object
 * @param {Error|AppError} error - The error object
 */
const sendError = (res, error) => {
  const statusCode = error.statusCode || 500;
  const response = {
    success: false,
    data: null,
    error: {
      message: error.message,
      code: error.errorCode || 'INTERNAL_ERROR'
    },
    meta: {
      timestamp: new Date().toISOString()
    }
  };

  if (error.details) {
    response.error.details = error.details;
  }
  
  if (error.stack && process.env.NODE_ENV === 'development') {
    response.error.stack = error.stack;
  }

  res.status(statusCode).json(response);
};

module.exports = {
  sendSuccess,
  sendError
};
