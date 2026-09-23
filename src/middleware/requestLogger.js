const morgan = require('morgan');
const { morganStream } = require('../core/logger');
const config = require('../config');

/**
 * Morgan request logging middleware
 */
const format = config.nodeEnv === 'development' ? 'dev' : 'combined';
const requestLogger = morgan(format, { stream: morganStream });

module.exports = requestLogger;
