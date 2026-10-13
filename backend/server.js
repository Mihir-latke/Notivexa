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

// Ensure upload directories exist
['pdfs','images','audio','generated'].forEach(d => {
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

// Serve uploaded files
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

app.get('/api/health', (req, res) => res.json({ status: 'ok', app: 'Notivexa v2.0', time: new Date().toISOString() }));

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
mongoose.connect(process.env.MONGODB_URI || 'mongodb://localhost:27017/notivexa')
  .then(async () => {
    console.log('✅ MongoDB connected');
    await require('./utils/seed').seedUsers();
  })
  .catch(err => console.warn('⚠️  MongoDB:', err.message, '— running without DB'));

app.listen(PORT, () => console.log(`🚀 Notivexa running on http://localhost:${PORT}`));
module.exports = app;
