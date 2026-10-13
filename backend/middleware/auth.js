const jwt = require('jsonwebtoken');
const mongoose = require('mongoose');
const { User } = require('../models');
const { DEMO_USERS } = require('../controllers/authController');

const SECRET = process.env.JWT_SECRET || 'notivexa_secret';

const DEMO_USERS_MAP = {
  '507f191e810c19729de860ea': DEMO_USERS ? DEMO_USERS['student@demo.com'] : {
    _id: '507f191e810c19729de860ea', id: '507f191e810c19729de860ea', name: 'Aryan Sharma', email: 'student@demo.com', role: 'student', isActive: true
  },
  '507f191e810c19729de860eb': DEMO_USERS ? DEMO_USERS['teacher@demo.com'] : {
    _id: '507f191e810c19729de860eb', id: '507f191e810c19729de860eb', name: 'Prof. Meera Joshi', email: 'teacher@demo.com', role: 'teacher', isActive: true
  }
};

const authenticate = async (req, res, next) => {
  try {
    const h = req.headers.authorization;
    if (!h?.startsWith('Bearer ')) return res.status(401).json({ error: 'No token provided.' });
    const decoded = jwt.verify(h.split(' ')[1], SECRET);
    
    // Check if known demo user ID
    if (DEMO_USERS_MAP[decoded.id]) {
      req.user = DEMO_USERS_MAP[decoded.id];
      return next();
    }

    // If database is not connected, fallback to decoded identity so requests do not block
    if (mongoose.connection.readyState !== 1) {
      req.user = {
        _id: decoded.id,
        id: decoded.id,
        name: 'Demo User',
        email: 'user@demo.com',
        role: 'student',
        isActive: true
      };
      return next();
    }

    const user = await User.findById(decoded.id);
    if (!user || !user.isActive) return res.status(401).json({ error: 'Invalid or inactive user token.' });
    req.user = user;
    next();
  } catch(e) {
    if (e.name === 'TokenExpiredError') return res.status(401).json({ error: 'Token expired. Please sign in again.' });
    res.status(401).json({ error: 'Invalid authentication token.' });
  }
};

module.exports = { authenticate, DEMO_USERS_MAP };