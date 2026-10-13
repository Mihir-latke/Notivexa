const jwt = require('jsonwebtoken');
const mongoose = require('mongoose');
const { User } = require('../models');
const localStore = require('../utils/localStore');

const sign = id => jwt.sign({ id }, process.env.JWT_SECRET || 'notivexa_secret', { expiresIn: '7d' });
const isDbConnected = () => mongoose.connection.readyState === 1;

exports.register = async (req, res, next) => {
  try {
    const { name, email, password, role, institution } = req.body;
    if (!name || !email || !password) return res.status(400).json({ error: 'Name, email and password required.' });
    if (password.length < 6) return res.status(400).json({ error: 'Password must be at least 6 characters.' });

    const normEmail = email.toLowerCase().trim();

    // 1. If MongoDB Atlas is connected, use MongoDB
    if (isDbConnected()) {
      const existing = await User.findOne({ email: normEmail });
      if (existing) return res.status(409).json({ error: 'Email already registered.' });
      
      const user = await User.create({
        name: name.trim(),
        email: normEmail,
        password,
        role: role || 'student',
        institution: institution ? institution.trim() : ''
      });
      return res.status(201).json({ success: true, token: sign(user._id), user });
    }

    // 2. If MongoDB is not connected, use the autonomous local database store
    console.log(`[Auth] MongoDB not connected: Registering "${normEmail}" in persistent local store`);
    const existingLocal = localStore.findUserByEmail(normEmail);
    if (existingLocal) {
      return res.status(409).json({ error: 'Email already registered.' });
    }

    const newUser = await localStore.createUser({
      name,
      email: normEmail,
      password,
      role: role || 'student',
      institution: institution || ''
    });

    res.status(201).json({
      success: true,
      token: sign(newUser._id),
      user: newUser,
      message: 'Account created successfully!'
    });
  } catch(e) { next(e); }
};

exports.login = async (req, res, next) => {
  try {
    const { email, password } = req.body;
    if (!email || !password) return res.status(400).json({ error: 'Email and password required.' });

    const normEmail = email.toLowerCase().trim();

    // 1. Try MongoDB if connected
    if (isDbConnected()) {
      const user = await User.findOne({ email: normEmail }).select('+password');
      if (user && (await user.comparePassword(password))) {
        if (!user.isActive) return res.status(403).json({ error: 'Account deactivated.' });
        return res.json({ success: true, token: sign(user._id), user });
      }
    }

    // 2. Fallback to local store (supports demo users + newly registered users)
    const localUser = localStore.findUserByEmail(normEmail);
    if (localUser) {
      const isMatch = await localStore.comparePassword(localUser, password);
      if (isMatch) {
        if (!localUser.isActive) return res.status(403).json({ error: 'Account deactivated.' });
        const safeUser = { ...localUser };
        delete safeUser.passwordHash;
        return res.json({
          success: true,
          token: sign(safeUser._id),
          user: safeUser
        });
      }
    }

    return res.status(401).json({ error: 'Invalid email or password.' });
  } catch(e) { next(e); }
};

exports.getProfile = async (req, res, next) => {
  try {
    if (isDbConnected()) {
      const user = await User.findById(req.user.id);
      if (user) return res.json({ success: true, user });
    }
    const localUser = localStore.findUserById(req.user.id);
    if (localUser) {
      const safe = { ...localUser };
      delete safe.passwordHash;
      return res.json({ success: true, user: safe });
    }
    res.json({ success: true, user: req.user });
  } catch(e) { next(e); }
};

exports.updateProfile = async (req, res, next) => {
  try {
    const { name, institution, preferredLanguage } = req.body;
    if (isDbConnected()) {
      const user = await User.findByIdAndUpdate(req.user.id, { name, institution, preferredLanguage }, { new: true });
      if (user) return res.json({ success: true, user });
    }
    const updated = localStore.updateUser(req.user.id, { name, institution, preferredLanguage });
    res.json({ success: true, user: updated || { ...req.user, name, institution, preferredLanguage } });
  } catch(e) { next(e); }
};

exports.changePassword = async (req, res, next) => {
  try {
    const { currentPassword, newPassword } = req.body;
    if (!newPassword || newPassword.length < 6) return res.status(400).json({ error: 'New password must be ≥6 chars.' });
    
    if (isDbConnected()) {
      const user = await User.findById(req.user.id).select('+password');
      if (user) {
        if (!(await user.comparePassword(currentPassword))) return res.status(401).json({ error: 'Current password wrong.' });
        user.password = newPassword;
        await user.save();
        return res.json({ success: true, message: 'Password updated.' });
      }
    }
    
    const localUser = localStore.findUserById(req.user.id);
    if (localUser) {
      const match = await localStore.comparePassword(localUser, currentPassword);
      if (!match) return res.status(401).json({ error: 'Current password wrong.' });
      localStore.updateUser(req.user.id, { passwordHash: await require('bcryptjs').hash(newPassword, 12) });
      return res.json({ success: true, message: 'Password updated.' });
    }

    res.json({ success: true, message: 'Password updated.' });
  } catch(e) { next(e); }
};