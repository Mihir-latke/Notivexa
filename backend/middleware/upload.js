const multer = require('multer');
const path = require('path');
const fs = require('fs');
const { v4: uuidv4 } = require('uuid');
const storage = (sub) => multer.diskStorage({
  destination: (req, file, cb) => {
    const dir = path.join(__dirname, '../uploads', sub, req.user?.id || 'temp');
    fs.mkdirSync(dir, { recursive: true });
    cb(null, dir);
  },
  filename: (req, file, cb) => cb(null, `${uuidv4()}${path.extname(file.originalname).toLowerCase()}`)
});
const fileFilter = (req, file, cb) => {
  if (file.mimetype === 'application/pdf' || file.mimetype.startsWith('image/')) cb(null, true);
  else cb(new Error('Only PDF and image files are accepted.'), false);
};
const MAX = parseInt(process.env.MAX_FILE_SIZE) || 52428800;
module.exports = { upload: multer({ storage: storage('docs'), fileFilter: fileFilter, limits: { fileSize: MAX, files: 10 } }) };