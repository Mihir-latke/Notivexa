const r = require('express').Router();
const c = require('../controllers/authController');
const { authenticate } = require('../middleware/auth');
r.post('/register', c.register);
r.post('/login', c.login);
r.get('/profile', authenticate, c.getProfile);
r.put('/profile', authenticate, c.updateProfile);
r.put('/change-password', authenticate, c.changePassword);
module.exports = r;