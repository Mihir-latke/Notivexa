const fs = require('fs');
const mongoose = require('mongoose');
const { Document, User } = require('../models');
const { extractFromPDF } = require('../services/pdfEngine');
const { extractFromImage } = require('../services/aiService');
const { extractFromUrl } = require('../services/urlEngine');
const { extractDocumentText } = require('../services/ocr/textExtractionService');
const localStore = require('../utils/localStore');
const { extractImagesFromPDF } = require('../services/pdfImageExtractor');

const isDbConnected = () => mongoose.connection.readyState === 1;

// Built-in sample documents for demo mode and initial preview
const SAMPLE_DEMO_DOCS = [
  {
    _id: '6acd1272c42773e489b74e48',
    id: '6acd1272c42773e489b74e48',
    isDemo: true,
    title: 'Java Database Connectivity (JDBC) & Architecture',
    originalName: 'JDBC_Architecture_Guide.pdf',
    fileType: 'pdf',
    size: 245800,
    filePath: 'uploads/pdfs/sample.pdf',
    status: 'ready',
    subject: 'Computer Science',
    pageCount: 12,
    wordCount: 3840,
    createdAt: new Date().toISOString(),
    sections: [
      {
        title: 'Introduction to JDBC Architecture',
        content: 'Java Database Connectivity (JDBC) is a Java API that manages connecting to a database, issuing SQL queries and commands, and handling result sets obtained from the database. Released as part of JDK 1.1 in 1997, JDBC was one of the earliest components of Java Enterprise Edition. The architecture comprises two layers: the JDBC API and the JDBC Driver API. The JDBC API provides application-to-JDBC Manager connection, while the Driver API provides JDBC Manager-to-Driver connection.',
        wordCount: 78
      },
      {
        title: 'JDBC Drivers and Types',
        content: 'There are four distinct types of JDBC Drivers:\nType 1: JDBC-ODBC Bridge Driver (Translates JDBC calls into ODBC calls).\nType 2: Native-API Driver (Partly Java Driver that converts JDBC calls into native database C/C++ API calls).\nType 3: Network-Protocol Driver (Pure Java driver for database middleware).\nType 4: Thin Driver (Direct-to-Database Pure Java Driver that converts JDBC calls directly into vendor-specific network protocol). Type 4 is most commonly used in modern enterprise production systems.',
        wordCount: 76
      },
      {
        title: 'Connection, Statements and ResultSets',
        content: 'The core workflow involves loading the driver class with Class.forName(), obtaining a connection via DriverManager.getConnection(url, username, password), creating a Statement or PreparedStatement, executing queries with executeQuery() or executeUpdate(), and iterating over ResultSet objects. PreparedStatement provides precompiled SQL queries and protection against SQL Injection attacks.',
        wordCount: 52
      },
      {
        title: 'Transaction Management & ACID Properties',
        content: 'JDBC supports transaction management through Connection methods. By default, auto-commit is enabled (setAutoCommit(true)). To group operations into an atomic transaction, setAutoCommit(false) is called, followed by executeUpdate() calls, and finally connection.commit() or connection.rollback() inside an exception catch block to preserve Atomicity, Consistency, Isolation, and Durability.',
        wordCount: 55
      }
    ],
    extractedText: 'Java Database Connectivity (JDBC) is a Java-based data access technology that provides a uniform interface to relational databases. It consists of JDBC API and JDBC Driver API. Four types of drivers exist: Type 1 JDBC-ODBC bridge, Type 2 Native API, Type 3 Network Protocol, and Type 4 100% Pure Java Thin Driver. Connecting requires loading the driver, DriverManager.getConnection, creating Statement or PreparedStatement, executing queries, and processing ResultSets. Proper transaction management uses setAutoCommit(false), commit(), and rollback() to ensure ACID compliance.',
    outputs: []
  }
];

exports.SAMPLE_DEMO_DOCS = SAMPLE_DEMO_DOCS;

