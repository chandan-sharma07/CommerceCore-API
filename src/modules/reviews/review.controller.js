const reviewService = require('./review.service');
const { sendSuccess } = require('../../core/responseHandler');

/**
 * Add a review (authenticated user).
 */
const create = async (req, res, next) => {
  try {
    const review = await reviewService.create(req.user.id, req.body);
    sendSuccess(res, { data: review, statusCode: 201 });
  } catch (err) {
    next(err);
  }
};

/**
 * Get paginated reviews for a product (public).
 */
const getByProduct = async (req, res, next) => {
  try {
    const { reviews, pagination } = await reviewService.getByProduct(req.params.productId, req.query);
    sendSuccess(res, { data: reviews, meta: pagination });
  } catch (err) {
    next(err);
  }
};

/**
 * Update own review (ownership check in service).
 */
const update = async (req, res, next) => {
  try {
    const review = await reviewService.update(req.params.id, req.user.id, req.body);
    sendSuccess(res, { data: review });
  } catch (err) {
    next(err);
  }
};

/**
 * Delete own review (ownership check in service).
 */
const remove = async (req, res, next) => {
  try {
    await reviewService.remove(req.params.id, req.user.id);
    sendSuccess(res, { data: { message: 'Review deleted successfully' } });
  } catch (err) {
    next(err);
  }
};

module.exports = {
  create,
  getByProduct,
  update,
  remove
};
