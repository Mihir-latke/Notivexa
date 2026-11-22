const mongoose = require('mongoose');
const bcrypt = require('bcryptjs');
const crypto = require('crypto');
const { User } = require('../models');
const localStore = require('../utils/localStore');
const { signToken, signMfaToken, verifyMfaToken } = require('../middleware/auth');
const { validatePasswordStrength } = require('../utils/passwordValidator');
const emailService = require('../services/emailService');
const { ensureDbState, attemptMongoConnect } = require('../utils/dbSync');

function generateOtp() {
  return crypto.randomInt(100000, 999999).toString();
}

function hashOtp(otp) {
  return crypto.createHash('sha256').update(String(otp).trim()).digest('hex');
}

function maskEmail(email) {
  if (!email || !email.includes('@')) return email;
  const [local, domain] = email.split('@');
  if (local.length <= 2) return `${local[0]}***@${domain}`;
  return `${local[0]}${'*'.repeat(local.length - 2)}${local[local.length - 1]}@${domain}`;
}

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

    if (typeof email !== 'string') return res.status(400).json({ error: 'Please provide a valid email address.' });
    const normEmail = email.toLowerCase().trim();
    if (!EMAIL_REGEX.test(normEmail) || normEmail.length > 255) {
      return res.status(400).json({ error: 'Please provide a valid email address.' });
    }

    if (typeof password !== 'string' || password.length < 6 || password.length > 128) {
      return res.status(400).json({ error: 'Password must be at least 6 characters long.' });
    }

    const pwCheck = validatePasswordStrength(password);
    if (!pwCheck.valid) {
      return res.status(400).json({ error: pwCheck.message });
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
        isActive: true,
        mfaEnabled: false
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
    await ensureDbState(4000);

    const { email, password } = req.body;
    if (!email || !password) {
      return res.status(400).json({ error: 'Email and password are required.' });
    }
    if (typeof email !== 'string') return res.status(400).json({ error: 'Please provide a valid email address.' });

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

          if (user.mfaEnabled) {
            const otp = generateOtp();
            const otpHash = hashOtp(otp);
            user.mfaOtp = otpHash;
            user.mfaOtpExpires = new Date(Date.now() + 5 * 60 * 1000);
            await user.save();

            const emailRes = await emailService.sendMfaOtp(normEmail, user.name, otp);
            if (!emailRes.success && process.env.NODE_ENV !== 'test') {
              return res.status(500).json({ error: emailRes.error || 'Failed to send two-factor verification code.' });
            }

            const tempToken = signMfaToken(user._id);
            return res.json({
              success: true,
              mfaRequired: true,
              tempToken,
              email: maskEmail(normEmail),
              message: 'Two-factor authentication code sent to your email.'
            });
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
              mfaEnabled: Boolean(localUser.mfaEnabled),
              studyStats: localUser.studyStats || { documentsUploaded: 0, notesGenerated: 0, flashcardsCreated: 0 },
              createdAt: localUser.createdAt ? new Date(localUser.createdAt) : new Date(),
              updatedAt: new Date()
            };
            await User.collection.insertOne(doc);
            const syncedUser = await User.findById(uid);
            console.log(`[Auth Login] Auto-migrated local user to MongoDB Atlas: ${normEmail}`);

            if (syncedUser.mfaEnabled) {
              const otp = generateOtp();
              const otpHash = hashOtp(otp);
              syncedUser.mfaOtp = otpHash;
              syncedUser.mfaOtpExpires = new Date(Date.now() + 5 * 60 * 1000);
              await syncedUser.save();

              const emailRes = await emailService.sendMfaOtp(normEmail, syncedUser.name, otp);
              if (!emailRes.success && process.env.NODE_ENV !== 'test') {
                return res.status(500).json({ error: emailRes.error || 'Failed to send two-factor verification code.' });
              }

              const tempToken = signMfaToken(syncedUser._id);
              return res.json({
                success: true,
                mfaRequired: true,
                tempToken,
                email: maskEmail(normEmail),
                message: 'Two-factor authentication code sent to your email.'
              });
            }

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

          if (localUser.mfaEnabled) {
            const otp = generateOtp();
            const otpHash = hashOtp(otp);
            localStore.setMfaOtp(localUser._id || localUser.id, otpHash, new Date(Date.now() + 5 * 60 * 1000));
            const emailRes = await emailService.sendMfaOtp(normEmail, localUser.name, otp);
            if (!emailRes.success && process.env.NODE_ENV !== 'test') {
              return res.status(500).json({ error: emailRes.error || 'Failed to send two-factor verification code.' });
            }

            const tempToken = signMfaToken(localUser._id || localUser.id);
            return res.json({
              success: true,
              mfaRequired: true,
              tempToken,
              email: maskEmail(normEmail),
              message: 'Two-factor authentication code sent to your email.'
            });
          }

          return res.json({
            success: true,
            token: signToken(safeUser._id || safeUser.id),
            user: safeUser
          });
        }
      }

      return res.status(401).json({ error: 'Invalid email or password.' });
    }

    // 2. Fallback to local store when DB disconnected
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

        if (localUser.mfaEnabled) {
          const otp = generateOtp();
          const otpHash = hashOtp(otp);
          localStore.setMfaOtp(localUser._id || localUser.id, otpHash, new Date(Date.now() + 5 * 60 * 1000));
          const emailRes = await emailService.sendMfaOtp(normEmail, localUser.name, otp);
          if (!emailRes.success && process.env.NODE_ENV !== 'test') {
            return res.status(500).json({ error: emailRes.error || 'Failed to send two-factor verification code.' });
          }

          const tempToken = signMfaToken(localUser._id || localUser.id);
          return res.json({
            success: true,
            mfaRequired: true,
            tempToken,
            email: maskEmail(normEmail),
            message: 'Two-factor authentication code sent to your email.'
          });
        }

        const safeUser = { ...localUser };
        delete safeUser.passwordHash;

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

