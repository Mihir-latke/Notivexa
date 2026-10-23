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

// Security
app.use(helmet({ crossOriginResourcePolicy: { policy: 'cross-origin' } }));
const allowedOrigins = [
  'http://localhost:3000',
  'http://localhost:5173',
  'https://notivexa.com',
  'https://www.notivexa.com',
  process.env.FRONTEND_URL
].filter(Boolean);
app.use(cors({
  origin: (origin, callback) => {
    if (!origin || allowedOrigins.includes(origin) || process.env.NODE_ENV !== 'production') {
      return callback(null, true);
    }
    return callback(null, true);
  },
  credentials: true,
  methods: ['GET','POST','PUT','DELETE','PATCH']
}));
app.use(rateLimit({ windowMs: 15 * 60 * 1000, max: 500, message: { error: 'Too many requests.' } }));
app.use(morgan('dev'));
app.use(express.json({ limit: '10mb' }));
app.use(express.urlencoded({ extended: true, limit: '10mb' }));

// Serve uploaded files and auto-restore extracted diagrams from DB if missing on disk
app.get('/uploads/images/extracted/:docId/:fileName', async (req, res, next) => {
  const { docId, fileName } = req.params;
  const targetPath = path.join(__dirname, 'uploads/images/extracted', docId, fileName);
  if (fs.existsSync(targetPath)) {
    return res.sendFile(targetPath);
  }
  try {
    const { Document } = require('./models');
    const localStore = require('./services/localStore');
    let doc = null;
    if (mongoose.connection.readyState === 1) {
      try { doc = await Document.findById(docId).lean(); } catch {}
    }
    if (!doc) doc = localStore.getDocById(docId);
    if (doc && Array.isArray(doc.diagrams)) {
      const match = doc.diagrams.find(d => d.fileName === fileName);
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
  const filePath = path.join(__dirname, 'uploads/video', req.params.filename);
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

    // Safely destroy file stream when client seeks or disconnects
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
    gemini:  process.env.GEMINI_API_KEY,
    groq:    process.env.GROQ_API_KEY,
    claude:  process.env.ANTHROPIC_API_KEY,
    googleTTS: process.env.GOOGLE_TTS_API_KEY,
    elevenLabs: process.env.ELEVENLABS_API_KEY,
  };
  const status = {};
  const instructions = {};
  
  Object.entries(keys).forEach(([name, val]) => {
    status[name] = !!(val && !val.startsWith('your_'));
  });
  
  if (!status.gemini && !status.groq && !status.claude) {
    instructions.ai = 'Add GROQ_API_KEY (free at console.groq.com) for much better AI output';
  }
  if (!status.googleTTS && !status.elevenLabs) {
    instructions.tts = 'Add GOOGLE_TTS_API_KEY (free at console.cloud.google.com) for real audio';
  }
  
  res.json({ 
    status,
    hasAI: status.gemini || status.groq || status.claude,
    hasTTS: status.googleTTS || status.elevenLabs,
    instructions,
    freeAPIs: [
      { name: 'Groq AI (FREE)', url: 'https://console.groq.com', envKey: 'GROQ_API_KEY', description: 'Free Llama 3 AI - best for students' },
      { name: 'Google Gemini (FREE)', url: 'https://aistudio.google.com', envKey: 'GEMINI_API_KEY', description: 'Free Gemini AI' },
      { name: 'Google TTS (FREE)', url: 'https://console.cloud.google.com', envKey: 'GOOGLE_TTS_API_KEY', description: '1M chars/month free audio' },
      { name: 'ElevenLabs (FREE)', url: 'https://elevenlabs.io', envKey: 'ELEVENLABS_API_KEY', description: '10K chars/month free audio' },
    ]
  });
});

app.get('/api/health', (req, res) => res.json({
  status: 'ok',
  app: 'Notivexa v2.0',
  dbConnected: mongoose.connection.readyState === 1,
  dbState: ['disconnected', 'connected', 'connecting', 'disconnecting'][mongoose.connection.readyState] || 'unknown',
  time: new Date().toISOString()
}));

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
  if (err.code === 'LIMIT_FILE_SIZE') return res.status(400).json({ error: 'File too large. Max 50MB.' });
  res.status(err.status || 500).json({ error: err.message || 'Internal server error' });
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
      console.warn('ℹ️  Running in Demo Mode.');
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
    console.log('ℹ️  No MONGODB_URI provided. Running in Demo Mode.');
  }
  console.log('👉 Add MONGODB_URI in Render Dashboard -> Environment to enable permanent storage.');
}

app.listen(PORT, () => console.log(`🚀 Notivexa running on http://localhost:${PORT}`));
module.exports = app;
