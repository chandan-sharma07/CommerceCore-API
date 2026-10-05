const express = require('express');
const orderController = require('./order.controller');
const validate = require('../../middleware/validate');
const authenticate = require('../../middleware/authenticate');
const authorize = require('../../middleware/authorize');
const {
  placeOrderSchema,
  confirmPaymentSchema,
  orderIdSchema,
  listOrdersQuerySchema,
  adminListQuerySchema
} = require('./order.validation');

const router = express.Router();

// Place order (authenticated)
router.post(
  '/',
  authenticate,
  validate(placeOrderSchema),
  orderController.placeOrder
);

// User's own order history (authenticated, paginated)
router.get(
  '/',
  authenticate,
  validate(listOrdersQuerySchema, 'query'),
  orderController.getUserOrders
);

// Admin: list all orders (admin only, paginated, filterable by status)
// MUST be defined BEFORE /:id to avoid being captured as a UUID param
router.get(
  '/admin',
  authenticate,
  authorize('admin'),
  validate(adminListQuerySchema, 'query'),
  orderController.adminListAll
);

// Get single order (authenticated, ownership check in service, admin can see all)
router.get(
  '/:id',
  authenticate,
  validate(orderIdSchema, 'params'),
  orderController.getById
);

// Confirm payment — mock endpoint (authenticated, ownership check in service)
router.post(
  '/:id/pay',
  authenticate,
  validate(orderIdSchema, 'params'),
  validate(confirmPaymentSchema),
  orderController.confirmPayment
);

module.exports = router;
