const path = require('path');
require('dotenv').config({ path: path.join(__dirname, '.env') });
const express = require('express');
const mongoose = require('mongoose');
const cors = require('cors');
const helmet = require('helmet');
const morgan = require('morgan');
const rateLimit = require('express-rate-limit');
const fs = require('fs');

const app = express();
app.set('trust proxy', 1);

// Ensure upload and local data directories exist
fs.mkdirSync(path.join(__dirname, 'data'), { recursive: true });
['pdfs','images','audio','video','generated'].forEach(d => {
  fs.mkdirSync(path.join(__dirname, 'uploads', d), { recursive: true });
});

// Resolve and enforce cryptographically secure JWT Secret
if (process.env.NODE_ENV === 'production') {
  if (!process.env.JWT_SECRET || process.env.JWT_SECRET === 'notivexa_secret' || process.env.JWT_SECRET.trim().length < 32) {
    console.error('FATAL: In production, process.env.JWT_SECRET must be set to a secure string of at least 32 characters.');
    process.exit(1);
  }
  const rawMongo = (process.env.MONGODB_URI || '').trim();
  if (
    !rawMongo ||
    rawMongo.includes('<db_password>') ||
    rawMongo.includes('<password>') ||
    rawMongo.includes('<username>') ||
    rawMongo.includes('YOUR_') ||
    rawMongo.includes('cluster0.xxxxx.mongodb.net') ||
    rawMongo.includes('cluster0.xxx.mongodb.net')
  ) {
    console.error('FATAL: In production, process.env.MONGODB_URI must be configured with a dedicated MongoDB Atlas connection string. Server startup aborted.');
    process.exit(1);
  }
} else {
  const DEV_JWT_FALLBACK = 'notivexa_dev_jwt_secret_key_minimum_32_characters_for_local_testing';
  if (!process.env.JWT_SECRET || process.env.JWT_SECRET.trim().length < 16) {
    process.env.JWT_SECRET = DEV_JWT_FALLBACK;
  }
}

// Security headers
app.use(helmet({ crossOriginResourcePolicy: { policy: 'cross-origin' } }));

const allowedOrigins = [
  'http://localhost:3000',
  'http://localhost:5173',
  'http://localhost:5000',
  'https://notivexa.com',
  'https://www.notivexa.com',
  'https://notivexa.onrender.com',
  process.env.FRONTEND_URL
].filter(Boolean);

app.use(cors({
  origin: (origin, callback) => {
    if (!origin) return callback(null, true);
    if (allowedOrigins.includes(origin)) return callback(null, true);
    // In local development or test mode, allow localhost/127.0.0.1
    if (process.env.NODE_ENV !== 'production' && /localhost|127\.0\.0\.1/.test(origin)) {
      return callback(null, true);
    }
    return callback(new Error('CORS blocked: Origin not authorized.'));
  },
  credentials: true,
  methods: ['GET','POST','PUT','DELETE','PATCH','OPTIONS'],
  allowedHeaders: ['Content-Type', 'Authorization']
}));

app.use(rateLimit({ windowMs: 15 * 60 * 1000, max: 500, message: { error: 'Too many requests.' } }));
app.use(morgan('dev'));
app.use(express.json({ limit: '50mb' }));
app.use(express.urlencoded({ extended: true, limit: '50mb' }));

// Helper to extract JWT token from Authorization header or ?token= query parameter
function getAuthTokenFromReq(req) {
  const authHeader = req.headers.authorization;
  if (authHeader && authHeader.startsWith('Bearer ')) {
    return authHeader.split(' ')[1];
  }
  if (req.query && req.query.token) {
    return req.query.token;
  }
  return null;
}

const { getJwtSecret } = require('./middleware/auth');
const jwt = require('jsonwebtoken');

function authenticateMediaRequest(req, res, next) {
  const token = getAuthTokenFromReq(req);
  if (!token) {
    return res.status(401).json({ error: 'Authentication required. No token provided.' });
  }
  try {
    const decoded = jwt.verify(token, getJwtSecret());
    if (!decoded || !decoded.id) {
      return res.status(401).json({ error: 'Invalid authentication token.' });
    }
    req.userId = decoded.id.toString();
    next();
  } catch (err) {
    if (err.name === 'TokenExpiredError') {
      return res.status(401).json({ error: 'Authentication session expired. Please sign in again.' });
    }
    return res.status(401).json({ error: 'Invalid authentication token.' });
  }
}

