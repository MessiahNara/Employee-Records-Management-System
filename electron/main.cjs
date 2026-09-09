process.env.NODE_TLS_REJECT_UNAUTHORIZED = '0';
const { app, BrowserWindow, session, utilityProcess, ipcMain } = require('electron');
const path = require('path');
const fs = require('fs');
const os = require('os');
const http = require('http');
const https = require('https');

// Allow self-signed certificates in development
app.commandLine.appendSwitch('ignore-certificate-errors');
app.commandLine.appendSwitch('allow-insecure-localhost');

// Completely bypass TLS/SSL certificate errors for local Vite dev server
app.on('certificate-error', (event, webContents, url, error, certificate, callback) => {
  event.preventDefault();
  callback(true);
});

// Global server URL (set during startup)
let GLOBAL_SERVER_URL = 'https://127.0.0.1:5000';

function getLocalIP() {
  const interfaces = os.networkInterfaces();
  for (const name of Object.keys(interfaces)) {
    for (const iface of interfaces[name]) {
      if (iface.family === 'IPv4' && !iface.internal) {
        return iface.address;
      }
    }
  }
  return '192.168.2.187';
}

let mainWindow;
let serverProcess = null;

function resolveFrontendDistPath() {
  const appPath = app.getAppPath();
  const unpackedDist = appPath.endsWith('.asar')
    ? path.join(appPath + '.unpacked', 'dist')
    : path.join(appPath, 'dist');
  const asarDist = path.join(appPath, 'dist');

  if (fs.existsSync(unpackedDist)) {
    return unpackedDist;
  }
  return asarDist;
}

function resolveFrontendIndexPath() {
  return path.join(resolveFrontendDistPath(), 'index.html');
}

function readClientConfig() {
  try {
    // Priority 1: Check in userData directory (where UI saves it)
    const userDataPath = path.join(app.getPath('userData'), 'client-config.json');
    if (fs.existsSync(userDataPath)) {
      return JSON.parse(fs.readFileSync(userDataPath, 'utf8'));
    }

    // Priority 2: Check next to the executable/asar
    const configPath = path.join(__dirname, 'client-config.json');
    if (fs.existsSync(configPath)) {
      return JSON.parse(fs.readFileSync(configPath, 'utf8'));
    }
  } catch (err) {
    console.error('[server] Error reading client config:', err);
  }
  return null;
}

function loadFrontend() {
  if (!mainWindow || mainWindow.isDestroyed()) return;
  const frontendIndexPath = resolveFrontendIndexPath();
  if (!fs.existsSync(frontendIndexPath)) {
    console.error('[ui] index.html not found at', frontendIndexPath);
    return;
  }
  console.log('[ui] Loading frontend from', frontendIndexPath);
  mainWindow.loadFile(frontendIndexPath);
}

/**
 * Check if the ERMS Windows Background Service is currently running.
 * Uses sc.exe which is available on all Windows versions.
 * Returns false on any error so the app falls back to in-process server.
 */
function isServiceRunning() {
  try {
    const { execFileSync } = require('child_process');
    const out = execFileSync('sc.exe', ['query', 'ERMSBackendServer'], {
      encoding: 'utf8',
      windowsHide: true,
      timeout: 3000,
    });
    return out.includes('RUNNING');
  } catch (_) {
    return false;
  }
}

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
      } catch (e) {
        console.warn('[migration] Failed to copy', srcPath, e.message);
      }
    }
  }
}

function loadEnvFile() {
  const envPath = app.isPackaged 
    ? path.join(process.resourcesPath, '.env')
    : path.join(__dirname, '../server/.env');
  
  if (fs.existsSync(envPath)) {
    try {
      const content = fs.readFileSync(envPath, 'utf8');
      content.split(/\r?\n/).forEach(line => {
        const trimmed = line.trim();
        if (trimmed && !trimmed.startsWith('#')) {
          const eqIdx = trimmed.indexOf('=');
          if (eqIdx > 0) {
            const key = trimmed.slice(0, eqIdx).trim();
            let val = trimmed.slice(eqIdx + 1).trim();
            if ((val.startsWith('"') && val.endsWith('"')) || (val.startsWith("'") && val.endsWith("'"))) {
              val = val.slice(1, -1);
            }
            if (!process.env[key]) process.env[key] = val;
          }
        }
      });
      console.log('[main] Loaded .env from:', envPath);
    } catch (err) {
      console.warn('[main] Failed to parse .env:', err.message);
    }
  }
}

