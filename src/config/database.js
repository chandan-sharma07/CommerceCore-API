const { Sequelize } = require('sequelize');
const mongoose = require('mongoose');
const config = require('./index');
const { logger } = require('../core/logger');

const sequelize = new Sequelize(config.mysql.database, config.mysql.user, config.mysql.password, {
  host: config.mysql.host,
  port: config.mysql.port,
  dialect: 'mysql',
  logging: (msg) => logger.debug(msg),
  define: {
    timestamps: true,
    underscored: true
  }
});

/**
 * Connects to the MySQL database using Sequelize.
 */
const connectMySQL = async () => {
  try {
    await sequelize.authenticate();
    logger.info('MySQL connected');
    
    // Ensure models are registered before sync
    // require('../models/mysql');
    
    const syncOptions = config.nodeEnv === 'test' 
      ? { force: true } 
      : { alter: config.nodeEnv === 'development' };
      
    await sequelize.sync(syncOptions);
  } catch (error) {
    logger.error('MySQL connection error:', error);
    throw error;
  }
};

/**
 * Connects to the MongoDB database using Mongoose.
 */
const connectMongoDB = async () => {
  try {
    mongoose.connection.on('error', (err) => {
      logger.error('MongoDB connection error:', err);
    });

    mongoose.connection.on('disconnected', () => {
      logger.warn('MongoDB disconnected');
    });

    await mongoose.connect(config.mongo.uri);
    logger.info('MongoDB connected');
  } catch (error) {
    logger.error('MongoDB connection error:', error);
    throw error;
  }
};

module.exports = { sequelize, connectMySQL, connectMongoDB };
