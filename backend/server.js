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

// Ensure upload and local data directories exist
fs.mkdirSync(path.join(__dirname, 'data'), { recursive: true });
['pdfs','images','audio','video','generated'].forEach(d => {
  fs.mkdirSync(path.join(__dirname, 'uploads', d), { recursive: true });
});

// Resolve and enforce cryptographically secure JWT Secret
const crypto = require('crypto');
if (!process.env.JWT_SECRET || process.env.JWT_SECRET === 'notivexa_secret' || process.env.JWT_SECRET.trim().length < 16) {
  if (process.env.NODE_ENV === 'production') {
    const runtimeSecret = crypto.randomBytes(32).toString('hex');
    process.env.JWT_SECRET = runtimeSecret;
    console.warn('⚠️  SECURITY NOTICE: JWT_SECRET was not found in environment.');
    console.warn('🔑 Automatically provisioned a secure 64-char cryptographic secret for this runtime session.');
    console.warn('👉 To persist user sessions across server redeploys, set JWT_SECRET in Render Dashboard -> Environment.');
  } else {
    process.env.JWT_SECRET = 'notivexa_development_jwt_secret_key_32chars_min';
  }
}

// Security headers
app.use(helmet({ crossOriginResourcePolicy: { policy: 'cross-origin' } }));

const allowedOrigins = [
  'http://localhost:3000',
  'http://localhost:5173',
  'https://notivexa.com',
  'https://www.notivexa.com',
  'https://notivexa.onrender.com',
  process.env.FRONTEND_URL
].filter(Boolean);

