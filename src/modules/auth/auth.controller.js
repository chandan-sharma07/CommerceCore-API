const authService = require('./auth.service');
const { sendSuccess } = require('../../core/responseHandler');

/**
 * Register a user
 */
const register = async (req, res, next) => {
  try {
    const result = await authService.register(req.body);
    sendSuccess(res, { data: result, statusCode: 201 });
  } catch (err) {
    next(err);
  }
};

/**
 * Login a user
 */
const login = async (req, res, next) => {
  try {
    const result = await authService.login(req.body);
    sendSuccess(res, { data: result });
  } catch (err) {
    next(err);
  }
};

/**
 * Refresh token
 */
const refresh = async (req, res, next) => {
  try {
    const result = await authService.refreshToken(req.body.refreshToken);
    sendSuccess(res, { data: result });
  } catch (err) {
    next(err);
  }
};

/**
 * Logout a user
 */
const logout = async (req, res, next) => {
  try {
    await authService.logout(req.body.refreshToken);
    sendSuccess(res, { data: { message: 'Logged out successfully' } });
  } catch (err) {
    next(err);
  }
};

module.exports = {
  register,
  login,
  refresh,
  logout
};
