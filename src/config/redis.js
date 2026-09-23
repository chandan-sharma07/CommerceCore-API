const Redis = require('ioredis');
const config = require('./index');
const { logger } = require('../core/logger');

const redisClient = new Redis(config.redis.url, {
  maxRetriesPerRequest: 3,
  lazyConnect: true
});

redisClient.on('connect', () => {
  logger.info('Redis connected');
});

redisClient.on('error', (err) => {
  logger.error('Redis connection error:', err);
});

/**
 * Connects to Redis.
 */
const connectRedis = async () => {
  try {
    await redisClient.connect();
    return redisClient;
  } catch (error) {
    logger.error('Failed to connect to Redis:', error);
    throw error;
  }
};

module.exports = { redisClient, connectRedis };