function resolveUploadsDir() {
  loadEnvFile();
  if (process.env.UPLOADS_DIR) {
    const customDir = process.env.UPLOADS_DIR;
    try {
      fs.mkdirSync(path.join(customDir, 'profile-pictures'), { recursive: true });
      fs.mkdirSync(path.join(customDir, 'documents'), { recursive: true });
      fs.mkdirSync(path.join(customDir, 'data'), { recursive: true });
      console.log('[server] ✅ Uploads directory ready at custom UPLOADS_DIR:', customDir);
      return customDir;
    } catch (err) {
      console.warn('[server] ⚠️ Could not create custom UPLOADS_DIR, falling back:', err.message);
    }
  }

  const programData = process.env.PROGRAMDATA || 'C:\\ProgramData';
  let uploadsDir = path.join(programData, 'ERMS', 'uploads');
  try {
    fs.mkdirSync(path.join(uploadsDir, 'profile-pictures'), { recursive: true });
    fs.mkdirSync(path.join(uploadsDir, 'documents'), { recursive: true });
    fs.mkdirSync(path.join(uploadsDir, 'data'), { recursive: true });
    console.log('[server] ✅ Uploads directory ready at ProgramData:', uploadsDir);
  } catch (err) {
    console.warn('[server] ⚠️ Could not use ProgramData uploads dir, falling back to userData:', err.message);
    uploadsDir = path.join(app.getPath('userData'), 'uploads');
    fs.mkdirSync(path.join(uploadsDir, 'profile-pictures'), { recursive: true });
    fs.mkdirSync(path.join(uploadsDir, 'documents'), { recursive: true });
    fs.mkdirSync(path.join(uploadsDir, 'data'), { recursive: true });
    console.log('[server] ✅ Uploads directory ready at userData:', uploadsDir);
  }

  // Migrate any legacy uploads from app installation directory if present
  try {
    const legacyUploads = path.join(path.dirname(process.execPath), 'uploads');
    if (fs.existsSync(legacyUploads) && path.resolve(legacyUploads) !== path.resolve(uploadsDir)) {
      copyDirRecursiveSync(legacyUploads, uploadsDir);
      console.log('[migration] Checked and migrated legacy uploads from', legacyUploads);
    }
  } catch (err) {
    console.warn('[migration] Legacy uploads check warning:', err.message);
  }

  return uploadsDir;
}

function startBackendServer() {
  if (!app.isPackaged) return;
  const clientConfig = readClientConfig();
  if (clientConfig?.serverUrl) {
    GLOBAL_SERVER_URL = clientConfig.serverUrl;
    console.log('[server-url] Client config loaded. Server URL set to:', GLOBAL_SERVER_URL);
    
    // Only skip starting the local server if the URL points to a remote machine
    const isLocal = GLOBAL_SERVER_URL.includes('localhost') || GLOBAL_SERVER_URL.includes('127.0.0.1');
    if (!isLocal) {
      return; // client build — use remote server
    }
  }

  // If the Windows Service is already running, don't start a second server process.
  // The service runs server.bundle.cjs in the background independently of this app.
  if (isServiceRunning()) {
    console.log('[server] ✅ ERMS Backend Service is running — skipping in-process server start.');
    return;
  }

  console.log('[server] Starting backend server...');
  const serverBundlePath = path.join(process.resourcesPath, 'server.bundle.cjs');
  if (!fs.existsSync(serverBundlePath)) {
    console.warn('[server] ❌ Bundle not found at', serverBundlePath);
    return;
  }

  const frontendDist = resolveFrontendDistPath();
  const uploadsDir = resolveUploadsDir();

  serverProcess = utilityProcess.fork(serverBundlePath, [], {
    cwd: process.resourcesPath,
    env: {
      ...process.env,
      NODE_ENV: 'production',
      NODE_PATH: path.join(process.resourcesPath, 'node_modules'),
      FRONTEND_DIST: frontendDist,
      UPLOADS_DIR: uploadsDir,
      SSL_CERT_PATH: path.join(process.resourcesPath, 'certs', 'server-cert.pem'),
      SSL_KEY_PATH: path.join(process.resourcesPath, 'certs', 'server-key.pem'),
      PRISMA_QUERY_ENGINE_BINARY: path.join(process.resourcesPath, 'node_modules', '.prisma', 'client', 'query-engine-windows.exe'),
    },
    stdio: 'pipe',
  });

  serverProcess.stdout?.on('data', (data) => {
    console.log('[server]', data.toString().trim());
  });
  serverProcess.stderr?.on('data', (data) => {
    console.error('[server]', data.toString().trim());
  });
  serverProcess.on('exit', (code) => {
    console.log(`[server] ❌ Process exited with code ${code}`);
    serverProcess = null;
  });
}