// Authenticated & authorized access to extracted diagrams/images with IDOR & path-traversal prevention
app.get('/uploads/images/extracted/:docId/:fileName', authenticateMediaRequest, async (req, res, next) => {
  const safeDocId = path.basename(req.params.docId);
  const safeFileName = path.basename(req.params.fileName);
  const uploadsDir = path.resolve(__dirname, 'uploads/images/extracted');
  const targetPath = path.resolve(uploadsDir, safeDocId, safeFileName);

  if (!targetPath.startsWith(uploadsDir)) {
    return res.status(400).json({ error: 'Invalid path parameter.' });
  }

  // Multi-tenant authorization check: user must own the document or document is public demo
  try {
    const { Document } = require('./models');
    const localStore = require('./utils/localStore');
    let doc = null;
    if (mongoose.connection.readyState === 1) {
      try { doc = await Document.findById(safeDocId).lean(); } catch {}
    }
    if (!doc) doc = localStore.getDocById(safeDocId);

    if (!doc) {
      return res.status(404).json({ error: 'Document image not found.' });
    }

    const docOwner = (doc.user?._id || doc.user || '').toString();
    if (docOwner !== req.userId && !doc.isDemo) {
      return res.status(403).json({ error: 'Access denied: You do not own this document.' });
    }

    if (fs.existsSync(targetPath)) {
      res.setHeader('X-Content-Type-Options', 'nosniff');
      res.setHeader('Cache-Control', 'private, no-transform, max-age=3600');
      return res.sendFile(targetPath);
    }

    if (Array.isArray(doc.diagrams)) {
      const match = doc.diagrams.find(d => d.fileName === safeFileName);
      if (match && match.base64) {
        fs.mkdirSync(path.dirname(targetPath), { recursive: true });
        fs.writeFileSync(targetPath, Buffer.from(match.base64, 'base64'));
        res.setHeader('X-Content-Type-Options', 'nosniff');
        res.setHeader('Cache-Control', 'private, no-transform, max-age=3600');
        return res.sendFile(targetPath);
      }
    }
  } catch (err) {
    console.warn('[Diagram Static Restore Error]', err.message);
  }
  return res.status(404).json({ error: 'Image file not found.' });
});

// Authenticated & authorized Range-Streaming for generated MP4 videos
app.get('/uploads/video/:filename', authenticateMediaRequest, async (req, res, next) => {
  const safeFileName = path.basename(req.params.filename);
  const uploadsDir = path.resolve(__dirname, 'uploads/video');
  const filePath = path.resolve(uploadsDir, safeFileName);

  if (!filePath.startsWith(uploadsDir) || !fs.existsSync(filePath)) {
    return res.status(404).json({ error: 'Video not found.' });
  }

  // Multi-tenant check: verify that user owns the document/output or VideoJob associated with this video
  try {
    const { Document, VideoJob } = require('./models');
    const localStore = require('./utils/localStore');
    let isOwner = false;

    if (mongoose.connection.readyState === 1) {
      const doc = await Document.findOne({
        user: req.userId,
        $or: [
          { 'outputs.fileName': safeFileName },
          { 'outputs.filePath': { $regex: safeFileName, $options: 'i' } }
        ]
      });
      if (doc) isOwner = true;

      if (!isOwner) {
        const job = await VideoJob.findOne({
          user: req.userId,
          $or: [
            { finalVideoUrl: { $regex: safeFileName, $options: 'i' } },
            { finalVideoPath: { $regex: safeFileName, $options: 'i' } },
            { 'clips.fileName': safeFileName }
          ]
        });
        if (job) isOwner = true;
      }
    }

    if (!isOwner) {
      const userDocs = localStore.getDocsByUser(req.userId);
      isOwner = userDocs.some(d => (d.outputs || []).some(o => o.fileName === safeFileName || (o.filePath && o.filePath.includes(safeFileName))));
    }

    if (!isOwner) {
      const userJobs = localStore.getVideoJobsByUser(req.userId);
      isOwner = userJobs.some(j => (j.finalVideoUrl && j.finalVideoUrl.includes(safeFileName)) || (j.finalVideoPath && j.finalVideoPath.includes(safeFileName)) || (j.clips || []).some(c => c.fileName === safeFileName));
    }

    // Allow public sample demo video if matching sample
    if (!isOwner && (safeFileName === 'sample_lecture.mp4' || safeFileName === 'teacher_stock.mp4')) {
      isOwner = true;
    }

    if (!isOwner) {
      return res.status(403).json({ error: 'Access denied: You do not own this video resource.' });
    }
  } catch (err) {
    console.warn('[Video Auth Error]', err.message);
    return res.status(500).json({ error: 'Authorization check failed.' });
  }

  res.sendFile(filePath, {
    acceptRanges: true,
    headers: {
      'Content-Type': 'video/mp4',
      'X-Content-Type-Options': 'nosniff',
      'Cache-Control': 'private, no-transform, max-age=3600'
    }
  }, (err) => {
    if (err && !res.headersSent) {
      if (err.code === 'ECONNRESET' || err.code === 'EPIPE') return;
      next(err);
    }
  });
});