exports.upload = async (req, res, next) => {
  try {
    if (!req.files?.length) {
      return res.status(400).json({ error: 'No files uploaded. Please select at least one PDF or image.' });
    }

    const userId = req.user?.id || req.user?._id;

    // 1. Fallback when MongoDB is not connected
    if (!isDbConnected()) {
      const results = [];
      for (const file of req.files) {
        const isImage = file.mimetype.startsWith('image/');
        const docTitle = req.body.title || file.originalname.replace(/\.[^/.]+$/, '');
        const subject = req.body.subject || 'General';

        try {
          const ext = await extractDocumentText(file.path, file.mimetype);

          const doc = localStore.createDoc({
            user: userId,
            title: docTitle,
            originalName: file.originalname,
            fileType: isImage ? 'image' : 'pdf',
            mimeType: file.mimetype,
            size: file.size,
            filePath: file.path,
            subject,
            extractedText: ext.text,
            sections: ext.sections,
            pageCount: ext.pages,
            wordCount: ext.words,
            contentHash: ext.contentHash,
            extractionMethod: ext.extractionMethod,
            ocrConfidence: ext.ocrConfidence,
            pageResults: ext.pageResults,
            status: ext.status || 'ready',
            imagePaths: []
          });

          if (!isImage) {
            const docId = (doc._id || doc.id).toString();
            extractImagesFromPDF(file.path, docId).then(imgs => {
              if (imgs.length > 0) {
                const relPaths = imgs.map(i => `uploads/images/extracted/${docId}/${i.fileName}`);
                localStore.updateDoc(docId, { imagePaths: relPaths }, userId);
              }
            }).catch(e => console.warn('[ImgExtract] Background extraction failed:', e.message));
          }

          results.push({ doc, ok: true });
        } catch (e) {
          console.error(`[Upload Local FAIL] ${file.originalname}:`, e.message);
          const doc = localStore.createDoc({
            user: userId,
            title: docTitle,
            originalName: file.originalname,
            fileType: isImage ? 'image' : 'pdf',
            mimeType: file.mimetype,
            size: file.size,
            filePath: file.path,
            subject,
            status: 'error',
            errorMessage: e.message
          });
          results.push({ doc, ok: false, error: e.message });
        }
      }

      const user = localStore.findUserById(userId);
      if (user) {
        user.studyStats = user.studyStats || {};
        user.studyStats.documentsUploaded = (user.studyStats.documentsUploaded || 0) + req.files.length;
        localStore.updateUser(userId, { studyStats: user.studyStats });
      }

      const ok = results.filter(r => r.ok).length;
      const err = results.filter(r => !r.ok);
      return res.status(201).json({
        success: true,
        message: `${ok}/${results.length} file(s) processed successfully`,
        documents: results.map(r => r.doc),
        errors: err.map(e => ({ file: e.doc.originalName, error: e.error }))
      });
    }

    // 2. Connected MongoDB
    const results = [];
    for (const file of req.files) {
      const isImage = file.mimetype.startsWith('image/');
      const doc = await Document.create({
        user: userId,
        title: req.body.title || file.originalname.replace(/\.[^/.]+$/, ''),
        originalName: file.originalname,
        fileType: isImage ? 'image' : 'pdf',
        mimeType: file.mimetype,
        size: file.size,
        filePath: file.path,
        status: 'processing',
        subject: req.body.subject || 'General'
      });

      try {
        const ext = await extractDocumentText(file.path, file.mimetype);
        doc.extractedText    = ext.text;
        doc.sections         = ext.sections;
        doc.pageCount        = ext.pages;
        doc.wordCount        = ext.words;
        doc.contentHash      = ext.contentHash;
        doc.extractionMethod = ext.extractionMethod;
        doc.ocrConfidence    = ext.ocrConfidence;
        doc.pageResults      = ext.pageResults;
        doc.status           = ext.status || 'ready';
        await doc.save();

        if (!isImage) {
          const docId = doc._id.toString();
          extractImagesFromPDF(file.path, docId).then(async imgs => {
            if (imgs.length > 0) {
              const relPaths = imgs.map(i => `uploads/images/extracted/${docId}/${i.fileName}`);
              try {
                await Document.findByIdAndUpdate(doc._id, { imagePaths: relPaths });
              } catch (e) {
                console.warn('[ImgExtract] DB update failed:', e.message);
              }
            }
          }).catch(e => console.warn('[ImgExtract] Background extraction failed:', e.message));
        }

        results.push({ doc, ok: true });
      } catch (e) {
        console.error(`[Upload FAIL] ${file.originalname}:`, e.message);
        doc.status = 'error';
        doc.errorMessage = e.message;
        await doc.save();
        results.push({ doc, ok: false, error: e.message });
      }
    }

    await User.findByIdAndUpdate(userId, { $inc: { 'studyStats.documentsUploaded': req.files.length } });
    const ok = results.filter(r => r.ok).length;
    const err = results.filter(r => !r.ok);
    return res.status(201).json({
      success: true,
      message: `${ok}/${results.length} PDF(s) processed successfully`,
      documents: results.map(r => r.doc),
      errors: err.map(e => ({ file: e.doc.originalName, error: e.error }))
    });
  } catch (e) {
    next(e);
  }
};

