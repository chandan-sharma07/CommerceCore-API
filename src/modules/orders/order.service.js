const Product = require('../../models/mongo/Product');
const { sequelize, Order, OrderItem, Payment } = require('../../models/mysql');
const AppError = require('../../core/AppError');
const { logger } = require('../../core/logger');

/**
 * Place a new order with ACID-safe MySQL transaction and cross-DB stock management.
 *
 * @param {string} userId - MySQL UUID of the authenticated user
 * @param {Array<{productId: string, quantity: number}>} items - Items to order
 * @param {string|null} idempotencyKey - Optional idempotency key from request header
 * @returns {Promise<{order: Object, created: boolean}>}
 */
const placeOrder = async (userId, items, idempotencyKey) => {
  // ── 1. Idempotency check ─────────────────────────────────
  if (idempotencyKey) {
    const existingOrder = await Order.findOne({
      where: { idempotency_key: idempotencyKey },
      include: [
        { model: OrderItem, as: 'items' },
        { model: Payment, as: 'payment' }
      ]
    });
    if (existingOrder) {
      logger.info(`Idempotent hit: returning existing order ${existingOrder.id} for key "${idempotencyKey}"`);
      return { order: existingOrder, created: false };
    }
  }

  // ── 2. Fetch products from MongoDB (current price + stock) ─
  const uniqueProductIds = [...new Set(items.map(i => i.productId))];
  const products = await Product.find({ _id: { $in: uniqueProductIds } });

  const productMap = new Map();
  for (const p of products) {
    productMap.set(p._id.toString(), p);
  }

  // Validate all products exist
  for (const item of items) {
    if (!productMap.has(item.productId)) {
      throw new AppError(`Product not found: ${item.productId}`, 404, 'PRODUCT_NOT_FOUND');
    }
  }

  // ── 3. Aggregate quantity per product for stock check ──────
  // Handles duplicate productIds in items array (e.g. same product listed twice)
  const quantityByProduct = {};
  for (const item of items) {
    quantityByProduct[item.productId] = (quantityByProduct[item.productId] || 0) + item.quantity;
  }

  // ── 4. Verify stock sufficiency ───────────────────────────
  for (const [productId, totalQty] of Object.entries(quantityByProduct)) {
    const product = productMap.get(productId);
    if (product.stock < totalQty) {
      throw new AppError(
        `Insufficient stock for "${product.name}". Available: ${product.stock}, Requested: ${totalQty}`,
        400,
        'INSUFFICIENT_STOCK'
      );
    }
  }

  // ── 5. Calculate total & prepare order items ──────────────
  let totalAmount = 0;
  const orderItemsData = [];

  for (const item of items) {
    const product = productMap.get(item.productId);
    totalAmount += product.price * item.quantity;
    orderItemsData.push({
      product_id: item.productId,
      quantity: item.quantity,
      price_at_purchase: product.price
    });
  }

  totalAmount = Math.round(totalAmount * 100) / 100;

  // ── 6. MySQL transaction: order + items + payment ─────────
  const transaction = await sequelize.transaction();

  try {
    const order = await Order.create({
      user_id: userId,
      total_amount: totalAmount,
      status: 'pending',
      idempotency_key: idempotencyKey || null
    }, { transaction });

    await OrderItem.bulkCreate(
      orderItemsData.map(item => ({ ...item, order_id: order.id })),
      { transaction }
    );

    await Payment.create({
      order_id: order.id,
      status: 'pending'
    }, { transaction });

    await transaction.commit();

    logger.info(`Order ${order.id} placed by user ${userId}, total: ${totalAmount}`);

    // ── 7. Stock decrement in MongoDB (post-commit) ─────────
    // CROSS-DB CONSISTENCY NOTE:
    // MongoDB operations CANNOT participate in MySQL transactions. The stock
    // decrement happens immediately after the MySQL commit succeeds. If MongoDB
    // is unreachable or the decrement fails (network error, crash, etc.), the
    // order is marked "stock_sync_failed" so it can be reconciled later via a
    // background job or admin action. This is an accepted trade-off in polyglot
    // persistence architectures — full distributed transactions (2PC/Saga) are
    // not used here to keep complexity manageable.
    try {
      for (const [productId, qty] of Object.entries(quantityByProduct)) {
        await Product.findByIdAndUpdate(productId, { $inc: { stock: -qty } });
      }
    } catch (stockErr) {
      logger.error(`Stock sync failed for order ${order.id}: ${stockErr.message}`);
      await Order.update(
        { status: 'stock_sync_failed' },
        { where: { id: order.id } }
      );
    }

    // ── 8. Return complete order ────────────────────────────
    const completeOrder = await Order.findByPk(order.id, {
      include: [
        { model: OrderItem, as: 'items' },
        { model: Payment, as: 'payment' }
      ]
    });

    return { order: completeOrder, created: true };
  } catch (err) {
    await transaction.rollback();
    throw err;
  }
};

