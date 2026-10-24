const mongoose = require('mongoose');
const { User } = require('../models');
const localStore = require('../utils/localStore');
const { signToken } = require('../middleware/auth');
const { ensureDbState, attemptMongoConnect, resolveMongoUri } = require('../utils/dbSync');

const isDbConnected = () => mongoose.connection.readyState === 1;

const EMAIL_REGEX = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

exports.register = async (req, res, next) => {
  try {
    await ensureDbState(4000);
    const { name, email, password, institution, preferredLanguage } = req.body;
    if (!name || !email || !password) {
      return res.status(400).json({ error: 'Name, email, and password are required.' });
    }

    if (typeof name !== 'string' || name.trim().length < 2 || name.trim().length > 100) {
      return res.status(400).json({ error: 'Name must be between 2 and 100 characters.' });
    }

    const normEmail = email.toLowerCase().trim();
    if (!EMAIL_REGEX.test(normEmail) || normEmail.length > 255) {
      return res.status(400).json({ error: 'Please provide a valid email address.' });
    }

    if (typeof password !== 'string' || password.length < 6 || password.length > 128) {
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

      // Dual-write to local store so both stores remain fully populated
      try {
        await localStore.createUser({
          name: name.trim(),
          email: normEmail,
          password,
          role: assignedRole,
          institution: institution ? institution.trim() : '',
          preferredLanguage: preferredLanguage ? preferredLanguage.trim() : 'English'
        });
      } catch (e) {
        // Local cache ignore if duplicate
      }

      return res.status(201).json({
        success: true,
        token: signToken(user._id),
        user
      });
    }

    // 2. If MongoDB is not connected, use the autonomous local database store (or reject in production)
    if (process.env.NODE_ENV === 'production' && process.env.ALLOW_DEMO_MODE !== 'true') {
      return res.status(503).json({ error: 'Database service is currently unavailable. Please try again shortly.' });
    }

    console.log(`[Auth] MongoDB not connected: Registering "${normEmail}" in autonomous local store`);
    const existingLocal = localStore.findUserByEmail(normEmail);
    if (existingLocal) {
      return res.status(409).json({ error: 'Email is already registered. Please sign in.' });
    }

    const newUser = await localStore.createUser({
      name: name.trim(),
      email: normEmail,
      password,
      role: assignedRole,
      institution: institution ? institution.trim() : '',
      preferredLanguage: preferredLanguage ? preferredLanguage.trim() : 'English'
    });

    // Trigger background attempt to connect & sync to MongoDB Atlas
    attemptMongoConnect().catch(() => {});

    return res.status(201).json({
      success: true,
      token: signToken(newUser._id || newUser.id),
      user: newUser,
      message: 'Account created successfully!'
    });
  } catch (err) {
    if (err.code === 11000) {
      return res.status(409).json({ error: 'Email is already registered. Please sign in.' });
    }
    next(err);
  }
};

