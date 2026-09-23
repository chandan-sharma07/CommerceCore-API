const { sequelize } = require('../../config/database');
const defineUser = require('./User');
const defineOrder = require('./Order');
const defineOrderItem = require('./OrderItem');
const definePayment = require('./Payment');
const defineRefreshToken = require('./RefreshToken');

const User = defineUser(sequelize);
const Order = defineOrder(sequelize);
const OrderItem = defineOrderItem(sequelize);
const Payment = definePayment(sequelize);
const RefreshToken = defineRefreshToken(sequelize);

User.hasMany(Order, { foreignKey: 'user_id', as: 'orders' });
Order.belongsTo(User, { foreignKey: 'user_id', as: 'user' });

Order.hasMany(OrderItem, { foreignKey: 'order_id', as: 'items' });
OrderItem.belongsTo(Order, { foreignKey: 'order_id', as: 'order' });

Order.hasOne(Payment, { foreignKey: 'order_id', as: 'payment' });
Payment.belongsTo(Order, { foreignKey: 'order_id', as: 'order' });

User.hasMany(RefreshToken, { foreignKey: 'user_id', as: 'refreshTokens' });
RefreshToken.belongsTo(User, { foreignKey: 'user_id', as: 'user' });

module.exports = {
  sequelize,
  User,
  Order,
  OrderItem,
  Payment,
  RefreshToken
};
