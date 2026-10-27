const multer = require('multer');
const path = require('path');
const fs = require('fs');
const { v4: uuidv4 } = require('uuid');

const ALLOWED_EXTENSIONS = new Set(['.pdf', '.png', '.jpg', '.jpeg', '.webp', '.docx']);
const ALLOWED_MIME_TYPES = new Set([
  'application/pdf',
  'image/png',
  'image/jpeg',
  'image/jpg',
  'image/webp',
  'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
  'application/msword',
  'application/zip',
  'application/x-zip-compressed',
  'application/octet-stream'
]);

const storage = (sub) => multer.diskStorage({
  destination: (req, file, cb) => {
    const rawUserId = (req.user?.id || req.user?._id || 'temp').toString();
    const safeUser = path.basename(rawUserId);
    const dir = path.join(__dirname, '../uploads', sub, safeUser);
    fs.mkdirSync(dir, { recursive: true });
    cb(null, dir);
  },
  filename: (req, file, cb) => {
    const ext = path.extname(file.originalname || '').toLowerCase();
    if (!ALLOWED_EXTENSIONS.has(ext)) {
      return cb(new Error('Only PDF, image, and DOCX files are accepted.'));
    }
    cb(null, `${uuidv4()}${ext}`);
  }
});

const fileFilter = (req, file, cb) => {
  const ext = path.extname(file.originalname || '').toLowerCase();
  const mime = (file.mimetype || '').toLowerCase();

  if (!ALLOWED_EXTENSIONS.has(ext)) {
    return cb(new Error('Only PDF, image, and DOCX files are accepted.'), false);
  }
  // If extension is docx, allow it even if mime is generic octet-stream/zip from browser
  if (ext === '.docx') {
    return cb(null, true);
  }
  if (!ALLOWED_MIME_TYPES.has(mime)) {
    return cb(new Error('Only PDF, image, and DOCX files are accepted.'), false);
  }
  cb(null, true);
};

const MAX = parseInt(process.env.MAX_FILE_SIZE) || 52428800; // 50MB

module.exports = {
  upload: multer({
    storage: storage('docs'),
    fileFilter,
    limits: { fileSize: MAX, files: 10 }
  })
};