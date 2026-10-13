const r = require('express').Router();
const mongoose = require('mongoose');
const { Document } = require('../models');
const { authenticate } = require('../middleware/auth');
const { SAMPLE_DEMO_DOCS } = require('../controllers/documentController');

const isDbConnected = () => mongoose.connection.readyState === 1;

r.use(authenticate);

r.get('/', async (req, res, next) => {
  try {
    if (!isDbConnected()) {
      return res.json({ success: true, documents: SAMPLE_DEMO_DOCS });
    }
    const docs = await Document.find({ user: req.user.id })
      .select('title originalName fileType size status subject createdAt outputs wordCount pageCount')
      .sort({ createdAt: -1 });
    if (docs.length === 0) {
      return res.json({ success: true, documents: SAMPLE_DEMO_DOCS });
    }
    res.json({ success: true, documents: docs });
  } catch(e) { next(e); }
});

r.get('/outputs', async (req, res, next) => {
  try {
    if (!isDbConnected()) {
      return res.json({ success: true, outputs: [] });
    }
    const docs = await Document.find({ user: req.user.id, 'outputs.0': { $exists: true } }).select('title subject outputs');
    const out = [];
    docs.forEach(d => (d.outputs || []).forEach(o => out.push({
      documentId: d._id,
      documentTitle: d.title,
      subject: d.subject,
      ...(o.toObject ? o.toObject() : o)
    })));
    out.sort((a,b) => new Date(b.createdAt) - new Date(a.createdAt));
    res.json({ success: true, outputs: out.slice(0, 60) });
  } catch(e) { next(e); }
});

module.exports = r;