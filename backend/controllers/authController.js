const mongoose = require('mongoose');
const { User } = require('../models');
const localStore = require('../utils/localStore');
const { signToken } = require('../middleware/auth');

const isDbConnected = () => mongoose.connection.readyState === 1;

async function ensureDbState() {
  if (mongoose.connection.readyState === 2) {
    await new Promise((resolve) => {
      const timer = setTimeout(resolve, 2000);
      mongoose.connection.once('connected', () => {
        clearTimeout(timer);
        resolve();
      });
      mongoose.connection.once('error', () => {
        clearTimeout(timer);
        resolve();
      });
    });
  }
}

const EMAIL_REGEX = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

exports.register = async (req, res, next) => {
  try {
    await ensureDbState();
    const { name, email, password, institution, preferredLanguage } = req.body;
    if (!name || !email || !password) {
      return res.status(400).json({ error: 'Name, email, and password are required.' });
    }

    const normEmail = email.toLowerCase().trim();
    if (!EMAIL_REGEX.test(normEmail)) {
      return res.status(400).json({ error: 'Please provide a valid email address.' });
    }

    if (typeof password !== 'string' || password.length < 6) {
      return res.status(400).json({ error: 'Password must be at least 6 characters long.' });
    }

    // SECURITY: Force role to 'student'. Never allow public self-assignment of 'admin' or 'teacher'
    const assignedRole = 'student';

    // 1. If MongoDB Atlas is connected, use MongoDB
    if (isDbConnected()) {
      const existing = await User.findOne({ email: normEmail });
      if (existing) {
        return res.status(409).json({ error: 'Email is already registered. Please sign in.' });
      }
      const existingLocal = localStore.findUserByEmail(normEmail);
      if (existingLocal) {
        return res.status(409).json({ error: 'Email is already registered. Please sign in.' });
      }

      const user = await User.create({
        name: name.trim(),
        email: normEmail,
        password,
        role: assignedRole,
        institution: institution ? institution.trim() : '',
        preferredLanguage: preferredLanguage ? preferredLanguage.trim() : 'English',
        isActive: true
      });

      return res.status(201).json({
        success: true,
        token: signToken(user._id),
        user
      });
    }

    // 2. Production requirement: Disallow silent fallback to ephemeral storage in production
    if (process.env.NODE_ENV === 'production' && process.env.ALLOW_DEMO_MODE !== 'true') {
      return res.status(503).json({
        error: 'Database service is currently unavailable. Please check MONGODB_URI in environment configuration.'
      });
    }

    // 3. Development / Demo mode persistent local store
    console.log(`[Auth] MongoDB not connected: Registering "${normEmail}" in development local store`);
    const existingLocal = localStore.findUserByEmail(normEmail);
    if (existingLocal) {
      return res.status(409).json({ error: 'Email is already registered.' });
    }

    const newUser = await localStore.createUser({
      name: name.trim(),
      email: normEmail,
      password,
      role: assignedRole,
      institution: institution ? institution.trim() : '',
      preferredLanguage: preferredLanguage ? preferredLanguage.trim() : 'English'
    });

    return res.status(201).json({
      success: true,
      token: signToken(newUser._id || newUser.id),
      user: newUser,
      message: 'Account created successfully in development mode.'
    });
  } catch (err) {
    next(err);
  }
};

