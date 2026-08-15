const fs = require('fs');
const path = require('path');
const { Document, User } = require('../models');
const { extractFromPDF } = require('../services/pdfEngine');
const { analyzeImage } = require('../services/aiService');

exports.upload = async (req, res, next) => {
  try {
    if (!req.files?.length) return res.status(400).json({ error: 'No files uploaded.' });
    const results = [];
    for (const file of req.files) {
      const isPDF = file.mimetype === 'application/pdf';
      const isImage = file.mimetype.startsWith('image/');
      const doc = await Document.create({
        user: req.user.id,
        title: req.body.title || file.originalname.replace(/\.[^/.]+$/, ''),
        originalName: file.originalname,
        fileType: isImage ? 'image' : 'pdf',
        size: file.size, filePath: file.path,
        status: 'processing',
        subject: req.body.subject || 'General'
      });

      try {
        if (isPDF) {
          const ext = await extractFromPDF(file.path);
          doc.extractedText = ext.text;
          doc.sections      = ext.sections;
          doc.pageCount     = ext.pages;
          doc.wordCount     = ext.words;
          doc.status        = 'ready';
          console.log(`[PDF ✅] "${doc.title}" ${ext.words} words, ${ext.pages} pages`);
        } else if (isImage) {
          // Convert image to base64 for AI analysis
          const imageData = fs.readFileSync(file.path);
          const base64 = imageData.toString('base64');
          const analysis = await analyzeImage(base64, file.mimetype);
          doc.imageAnalysis = analysis;
          doc.extractedText = analysis; // Use analysis as extracted text for generation
          doc.wordCount = analysis.split(/\s+/).length;
          doc.status = 'ready';
          console.log(`[Image ✅] "${doc.title}" analyzed, ${doc.wordCount} words extracted`);
        }
        await doc.save();
        results.push({ doc, ok: true });
      } catch(e) {
        console.error(`[Upload ❌] ${file.originalname}:`, e.message);
        doc.status = 'error'; doc.errorMessage = e.message;
        await doc.save();
        results.push({ doc, ok: false, error: e.message });
      }
    }
    await User.findByIdAndUpdate(req.user.id, { $inc: { 'studyStats.documentsUploaded': req.files.length } });
    const ok = results.filter(r => r.ok).length;
    res.status(201).json({
      success: true,
      message: `${ok}/${results.length} file(s) processed`,
      documents: results.map(r => r.doc),
      errors: results.filter(r => !r.ok).map(r => ({ file: r.doc.originalName, error: r.error }))
    });
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
    if (!doc) return res.status(404).json({ error: 'Not found.' });
    res.json({ success:true, document: doc });
  } catch(e) { next(e); }
};

exports.remove = async (req, res, next) => {
  try {
    const doc = await Document.findOne({ _id: req.params.id, user: req.user.id });
    if (!doc) return res.status(404).json({ error: 'Not found.' });
    if (fs.existsSync(doc.filePath)) try { fs.unlinkSync(doc.filePath); } catch {}
    await doc.deleteOne();
    res.json({ success:true });
  } catch(e) { next(e); }
};

exports.stats = async (req, res, next) => {
  try {
    const [total, ready, proc, err] = await Promise.all([
      Document.countDocuments({ user: req.user.id }),
      Document.countDocuments({ user: req.user.id, status:'ready' }),
      Document.countDocuments({ user: req.user.id, status:'processing' }),
      Document.countDocuments({ user: req.user.id, status:'error' })
    ]);
    res.json({ success:true, stats: { total, ready, processing:proc, error:err } });
  } catch(e) { next(e); }
};