exports.verifyMfa = async (req, res, next) => {
  try {
    await ensureDbState(4000);
    const { tempToken, otp } = req.body;
    if (!tempToken || !otp) {
      return res.status(400).json({ error: 'Session token and 6-digit verification code are required.' });
    }

    const decoded = verifyMfaToken(tempToken);
    if (!decoded || !decoded.id) {
      return res.status(401).json({ error: 'Verification session expired or invalid. Please sign in again.' });
    }

    const userId = decoded.id;
    const otpHash = hashOtp(otp);
    const now = new Date();

    if (isDbConnected() && mongoose.Types.ObjectId.isValid(userId)) {
      const user = await User.findById(userId).select('+mfaOtp +mfaOtpExpires');
      if (user) {
        if (!user.mfaOtp || !user.mfaOtpExpires || user.mfaOtpExpires < now || user.mfaOtp !== otpHash) {
          return res.status(400).json({ error: 'Invalid or expired verification code.' });
        }

        user.mfaOtp = undefined;
        user.mfaOtpExpires = undefined;
        await user.save();

        return res.json({
          success: true,
          token: signToken(user._id),
          user
        });
      }
    }

    const localUser = localStore.findUserById(userId);
    if (localUser) {
      if (!localUser.mfaOtp || !localUser.mfaOtpExpires || new Date(localUser.mfaOtpExpires) < now || localUser.mfaOtp !== otpHash) {
        return res.status(400).json({ error: 'Invalid or expired verification code.' });
      }

      delete localUser.mfaOtp;
      delete localUser.mfaOtpExpires;
      const safe = { ...localUser };
      delete safe.passwordHash;

      return res.json({
        success: true,
        token: signToken(safe._id || safe.id),
        user: safe
      });
    }

    return res.status(404).json({ error: 'User account not found.' });
  } catch (err) {
    next(err);
  }
};

