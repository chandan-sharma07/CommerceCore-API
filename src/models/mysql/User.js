const { DataTypes } = require('sequelize');

/**
 * Defines the User model.
 * @param {import('sequelize').Sequelize} sequelize
 * @returns {import('sequelize').ModelCtor<import('sequelize').Model>}
 */
module.exports = (sequelize) => {
  return sequelize.define('User', {
    id: { type: DataTypes.UUID, defaultValue: DataTypes.UUIDV4, primaryKey: true },
    name: { type: DataTypes.STRING(100), allowNull: false },
    email: { type: DataTypes.STRING(255), allowNull: false, unique: true },
    password_hash: { type: DataTypes.STRING(255), allowNull: false },
    role: { type: DataTypes.ENUM('customer', 'admin'), defaultValue: 'customer', allowNull: false }
  }, {
    tableName: 'users',
    timestamps: true,
    underscored: true,
    createdAt: 'created_at',
    updatedAt: 'updated_at'
  });
};
