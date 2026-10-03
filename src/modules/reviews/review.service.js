const mongoose = require('mongoose');
const Review = require('../../models/mongo/Review');
const Product = require('../../models/mongo/Product');
const AppError = require('../../core/AppError');
const { logger } = require('../../core/logger');

// ── Purchase Verification Stub ────────────────────────────────
// TODO: Replace this stub with actual Order module lookup once the Order module is built.
// It should query MySQL orders + order_items tables to verify the user has purchased the product.
//
// Expected implementation:
//   const { Order, OrderItem } = require('../../models/mysql');
//   const hasPurchased = async (userId, productId) => {
//     const order = await Order.findOne({
//       where: { user_id: userId, status: ['confirmed', 'shipped', 'delivered'] },
//       include: [{ model: OrderItem, as: 'items', where: { product_id: productId } }]
//     });
//     return !!order;
//   };
//
const hasPurchased = async (userId, productId) => {
  // Stub: always returns true during development.
  // TODO: Connect to Order module when it's built.
  return true;
};

/**
 * Recalculate and update the averageRating and reviewCount for a product.
 * Uses MongoDB aggregation pipeline on the Review collection.
 * @param {string|ObjectId} productId - Product's MongoDB ObjectId
 */
const recalculateAverageRating = async (productId) => {
  const objectId = new mongoose.Types.ObjectId(String(productId));

  const result = await Review.aggregate([
    { $match: { product_id: objectId } },
    {
      $group: {
        _id: null,
        averageRating: { $avg: '$rating' },
        reviewCount: { $sum: 1 }
      }
    }
  ]);

  const stats = result.length > 0
    ? {
        averageRating: Math.round(result[0].averageRating * 10) / 10,
        reviewCount: result[0].reviewCount
      }
    : { averageRating: 0, reviewCount: 0 };

  await Product.findByIdAndUpdate(productId, {
    averageRating: stats.averageRating,
    reviewCount: stats.reviewCount
  });

  logger.info(`Product ${productId} rating recalculated: avg=${stats.averageRating}, count=${stats.reviewCount}`);
};

/**
 * Create a new review for a product.
 * @param {string} userId - MySQL UUID of the authenticated user
 * @param {Object} data - { product_id, rating, comment }
 * @returns {Promise<Object>} Created review document
 */
const create = async (userId, data) => {
  // Verify product exists
  const product = await Product.findById(data.product_id);
  if (!product) {
    throw new AppError('Product not found', 404, 'NOT_FOUND');
  }

  // Purchase verification (stub for now)
  const purchased = await hasPurchased(userId, data.product_id);
  if (!purchased) {
    throw new AppError('You must purchase this product before reviewing it', 403, 'PURCHASE_REQUIRED');
  }

  // Duplicate check — one review per user per product
  const existing = await Review.findOne({ product_id: data.product_id, user_id: userId });
  if (existing) {
    throw new AppError('You have already reviewed this product', 409, 'DUPLICATE_REVIEW');
  }

  const review = await Review.create({
    product_id: data.product_id,
    user_id: userId,
    rating: data.rating,
    comment: data.comment
  });

  await recalculateAverageRating(data.product_id);

  logger.info(`Review created by user ${userId} for product ${data.product_id}`);
  return review;
};

/**
 * Get paginated reviews for a product (public).
 * @param {string} productId - MongoDB ObjectId string
 * @param {Object} query - { page, limit }
 * @returns {Promise<Object>} { reviews, pagination }
 */
const getByProduct = async (productId, { page = 1, limit = 10 }) => {
  // Verify product exists
  const product = await Product.findById(productId);
  if (!product) {
    throw new AppError('Product not found', 404, 'NOT_FOUND');
  }

  const skip = (page - 1) * limit;

  const [reviews, total] = await Promise.all([
    Review.find({ product_id: productId }).sort({ createdAt: -1 }).skip(skip).limit(limit),
    Review.countDocuments({ product_id: productId })
  ]);

  const totalPages = Math.ceil(total / limit);

  return {
    reviews,
    pagination: {
      page,
      limit,
      total,
      totalPages,
      hasNextPage: page < totalPages
    }
  };
};

/**
 * Update a review (ownership check — only the author can update).
 * @param {string} reviewId - MongoDB ObjectId string
 * @param {string} userId - MySQL UUID of the authenticated user
 * @param {Object} data - Fields to update { rating?, comment? }
 * @returns {Promise<Object>} Updated review document
 */
const update = async (reviewId, userId, data) => {
  const review = await Review.findById(reviewId);
  if (!review) {
    throw new AppError('Review not found', 404, 'NOT_FOUND');
  }

  // Ownership check
  if (review.user_id !== userId) {
    throw new AppError('You can only update your own reviews', 403, 'FORBIDDEN');
  }

  if (data.rating !== undefined) review.rating = data.rating;
  if (data.comment !== undefined) review.comment = data.comment;
  await review.save();

  await recalculateAverageRating(review.product_id);

  logger.info(`Review ${reviewId} updated by user ${userId}`);
  return review;
};

/**
 * Delete a review (ownership check — only the author can delete).
 * @param {string} reviewId - MongoDB ObjectId string
 * @param {string} userId - MySQL UUID of the authenticated user
 * @returns {Promise<Object>} Deleted review document
 */
const remove = async (reviewId, userId) => {
  const review = await Review.findById(reviewId);
  if (!review) {
    throw new AppError('Review not found', 404, 'NOT_FOUND');
  }

  // Ownership check
  if (review.user_id !== userId) {
    throw new AppError('You can only delete your own reviews', 403, 'FORBIDDEN');
  }

  const productId = review.product_id;
  await review.deleteOne();

  await recalculateAverageRating(productId);

  logger.info(`Review ${reviewId} deleted by user ${userId}`);
  return review;
};

module.exports = {
  create,
  getByProduct,
  update,
  remove
};