exports.resendMfaOtp = async (req, res, next) => {
  try {
    await ensureDbState(4000);
    const { tempToken } = req.body;
    if (!tempToken) {
      return res.status(400).json({ error: 'Session token is required.' });
    }

    const decoded = verifyMfaToken(tempToken);
    if (!decoded || !decoded.id) {
      return res.status(401).json({ error: 'Verification session expired. Please sign in again.' });
    }

    const userId = decoded.id;
    const otp = generateOtp();
    const otpHash = hashOtp(otp);
    const expiresAt = new Date(Date.now() + 5 * 60 * 1000);

    if (isDbConnected() && mongoose.Types.ObjectId.isValid(userId)) {
      const user = await User.findById(userId);
      if (user) {
        user.mfaOtp = otpHash;
        user.mfaOtpExpires = expiresAt;
        await user.save();

        const emailRes = await emailService.sendMfaOtp(user.email, user.name, otp);
        if (!emailRes.success && process.env.NODE_ENV !== 'test') {
          return res.status(500).json({ error: emailRes.error || 'Failed to resend verification code.' });
        }

        const newTempToken = signMfaToken(user._id);
        return res.json({
          success: true,
          tempToken: newTempToken,
          email: maskEmail(user.email),
          message: 'A new verification code has been sent to your email.'
        });
      }
    }

    const localUser = localStore.findUserById(userId);
    if (localUser) {
      localStore.setMfaOtp(userId, otpHash, expiresAt);
      const emailRes = await emailService.sendMfaOtp(localUser.email, localUser.name, otp);
      if (!emailRes.success && process.env.NODE_ENV !== 'test') {
        return res.status(500).json({ error: emailRes.error || 'Failed to resend verification code.' });
      }

      const newTempToken = signMfaToken(userId);
      return res.json({
        success: true,
        tempToken: newTempToken,
        email: maskEmail(localUser.email),
        message: 'A new verification code has been sent to your email.'
      });
    }

    return res.status(404).json({ error: 'User account not found.' });
  } catch (err) {
    next(err);
  }
};

exports.forgotPassword = async (req, res, next) => {
  try {
    await ensureDbState(4000);
    const { email } = req.body;
    if (!email || typeof email !== 'string') {
      return res.status(400).json({ error: 'Please enter a valid email address.' });
    }

    const normEmail = email.toLowerCase().trim();
    if (!EMAIL_REGEX.test(normEmail)) {
      return res.status(400).json({ error: 'Please enter a valid email address.' });
    }

    const otp = generateOtp();
    const otpHash = hashOtp(otp);
    const expiresAt = new Date(Date.now() + 10 * 60 * 1000); // 10 minutes

    let userFound = false;
    let emailResult = null;

    if (isDbConnected()) {
      const user = await User.findOne({ email: normEmail });
      if (user) {
        userFound = true;
        user.resetPasswordOtp = otpHash;
        user.resetPasswordExpires = expiresAt;
        user.resetPasswordAttempts = 0;
        await user.save();
        emailResult = await emailService.sendPasswordResetOtp(normEmail, user.name, otp);
      }
    }

    if (!userFound) {
      const localUser = localStore.findUserByEmail(normEmail);
      if (localUser) {
        userFound = true;
        localStore.setResetPasswordOtp(normEmail, otpHash, expiresAt);
        emailResult = await emailService.sendPasswordResetOtp(normEmail, localUser.name, otp);
      }
    }

    // If account was found and email sending failed, return the exact error
    if (userFound && emailResult && !emailResult.success && process.env.NODE_ENV !== 'test') {
      return res.status(500).json({
        error: emailResult.error || 'Failed to send verification email to your inbox.'
      });
    }

    return res.json({
      success: true,
      email: maskEmail(normEmail),
      message: 'Verification code sent to your email inbox.'
    });
  } catch (err) {
    next(err);
  }
};

exports.verifyResetOtp = async (req, res, next) => {
  try {
    await ensureDbState(4000);
    const { email, otp } = req.body;
    if (!email || !otp) {
      return res.status(400).json({ error: 'Email and 6-digit verification code are required.' });
    }

    const normEmail = email.toLowerCase().trim();
    const otpHash = hashOtp(otp);
    const now = new Date();

    if (isDbConnected()) {
      const user = await User.findOne({ email: normEmail }).select('+resetPasswordOtp +resetPasswordExpires');
      if (user) {
        if (!user.resetPasswordOtp || !user.resetPasswordExpires || user.resetPasswordExpires < now || user.resetPasswordOtp !== otpHash) {
          return res.status(400).json({ error: 'Invalid or expired verification code.' });
        }
        return res.json({ success: true, message: 'Verification code verified successfully.' });
      }
    }

    const localUser = localStore.findUserByEmail(normEmail);
    if (localUser) {
      if (!localUser.resetPasswordOtp || !localUser.resetPasswordExpires || new Date(localUser.resetPasswordExpires) < now || localUser.resetPasswordOtp !== otpHash) {
        return res.status(400).json({ error: 'Invalid or expired verification code.' });
      }
      return res.json({ success: true, message: 'Verification code verified successfully.' });
    }

    return res.status(400).json({ error: 'Invalid or expired verification code.' });
  } catch (err) {
    next(err);
  }
};