exports.login = async (req, res, next) => {
  try {
    const { email, password } = req.body;
    if (!email || !password) {
      return res.status(400).json({ error: 'Email and password are required.' });
    }

    const normEmail = email.toLowerCase().trim();

    // 1. Try MongoDB if connected
    if (isDbConnected()) {
      const user = await User.findOne({ email: normEmail }).select('+password');
      if (user) {
        const isMatch = await user.comparePassword(password);
        if (isMatch) {
          if (!user.isActive) {
            return res.status(403).json({ error: 'Account has been deactivated. Please contact support.' });
          }
          return res.json({
            success: true,
            token: signToken(user._id),
            user
          });
        }
      }
    }

    // 2. Fallback to local store (for demo / dev mode)
    if (process.env.NODE_ENV !== 'production' || process.env.ALLOW_DEMO_MODE === 'true') {
      const localUser = localStore.findUserByEmail(normEmail);
      if (localUser) {
        const isMatch = await localStore.comparePassword(localUser, password);
        if (isMatch) {
          if (!localUser.isActive) {
            return res.status(403).json({ error: 'Account has been deactivated.' });
          }
          const safeUser = { ...localUser };
          delete safeUser.passwordHash;
          return res.json({
            success: true,
            token: signToken(safeUser._id || safeUser.id),
            user: safeUser
          });
        }
      }
    }

    return res.status(401).json({ error: 'Invalid email or password.' });
  } catch (err) {
    next(err);
  }
};

exports.getProfile = async (req, res, next) => {
  try {
    const userId = req.user?.id || req.user?._id;
    if (isDbConnected() && mongoose.Types.ObjectId.isValid(userId)) {
      const user = await User.findById(userId);
      if (user) return res.json({ success: true, user });
    }

    if (process.env.NODE_ENV !== 'production' || process.env.ALLOW_DEMO_MODE === 'true') {
      const localUser = localStore.findUserById(userId);
      if (localUser) {
        const safe = { ...localUser };
        delete safe.passwordHash;
        return res.json({ success: true, user: safe });
      }
    }

    res.json({ success: true, user: req.user });
  } catch (err) {
    next(err);
  }
};

exports.updateProfile = async (req, res, next) => {
  try {
    const userId = req.user?.id || req.user?._id;
    const { name, institution, preferredLanguage } = req.body;
    const safeUpdates = {};
    if (name && typeof name === 'string') safeUpdates.name = name.trim();
    if (institution !== undefined) safeUpdates.institution = typeof institution === 'string' ? institution.trim() : '';
    if (preferredLanguage && typeof preferredLanguage === 'string') safeUpdates.preferredLanguage = preferredLanguage.trim();

    if (isDbConnected() && mongoose.Types.ObjectId.isValid(userId)) {
      const user = await User.findByIdAndUpdate(userId, safeUpdates, { new: true });
      if (user) return res.json({ success: true, user });
    }

    if (process.env.NODE_ENV !== 'production' || process.env.ALLOW_DEMO_MODE === 'true') {
      const updated = localStore.updateUser(userId, safeUpdates);
      return res.json({ success: true, user: updated || { ...req.user, ...safeUpdates } });
    }

    res.json({ success: true, user: { ...req.user, ...safeUpdates } });
  } catch (err) {
    next(err);
  }
};

exports.changePassword = async (req, res, next) => {
  try {
    const userId = req.user?.id || req.user?._id;
    const { currentPassword, newPassword } = req.body;
    if (!newPassword || typeof newPassword !== 'string' || newPassword.length < 6) {
      return res.status(400).json({ error: 'New password must be at least 6 characters.' });
    }

    if (isDbConnected() && mongoose.Types.ObjectId.isValid(userId)) {
      const user = await User.findById(userId).select('+password');
      if (user) {
        if (!(await user.comparePassword(currentPassword))) {
          return res.status(401).json({ error: 'Current password is incorrect.' });
        }
        user.password = newPassword;
        await user.save();
        return res.json({ success: true, message: 'Password updated successfully.' });
      }
    }

    if (process.env.NODE_ENV !== 'production' || process.env.ALLOW_DEMO_MODE === 'true') {
      const localUser = localStore.findUserById(userId);
      if (localUser) {
        const match = await localStore.comparePassword(localUser, currentPassword);
        if (!match) return res.status(401).json({ error: 'Current password is incorrect.' });
        const bcrypt = require('bcryptjs');
        localStore.updateUser(userId, { passwordHash: await bcrypt.hash(newPassword, 12) });
        return res.json({ success: true, message: 'Password updated successfully.' });
      }
    }

    res.status(404).json({ error: 'User account not found.' });
  } catch (err) {
    next(err);
  }
};