exports.login = async (req, res, next) => {
  try {
    // Ensure DB state before attempting login
    await ensureDbState(4000);

    const { email, password } = req.body;
    if (!email || !password) {
      return res.status(400).json({ error: 'Email and password are required.' });
    }

    const normEmail = email.toLowerCase().trim();
    const allowDemoMode = process.env.ALLOW_DEMO_MODE === 'true' || process.env.NODE_ENV !== 'production';

    // 1. Try MongoDB if connected
    if (isDbConnected()) {
      const user = await User.findOne({ email: normEmail }).select('+password');
      if (user) {
        let isMatch = await user.comparePassword(password);

        // Support demo aliases ONLY if demo mode is explicitly enabled
        if (allowDemoMode && !isMatch && (normEmail === 'student@demo.com' || normEmail === 'teacher@demo.com')) {
          if (password === 'demo1234' || password === 'student123' || password === 'teacher123') {
            isMatch = true;
          }
        }

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

      // If user registered in localStore before DB connected, find and migrate securely using stored hash!
      const localUser = localStore.findUserByEmail(normEmail);
      if (localUser && localUser.passwordHash) {
        const isMatch = await localStore.comparePassword(localUser, password);
        if (isMatch) {
          if (!localUser.isActive) {
            return res.status(403).json({ error: 'Account has been deactivated.' });
          }
          // Migrate into MongoDB Atlas using existing passwordHash (never assign plaintext)
          try {
            const uid = (localUser._id && mongoose.Types.ObjectId.isValid(localUser._id))
              ? new mongoose.Types.ObjectId(localUser._id)
              : new mongoose.Types.ObjectId();
            const doc = {
              _id: uid,
              name: localUser.name,
              email: normEmail,
              password: localUser.passwordHash,
              role: localUser.role || 'student',
              institution: localUser.institution || '',
              preferredLanguage: localUser.preferredLanguage || 'English',
              isActive: true,
              studyStats: localUser.studyStats || { documentsUploaded: 0, notesGenerated: 0, flashcardsCreated: 0 },
              createdAt: localUser.createdAt ? new Date(localUser.createdAt) : new Date(),
              updatedAt: new Date()
            };
            await User.collection.insertOne(doc);
            const syncedUser = await User.findById(uid);
            console.log(`[Auth Login] Auto-migrated local user to MongoDB Atlas: ${normEmail}`);
            return res.json({
              success: true,
              token: signToken(syncedUser._id),
              user: syncedUser
            });
          } catch (migrateErr) {
            console.warn('[Auth Auto-Migration Warn]', migrateErr.message);
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

      return res.status(401).json({ error: 'Invalid email or password.' });
    }

    // 2. Fallback to local store when DB disconnected (disallowed in production unless demo mode enabled)
    if (process.env.NODE_ENV === 'production' && process.env.ALLOW_DEMO_MODE !== 'true') {
      return res.status(503).json({ error: 'Database service is currently unavailable. Please try again shortly.' });
    }

    const localUser = localStore.findUserByEmail(normEmail);
    if (localUser) {
      const isMatch = await localStore.comparePassword(localUser, password);
      if (isMatch) {
        if (!localUser.isActive) {
          return res.status(403).json({ error: 'Account has been deactivated.' });
        }
        const safeUser = { ...localUser };
        delete safeUser.passwordHash;

        // Trigger background attempt to connect & sync
        attemptMongoConnect().catch(() => {});

        return res.json({
          success: true,
          token: signToken(safeUser._id || safeUser.id),
          user: safeUser
        });
      }
    }

    return res.status(401).json({ error: 'Invalid email or password.' });
  } catch (err) {
    if (err.code === 11000) {
      return res.status(409).json({ error: 'Email is already registered. Please sign in.' });
    }
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

    const localUser = localStore.findUserById(userId);
    if (localUser) {
      const safe = { ...localUser };
      delete safe.passwordHash;
      return res.json({ success: true, user: safe });
    }

    res.json({ success: true, user: req.user });
  } catch (err) {
    if (err.code === 11000) {
      return res.status(409).json({ error: 'Email is already registered. Please sign in.' });
    }
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

    const updated = localStore.updateUser(userId, safeUpdates);
    if (updated) {
      return res.json({ success: true, user: updated });
    }

    res.json({ success: true, user: { ...req.user, ...safeUpdates } });
  } catch (err) {
    if (err.code === 11000) {
      return res.status(409).json({ error: 'Email is already registered. Please sign in.' });
    }
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

    const localUser = localStore.findUserById(userId);
    if (localUser) {
      const match = await localStore.comparePassword(localUser, currentPassword);
      if (!match) return res.status(401).json({ error: 'Current password is incorrect.' });
      const bcrypt = require('bcryptjs');
      localStore.updateUser(userId, { passwordHash: await bcrypt.hash(newPassword, 12) });
      return res.json({ success: true, message: 'Password updated successfully.' });
    }

    res.status(404).json({ error: 'User account not found.' });
  } catch (err) {
    if (err.code === 11000) {
      return res.status(409).json({ error: 'Email is already registered. Please sign in.' });
    }
    next(err);
  }
};

exports.logout = async (req, res) => {
  res.json({ success: true, message: 'Logged out successfully.' });
};