function isTrustedOrigin(requestingUrl) {
  try {
    if (!requestingUrl) {
      return false;
    }

    const url = new URL(requestingUrl);
    return (
      url.protocol === 'file:' ||
      (
        url.protocol === 'https:' &&
        (url.hostname === 'localhost' || url.hostname === '127.0.0.1') &&
        url.port === '5174'
      )
    );
  } catch {
    return false;
  }
}

function configureMediaPermissions() {
  const ses = session.defaultSession;

  const isAppWindowRequest = (webContents) => {
    return !!mainWindow && !mainWindow.isDestroyed() && webContents.id === mainWindow.webContents.id;
  };

  const shouldAllowMediaRequest = (webContents, requestingUrl) => {
    const currentUrl = webContents.getURL();

    // During early page lifecycle, requesting URL can be empty.
    if (isAppWindowRequest(webContents) && !requestingUrl) {
      return isTrustedOrigin(currentUrl) || currentUrl.length === 0;
    }

    return isTrustedOrigin(requestingUrl) || isTrustedOrigin(currentUrl);
  };

  ses.setPermissionCheckHandler((webContents, permission, requestingOrigin) => {
    if (permission !== 'media') {
      return false;
    }

    const allow = shouldAllowMediaRequest(webContents, requestingOrigin);
    console.log(`[permissions] check media origin=${requestingOrigin || '(empty)'} current=${webContents.getURL() || '(empty)'} allow=${allow}`);
    return allow;
  });

  ses.setPermissionRequestHandler((webContents, permission, callback, details) => {
    if (permission !== 'media') {
      callback(false);
      return;
    }

    const requestingUrl = details.requestingUrl || webContents.getURL();
    const allow = shouldAllowMediaRequest(webContents, requestingUrl);
    console.log(`[permissions] request media origin=${requestingUrl || '(empty)'} current=${webContents.getURL() || '(empty)'} allow=${allow}`);
    callback(allow);
  });
}

