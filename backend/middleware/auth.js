const jwt = require('jsonwebtoken');
const mongoose = require('mongoose');
const { User } = require('../models');
const localStore = require('../utils/localStore');

const SECRET = process.env.JWT_SECRET || 'notivexa_secret';

const authenticate = async (req, res, next) => {
  try {
    const h = req.headers.authorization;
    if (!h?.startsWith('Bearer ')) return res.status(401).json({ error: 'No token provided.' });
    const decoded = jwt.verify(h.split(' ')[1], SECRET);
    
    // 1. Check MongoDB if connected
    if (mongoose.connection.readyState === 1) {
      try {
        const user = await User.findById(decoded.id);
        if (user && user.isActive) {
          req.user = user;
          return next();
        }
      } catch (err) {}
    }

    // 2. Check local store (demo users or users registered in local store)
    const localUser = localStore.findUserById(decoded.id);
    if (localUser && localUser.isActive) {
      const safe = { ...localUser };
      delete safe.passwordHash;
      req.user = safe;
      return next();
    }

    // 3. Fallback identity if valid token signature
    req.user = {
      _id: decoded.id,
      id: decoded.id,
      name: 'User',
      email: 'user@notivexa.com',
      role: 'student',
      isActive: true
    };
    next();
  } catch(e) {
    if (e.name === 'TokenExpiredError') return res.status(401).json({ error: 'Token expired. Please sign in again.' });
    res.status(401).json({ error: 'Invalid authentication token.' });
  }
};

module.exports = { authenticate };