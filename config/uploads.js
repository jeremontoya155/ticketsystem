const fs = require('fs');
const path = require('path');
const multer = require('multer');

const uploadDir = path.join(__dirname, '..', 'public', 'uploads', 'tickets');
fs.mkdirSync(uploadDir, { recursive: true });

const storage = multer.diskStorage({
  destination: (_req, _file, cb) => {
    cb(null, uploadDir);
  },
  filename: (_req, file, cb) => {
    const safeBaseName = path.basename(file.originalname, path.extname(file.originalname))
      .replace(/[^a-zA-Z0-9-_]/g, '-')
      .slice(0, 60) || 'adjunto';
    const uniqueSuffix = `${Date.now()}-${Math.round(Math.random() * 1e9)}`;
    cb(null, `${safeBaseName}-${uniqueSuffix}${path.extname(file.originalname).toLowerCase()}`);
  }
});

function imageFileFilter(_req, file, cb) {
  if (file.mimetype.startsWith('image/')) {
    cb(null, true);
    return;
  }

  cb(new Error('Solo se permiten imagenes'));
}

const uploadTicketImages = multer({
  storage,
  fileFilter: imageFileFilter,
  limits: {
    fileSize: 5 * 1024 * 1024,
    files: 8
  }
});

module.exports = { uploadTicketImages };
