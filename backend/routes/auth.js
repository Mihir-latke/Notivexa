const r = require('express').Router();
const c = require('../controllers/authController');
const { authenticate } = require('../middleware/auth');

// Public authentication routes
r.post('/register', c.register);
r.post('/login', c.login);
r.post('/logout', c.logout);

// Multi-Factor Authentication (MFA) verification routes
r.post('/verify-mfa', c.verifyMfa);
r.post('/resend-mfa-otp', c.resendMfaOtp);

// Forgot & Reset Password routes
r.post('/forgot-password', c.forgotPassword);
r.post('/verify-reset-otp', c.verifyResetOtp);
r.post('/reset-password', c.resetPassword);

// Authenticated user profile and security routes
r.get('/profile', authenticate, c.getProfile);
r.put('/profile', authenticate, c.updateProfile);
r.put('/change-password', authenticate, c.changePassword);
r.post('/mfa/toggle', authenticate, c.toggleMfa);

module.exports = r;
