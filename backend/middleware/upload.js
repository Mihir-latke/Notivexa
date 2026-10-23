const multer = require('multer');
const path = require('path');
const fs = require('fs');
const { v4: uuidv4 } = require('uuid');

const ALLOWED_EXTENSIONS = new Set(['.pdf', '.png', '.jpg', '.jpeg', '.webp']);
const ALLOWED_MIME_TYPES = new Set([
  'application/pdf',
  'image/png',
  'image/jpeg',
  'image/jpg',
  'image/webp'
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
      return cb(new Error('Only PDF and image files are accepted.'));
    }
    cb(null, `${uuidv4()}${ext}`);
  }
});

const fileFilter = (req, file, cb) => {
  const ext = path.extname(file.originalname || '').toLowerCase();
  const mime = (file.mimetype || '').toLowerCase();

  if (!ALLOWED_EXTENSIONS.has(ext) || !ALLOWED_MIME_TYPES.has(mime)) {
    return cb(new Error('Only PDF and image files are accepted.'), false);
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