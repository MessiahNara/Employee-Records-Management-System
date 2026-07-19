import express, { Express, Request, Response } from 'express';
import cors from 'cors';
import dotenv from 'dotenv';
import path from 'path';
import fs from 'fs';
import http from 'http';
import https from 'https';
import userRoutes from './routes/user.routes';
import employeeRoutes from './routes/employee.routes';
import documentRoutes from './routes/document.routes';
import auditRoutes from './routes/audit.routes';
import systemSettingsRoutes from './routes/systemSettings.routes';
import file201Routes from './routes/file201.routes';
import approvalRoutes from './routes/approval.routes';
import activityRoutes from './routes/activity.routes';
import chatRoutes from './routes/chat.routes';
import yellowBoxRoutes from './routes/yellowBox.routes';
import { validateSession } from './middleware/session';
import { syncExistingRecordsToDropdownOptions } from './utils/dropdownOptionsHelper';

dotenv.config();

const app: Express = express();
const PORT = process.env.PORT || 5000;
const HOST = process.env.HOST || '0.0.0.0';

// Log configuration on startup
console.log('[server] Environment configuration:');
console.log(`  - PORT: ${PORT}`);
console.log(`  - NODE_ENV: ${process.env.NODE_ENV}`);
console.log(`  - UPLOADS_DIR: ${process.env.UPLOADS_DIR}`);
console.log(`  - __dirname: ${__dirname}`);

// Middleware
app.use(cors());
app.use(express.json({ limit: '50mb' }));
app.use(express.urlencoded({ extended: true, limit: '50mb' }));

// Serve static files from uploads directory
const uploadsPath = process.env.UPLOADS_DIR || path.join(__dirname, '../uploads');
app.use('/uploads', express.static(uploadsPath));

// Proxy missing uploads to remote server (for installs where uploads live on another machine)
const remoteUploadsUrl = process.env.REMOTE_UPLOADS_URL;
if (remoteUploadsUrl) {
  app.use('/uploads', (req: Request, res: Response) => {
    const targetUrl = `${remoteUploadsUrl}/uploads${req.path}`;
    const parsedUrl = new URL(targetUrl);
    const options = {
      hostname: parsedUrl.hostname,
      port: parseInt(parsedUrl.port) || 80,
      path: parsedUrl.pathname,
      method: 'GET',
    };
    const proxyReq = http.get(options, (proxyRes) => {
      res.writeHead(proxyRes.statusCode || 200, proxyRes.headers);
      proxyRes.pipe(res);
    });
    proxyReq.on('error', () => res.status(404).send('Not found'));
  });
}

// Session verification middleware for concurrent logins
app.use(validateSession);

// Routes
app.use('/api/users', userRoutes);
app.use('/api/employees', employeeRoutes);
app.use('/api/documents', documentRoutes);
app.use('/api/audit', auditRoutes);
app.use('/api/system-settings', systemSettingsRoutes);
app.use('/api/file201', file201Routes);
app.use('/api/approvals', approvalRoutes);
app.use('/api/activities', activityRoutes);
app.use('/api/chats', chatRoutes);
app.use('/api/yellow-boxes', yellowBoxRoutes);

// Health check
app.get('/api/health', (req: Request, res: Response) => {
  res.json({ status: 'ok', message: 'Server is running' });
});

// Serve frontend static files for network clients (production only)
const frontendDist = process.env.FRONTEND_DIST;
if (frontendDist && fs.existsSync(frontendDist)) {
  app.use(express.static(frontendDist));
  // SPA fallback — serve index.html for any unmatched route
  app.get('*', (_req: Request, res: Response) => {
    res.sendFile(path.join(frontendDist, 'index.html'));
  });
}

// Start server with HTTPS
const certPath = process.env.SSL_CERT_PATH || path.join(__dirname, '../certs/server-cert.pem');
const keyPath = process.env.SSL_KEY_PATH || path.join(__dirname, '../certs/server-key.pem');

if (fs.existsSync(certPath) && fs.existsSync(keyPath)) {
  const httpsOptions = {
    cert: fs.readFileSync(certPath),
    key: fs.readFileSync(keyPath),
  };

  https.createServer(httpsOptions, app).listen(Number(PORT), HOST, () => {
    console.log(`🚀 Server is running on https://localhost:${PORT}`);
    console.log(`📊 API endpoints available at https://localhost:${PORT}/api`);
    console.log(`🔒 Using HTTPS with self-signed certificate`);
    // Seed existing database values into dynamic dropdown lists on start
    syncExistingRecordsToDropdownOptions();
  });
} else {
  console.error('❌ SSL certificates not found!');
  console.log('Please run: node scripts/generate-ssl-cert-node.js');
  console.log('Expected files:');
  console.log(`  - ${certPath}`);
  console.log(`  - ${keyPath}`);
  process.exit(1);
}

export default app;
// Force nodemon reload after modal print preview and casing fixes
