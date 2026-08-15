const jwt = require('jsonwebtoken');
const { User } = require('../models');
const SECRET = process.env.JWT_SECRET || 'notivexa_secret';
const authenticate = async (req, res, next) => {
  try {
    const h = req.headers.authorization;
    if (!h?.startsWith('Bearer ')) return res.status(401).json({ error: 'No token.' });
    const decoded = jwt.verify(h.split(' ')[1], SECRET);
    const user = await User.findById(decoded.id);
    if (!user || !user.isActive) return res.status(401).json({ error: 'Invalid token.' });
    req.user = user; next();
  } catch(e) {
    if (e.name==='TokenExpiredError') return res.status(401).json({ error: 'Token expired.' });
    res.status(401).json({ error: 'Invalid token.' });
  }
};
module.exports = { authenticate };