exports.importUrl = async (req, res, next) => {
  try {
    const { url, subject, title } = req.body;
    if (!url || typeof url !== 'string' || !url.trim()) {
      return res.status(400).json({ error: 'Please provide a valid URL.' });
    }

    const userId = req.user?.id || req.user?._id;
    const trimmedUrl = url.trim();

    if (!isDbConnected()) {
      try {
        const ext = await extractFromUrl(trimmedUrl, subject?.trim() || 'General');
        const doc = localStore.createDoc({
          user: userId,
          title: title?.trim() || ext.title || 'Web Link',
          originalName: ext.originalName || trimmedUrl,
          fileType: ext.fileType || 'url',
          filePath: ext.filePath || trimmedUrl,
          size: ext.size || 0,
          status: 'ready',
          subject: subject?.trim() || 'General',
          extractedText: ext.text,
          sections: ext.sections,
          pageCount: ext.pages,
          wordCount: ext.words
        });

        const user = localStore.findUserById(userId);
        if (user) {
          user.studyStats = user.studyStats || {};
          user.studyStats.documentsUploaded = (user.studyStats.documentsUploaded || 0) + 1;
          localStore.updateUser(userId, { studyStats: user.studyStats });
        }

        return res.status(201).json({
          success: true,
          message: 'Content successfully extracted from link!',
          document: doc
        });
      } catch (e) {
        return res.status(422).json({ error: e.message });
      }
    }

    const doc = await Document.create({
      user: userId,
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

      await User.findByIdAndUpdate(userId, { $inc: { 'studyStats.documentsUploaded': 1 } });
      res.status(201).json({
        success: true,
        message: 'Content successfully extracted from link!',
        document: doc
      });
    } catch (e) {
      doc.status = 'error';
      doc.errorMessage = e.message;
      await doc.save();
      return res.status(422).json({ error: e.message, document: doc });
    }
  } catch (e) {
    next(e);
  }
};

exports.list = async (req, res, next) => {
  try {
    const { search, status } = req.query;
    const userId = req.user?.id || req.user?._id;
    let docs = [];

    if (isDbConnected()) {
      try {
        const filter = { user: userId };
        if (search) filter.title = { $regex: search, $options: 'i' };
        if (status) filter.status = status;
        docs = await Document.find(filter)
          .select('title originalName fileType size status subject createdAt outputs wordCount pageCount imagePaths')
          .sort({ createdAt: -1 })
          .lean();
      } catch (err) {
        console.warn('[DocList DB Error]', err.message);
      }
    }

    // Merge localStore documents strictly owned by userId
    let localDocs = localStore.getDocsByUser(userId);
    if (search) localDocs = localDocs.filter(d => (d.title || '').toLowerCase().includes(search.toLowerCase()));
    if (status) localDocs = localDocs.filter(d => d.status === status);

    const existingIds = new Set(docs.map(d => (d._id || d.id).toString()));
    for (const ld of localDocs) {
      const idStr = (ld._id || ld.id).toString();
      if (!existingIds.has(idStr)) {
        docs.push(ld);
        existingIds.add(idStr);
      }
    }

    // Only present demo doc preview if the user has no documents of their own
    if (docs.length === 0 && SAMPLE_DEMO_DOCS?.length > 0) {
      return res.json({ success: true, documents: SAMPLE_DEMO_DOCS });
    }

    // Sanitize document list response: omit heavy extracted text and base64 diagram blobs
    const cleanDocs = docs.map(d => {
      const obj = typeof d.toObject === 'function' ? d.toObject() : { ...d };
      delete obj.extractedText;
      delete obj.sections;
      if (Array.isArray(obj.diagrams)) {
        obj.diagrams = obj.diagrams.map(diag => ({ page: diag.page, fileName: diag.fileName }));
      }
      return obj;
    });

    res.json({ success: true, documents: cleanDocs });
  } catch (e) {
    next(e);
  }
};

exports.get = async (req, res, next) => {
  try {
    const docId = req.params.id;
    const userId = req.user?.id || req.user?._id;
    let doc = null;

    // 1. Check MongoDB with strict multi-tenant ownership check
    if (isDbConnected()) {
      try {
        if (mongoose.Types.ObjectId.isValid(docId)) {
          doc = await Document.findOne({ _id: docId, user: userId });
        }
      } catch (err) {
        console.warn('[DocGet DB Error]', err.message);
      }
    }

    // 2. Check local store with strict user ownership check
    if (!doc) {
      doc = localStore.getDocById(docId, userId);
    }

    // 3. Check sample demo docs only if ID matches demo doc ID
    if (!doc && SAMPLE_DEMO_DOCS?.length > 0) {
      doc = SAMPLE_DEMO_DOCS.find(x => (x._id && x._id.toString() === docId.toString()) || x.id === docId);
    }

    if (!doc) {
      return res.status(404).json({ error: 'Document not found or access denied.' });
    }

    return res.json({ success: true, document: doc });
  } catch (e) {
    next(e);
  }
};

exports.remove = async (req, res, next) => {
  try {
    const docId = req.params.id;
    const userId = req.user?.id || req.user?._id;
    let doc = null;

    if (isDbConnected()) {
      try {
        if (mongoose.Types.ObjectId.isValid(docId)) {
          doc = await Document.findOne({ _id: docId, user: userId });
        }
      } catch (err) {
        console.warn('[DocRemove DB Error]', err.message);
      }
    }

    if (!doc) {
      const localDoc = localStore.getDocById(docId, userId);
      if (localDoc && localDoc.user && localDoc.user.toString() === userId.toString()) {
        if (localDoc.filePath && fs.existsSync(localDoc.filePath)) {
          try { fs.unlinkSync(localDoc.filePath); } catch {}
        }
        localStore.deleteDoc(docId, userId);
        return res.json({ success: true });
      }
    }

    if (!doc) {
      return res.status(404).json({ error: 'Document not found or access denied.' });
    }

    if (doc.filePath && fs.existsSync(doc.filePath)) {
      try { fs.unlinkSync(doc.filePath); } catch {}
    }
    await doc.deleteOne();
    return res.json({ success: true });
  } catch (e) {
    next(e);
  }
};

exports.stats = async (req, res, next) => {
  try {
    const userId = req.user?.id || req.user?._id;
    let total = 0;
    let ready = 0;
    let processing = 0;
    let error = 0;
    let totalSize = 0;

    const localDocs = localStore.getDocsByUser(userId);
    total += localDocs.length;
    ready += localDocs.filter(d => d.status === 'ready').length;
    processing += localDocs.filter(d => d.status === 'processing').length;
    error += localDocs.filter(d => d.status === 'error').length;
    totalSize += localDocs.reduce((acc, d) => acc + (d.size || 0), 0);

    if (isDbConnected()) {
      try {
        const [dbTotal, dbReady, dbProcessing, dbError] = await Promise.all([
          Document.countDocuments({ user: userId }),
          Document.countDocuments({ user: userId, status: 'ready' }),
          Document.countDocuments({ user: userId, status: 'processing' }),
          Document.countDocuments({ user: userId, status: 'error' })
        ]);
        total += dbTotal;
        ready += dbReady;
        processing += dbProcessing;
        error += dbError;
        if (mongoose.Types.ObjectId.isValid(userId)) {
          const agg = await Document.aggregate([
            { $match: { user: new mongoose.Types.ObjectId(userId) } },
            { $group: { _id: null, size: { $sum: '$size' } } }
          ]);
          totalSize += (agg[0]?.size || 0);
        }
      } catch (err) {
        console.warn('[DocStats DB Error]', err.message);
      }
    }

    res.json({ success: true, stats: { total, ready, processing, error, totalSize } });
  } catch (e) {
    next(e);
  }
};
