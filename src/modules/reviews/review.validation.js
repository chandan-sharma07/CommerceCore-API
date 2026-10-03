const { z } = require('zod');

const createReviewSchema = z.object({
  product_id: z.string().regex(/^[0-9a-fA-F]{24}$/, 'Invalid product ID'),
  rating: z.number().int('Rating must be an integer').min(1, 'Rating must be at least 1').max(5, 'Rating must be at most 5'),
  comment: z.string().min(1, 'Comment is required').max(1000, 'Comment must be 1000 characters or less')
});

const updateReviewSchema = z.object({
  rating: z.number().int('Rating must be an integer').min(1, 'Rating must be at least 1').max(5, 'Rating must be at most 5').optional(),
  comment: z.string().min(1).max(1000, 'Comment must be 1000 characters or less').optional()
}).refine((data) => Object.keys(data).length > 0, {
  message: 'At least one field must be provided for update'
});

const reviewIdSchema = z.object({
  id: z.string().regex(/^[0-9a-fA-F]{24}$/, 'Invalid review ID')
});

const productIdParamSchema = z.object({
  productId: z.string().regex(/^[0-9a-fA-F]{24}$/, 'Invalid product ID')
});

const listReviewsQuerySchema = z.object({
  page: z.coerce.number().int().positive().default(1),
  limit: z.coerce.number().int().positive().max(100).default(10)
});

module.exports = {
  createReviewSchema,
  updateReviewSchema,
  reviewIdSchema,
  productIdParamSchema,
  listReviewsQuerySchema
};
