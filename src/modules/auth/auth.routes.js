const express = require('express');
const authController = require('./auth.controller');
const validate = require('../../middleware/validate');
const { registerSchema, loginSchema, refreshSchema } = require('./auth.validation');

const router = express.Router();

router.post('/register', validate(registerSchema), authController.register);
router.post('/login', validate(loginSchema), authController.login);
router.post('/refresh', validate(refreshSchema), authController.refresh);
router.post('/logout', validate(refreshSchema), authController.logout);

module.exports = router;
