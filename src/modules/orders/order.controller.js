const orderService = require('./order.service');
const { sendSuccess } = require('../../core/responseHandler');

/**
 * Place a new order (authenticated user).
 * Reads Idempotency-Key from request header.
 */
const placeOrder = async (req, res, next) => {
  try {
    const idempotencyKey = req.headers['idempotency-key'] || null;
    const { order, created } = await orderService.placeOrder(req.user.id, req.body.items, idempotencyKey);
    sendSuccess(res, { data: order, statusCode: created ? 201 : 200 });
  } catch (err) {
    next(err);
  }
};

/**
 * Confirm payment (mock) — update payment + order status.
 */
const confirmPayment = async (req, res, next) => {
  try {
    const order = await orderService.confirmPayment(
      req.params.id, req.user.id, req.user.role, req.body.status
    );
    sendSuccess(res, { data: order });
  } catch (err) {
    next(err);
  }
};

/**
 * Get logged-in user's order history (paginated).
 */
const getUserOrders = async (req, res, next) => {
  try {
    const { orders, pagination } = await orderService.getUserOrders(req.user.id, req.query);
    sendSuccess(res, { data: orders, meta: pagination });
  } catch (err) {
    next(err);
  }
};

/**
 * Get single order by ID (ownership check in service).
 */
const getById = async (req, res, next) => {
  try {
    const order = await orderService.getById(req.params.id, req.user.id, req.user.role);
    sendSuccess(res, { data: order });
  } catch (err) {
    next(err);
  }
};

/**
 * Admin: list all orders with optional status filter.
 */
const adminListAll = async (req, res, next) => {
  try {
    const { orders, pagination } = await orderService.adminListAll(req.query);
    sendSuccess(res, { data: orders, meta: pagination });
  } catch (err) {
    next(err);
  }
};

module.exports = {
  placeOrder,
  confirmPayment,
  getUserOrders,
  getById,
  adminListAll
};
