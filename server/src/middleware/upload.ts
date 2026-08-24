import multer from 'multer';
import path from 'path';
import fs from 'fs';

const PROGRAM_DATA = process.env.PROGRAMDATA || 'C:\\ProgramData';
const DEFAULT_UPLOADS_BASE = path.join(PROGRAM_DATA, 'ERMS', 'uploads');
const baseUploadsDir = process.env.UPLOADS_DIR || DEFAULT_UPLOADS_BASE;

// Ensure base directories exist
const uploadsDir = path.join(baseUploadsDir, 'profile-pictures');
if (!fs.existsSync(uploadsDir)) {
  fs.mkdirSync(uploadsDir, { recursive: true });
}

// Configure storage
const storage = multer.diskStorage({
  destination: (req, file, cb) => {
    cb(null, uploadsDir);
  },
  filename: (req, file, cb) => {
    // Generate unique filename: userId-timestamp.ext
    const userId = req.params.id;
    const ext = path.extname(file.originalname);
    const filename = `${userId}-${Date.now()}${ext}`;
    cb(null, filename);
  },
});

// File filter - only allow JPG and PNG (support browser MIME quirks)
const allowedMimeTypes = new Set([
  'image/jpeg',
  'image/jpg',
  'image/png',
  'image/pjpeg',
  'image/x-png',
]);

const fileFilter = (req: any, file: Express.Multer.File, cb: multer.FileFilterCallback) => {
  const mimeType = (file.mimetype || '').toLowerCase();
  const extension = path.extname(file.originalname || '').toLowerCase();
  const isAllowed = allowedMimeTypes.has(mimeType) || ['.jpg', '.jpeg', '.png'].includes(extension);

  if (isAllowed) {
    cb(null, true);
  } else {
    cb(new Error('Only JPG and PNG images are allowed'));
  }
};

// Create multer upload instance
export const uploadProfilePicture = multer({
  storage,
  fileFilter,
});

// ── Document file upload ──────────────────────────────────────────────────────

const documentsDir = path.join(baseUploadsDir, 'documents');

console.log('[upload] Document upload configuration:');
console.log(`  - baseUploadsDir: ${baseUploadsDir}`);
console.log(`  - documentsDir: ${documentsDir}`);

if (!fs.existsSync(documentsDir)) {
  fs.mkdirSync(documentsDir, { recursive: true });
  console.log(`[upload] Created documentsDir at: ${documentsDir}`);
}

const documentStorage = multer.diskStorage({
  destination: (req, _file, cb) => {
    // Sanitize employee name and category to be filesystem-safe
    // Strip invalid chars, then strip trailing dots/spaces (Windows NTFS restriction)
    const employeeName: string = (req.body?.employeeName || 'Unknown Employee')
      .replace(/[/\\?%*:|"<>]/g, '-')
      .trim()
      .replace(/\.+$/, '');  // remove trailing dots
    const category: string = (req.body?.category || 'Uncategorized')
      .replace(/[/\\?%*:|"<>]/g, '-')
      .replace(/\.+$/, '');
    const destDir = path.join(documentsDir, employeeName, category);
    if (!fs.existsSync(destDir)) {
      fs.mkdirSync(destDir, { recursive: true });
    }
    cb(null, destDir);
  },
  filename: (req, file, cb) => {
    // Use the original file name; prefix with timestamp if file already exists
    const originalName = file.originalname;
    const employeeName: string = (req.body?.employeeName || 'Unknown Employee')
      .replace(/[/\\?%*:|"<>]/g, '-')
      .trim()
      .replace(/\.+$/, '');  // remove trailing dots
    const category: string = (req.body?.category || 'Uncategorized')
      .replace(/[/\\?%*:|"<>]/g, '-')
      .replace(/\.+$/, '');
    const targetPath = path.join(documentsDir, employeeName, category, originalName);
    if (fs.existsSync(targetPath)) {
      const ext = path.extname(originalName);
      const base = path.basename(originalName, ext);
      cb(null, `${base}-${Date.now()}${ext}`);
    } else {
      cb(null, originalName);
    }
  },
});

const documentFileFilter = (req: any, file: Express.Multer.File, cb: multer.FileFilterCallback) => {
  if (file.mimetype === 'application/pdf') {
    cb(null, true);
  } else {
    cb(new Error('Only PDF files are allowed'));
  }
};

export const uploadDocumentFile = multer({
  storage: documentStorage,
  fileFilter: documentFileFilter,
});

const inventoryStorage = multer.diskStorage({
  destination: (_req, _file, cb) => {
    const destDir = path.join(baseUploadsDir, 'inventory');
    if (!fs.existsSync(destDir)) {
      fs.mkdirSync(destDir, { recursive: true });
    }
    cb(null, destDir);
  },
  filename: (_req, file, cb) => {
    const ext = path.extname(file.originalname);
    const base = path.basename(file.originalname, ext).replace(/[/\\?%*:|"<>]/g, '-');
    cb(null, `${base}-${Date.now()}${ext}`);
  },
});

export const uploadInventoryAttachment = multer({
  storage: inventoryStorage,
  limits: { fileSize: 25 * 1024 * 1024 },
});
