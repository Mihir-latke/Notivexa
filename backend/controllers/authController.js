const jwt = require('jsonwebtoken');
const { User } = require('../models');
const sign = id => jwt.sign({ id }, process.env.JWT_SECRET || 'notivexa_secret', { expiresIn: '7d' });
exports.register = async (req, res, next) => {
  try {
    const { name, email, password, role, institution } = req.body;
    if (!name||!email||!password) return res.status(400).json({ error: 'Name, email and password required.' });
    if (password.length < 6) return res.status(400).json({ error: 'Password must be at least 6 characters.' });
    if (await User.findOne({ email: email.toLowerCase() })) return res.status(409).json({ error: 'Email already registered.' });
    const user = await User.create({ name, email, password, role: role||'student', institution: institution||'' });
    res.status(201).json({ success:true, token:sign(user._id), user });
  } catch(e) { next(e); }
};
exports.login = async (req, res, next) => {
  try {
    const { email, password } = req.body;
    if (!email||!password) return res.status(400).json({ error: 'Email and password required.' });
    const user = await User.findOne({ email: email.toLowerCase() }).select('+password');
    if (!user || !(await user.comparePassword(password))) return res.status(401).json({ error: 'Invalid email or password.' });
    if (!user.isActive) return res.status(403).json({ error: 'Account deactivated.' });
    res.json({ success:true, token:sign(user._id), user });
  } catch(e) { next(e); }
};
exports.getProfile = async (req, res, next) => {
  try { res.json({ success:true, user: await User.findById(req.user.id) }); } catch(e) { next(e); }
};
exports.updateProfile = async (req, res, next) => {
  try {
    const { name, institution, preferredLanguage } = req.body;
    const user = await User.findByIdAndUpdate(req.user.id, { name, institution, preferredLanguage }, { new:true });
    res.json({ success:true, user });
  } catch(e) { next(e); }
};
exports.changePassword = async (req, res, next) => {
  try {
    const { currentPassword, newPassword } = req.body;
    if (!newPassword || newPassword.length < 6) return res.status(400).json({ error: 'New password must be ≥6 chars.' });
    const user = await User.findById(req.user.id).select('+password');
    if (!(await user.comparePassword(currentPassword))) return res.status(401).json({ error: 'Current password wrong.' });
    user.password = newPassword; await user.save();
    res.json({ success:true, message:'Password updated.' });
  } catch(e) { next(e); }
};