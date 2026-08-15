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

const anyFilter = (req, file, cb) => {
  const allowed = ['application/pdf','image/jpeg','image/jpg','image/png','image/webp','image/gif'];
  if (allowed.includes(file.mimetype)) cb(null, true);
  else cb(new Error('Only PDF and image files accepted'), false);
};

const MAX = parseInt(process.env.MAX_FILE_SIZE) || 104857600;
module.exports = {
  upload: multer({ storage: storage('pdfs'), fileFilter: anyFilter, limits: { fileSize: MAX, files: 10 } })
};
