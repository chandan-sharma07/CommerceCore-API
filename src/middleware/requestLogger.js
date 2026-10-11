const morgan = require('morgan');
const { morganStream } = require('../core/logger');
const config = require('../config');

// Custom token: request ID (set by requestId middleware)
morgan.token('id', (req) => req.id || '-');

/**
 * Morgan request logging middleware.
 * Dev: short readable format with request ID
 * Prod: full combined format with request ID for structured analysis
 */
const format = config.nodeEnv === 'development'
  ? ':id :method :url :status :response-time ms'
  : ':id :remote-addr :method :url HTTP/:http-version :status :res[content-length] - :response-time ms';

const requestLogger = morgan(format, { stream: morganStream });

module.exports = requestLogger;
