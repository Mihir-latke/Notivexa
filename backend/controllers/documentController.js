const fs = require('fs');
const { Document, User } = require('../models');
const { extractFromPDF } = require('../services/pdfEngine');
const { extractFromImage } = require('../services/aiService');
const { extractFromUrl } = require('../services/urlEngine');

exports.upload = async (req, res, next) => {
  try {
    if (!req.files?.length) return res.status(400).json({ error: 'No files uploaded.' });
    const results = [];
    for (const file of req.files) {
      const isImage = file.mimetype.startsWith('image/');
      const doc = await Document.create({
        user: req.user.id,
        title: req.body.title || file.originalname.replace(/\.[^/.]+$/, ''),
        originalName: file.originalname,
        fileType: isImage ? 'image' : 'pdf', 
        mimeType: file.mimetype,
        size: file.size, filePath: file.path,
        status: 'processing',
        subject: req.body.subject || 'General'
      });
      try {
        let ext;
        if (isImage) {
          ext = await extractFromImage(file.path, file.mimetype);
        } else {
          ext = await extractFromPDF(file.path);
        }
        doc.extractedText = ext.text;   // FULL text saved
        doc.sections      = ext.sections;
        doc.pageCount     = ext.pages;
        doc.wordCount     = ext.words;
        doc.status        = 'ready';
        await doc.save();
        console.log(`[Upload OK] "${doc.title}": ${ext.words} words, ${ext.pages} pages, ${ext.sections.length} sections`);
        results.push({ doc, ok: true });
      } catch(e) {
        console.error(`[Upload FAIL] ${file.originalname}:`, e.message);
        doc.status = 'error'; doc.errorMessage = e.message;
        await doc.save();
        results.push({ doc, ok: false, error: e.message });
      }
    }
    await User.findByIdAndUpdate(req.user.id, { $inc: { 'studyStats.documentsUploaded': req.files.length } });
    const ok = results.filter(r => r.ok).length;
    const err = results.filter(r => !r.ok);
    res.status(201).json({
      success: true,
      message: `${ok}/${results.length} PDF(s) processed successfully`,
      documents: results.map(r => r.doc),
      errors: err.map(e => ({ file: e.doc.originalName, error: e.error }))
    });
  } catch(e) { next(e); }
};

exports.importUrl = async (req, res, next) => {
  try {
    const { url, subject, title } = req.body;
    if (!url || typeof url !== 'string' || !url.trim()) {
      return res.status(400).json({ error: 'Please provide a valid URL.' });
    }

    const trimmedUrl = url.trim();
    console.log(`[Import URL] User ${req.user.id} requested: ${trimmedUrl}`);

    const doc = await Document.create({
      user: req.user.id,
      title: title?.trim() || 'Fetching link content...',
      originalName: trimmedUrl,
      fileType: 'url',
      filePath: trimmedUrl,
      size: 0,
      status: 'processing',
      subject: subject?.trim() || 'General'
    });

    try {
      const ext = await extractFromUrl(trimmedUrl, doc.subject);

      doc.title         = title?.trim() || ext.title || doc.title;
      doc.originalName  = ext.originalName || trimmedUrl;
      doc.fileType      = ext.fileType || 'url';
      doc.filePath      = ext.filePath || trimmedUrl;
      doc.size          = ext.size || 0;
      doc.extractedText = ext.text;
      doc.sections      = ext.sections;
      doc.pageCount     = ext.pages;
      doc.wordCount     = ext.words;
      doc.status        = 'ready';
      await doc.save();

      await User.findByIdAndUpdate(req.user.id, { $inc: { 'studyStats.documentsUploaded': 1 } });
      console.log(`[Import URL OK] "${doc.title}": ${ext.words} words, ${ext.pages} pages, ${ext.sections.length} sections`);

      res.status(201).json({
        success: true,
        message: 'Content successfully extracted from link!',
        document: doc
      });
    } catch(e) {
      console.error(`[Import URL FAIL] ${trimmedUrl}:`, e.message);
      doc.status = 'error';
      doc.errorMessage = e.message;
      await doc.save();
      return res.status(422).json({
        error: e.message,
        document: doc
      });
    }
  } catch(e) { next(e); }
};

exports.list = async (req, res, next) => {
  try {
    const { search, status } = req.query;
    const filter = { user: req.user.id };
    if (search) filter.title = { $regex: search, $options: 'i' };
    if (status) filter.status = status;
    const docs = await Document.find(filter).select('-extractedText').sort({ createdAt: -1 });
    res.json({ success:true, documents: docs });
  } catch(e) { next(e); }
};

exports.get = async (req, res, next) => {
  try {
    const doc = await Document.findOne({ _id: req.params.id, user: req.user.id });
    if (!doc) return res.status(404).json({ error: 'Document not found.' });
    res.json({ success:true, document: doc });
  } catch(e) { next(e); }
};

exports.remove = async (req, res, next) => {
  try {
    const doc = await Document.findOne({ _id: req.params.id, user: req.user.id });
    if (!doc) return res.status(404).json({ error: 'Not found.' });
    if (fs.existsSync(doc.filePath)) { try { fs.unlinkSync(doc.filePath); } catch {} }
    await doc.deleteOne();
    res.json({ success:true });
  } catch(e) { next(e); }
};

exports.stats = async (req, res, next) => {
  try {
    const [total, ready, processing, error] = await Promise.all([
      Document.countDocuments({ user: req.user.id }),
      Document.countDocuments({ user: req.user.id, status: 'ready' }),
      Document.countDocuments({ user: req.user.id, status: 'processing' }),
      Document.countDocuments({ user: req.user.id, status: 'error' })
    ]);
    const agg = await Document.aggregate([{ $match: { user: req.user._id } }, { $group: { _id: null, size: { $sum: '$size' } } }]);
    res.json({ success:true, stats: { total, ready, processing, error, totalSize: agg[0]?.size||0 } });
  } catch(e) { next(e); }
};