/**
 * Confirm payment (mock) — updates payment + order status in a single transaction.
 *
 * @param {string} orderId - UUID
 * @param {string} userId - Authenticated user's UUID
 * @param {string} userRole - 'customer' or 'admin'
 * @param {string} paymentStatus - 'success' or 'failed'
 * @returns {Promise<Object>} Updated order
 */
const confirmPayment = async (orderId, userId, userRole, paymentStatus) => {
  const order = await Order.findByPk(orderId, {
    include: [{ model: Payment, as: 'payment' }]
  });

  if (!order) {
    throw new AppError('Order not found', 404, 'NOT_FOUND');
  }

  // Ownership check — order owner or admin
  if (order.user_id !== userId && userRole !== 'admin') {
    throw new AppError('You can only manage your own orders', 403, 'FORBIDDEN');
  }

  if (order.payment.status !== 'pending') {
    throw new AppError('Payment has already been processed', 400, 'PAYMENT_ALREADY_PROCESSED');
  }

  const transaction = await sequelize.transaction();

  try {
    await Payment.update(
      { status: paymentStatus },
      { where: { order_id: orderId }, transaction }
    );

    const orderStatus = paymentStatus === 'success' ? 'paid' : 'failed';
    await Order.update(
      { status: orderStatus },
      { where: { id: orderId }, transaction }
    );

    await transaction.commit();

    logger.info(`Payment ${paymentStatus} for order ${orderId} by user ${userId}`);

    const updatedOrder = await Order.findByPk(orderId, {
      include: [
        { model: OrderItem, as: 'items' },
        { model: Payment, as: 'payment' }
      ]
    });

    return updatedOrder;
  } catch (err) {
    await transaction.rollback();
    throw err;
  }
};

/**
 * Get order history for a logged-in user (paginated, includes items).
 *
 * @param {string} userId - MySQL UUID
 * @param {Object} query - { page, limit }
 * @returns {Promise<{orders: Array, pagination: Object}>}
 */
const getUserOrders = async (userId, { page = 1, limit = 10 }) => {
  const offset = (page - 1) * limit;

  const { rows: orders, count: total } = await Order.findAndCountAll({
    where: { user_id: userId },
    include: [
      { model: OrderItem, as: 'items' },
      { model: Payment, as: 'payment' }
    ],
    order: [['created_at', 'DESC']],
    offset,
    limit,
    distinct: true // avoid inflated count from JOINs
  });

  const totalPages = Math.ceil(total / limit);

  return {
    orders,
    pagination: { page, limit, total, totalPages, hasNextPage: page < totalPages }
  };
};

/**
 * Get a single order by ID (ownership check: user can see own, admin can see all).
 *
 * @param {string} orderId - UUID
 * @param {string} userId - Authenticated user's UUID
 * @param {string} userRole - 'customer' or 'admin'
 * @returns {Promise<Object>} Order with items and payment
 */
const getById = async (orderId, userId, userRole) => {
  const order = await Order.findByPk(orderId, {
    include: [
      { model: OrderItem, as: 'items' },
      { model: Payment, as: 'payment' }
    ]
  });

  if (!order) {
    throw new AppError('Order not found', 404, 'NOT_FOUND');
  }

  if (order.user_id !== userId && userRole !== 'admin') {
    throw new AppError('You can only view your own orders', 403, 'FORBIDDEN');
  }

  return order;
};

/**
 * Admin: list all orders with optional status filter (paginated).
 *
 * @param {Object} query - { page, limit, status? }
 * @returns {Promise<{orders: Array, pagination: Object}>}
 */
const adminListAll = async ({ page = 1, limit = 10, status }) => {
  const where = {};
  if (status) where.status = status;

  const offset = (page - 1) * limit;

  const { rows: orders, count: total } = await Order.findAndCountAll({
    where,
    include: [
      { model: OrderItem, as: 'items' },
      { model: Payment, as: 'payment' }
    ],
    order: [['created_at', 'DESC']],
    offset,
    limit,
    distinct: true
  });

  const totalPages = Math.ceil(total / limit);

  return {
    orders,
    pagination: { page, limit, total, totalPages, hasNextPage: page < totalPages }
  };
};

module.exports = {
  placeOrder,
  confirmPayment,
  getUserOrders,
  getById,
  adminListAll
};
