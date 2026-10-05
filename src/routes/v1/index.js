const express = require('express');
const authRoutes = require('../../modules/auth/auth.routes');
const productRoutes = require('../../modules/products/product.routes');
const reviewRoutes = require('../../modules/reviews/review.routes');
const orderRoutes = require('../../modules/orders/order.routes');

const router = express.Router();

router.use('/auth', authRoutes);
router.use('/products', productRoutes);
router.use('/reviews', reviewRoutes);
router.use('/orders', orderRoutes);

module.exports = router;