// Authenticated & authorized access to generated audio and lecture podcasts
app.get('/uploads/audio/:filename', authenticateMediaRequest, async (req, res, next) => {
  const safeFileName = path.basename(req.params.filename);
  const uploadsDir = path.resolve(__dirname, 'uploads/audio');
  const filePath = path.resolve(uploadsDir, safeFileName);

  if (!filePath.startsWith(uploadsDir) || !fs.existsSync(filePath)) {
    return res.status(404).json({ error: 'Audio file not found.' });
  }

  try {
    const { Document, VideoJob } = require('./models');
    const localStore = require('./utils/localStore');
    let isOwner = false;

    if (mongoose.connection.readyState === 1) {
      const doc = await Document.findOne({
        user: req.userId,
        $or: [
          { 'outputs.fileName': safeFileName },
          { 'outputs.filePath': { $regex: safeFileName, $options: 'i' } }
        ]
      });
      if (doc) isOwner = true;

      if (!isOwner) {
        const job = await VideoJob.findOne({
          user: req.userId,
          $or: [
            { audioUrl: { $regex: safeFileName, $options: 'i' } },
            { finalVideoPath: { $regex: safeFileName, $options: 'i' } }
          ]
        });
        if (job) isOwner = true;
      }
    }

    if (!isOwner) {
      const userDocs = localStore.getDocsByUser(req.userId);
      isOwner = userDocs.some(d => (d.outputs || []).some(o => o.fileName === safeFileName || (o.filePath && o.filePath.includes(safeFileName))));
    }

    if (!isOwner) {
      const userJobs = localStore.getVideoJobsByUser(req.userId);
      isOwner = userJobs.some(j => (j.audioUrl && j.audioUrl.includes(safeFileName)));
    }

    if (!isOwner) {
      return res.status(403).json({ error: 'Access denied: You do not own this audio resource.' });
    }
  } catch (err) {
    console.warn('[Audio Auth Error]', err.message);
    return res.status(500).json({ error: 'Authorization check failed.' });
  }

  res.sendFile(filePath, {
    acceptRanges: true,
    headers: {
      'Content-Type': 'audio/mpeg',
      'X-Content-Type-Options': 'nosniff',
      'Cache-Control': 'private, no-transform, max-age=3600'
    }
  }, (err) => {
    if (err && !res.headersSent) {
      if (err.code === 'ECONNRESET' || err.code === 'EPIPE') return;
      next(err);
    }
  });
});