function createWindow() {
  console.log('[ui] Creating main window...');
  mainWindow = new BrowserWindow({
    width: 1366,
    height: 768,
    minWidth: 1024,
    minHeight: 768,
    webPreferences: {
      nodeIntegration: false,
      contextIsolation: true,
      preload: path.join(__dirname, 'preload.cjs')
    },
    icon: path.join(__dirname, '../public/icon.ico'),
    title: 'HRMDO - EMIS',
    backgroundColor: '#f9fafb',
    show: false
  });

  // Track current zoom and prevent zoom resets on window maximize/minimize/idle
  const TARGET_ZOOM = 0.65;
  let currentZoom = TARGET_ZOOM;
  
  const applyZoom = () => {
    if (mainWindow && !mainWindow.isDestroyed()) {
      try {
        mainWindow.webContents.setVisualZoomLevelLimits(1, 1);
        mainWindow.webContents.setZoomFactor(currentZoom);
      } catch (e) {
        // ignore
      }
    }
  };

  mainWindow.webContents.on('did-finish-load', applyZoom);
  mainWindow.on('focus', applyZoom);
  mainWindow.on('restore', applyZoom);
  mainWindow.on('maximize', applyZoom);
  mainWindow.on('unmaximize', applyZoom);

  // Allow manual Ctrl + 0, Ctrl + +, Ctrl + -, zoom adjustments, and Ctrl+R / F5 reload
  mainWindow.webContents.on('before-input-event', (event, input) => {
    if ((input.control && (input.key === 'r' || input.key === 'R')) || input.key === 'F5') {
      mainWindow.webContents.reload();
      return;
    }
    if (input.control && (input.key === '0' || input.code === 'Digit0' || input.code === 'Numpad0')) {
      event.preventDefault();
      currentZoom = TARGET_ZOOM;
      applyZoom();
    } else if (input.control && (input.key === '=' || input.key === '+' || input.code === 'NumpadAdd')) {
      event.preventDefault();
      currentZoom = Math.min(currentZoom + 0.05, 1.5);
      applyZoom();
    } else if (input.control && (input.key === '-' || input.code === 'NumpadSubtract')) {
      event.preventDefault();
      currentZoom = Math.max(currentZoom - 0.05, 0.4);
      applyZoom();
    }
  });

  mainWindow.webContents.on('zoom-changed', (event, zoomDirection) => {
    if (zoomDirection === 'in') {
      currentZoom = Math.min(currentZoom + 0.05, 1.5);
    } else if (zoomDirection === 'out') {
      currentZoom = Math.max(currentZoom - 0.05, 0.4);
    }
    applyZoom();
  });

  // Show window as soon as content is painted
  let windowShown = false;
  const showWindow = () => {
    if (windowShown || !mainWindow || mainWindow.isDestroyed()) return;
    windowShown = true;
    console.log('[ui] Showing window');
    mainWindow.show();
    mainWindow.focus();
  };

  mainWindow.once('ready-to-show', showWindow);
  // Hard fallback: always show within 3 seconds no matter what
  setTimeout(showWindow, 3000);

  // Intercept all target="_blank" links and window.open calls
  mainWindow.webContents.setWindowOpenHandler(({ url }) => {
    const lowerUrl = url.toLowerCase();
    if (lowerUrl.endsWith('.pdf') || lowerUrl.endsWith('.docx') || lowerUrl.endsWith('.doc')) {
      require('electron').shell.openExternal(url);
      return { action: 'deny' };
    }
    mainWindow.webContents.downloadURL(url);
    return { action: 'deny' };
  });

  // Always load frontend from built dist — works reliably on both file:// and http://
  // The backend server runs independently (as a service or via npm run dev)
  loadFrontend();

  mainWindow.on('closed', () => {
    mainWindow = null;
  });
}

// IPC handler for frontend to read template.xlsx safely in production/packaged mode
ipcMain.handle('get-template-file', async () => {
  try {
    const finalPath = app.isPackaged
      ? path.join(app.getAppPath(), 'dist', 'template.xlsx')
      : path.join(__dirname, '../public/template.xlsx');

    console.log('[ipc] Reading template file from path:', finalPath);
    if (!fs.existsSync(finalPath)) {
      throw new Error(`Template file not found at ${finalPath}`);
    }

    const data = fs.readFileSync(finalPath);
    // Return ArrayBuffer representation
    return data.buffer.slice(data.byteOffset, data.byteOffset + data.byteLength);
  } catch (error) {
    console.error('[ipc] Failed to read template file:', error);
    throw error;
  }
});

// IPC handler for frontend to read SCANNING SUMMARY FORMAT.xlsx safely
ipcMain.handle('get-scanning-template-file', async () => {
  try {
    const finalPath = app.isPackaged
      ? path.join(app.getAppPath(), 'dist', 'SCANNING SUMMARY FORMAT.xlsx')
      : path.join(__dirname, '../public/SCANNING SUMMARY FORMAT.xlsx');

    console.log('[ipc] Reading scanning template file from path:', finalPath);
    if (!fs.existsSync(finalPath)) {
      throw new Error(`Scanning template file not found at ${finalPath}`);
    }

    const data = fs.readFileSync(finalPath);
    return data.buffer.slice(data.byteOffset, data.byteOffset + data.byteLength);
  } catch (error) {
    console.error('[ipc] Failed to read scanning template file:', error);
    throw error;
  }
});

// IPC handler for frontend to get server URL
ipcMain.handle('get-server-url', () => {
  console.log('[ipc] Frontend requested server URL:', GLOBAL_SERVER_URL);
  return GLOBAL_SERVER_URL;
});

