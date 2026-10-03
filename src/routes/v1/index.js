const express = require('express');
const authRoutes = require('../../modules/auth/auth.routes');
const productRoutes = require('../../modules/products/product.routes');
const reviewRoutes = require('../../modules/reviews/review.routes');

const router = express.Router();

router.use('/auth', authRoutes);
router.use('/products', productRoutes);
router.use('/reviews', reviewRoutes);

module.exports = router;
