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
    const configPath = path.join(__dirname, 'client-config.json');
    if (fs.existsSync(configPath)) {
      return JSON.parse(fs.readFileSync(configPath, 'utf8'));
    }
  } catch {
    // ignore
  }
  return null;
}

// Poll the local server health endpoint until it responds, then invoke callback.
function waitForServer(callback) {
  const healthUrl = 'https://127.0.0.1:5000/api/health';
  const maxAttempts = 120; // 60 seconds (500 ms × 120) - increased for database initialization
  let attempts = 0;
  let done = false;

  console.log('[server] Waiting for backend server to start...');

  function tryOnce() {
    if (done) return;
    attempts++;
    const req = https.get(healthUrl, { rejectUnauthorized: false }, (res) => {
      if (done) { res.resume(); return; }
      res.resume();
      done = true;
      console.log(`[server] ✅ Ready after ${attempts} attempt(s) (${(attempts * 500) / 1000}s)`);
      callback();
    });
    req.on('error', () => {
      if (done) return;
      if (attempts % 20 === 0) {
        // Log progress every 10 seconds
        console.log(`[server] Still waiting... (${(attempts * 500) / 1000}s elapsed)`);
      }
      if (attempts >= maxAttempts) {
        done = true;
        console.warn('[server] ⚠️ Server startup timeout after 60 seconds. Loading frontend anyway - you may see connection errors.');
        callback();
        return;
      }
      setTimeout(tryOnce, 500);
    });
    req.setTimeout(1000, () => { req.destroy(); });
  }

  tryOnce();
}

function loadFrontend() {
  if (!mainWindow || mainWindow.isDestroyed()) return;
  const frontendIndexPath = resolveFrontendIndexPath();
  if (!fs.existsSync(frontendIndexPath)) {
    console.error('[ui] index.html not found at', frontendIndexPath);
  }
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

function startBackendServer() {
  if (!app.isPackaged) return;
  const clientConfig = readClientConfig();
  if (clientConfig?.serverUrl) {
    GLOBAL_SERVER_URL = clientConfig.serverUrl;
    console.log('[server-url] Client config loaded. Server URL set to:', GLOBAL_SERVER_URL);
    return; // client build — use remote server
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

  // Store uploads alongside the install path (app runs as admin so Program Files is writable)
  const uploadsDir = path.join(path.dirname(process.execPath), 'uploads');
  try {
    fs.mkdirSync(path.join(uploadsDir, 'profile-pictures'), { recursive: true });
    fs.mkdirSync(path.join(uploadsDir, 'documents'), { recursive: true });
    console.log('[server] ✅ Uploads directory ready:', uploadsDir);
  } catch (err) {
    console.warn('[server] ⚠️ Could not create uploads dir at', uploadsDir, '-', err.message);
  }

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
      preload: path.join(__dirname, 'preload.cjs'),
      zoomFactor: 0.65
    },
    icon: path.join(__dirname, '../public/icon.ico'),
    title: 'HRMDO - EMIS',
    backgroundColor: '#f9fafb',
    show: false
  });

  // Show window when ready to avoid flickering
  mainWindow.once('ready-to-show', () => {
    console.log('[ui] Window ready to show');
    mainWindow.show();
  });

  // Intercept all target="_blank" links and window.open calls
  mainWindow.webContents.setWindowOpenHandler(({ url }) => {
    const lowerUrl = url.toLowerCase();
    
    // For PDFs and DOCX, hand them over to the OS to open in native apps (Acrobat, Word)
    // This is the most reliable way to "view" them since Electron lacks built-in document viewers.
    if (lowerUrl.endsWith('.pdf') || lowerUrl.endsWith('.docx') || lowerUrl.endsWith('.doc')) {
      require('electron').shell.openExternal(url);
      return { action: 'deny' };
    }
    
    // For XLSX, XLS, and others, force a direct download dialog instead of opening a browser!
    mainWindow.webContents.downloadURL(url);
    return { action: 'deny' };
  });

  // Enforce zoom factor on every navigation (login, dashboard, etc.)
  // Overrides any zoom level persisted by Electron between sessions
  const enforceZoom = () => mainWindow.webContents.setZoomFactor(0.65);
  mainWindow.webContents.on('did-finish-load', enforceZoom);
  mainWindow.webContents.on('did-navigate', enforceZoom);
  mainWindow.webContents.on('did-navigate-in-page', enforceZoom);

  // Load the app
  if (process.env.NODE_ENV === 'development' || !app.isPackaged) {
    // Development mode - load from Vite dev server
    const devUrl = `https://localhost:5174`;
    // In dev mode, server runs on localhost on port 5000 with HTTPS
    GLOBAL_SERVER_URL = `https://localhost:5000`;
    console.log('[ui] Loading from Vite dev server at', devUrl);
    console.log('[server-url] Set to', GLOBAL_SERVER_URL);
    mainWindow.loadURL(devUrl);
    // DevTools can be opened manually via Ctrl+Shift+I if needed
  } else {
    // Production mode
    const clientConfig = readClientConfig();
    if (clientConfig?.serverUrl) {
      // Client build pointing at a remote server — load immediately.
      loadFrontend();
    } else {
      // Load loading splash screen first so window opens instantly
      console.log('[ui] Loading splash screen first...');
      mainWindow.loadFile(path.join(__dirname, 'loading.html'));
    }
  }

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

// IPC handler for frontend to get server URL
ipcMain.handle('get-server-url', () => {
  console.log('[ipc] Frontend requested server URL:', GLOBAL_SERVER_URL);
  return GLOBAL_SERVER_URL;
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

  if (app.isPackaged) {
    // Wait for the local backend to be ready before showing the login page.
    // This prevents "Unable to reach the server" errors caused by the UI
    // loading faster than the server process starts.
    const clientConfig = readClientConfig();
    if (clientConfig?.serverUrl) {
      // Client build pointing at a remote server — load immediately.
      loadFrontend();
    } else {
      waitForServer(loadFrontend);
    }
  }

  app.on('activate', () => {
    // On macOS, re-create window when dock icon is clicked
    if (BrowserWindow.getAllWindows().length === 0) {
      createWindow();
      if (app.isPackaged) {
        const clientConfig = readClientConfig();
        if (clientConfig?.serverUrl) {
          loadFrontend();
        } else {
          waitForServer(loadFrontend);
        }
      }
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
