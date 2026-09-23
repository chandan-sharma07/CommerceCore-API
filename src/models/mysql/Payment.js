const { DataTypes } = require('sequelize');

/**
 * Defines the Payment model.
 * @param {import('sequelize').Sequelize} sequelize
 * @returns {import('sequelize').ModelCtor<import('sequelize').Model>}
 */
module.exports = (sequelize) => {
  return sequelize.define('Payment', {
    id: { type: DataTypes.UUID, defaultValue: DataTypes.UUIDV4, primaryKey: true },
    order_id: { type: DataTypes.UUID, allowNull: false, references: { model: 'orders', key: 'id' } },
    status: { type: DataTypes.ENUM('pending', 'success', 'failed'), defaultValue: 'pending', allowNull: false },
    provider: { type: DataTypes.STRING(50), allowNull: true, comment: 'e.g. stripe, razorpay' }
  }, {
    tableName: 'payments',
    timestamps: true,
    underscored: true,
    createdAt: 'created_at',
    updatedAt: 'updated_at'
  });
};