// Authenticated & authorized access to generated PDFs, DOCX, and PPTX notes
app.get('/uploads/generated/:filename', authenticateMediaRequest, async (req, res, next) => {
  const safeFileName = path.basename(req.params.filename);
  const uploadsDir = path.resolve(__dirname, 'uploads/generated');
  const filePath = path.resolve(uploadsDir, safeFileName);

  if (!filePath.startsWith(uploadsDir) || !fs.existsSync(filePath)) {
    return res.status(404).json({ error: 'Generated document not found.' });
  }

  try {
    const { Document } = require('./models');
    const localStore = require('./utils/localStore');
    let isOwner = false;

    if (mongoose.connection.readyState === 1) {
      const doc = await Document.findOne({
        user: req.userId,
        $or: [
          { 'outputs.fileName': safeFileName },
          { 'outputs.filePath': { $regex: safeFileName, $options: 'i' } }
        ]
      });
      if (doc) isOwner = true;
    }

    if (!isOwner) {
      const userDocs = localStore.getDocsByUser(req.userId);
      isOwner = userDocs.some(d => (d.outputs || []).some(o => o.fileName === safeFileName || (o.filePath && o.filePath.includes(safeFileName))));
    }

    if (!isOwner) {
      return res.status(403).json({ error: 'Access denied: You do not own this generated document.' });
    }
  } catch (err) {
    console.warn('[Generated Doc Auth Error]', err.message);
    return res.status(500).json({ error: 'Authorization check failed.' });
  }

  res.sendFile(filePath, {
    headers: {
      'X-Content-Type-Options': 'nosniff',
      'Cache-Control': 'private, no-transform, max-age=3600'
    }
  });
});

// Block direct unauthenticated access to all private document, media, and upload stores
app.use(['/uploads/docs', '/uploads/pdfs', '/uploads/audio', '/uploads/video', '/uploads/generated', '/uploads/images'], (req, res) => {
  res.status(403).json({ error: 'Direct access to private document and media storage is forbidden. Use authenticated endpoints.' });
});

// Explicitly serve only public stock media assets
const PUBLIC_STOCK_FILES = new Set(['classroom_bg.png', 'teacher_stock.mp4']);
app.get('/uploads/:filename', (req, res, next) => {
  const safeFileName = path.basename(req.params.filename);
  if (PUBLIC_STOCK_FILES.has(safeFileName)) {
    const target = path.join(__dirname, 'uploads', safeFileName);
    if (fs.existsSync(target)) {
      return res.sendFile(target);
    }
  }
  res.status(403).json({ error: 'Direct access to upload storage is forbidden.' });
});

// Routes
const aiLimiter = rateLimit({ windowMs: 60 * 1000, max: 30 });
const authLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  max: 150,
  message: { error: 'Too many authentication attempts. Please try again after a few minutes.' }
});
app.use('/api/auth',       authLimiter, require('./routes/auth'));
app.use('/api/documents',  require('./routes/documents'));
app.use('/api/generate',   aiLimiter, require('./routes/generate'));
app.use('/api/flashcards', require('./routes/flashcards'));
app.use('/api/chatbot',    aiLimiter, require('./routes/chatbot'));
app.use('/api/library',    require('./routes/library'));
app.use('/api/ebooks',     require('./routes/ebooks'));
app.use('/api/planner',    require('./routes/planner'));
app.use('/api/video-studio', aiLimiter, require('./routes/videoStudio'));

// API Setup status endpoint
app.get('/api/setup', (req, res) => {
  const keys = {
    gemini:     process.env.GEMINI_API_KEY,
    groq:       process.env.GROQ_API_KEY,
    claude:     process.env.ANTHROPIC_API_KEY,
    googleTTS:  process.env.GOOGLE_TTS_API_KEY,
    elevenLabs: process.env.ELEVENLABS_API_KEY,
    veo:        process.env.VEO_MODEL || process.env.GEMINI_API_KEY,
  };
  const status = {};
  const instructions = {};
  
  Object.entries(keys).forEach(([name, val]) => {
    status[name] = !!(val && !val.startsWith('your_'));
  });
  
  if (!status.gemini && !status.groq && !status.claude) {
    instructions.ai = 'Add GROQ_API_KEY (free at console.groq.com) or GEMINI_API_KEY (free at aistudio.google.com)';
  }
  if (!status.googleTTS && !status.elevenLabs) {
    instructions.tts = 'Using high-speed Edge TTS for audio narration.';
  }
  
  res.json({ 
    status,
    hasAI: Boolean(status.gemini || status.groq || status.claude),
    hasTTS: Boolean(status.googleTTS || status.elevenLabs),
    edgeTTS: true,
    instructions,
    freeAPIs: [
      { name: 'Google Gemini (FREE)', url: 'https://aistudio.google.com', envKey: 'GEMINI_API_KEY', description: 'Free Gemini 3.8 Flash AI' },
      { name: 'Groq AI (FREE)', url: 'https://console.groq.com', envKey: 'GROQ_API_KEY', description: 'Free ultra-fast Llama 3 & Qwen AI' },
      { name: 'Google TTS (FREE)', url: 'https://console.cloud.google.com', envKey: 'GOOGLE_TTS_API_KEY', description: '1M chars/month free audio' },
      { name: 'ElevenLabs (FREE)', url: 'https://elevenlabs.io', envKey: 'ELEVENLABS_API_KEY', description: '10K chars/month free audio' },
    ]
  });
});

