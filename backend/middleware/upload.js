const multer = require('multer');
const path = require('path');
const fs = require('fs');

function makeStorage(subfolder) {
  const dir = path.join(__dirname, '..', 'uploads', subfolder);
  if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });

  return multer.diskStorage({
    destination: (req, file, cb) => cb(null, dir),
    filename: (req, file, cb) => {
      const ext = path.extname(file.originalname);
      const safeBase = path.basename(file.originalname, ext).replace(/[^a-zA-Z0-9_-]/g, '_');
      cb(null, `${Date.now()}-${safeBase}${ext}`);
    }
  });
}

const documentUpload = multer({
  storage: makeStorage('documents'),
  limits: { fileSize: 10 * 1024 * 1024 }, // 10MB
  fileFilter: (req, file, cb) => {
    const allowed = /pdf|jpg|jpeg|png|doc|docx/;
    const ext = path.extname(file.originalname).toLowerCase().replace('.', '');
    if (allowed.test(ext)) cb(null, true);
    else cb(new Error('Unsupported file type. Allowed: PDF, JPG, PNG, DOC, DOCX.'));
  }
});

const logoUpload = multer({
  storage: makeStorage('logo'),
  limits: { fileSize: 3 * 1024 * 1024 }, // 3MB
  fileFilter: (req, file, cb) => {
    const allowed = /png|jpg|jpeg|svg|webp/;
    const ext = path.extname(file.originalname).toLowerCase().replace('.', '');
    if (allowed.test(ext)) cb(null, true);
    else cb(new Error('Logo must be PNG, JPG, SVG, or WEBP.'));
  }
});

module.exports = { documentUpload, logoUpload };
