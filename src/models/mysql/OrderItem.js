const { DataTypes } = require('sequelize');

/**
 * Defines the OrderItem model.
 * @param {import('sequelize').Sequelize} sequelize
 * @returns {import('sequelize').ModelCtor<import('sequelize').Model>}
 */
module.exports = (sequelize) => {
  return sequelize.define('OrderItem', {
    id: { type: DataTypes.UUID, defaultValue: DataTypes.UUIDV4, primaryKey: true },
    order_id: { type: DataTypes.UUID, allowNull: false, references: { model: 'orders', key: 'id' } },
    product_id: { type: DataTypes.STRING(24), allowNull: false, comment: 'MongoDB ObjectId reference' },
    quantity: { type: DataTypes.INTEGER, allowNull: false, validate: { min: 1 } },
    price_at_purchase: { type: DataTypes.DECIMAL(10, 2), allowNull: false }
  }, {
    tableName: 'order_items',
    timestamps: true,
    underscored: true,
    createdAt: 'created_at',
    updatedAt: 'updated_at'
  });
};
