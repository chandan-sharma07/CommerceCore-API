const express = require('express');
const reviewController = require('./review.controller');
const validate = require('../../middleware/validate');
const authenticate = require('../../middleware/authenticate');
const {
  createReviewSchema,
  updateReviewSchema,
  reviewIdSchema,
  productIdParamSchema,
  listReviewsQuerySchema
} = require('./review.validation');

const router = express.Router();

// Public — get reviews for a product (paginated)
router.get(
  '/product/:productId',
  validate(productIdParamSchema, 'params'),
  validate(listReviewsQuerySchema, 'query'),
  reviewController.getByProduct
);

// Authenticated — add a review
router.post(
  '/',
  authenticate,
  validate(createReviewSchema),
  reviewController.create
);

// Authenticated — update own review
router.put(
  '/:id',
  authenticate,
  validate(reviewIdSchema, 'params'),
  validate(updateReviewSchema),
  reviewController.update
);

// Authenticated — delete own review
router.delete(
  '/:id',
  authenticate,
  validate(reviewIdSchema, 'params'),
  reviewController.remove
);

module.exports = router;
