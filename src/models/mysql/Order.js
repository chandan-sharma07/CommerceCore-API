const { DataTypes } = require('sequelize');

/**
 * Defines the Order model.
 * @param {import('sequelize').Sequelize} sequelize
 * @returns {import('sequelize').ModelCtor<import('sequelize').Model>}
 */
module.exports = (sequelize) => {
  return sequelize.define('Order', {
    id: { type: DataTypes.UUID, defaultValue: DataTypes.UUIDV4, primaryKey: true },
    user_id: { type: DataTypes.UUID, allowNull: false, references: { model: 'users', key: 'id' } },
    status: { type: DataTypes.ENUM('pending', 'confirmed', 'shipped', 'delivered', 'cancelled'), defaultValue: 'pending', allowNull: false },
    total_amount: { type: DataTypes.DECIMAL(10, 2), allowNull: false },
    idempotency_key: { type: DataTypes.STRING(255), unique: true }
  }, {
    tableName: 'orders',
    timestamps: true,
    underscored: true,
    createdAt: 'created_at',
    updatedAt: 'updated_at'
  });
};
