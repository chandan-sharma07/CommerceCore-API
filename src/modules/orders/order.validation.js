const { z } = require('zod');

const placeOrderSchema = z.object({
  items: z.array(
    z.object({
      productId: z.string().regex(/^[0-9a-fA-F]{24}$/, 'Invalid product ID'),
      quantity: z.number().int('Quantity must be an integer').positive('Quantity must be a positive number')
    })
  ).min(1, 'Items array cannot be empty')
});

const confirmPaymentSchema = z.object({
  status: z.enum(['success', 'failed'], {
    errorMap: () => ({ message: 'Status must be "success" or "failed"' })
  })
});

const orderIdSchema = z.object({
  id: z.string().uuid('Invalid order ID')
});

const listOrdersQuerySchema = z.object({
  page: z.coerce.number().int().positive().default(1),
  limit: z.coerce.number().int().positive().max(100).default(10)
});

const adminListQuerySchema = z.object({
  page: z.coerce.number().int().positive().default(1),
  limit: z.coerce.number().int().positive().max(100).default(10),
  status: z.enum([
    'pending', 'confirmed', 'paid', 'failed',
    'shipped', 'delivered', 'cancelled', 'stock_sync_failed'
  ]).optional()
});

module.exports = {
  placeOrderSchema,
  confirmPaymentSchema,
  orderIdSchema,
  listOrdersQuerySchema,
  adminListQuerySchema
};
