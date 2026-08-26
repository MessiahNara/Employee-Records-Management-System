import multer from 'multer';
import path from 'path';
import fs from 'fs';

export function getBaseUploadsDir(): string {
  const PROGRAM_DATA = process.env.PROGRAMDATA || 'C:\\ProgramData';
  const DEFAULT_UPLOADS_BASE = path.join(PROGRAM_DATA, 'ERMS', 'uploads');
  return process.env.UPLOADS_DIR || DEFAULT_UPLOADS_BASE;
}

// Configure storage for profile pictures
const storage = multer.diskStorage({
  destination: (_req, _file, cb) => {
    const baseUploadsDir = getBaseUploadsDir();
    const uploadsDir = path.join(baseUploadsDir, 'profile-pictures');
    if (!fs.existsSync(uploadsDir)) {
      fs.mkdirSync(uploadsDir, { recursive: true });
    }
    cb(null, uploadsDir);
  },
  filename: (req, file, cb) => {
    const userId = req.params.id;
    const ext = path.extname(file.originalname);
    const filename = `${userId}-${Date.now()}${ext}`;
    cb(null, filename);
  },
});

const allowedMimeTypes = new Set([
  'image/jpeg',
  'image/jpg',
  'image/png',
  'image/pjpeg',
  'image/x-png',
]);

const fileFilter = (_req: any, file: Express.Multer.File, cb: multer.FileFilterCallback) => {
  const mimeType = (file.mimetype || '').toLowerCase();
  const extension = path.extname(file.originalname || '').toLowerCase();
  const isAllowed = allowedMimeTypes.has(mimeType) || ['.jpg', '.jpeg', '.png'].includes(extension);

  if (isAllowed) {
    cb(null, true);
  } else {
    cb(new Error('Only JPG and PNG images are allowed'));
  }
};

export const uploadProfilePicture = multer({
  storage,
  fileFilter,
});

// ── Document file upload ──────────────────────────────────────────────────────

/**
 * Resolves the canonical folder for an employee within `documents/`.
 * 1. Scans existing directories in `documents/` to find any matching folder (case-insensitive & token match).
 * 2. If a folder already exists (e.g. "FERRER, JASPER IAN DE GUZMAN"), reuses it instead of creating "Ferrer, Jasper Ian".
 * 3. Otherwise formats a clean canonical uppercase folder name.
 */
export function resolveEmployeeFolderName(documentsDir: string, rawEmployeeName: string): string {
  if (!fs.existsSync(documentsDir)) {
    fs.mkdirSync(documentsDir, { recursive: true });
  }

  const cleanName = (rawEmployeeName || 'Unknown Employee')
    .replace(/[/\\?%*:|"<>]/g, '-')
    .trim()
    .replace(/\.+$/, '');

  const normalize = (str: string) =>
    str.toUpperCase().replace(/,/g, ' ').replace(/\s+/g, ' ').trim();

  const targetNorm = normalize(cleanName);
  if (!targetNorm) return 'UNKNOWN_EMPLOYEE';

  try {
    const existingFolders = fs.readdirSync(documentsDir, { withFileTypes: true })
      .filter((d) => d.isDirectory())
      .map((d) => d.name);

    // 1. Exact normalized match (e.g. "FERRER, JASPER IAN" matches "Ferrer, Jasper Ian" or "FERRER, JASPER IAN")
    const exact = existingFolders.find((f) => normalize(f) === targetNorm);
    if (exact) {
      return exact;
    }

    // 2. Token match (e.g. "Ferrer, Jasper Ian" matches "FERRER, JASPER IAN DE GUZMAN" or vice versa)
    const targetTokens = targetNorm.split(' ').filter((t) => t.length > 1);
    if (targetTokens.length >= 2) {
      const tokenMatch = existingFolders.find((f) => {
        const fNorm = normalize(f);
        const fTokens = fNorm.split(' ').filter((t) => t.length > 1);
        // Primary check: same surname (first token in LASTNAME, FIRSTNAME format or last token in FIRSTNAME LASTNAME)
        const matchesAll = targetTokens.every((token) => fNorm.includes(token));
        if (matchesAll) return true;
        
        // Reverse check: all tokens in existing folder are in incoming name
        const reverseMatchesAll = fTokens.length >= 2 && fTokens.every((token) => targetNorm.includes(token));
        if (reverseMatchesAll) return true;

        return false;
      });

      if (tokenMatch) {
        return tokenMatch;
      }
    }
  } catch (err) {
    console.error('[upload] Error resolving employee folder:', err);
  }

  // Standardize default folder name: uppercase
  return cleanName.toUpperCase();
}

const documentStorage = multer.diskStorage({
  destination: (req, _file, cb) => {
    const baseUploadsDir = getBaseUploadsDir();
    const documentsDir = path.join(baseUploadsDir, 'documents');
    if (!fs.existsSync(documentsDir)) {
      fs.mkdirSync(documentsDir, { recursive: true });
    }

    const employeeFolder = resolveEmployeeFolderName(documentsDir, req.body?.employeeName || 'Unknown Employee');
    const category: string = (req.body?.category || 'Uncategorized')
      .replace(/[/\\?%*:|"<>]/g, '-')
      .replace(/\.+$/, '');

    const destDir = path.join(documentsDir, employeeFolder, category);
    if (!fs.existsSync(destDir)) {
      fs.mkdirSync(destDir, { recursive: true });
    }
    cb(null, destDir);
  },
  filename: (req, file, cb) => {
    const baseUploadsDir = getBaseUploadsDir();
    const documentsDir = path.join(baseUploadsDir, 'documents');

    const originalName = file.originalname;
    const employeeFolder = resolveEmployeeFolderName(documentsDir, req.body?.employeeName || 'Unknown Employee');
    const category: string = (req.body?.category || 'Uncategorized')
      .replace(/[/\\?%*:|"<>]/g, '-')
      .replace(/\.+$/, '');

    const targetPath = path.join(documentsDir, employeeFolder, category, originalName);
    if (fs.existsSync(targetPath)) {
      const ext = path.extname(originalName);
      const base = path.basename(originalName, ext);
      cb(null, `${base}-${Date.now()}${ext}`);
    } else {
      cb(null, originalName);
    }
  },
});

const documentFileFilter = (_req: any, file: Express.Multer.File, cb: multer.FileFilterCallback) => {
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

// ── Inventory attachment upload ───────────────────────────────────────────────

const inventoryStorage = multer.diskStorage({
  destination: (_req, _file, cb) => {
    const baseUploadsDir = getBaseUploadsDir();
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
