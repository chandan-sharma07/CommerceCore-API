const config = require('./config');
const { logger } = require('./core/logger');
const { connectMySQL, connectMongoDB } = require('./config/database');
const { connectRedis } = require('./config/redis');
const app = require('./app');

async function startServer() {
  try {
    await connectMySQL();
    await connectMongoDB();
    await connectRedis();
    
    const server = app.listen(config.port, () => {
      logger.info(`Server running on port ${config.port} in ${config.nodeEnv} mode`);
    });
    
    // Graceful shutdown
    const shutdown = async (signal) => {
      logger.info(`${signal} received. Starting graceful shutdown...`);
      server.close(async () => {
        logger.info('HTTP server closed');
        // Close DB connections
        const { sequelize } = require('./config/database');
        await sequelize.close();
        const mongoose = require('mongoose');
        await mongoose.connection.close();
        const { redisClient } = require('./config/redis');
        await redisClient.quit();
        logger.info('All connections closed. Exiting.');
        process.exit(0);
      });
      // Force exit after 10s
      setTimeout(() => { process.exit(1); }, 10000);
    };
    
    process.on('SIGTERM', () => shutdown('SIGTERM'));
    process.on('SIGINT', () => shutdown('SIGINT'));
    
    // Handle unhandled rejections and uncaught exceptions
    process.on('unhandledRejection', (err) => { logger.error('Unhandled rejection:', err); });
    process.on('uncaughtException', (err) => { logger.error('Uncaught exception:', err); process.exit(1); });
    
  } catch (err) {
    logger.error('Failed to start server:', err);
    process.exit(1);
  }
}

startServer();