app.use(cors({
  origin: (origin, callback) => {
    if (!origin || allowedOrigins.includes(origin) || process.env.NODE_ENV !== 'production') {
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
app.use(express.json({ limit: '10mb' }));
app.use(express.urlencoded({ extended: true, limit: '10mb' }));

// Serve uploaded files and auto-restore extracted diagrams from DB if missing on disk
app.get('/uploads/images/extracted/:docId/:fileName', async (req, res, next) => {
  const safeDocId = path.basename(req.params.docId);
  const safeFileName = path.basename(req.params.fileName);
  const targetPath = path.join(__dirname, 'uploads/images/extracted', safeDocId, safeFileName);

  if (fs.existsSync(targetPath)) {
    return res.sendFile(targetPath);
  }

  try {
    const { Document } = require('./models');
    const localStore = require('./utils/localStore');
    let doc = null;
    if (mongoose.connection.readyState === 1) {
      try { doc = await Document.findById(safeDocId).lean(); } catch {}
    }
    if (!doc) doc = localStore.getDocById(safeDocId);
    if (doc && Array.isArray(doc.diagrams)) {
      const match = doc.diagrams.find(d => d.fileName === safeFileName);
      if (match && match.base64) {
        fs.mkdirSync(path.dirname(targetPath), { recursive: true });
        fs.writeFileSync(targetPath, Buffer.from(match.base64, 'base64'));
        return res.sendFile(targetPath);
      }
    }
  } catch (err) {
    console.warn('[Diagram Static Restore Error]', err.message);
  }
  next();
});

// Optimized Range-Streaming for generated MP4 videos (prevents ECONNRESET / socket stalls)
app.get('/uploads/video/:filename', (req, res, next) => {
  const safeFileName = path.basename(req.params.filename);
  const filePath = path.join(__dirname, 'uploads/video', safeFileName);
  if (!fs.existsSync(filePath)) return next();

  let stat;
  try {
    stat = fs.statSync(filePath);
  } catch (err) {
    return next();
  }

  const fileSize = stat.size;
  const range = req.headers.range;

  res.setHeader('Accept-Ranges', 'bytes');
  res.setHeader('Content-Type', 'video/mp4');

  if (range) {
    const parts = range.replace(/bytes=/, '').split('-');
    const start = parseInt(parts[0], 10);
    const end = parts[1] ? parseInt(parts[1], 10) : fileSize - 1;

    if (start >= fileSize || end >= fileSize || start > end) {
      res.status(416).setHeader('Content-Range', `bytes */${fileSize}`);
      return res.end();
    }

    const chunksize = end - start + 1;
    res.writeHead(206, {
      'Content-Range': `bytes ${start}-${end}/${fileSize}`,
      'Accept-Ranges': 'bytes',
      'Content-Length': chunksize,
      'Content-Type': 'video/mp4',
      'Cache-Control': 'public, max-age=3600'
    });

    const fileStream = fs.createReadStream(filePath, { start, end });
    fileStream.on('error', () => {
      if (!res.headersSent) res.status(500).end();
    });

    req.on('close', () => {
      fileStream.destroy();
    });

    fileStream.pipe(res);
  } else {
    res.writeHead(200, {
      'Content-Length': fileSize,
      'Content-Type': 'video/mp4',
      'Accept-Ranges': 'bytes',
      'Cache-Control': 'public, max-age=3600'
    });

    const fileStream = fs.createReadStream(filePath);
    fileStream.on('error', () => {
      if (!res.headersSent) res.status(500).end();
    });

    req.on('close', () => {
      fileStream.destroy();
    });

    fileStream.pipe(res);
  }
});

app.use('/uploads', express.static(path.join(__dirname, 'uploads')));

// Routes
const aiLimiter = rateLimit({ windowMs: 60 * 1000, max: 30 });
app.use('/api/auth',       rateLimit({ windowMs: 900000, max: 30 }), require('./routes/auth'));
app.use('/api/documents',  require('./routes/documents'));
app.use('/api/generate',   aiLimiter, require('./routes/generate'));
app.use('/api/flashcards', require('./routes/flashcards'));
app.use('/api/chatbot',    aiLimiter, require('./routes/chatbot'));
app.use('/api/library',    require('./routes/library'));
app.use('/api/ebooks',     require('./routes/ebooks'));
app.use('/api/planner',    require('./routes/planner'));

// API Setup status endpoint
app.get('/api/setup', (req, res) => {
  const keys = {
    gemini:     process.env.GEMINI_API_KEY,
    groq:       process.env.GROQ_API_KEY,
    claude:     process.env.ANTHROPIC_API_KEY,
    googleTTS:  process.env.GOOGLE_TTS_API_KEY,
    elevenLabs: process.env.ELEVENLABS_API_KEY,
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
    hasAI: status.gemini || status.groq || status.claude,
    hasTTS: status.googleTTS || status.elevenLabs || true,
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
  const dbConnected = mongoose.connection.readyState === 1;
  const isProd = process.env.NODE_ENV === 'production';
  res.json({
    status: dbConnected ? 'ok' : (isProd ? 'degraded_no_database' : 'demo_mode'),
    app: 'Notivexa v2.0',
    environment: process.env.NODE_ENV || 'development',
    dbConnected,
    dbState: ['disconnected', 'connected', 'connecting', 'disconnecting'][mongoose.connection.readyState] || 'unknown',
    storageMode: dbConnected ? 'mongodb_atlas' : (isProd ? 'database_required' : 'local_store_demo'),
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
    return res.status(400).json({ error: 'File too large. Maximum file size is 50MB.' });
  }
  const status = err.status || 500;
  const message = process.env.NODE_ENV === 'production' && status === 500
    ? 'Internal server error'
    : (err.message || 'Internal server error');
  res.status(status).json({ error: message });
});

// Start
const PORT = process.env.PORT || 5000;
mongoose.set('bufferCommands', false);

const MONGODB_URI = process.env.MONGODB_URI;
const isPlaceholderUri = MONGODB_URI && (MONGODB_URI.includes('<username>') || MONGODB_URI.includes('<password>') || MONGODB_URI.includes('YOUR_'));

if (MONGODB_URI && !isPlaceholderUri && !MONGODB_URI.includes('localhost')) {
  console.log('🔄 Connecting to MongoDB Atlas...');
  mongoose.connect(MONGODB_URI, {
    serverSelectionTimeoutMS: 5000,
  })
    .then(async () => {
      console.log('✅ MongoDB connected');
      await require('./utils/seed').seedUsers();
    })
    .catch(err => {
      console.warn('⚠️  MongoDB connection failed:', err.message);
      console.warn('👉 Tip: Whitelist IP 0.0.0.0/0 in MongoDB Atlas Network Access');
      if (process.env.NODE_ENV === 'production') {
        console.warn('⚠️  Running in Production with degraded database capability. Operations requiring database persistence will return 503.');
      } else {
        console.warn('ℹ️  Running in Demo Mode.');
      }
    });
} else if (MONGODB_URI && MONGODB_URI.includes('localhost') && process.env.NODE_ENV !== 'production') {
  mongoose.connect(MONGODB_URI, {
    serverSelectionTimeoutMS: 2000,
  })
    .then(async () => {
      console.log('✅ Local MongoDB connected');
      await require('./utils/seed').seedUsers();
    })
    .catch(() => {
      console.log('ℹ️  Local MongoDB not running. Running in Demo Mode.');
    });
} else {
  if (isPlaceholderUri) {
    console.log('ℹ️  Please replace <username> and <password> in MONGODB_URI with your MongoDB Atlas credentials.');
  } else {
    console.log('ℹ️  No MONGODB_URI provided.');
  }
  console.log('👉 Add MONGODB_URI in Render Dashboard -> Environment to enable permanent storage.');
}

if (require.main === module) {
  app.listen(PORT, '0.0.0.0', () => console.log(`🚀 Notivexa running on http://localhost:${PORT}`));
}

module.exports = app;
