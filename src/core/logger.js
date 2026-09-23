const winston = require('winston');
const { combine, timestamp, errors, json, colorize, simple } = winston.format;

// Safely get log level if config is not fully loaded yet
const getLogLevel = () => {
  try {
    const config = require('../config/index');
    return config.logLevel || 'info';
  } catch (err) {
    return process.env.LOG_LEVEL || 'info';
  }
};

const transports = [
  new winston.transports.Console({
    format: process.env.NODE_ENV === 'production' 
      ? combine(timestamp({ format: 'YYYY-MM-DD HH:mm:ss' }), errors({ stack: true }), json())
      : combine(colorize(), simple())
  })
];

if (process.env.NODE_ENV === 'production') {
  transports.push(
    new winston.transports.File({ filename: 'logs/error.log', level: 'error' }),
    new winston.transports.File({ filename: 'logs/combined.log' })
  );
}

const logger = winston.createLogger({
  level: getLogLevel(),
  format: combine(
    timestamp({ format: 'YYYY-MM-DD HH:mm:ss' }),
    errors({ stack: true }),
    json()
  ),
  transports
});

const morganStream = {
  write: (message) => logger.http(message.trim())
};

module.exports = {
  logger,
  morganStream
};