// IPC handler for frontend to set server URL dynamically
ipcMain.handle('set-server-url', (event, url) => {
  try {
    console.log('[ipc] Frontend updating server URL to:', url);
    const configPath = path.join(app.getPath('userData'), 'client-config.json');
    fs.writeFileSync(configPath, JSON.stringify({ serverUrl: url }));
    GLOBAL_SERVER_URL = url;
    return { success: true };
  } catch (err) {
    console.error('[ipc] Failed to save server URL:', err);
    return { success: false, error: err.message };
  }
});

// IPC handler to securely fetch and open file in system native app (Acrobat, MS Word)
ipcMain.handle('open-file-natively', async (event, { url, filename }) => {
  try {
    const { shell, app } = require('electron');
    const path = require('path');
    const fs = require('fs');
    const https = require('https');
    
    const tempPath = path.join(app.getPath('temp'), filename || 'document.pdf');
    
    // Download to temp file bypassing cert errors
    return new Promise((resolve, reject) => {
      const file = fs.createWriteStream(tempPath);
      https.get(url, { rejectUnauthorized: false }, (response) => {
        response.pipe(file);
        file.on('finish', () => {
          file.close(async () => {
            // Open the file with default system handler
            await shell.openPath(tempPath);
            resolve({ success: true });
          });
        });
      }).on('error', (err) => {
        fs.unlink(tempPath, () => {});
        reject({ success: false, error: err.message });
      });
    });
  } catch (err) {
    return { success: false, error: err.message };
  }
});

// IPC handler to securely trigger a save dialog for a file (like XLSX)
ipcMain.handle('save-file-natively', async (event, { url, filename }) => {
  try {
    const { dialog, app } = require('electron');
    const fs = require('fs');
    const https = require('https');
    
    const { filePath } = await dialog.showSaveDialog({
      defaultPath: filename || 'document.xlsx',
    });
    
    if (!filePath) return { success: false, canceled: true };
    
    return new Promise((resolve, reject) => {
      const file = fs.createWriteStream(filePath);
      https.get(url, { rejectUnauthorized: false }, (response) => {
        response.pipe(file);
        file.on('finish', () => {
          file.close(() => {
            resolve({ success: true, filePath });
          });
        });
      }).on('error', (err) => {
        fs.unlink(filePath, () => {});
        reject({ success: false, error: err.message });
      });
    });
  } catch (err) {
    return { success: false, error: err.message };
  }
});

// IPC handler for frontend to print window contents to PDF and open it
ipcMain.handle('print-to-pdf', async (event, options) => {
  try {
    const { shell } = require('electron');
    const pdfPath = path.join(app.getPath('temp'), `ERMS-Report-${Date.now()}.pdf`);
    
    // Custom page size (landscape coupon: 13x8.5 inches)
    // 1 inch = 25400 microns. 
    // 13in = 330200 microns. 
    // 8.5in = 215900 microns.
    const data = await mainWindow.webContents.printToPDF({
      marginsType: 1, // Use CSS margins defined in Dashboard.css
      pageSize: {
        width: 330200,
        height: 215900
      },
      landscape: true,
      printBackground: true,
      ...options
    });
    
    fs.writeFileSync(pdfPath, data);
    await shell.openPath(pdfPath);
    return { success: true };
  } catch (err) {
    console.error('[ipc] Failed to generate PDF:', err);
    return { success: false, error: err.message };
  }
});

// Create window when app is ready
app.whenReady().then(() => {
  // Allow self-signed certificates for all requests in this session
  session.defaultSession.setCertificateVerifyProc((request, callback) => {
    callback(0); // 0 = success, bypass certificate verification
  });

  // Note: The backend server runs as a Windows Service (auto-start on boot).
  // The Electron UI does NOT need to auto-start — clients connect directly to the service.
  if (app.isPackaged) {
    app.setLoginItemSettings({ openAtLogin: false });
  }

  startBackendServer();
  configureMediaPermissions();
  createWindow();

  app.on('activate', () => {
    // On macOS, re-create window when dock icon is clicked
    if (BrowserWindow.getAllWindows().length === 0) {
      createWindow();
    }
  });
});

// Quit when all windows are closed (except on macOS)
app.on('window-all-closed', () => {
  if (process.platform !== 'darwin') {
    app.quit();
  }
});

app.on('will-quit', () => {
  // Only kill the in-process server — never kill the background service.
  if (serverProcess) {
    serverProcess.kill();
    serverProcess = null;
  }
});
