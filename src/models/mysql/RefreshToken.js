const { DataTypes } = require('sequelize');

/**
 * Defines the RefreshToken model.
 * @param {import('sequelize').Sequelize} sequelize
 * @returns {import('sequelize').ModelCtor<import('sequelize').Model>}
 */
module.exports = (sequelize) => {
  return sequelize.define('RefreshToken', {
    id: { type: DataTypes.UUID, defaultValue: DataTypes.UUIDV4, primaryKey: true },
    user_id: { type: DataTypes.UUID, allowNull: false, references: { model: 'users', key: 'id' } },
    token_hash: { type: DataTypes.STRING(255), allowNull: false, comment: 'SHA-256 hash of the refresh token' },
    expires_at: { type: DataTypes.DATE, allowNull: false }
  }, {
    tableName: 'refresh_tokens',
    timestamps: true,
    underscored: true,
    createdAt: 'created_at',
    updatedAt: 'updated_at'
  });
};
