const jwt = require('jsonwebtoken');
const mongoose = require('mongoose');
const { User } = require('../models');

const sign = id => jwt.sign({ id }, process.env.JWT_SECRET || 'notivexa_secret', { expiresIn: '7d' });
const isDbConnected = () => mongoose.connection.readyState === 1;

const DEMO_USERS = {
  'student@demo.com': {
    _id: '507f191e810c19729de860ea',
    id: '507f191e810c19729de860ea',
    name: 'Aryan Sharma',
    email: 'student@demo.com',
    role: 'student',
    institution: 'Demo College, Mumbai',
    isActive: true,
    preferredLanguage: 'English',
    studyStats: { documentsUploaded: 1, notesGenerated: 4, flashcardsCreated: 12 }
  },
  'teacher@demo.com': {
    _id: '507f191e810c19729de860eb',
    id: '507f191e810c19729de860eb',
    name: 'Prof. Meera Joshi',
    email: 'teacher@demo.com',
    role: 'teacher',
    institution: 'Demo College, Mumbai',
    isActive: true,
    preferredLanguage: 'English',
    studyStats: { documentsUploaded: 5, notesGenerated: 16, flashcardsCreated: 36 }
  }
};

exports.DEMO_USERS = DEMO_USERS;

exports.register = async (req, res, next) => {
  try {
    const { name, email, password, role, institution } = req.body;
    if (!name || !email || !password) return res.status(400).json({ error: 'Name, email and password required.' });
    if (password.length < 6) return res.status(400).json({ error: 'Password must be at least 6 characters.' });

    if (!isDbConnected()) {
      return res.status(503).json({
        error: 'Database is not connected on this server. To create new accounts, please configure MONGODB_URI in Render Environment Variables (MongoDB Atlas). Or sign in using the Demo Account buttons.'
      });
    }

    if (await User.findOne({ email: email.toLowerCase() })) return res.status(409).json({ error: 'Email already registered.' });
    const user = await User.create({ name, email, password, role: role || 'student', institution: institution || '' });
    res.status(201).json({ success: true, token: sign(user._id), user });
  } catch(e) { next(e); }
};

exports.login = async (req, res, next) => {
  try {
    const { email, password } = req.body;
    if (!email || !password) return res.status(400).json({ error: 'Email and password required.' });

    const normEmail = email.toLowerCase().trim();
    const isDemo = normEmail === 'student@demo.com' || normEmail === 'teacher@demo.com';
    const isDemoPass = password === 'demo1234' || password === 'student123' || password === 'teacher123';

    // If database is NOT connected, allow demo accounts immediately
    if (!isDbConnected()) {
      if (isDemo && isDemoPass) {
        const demoUser = DEMO_USERS[normEmail];
        return res.json({
          success: true,
          token: sign(demoUser._id),
          user: demoUser,
          isOfflineDemo: true,
          message: 'Signed in with Demo Account (Offline/Preview Mode)'
        });
      }
      return res.status(503).json({
        error: 'Database is not connected. Please add MONGODB_URI in Render Environment Variables (from MongoDB Atlas). Or use Demo Login (student@demo.com / demo1234).'
      });
    }

    // Database is connected: attempt database query
    const user = await User.findOne({ email: normEmail }).select('+password');
    if (!user || !(await user.comparePassword(password))) {
      // If DB is fresh and seed hasn't completed yet, allow demo accounts
      if (isDemo && isDemoPass) {
        const demoUser = DEMO_USERS[normEmail];
        return res.json({ success: true, token: sign(demoUser._id), user: demoUser });
      }
      return res.status(401).json({ error: 'Invalid email or password.' });
    }
    if (!user.isActive) return res.status(403).json({ error: 'Account deactivated.' });
    res.json({ success: true, token: sign(user._id), user });
  } catch(e) { next(e); }
};

exports.getProfile = async (req, res, next) => {
  try {
    if (!isDbConnected() || req.user?.email === 'student@demo.com' || req.user?.email === 'teacher@demo.com') {
      const demo = DEMO_USERS[req.user?.email] || Object.values(DEMO_USERS).find(u => u._id === req.user?.id || u._id === req.user?._id);
      if (demo) return res.json({ success: true, user: demo });
    }
    const user = await User.findById(req.user.id);
    res.json({ success: true, user: user || req.user });
  } catch(e) { next(e); }
};

exports.updateProfile = async (req, res, next) => {
  try {
    const { name, institution, preferredLanguage } = req.body;
    if (!isDbConnected()) {
      const updated = { ...req.user, name: name || req.user.name, institution: institution ?? req.user.institution, preferredLanguage: preferredLanguage || req.user.preferredLanguage };
      return res.json({ success: true, user: updated });
    }
    const user = await User.findByIdAndUpdate(req.user.id, { name, institution, preferredLanguage }, { new: true });
    res.json({ success: true, user });
  } catch(e) { next(e); }
};

exports.changePassword = async (req, res, next) => {
  try {
    const { currentPassword, newPassword } = req.body;
    if (!newPassword || newPassword.length < 6) return res.status(400).json({ error: 'New password must be ≥6 chars.' });
    if (!isDbConnected()) {
      return res.json({ success: true, message: 'Password updated (Demo mode).' });
    }
    const user = await User.findById(req.user.id).select('+password');
    if (!(await user.comparePassword(currentPassword))) return res.status(401).json({ error: 'Current password wrong.' });
    user.password = newPassword;
    await user.save();
    res.json({ success: true, message: 'Password updated.' });
  } catch(e) { next(e); }
};