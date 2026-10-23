const jwt = require('jsonwebtoken');
const mongoose = require('mongoose');
const { User } = require('../models');
const localStore = require('../utils/localStore');

const DEV_FALLBACK_SECRET = 'notivexa_development_jwt_secret_key_32chars_min';

function getJwtSecret() {
  const secret = process.env.JWT_SECRET;
  const isProd = process.env.NODE_ENV === 'production';

  if (isProd) {
    if (!secret || secret.trim().length < 16 || secret === 'notivexa_secret') {
      throw new Error('FATAL: A secure JWT_SECRET (>= 16 characters) is required in production.');
    }
    return secret;
  }

  return secret || DEV_FALLBACK_SECRET;
}

function signToken(userId) {
  const secret = getJwtSecret();
  return jwt.sign({ id: userId.toString() }, secret, { expiresIn: '7d' });
}

const authenticate = async (req, res, next) => {
  try {
    const authHeader = req.headers.authorization;
    if (!authHeader || !authHeader.startsWith('Bearer ')) {
      return res.status(401).json({ error: 'Authentication required. No token provided.' });
    }

    const token = authHeader.split(' ')[1];
    if (!token) {
      return res.status(401).json({ error: 'Malformed authorization token.' });
    }

    const secret = getJwtSecret();
    const decoded = jwt.verify(token, secret);

    if (!decoded || !decoded.id) {
      return res.status(401).json({ error: 'Invalid token payload.' });
    }

    // 1. Check MongoDB if connected
    if (mongoose.connection.readyState === 1) {
      try {
        const user = await User.findById(decoded.id);
        if (user) {
          if (!user.isActive) {
            return res.status(403).json({ error: 'Account has been deactivated.' });
          }
          req.user = user;
          return next();
        }
      } catch (err) {
        console.warn('[Auth Middleware DB Lookup Error]', err.message);
      }
    }

    // 2. Check local store (in development or demo mode only)
    if (process.env.NODE_ENV !== 'production' || process.env.ALLOW_DEMO_MODE === 'true') {
      const localUser = localStore.findUserById(decoded.id);
      if (localUser) {
        if (!localUser.isActive) {
          return res.status(403).json({ error: 'Account has been deactivated.' });
        }
        const safe = { ...localUser };
        delete safe.passwordHash;
        req.user = safe;
        return next();
      }
    }

    // 3. User could not be mapped to any active account - STRICTLY REJECT (IDOR/Security fix)
    return res.status(401).json({ error: 'User account not found or session has expired. Please sign in again.' });
  } catch (err) {
    if (err.name === 'TokenExpiredError') {
      return res.status(401).json({ error: 'Authentication session expired. Please sign in again.' });
    }
    if (err.name === 'JsonWebTokenError') {
      return res.status(401).json({ error: 'Invalid authentication token.' });
    }
    return res.status(500).json({ error: 'Authentication verification failure.' });
  }
};

module.exports = {
  authenticate,
  getJwtSecret,
  signToken
};