exports.resetPassword = async (req, res, next) => {
  try {
    await ensureDbState(4000);
    const { email, otp, newPassword } = req.body;
    if (!email || !otp || !newPassword) {
      return res.status(400).json({ error: 'Email, verification code, and new password are required.' });
    }

    const pwCheck = validatePasswordStrength(newPassword);
    if (!pwCheck.valid) {
      return res.status(400).json({ error: pwCheck.message });
    }

    const normEmail = email.toLowerCase().trim();
    const otpHash = hashOtp(otp);
    const now = new Date();
    let updated = false;

    if (isDbConnected()) {
      const user = await User.findOne({ email: normEmail }).select('+password +resetPasswordOtp +resetPasswordExpires');
      if (user) {
        if (!user.resetPasswordOtp || !user.resetPasswordExpires || user.resetPasswordExpires < now || user.resetPasswordOtp !== otpHash) {
          return res.status(400).json({ error: 'Invalid or expired verification code.' });
        }

        user.password = newPassword;
        user.resetPasswordOtp = undefined;
        user.resetPasswordExpires = undefined;
        user.resetPasswordAttempts = 0;
        await user.save();
        updated = true;

        // Also update localStore if cached there
        const localUser = localStore.findUserByEmail(normEmail);
        if (localUser) {
          const hash = await bcrypt.hash(newPassword, 12);
          localStore.setUserPassword(localUser._id || localUser.id, hash);
        }
      }
    }

    if (!updated) {
      const localUser = localStore.findUserByEmail(normEmail);
      if (localUser) {
        if (!localUser.resetPasswordOtp || !localUser.resetPasswordExpires || new Date(localUser.resetPasswordExpires) < now || localUser.resetPasswordOtp !== otpHash) {
          return res.status(400).json({ error: 'Invalid or expired verification code.' });
        }

        const hash = await bcrypt.hash(newPassword, 12);
        localStore.setUserPassword(localUser._id || localUser.id, hash);
        updated = true;
      }
    }

    if (!updated) {
      return res.status(400).json({ error: 'Unable to reset password. Please request a new verification code.' });
    }

    return res.json({
      success: true,
      message: 'Password reset successful! You may now sign in with your new password.'
    });
  } catch (err) {
    next(err);
  }
};

exports.toggleMfa = async (req, res, next) => {
  try {
    await ensureDbState(4000);
    const userId = req.user?.id || req.user?._id;
    const { enabled } = req.body;
    const isEnabled = Boolean(enabled);

    if (isDbConnected() && mongoose.Types.ObjectId.isValid(userId)) {
      const user = await User.findById(userId);
      if (user) {
        user.mfaEnabled = isEnabled;
        user.mfaOtp = undefined;
        user.mfaOtpExpires = undefined;
        await user.save();

        localStore.toggleMfa(userId, isEnabled);

        return res.json({
          success: true,
          mfaEnabled: user.mfaEnabled,
          message: isEnabled ? 'Two-Factor Authentication has been enabled.' : 'Two-Factor Authentication has been disabled.'
        });
      }
    }

    const updated = localStore.toggleMfa(userId, isEnabled);
    if (updated) {
      return res.json({
        success: true,
        mfaEnabled: updated.mfaEnabled,
        message: isEnabled ? 'Two-Factor Authentication has been enabled.' : 'Two-Factor Authentication has been disabled.'
      });
    }

    return res.status(404).json({ error: 'User account not found.' });
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
    const { name, institution, preferredLanguage, defaultOutputLanguage } = req.body;
    const safeUpdates = {};
    if (name && typeof name === 'string') safeUpdates.name = name.trim();
    if (institution !== undefined) safeUpdates.institution = typeof institution === 'string' ? institution.trim() : '';
    if (preferredLanguage && typeof preferredLanguage === 'string') safeUpdates.preferredLanguage = preferredLanguage.trim();
    if (defaultOutputLanguage && typeof defaultOutputLanguage === 'string') safeUpdates.defaultOutputLanguage = defaultOutputLanguage.trim();

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
    if (!newPassword || typeof newPassword !== 'string') {
      return res.status(400).json({ error: 'New password is required.' });
    }

    const pwCheck = validatePasswordStrength(newPassword);
    if (!pwCheck.valid) {
      return res.status(400).json({ error: pwCheck.message });
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
      localStore.setUserPassword(userId, await bcrypt.hash(newPassword, 12));
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
