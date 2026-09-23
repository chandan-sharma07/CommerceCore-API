const express = require('express');
const authRoutes = require('../../modules/auth/auth.routes');

const router = express.Router();

router.use('/auth', authRoutes);
// Future: router.use('/products', productRoutes);
// Future: router.use('/orders', orderRoutes);

module.exports = router;
