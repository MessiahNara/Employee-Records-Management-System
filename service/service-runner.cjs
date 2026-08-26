/**
 * ERMS Windows Service Runner
 * 
 * This script is executed by the Windows Service (via sc.exe / node.exe).
 * It sets up all required environment variables and launches the server bundle.
 * 
 * The service is installed by install-service.cjs during the server app setup.
 */

'use strict';

const path = require('path');
const fs   = require('fs');

// ── Resolve install directory ────────────────────────────────────────────────
// When running as a Windows Service the CWD may be System32.
// __dirname is reliable because Node resolves it at parse time.
const SERVICE_DIR  = __dirname;                          // <install>\resources\service
const RESOURCES    = path.dirname(SERVICE_DIR);          // <install>\resources
const INSTALL_DIR  = path.dirname(RESOURCES);            // <install>

// ── Paths ────────────────────────────────────────────────────────────────────
const BUNDLE_PATH  = path.join(RESOURCES, 'server.bundle.cjs');
const ENV_PATH     = path.join(RESOURCES, '.env');
const CERT_PATH    = path.join(RESOURCES, 'certs', 'server-cert.pem');
const KEY_PATH     = path.join(RESOURCES, 'certs', 'server-key.pem');
const PRISMA_ENGINE = path.join(RESOURCES, 'node_modules', '.prisma', 'client', 'query-engine-windows.exe');

// ── Logging ──────────────────────────────────────────────────────────────────
const PROGRAM_DATA = process.env.PROGRAMDATA || 'C:\\ProgramData';
const LOG_PATH     = path.join(PROGRAM_DATA, 'ERMS', 'service.log');

function log(msg) {
  const line = `[${new Date().toISOString()}] ${msg}\n`;
  process.stdout.write(line);
  try {
    const logDir = path.dirname(LOG_PATH);
    if (!fs.existsSync(logDir)) fs.mkdirSync(logDir, { recursive: true });
    fs.appendFileSync(LOG_PATH, line);
  } catch (_) {}
}

// ── Load .env from resources FIRST ───────────────────────────────────────────
if (fs.existsSync(ENV_PATH)) {
  const lines = fs.readFileSync(ENV_PATH, 'utf8').split(/\r?\n/);
  for (const line of lines) {
    const trimmed = line.trim();
    if (!trimmed || trimmed.startsWith('#')) continue;
    const eqIdx = trimmed.indexOf('=');
    if (eqIdx < 0) continue;
    const key = trimmed.slice(0, eqIdx).trim();
    let val = trimmed.slice(eqIdx + 1).trim();
    // Strip surrounding quotes
    if ((val.startsWith('"') && val.endsWith('"')) ||
        (val.startsWith("'") && val.endsWith("'"))) {
      val = val.slice(1, -1);
    }
    if (!process.env[key]) process.env[key] = val;
  }
  log(`Loaded .env from ${ENV_PATH}`);
}

const UPLOADS_DIR = process.env.UPLOADS_DIR || path.join(PROGRAM_DATA, 'ERMS', 'uploads');

// ── Validate required files ───────────────────────────────────────────────────
if (!fs.existsSync(BUNDLE_PATH)) {
  log(`ERROR: server bundle not found at ${BUNDLE_PATH}`);
  process.exit(1);
}
if (!fs.existsSync(CERT_PATH) || !fs.existsSync(KEY_PATH)) {
  log(`ERROR: SSL certificates not found in ${path.join(RESOURCES, 'certs')}`);
  process.exit(1);
}

// ── Recursive copy helper for migrations ──────────────────────────────────────
function copyDirRecursiveSync(src, dest) {
  if (!fs.existsSync(src)) return;
  if (!fs.existsSync(dest)) fs.mkdirSync(dest, { recursive: true });
  const entries = fs.readdirSync(src, { withFileTypes: true });
  for (const entry of entries) {
    const srcPath = path.join(src, entry.name);
    const destPath = path.join(dest, entry.name);
    if (entry.isDirectory()) {
      copyDirRecursiveSync(srcPath, destPath);
    } else if (!fs.existsSync(destPath)) {
      try {
        fs.copyFileSync(srcPath, destPath);
      } catch (_) {}
    }
  }
}

// ── Ensure uploads directories exist and migrate legacy files ──────────────────
try {
  fs.mkdirSync(path.join(UPLOADS_DIR, 'profile-pictures'), { recursive: true });
  fs.mkdirSync(path.join(UPLOADS_DIR, 'documents'),        { recursive: true });
  fs.mkdirSync(path.join(UPLOADS_DIR, 'data'),             { recursive: true });

  const legacyUploads = path.join(INSTALL_DIR, 'uploads');
  if (fs.existsSync(legacyUploads) && path.resolve(legacyUploads) !== path.resolve(UPLOADS_DIR)) {
    copyDirRecursiveSync(legacyUploads, UPLOADS_DIR);
    log(`Migrated legacy uploads from ${legacyUploads} to ${UPLOADS_DIR}`);
  }
  log(`Uploads directory ready: ${UPLOADS_DIR}`);
} catch (err) {
  log(`WARNING: Could not create uploads dir: ${err.message}`);
}

// ── Set environment variables ─────────────────────────────────────────────────
process.env.NODE_ENV             = 'production';
process.env.NODE_PATH            = path.join(RESOURCES, 'node_modules');
process.env.UPLOADS_DIR          = UPLOADS_DIR;
process.env.SSL_CERT_PATH        = CERT_PATH;
process.env.SSL_KEY_PATH         = KEY_PATH;
process.env.PRISMA_QUERY_ENGINE_BINARY = PRISMA_ENGINE;

log(`Starting ERMS server bundle from ${BUNDLE_PATH}`);
log(`  Resources : ${RESOURCES}`);
log(`  Uploads   : ${UPLOADS_DIR}`);
log(`  SSL Cert  : ${CERT_PATH}`);
log(`  Prisma    : ${PRISMA_ENGINE}`);

// ── Launch server bundle ──────────────────────────────────────────────────────
// Change CWD to resources so dotenv.config() inside the bundle finds .env
process.chdir(RESOURCES);

// Load the bundle directly in this process — the service wrapper IS the process.
try {
  require(BUNDLE_PATH);
} catch (err) {
  log(`FATAL: Failed to start server bundle: ${err.message}`);
  log(err.stack || '');
  process.exit(1);
}