app.get('/api/health', (req, res) => {
  const isProd = process.env.NODE_ENV === 'production';
  const dbConnected = mongoose.connection.readyState === 1;
  const status = dbConnected ? 'ok' : (isProd ? 'unhealthy' : 'degraded');
  const httpStatus = (isProd && !dbConnected) ? 503 : 200;

  res.status(httpStatus).json({
    status,
    app: 'Notivexa v2.0',
    environment: process.env.NODE_ENV || 'development',
    dbConnected,
    dbState: ['disconnected', 'connected', 'connecting', 'disconnecting'][mongoose.connection.readyState] || 'unknown',
    storageMode: dbConnected ? 'mongodb_atlas' : (isProd ? 'offline_error' : 'autonomous_local_storage'),
    uptimeSeconds: Math.floor(process.uptime()),
    timestamp: new Date().toISOString()
  });
});

// Serve frontend dist in production or when built
const distPath = path.join(__dirname, '../frontend/dist');
if (fs.existsSync(distPath)) {
  app.use(express.static(distPath));
  app.get('*', (req, res, next) => {
    if (req.path.startsWith('/api') || req.path.startsWith('/uploads')) return next();
    res.sendFile(path.join(distPath, 'index.html'));
  });
}

// Error handler
app.use((req, res, next) => res.status(404).json({ error: `Route not found: ${req.originalUrl}` }));
app.use((err, req, res, next) => {
  console.error('[ERROR]', err.message);
  if (err.message && err.message.includes('CORS blocked')) {
    return res.status(403).json({ error: err.message });
  }
  if (err.code === 'LIMIT_FILE_SIZE') {
    const maxBytes = parseInt(process.env.MAX_FILE_SIZE) || 1073741824;
    const maxMb = Math.round(maxBytes / (1024 * 1024));
    const label = maxMb >= 1024 ? (maxMb / 1024).toFixed(0) + ' GB' : maxMb + ' MB';
    return res.status(400).json({ error: 'File too large. Maximum file size is ' + label + '.' });
  }
  const status = err.status || 500;
  const message = process.env.NODE_ENV === 'production' && status === 500
    ? 'Internal server error'
    : (err.message || 'Internal server error');
  res.status(status).json({ error: message });
});

// Database Connection & Synchronization Manager
const PORT = process.env.PORT || 5000;
mongoose.set('bufferCommands', false);

const { startMongoManager, resolveMongoUri, isDatabaseConfigured } = require('./utils/dbSync');
const effectiveMongoUri = resolveMongoUri(process.env.MONGODB_URI);
if (effectiveMongoUri) {
  startMongoManager(effectiveMongoUri);
} else if (process.env.NODE_ENV === 'production') {
  console.error('FATAL: In production, valid MONGODB_URI is required. Please set MONGODB_URI in environment.');
  process.exit(1);
}

let server = null;
if (require.main === module) {
  server = app.listen(PORT, '0.0.0.0', () => console.log(`🚀 Notivexa running on http://localhost:${PORT}`));
}

function handleGracefulShutdown(signal) {
  console.log(`[SHUTDOWN] Received ${signal}. Closing server gracefully...`);
  if (server) {
    server.close(async () => {
      console.log('[SHUTDOWN] HTTP server closed.');
      try {
        await mongoose.connection.close(false);
        console.log('[SHUTDOWN] MongoDB connection closed.');
      } catch (err) {
        console.warn('[SHUTDOWN] Error closing MongoDB connection:', err.message);
      }
      process.exit(0);
    });
  } else {
    process.exit(0);
  }
}

process.on('SIGTERM', () => handleGracefulShutdown('SIGTERM'));
process.on('SIGINT', () => handleGracefulShutdown('SIGINT'));

module.exports = app;
