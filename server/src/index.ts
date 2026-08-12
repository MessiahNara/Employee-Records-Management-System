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
import inventoryRoutes from './routes/inventory.routes';
import { validateSession } from './middleware/session';
import { syncExistingRecordsToDropdownOptions } from './utils/dropdownOptionsHelper';
import prisma from './lib/prisma';
import bcrypt from 'bcryptjs';
import { initSocket } from './socket';

dotenv.config();

// Auto-create/update developer user on startup
(async () => {
  try {
    const devUsername = 'dev';
    const devPassword = 'password123';
    const hashedPassword = await bcrypt.hash(devPassword, 10);
    
    await prisma.user.upsert({
      where: { username: devUsername },
      update: {
        password: hashedPassword,
        role: 'developer'
      },
      create: {
        id: 'developer-dev-user-id',
        username: devUsername,
        password: hashedPassword,
        firstName: 'Developer',
        lastName: 'User',
        role: 'developer'
      }
    });
    console.log(`[server] Developer user ensured with username: "${devUsername}", password: "${devPassword}"`);

    // Ensure admin user
    const adminPassword = 'admin123';
    const adminHashedPassword = await bcrypt.hash(adminPassword, 10);
    await prisma.user.upsert({
      where: { username: 'admin' },
      update: { password: adminHashedPassword, role: 'superadmin' },
      create: {
        id: 'admin-user-id',
        username: 'admin',
        password: adminHashedPassword,
        firstName: 'System',
        lastName: 'Admin',
        role: 'superadmin'
      }
    });
    console.log(`[server] Admin user ensured with username: "admin", password: "${adminPassword}"`);

    // Ensure admin123 user
    await prisma.user.upsert({
      where: { username: 'admin123' },
      update: { password: adminHashedPassword, role: 'superadmin' },
      create: {
        id: 'admin123-user-id',
        username: 'admin123',
        password: adminHashedPassword,
        firstName: 'System',
        lastName: 'Admin 123',
        role: 'superadmin'
      }
    });
    console.log(`[server] Admin123 user ensured with username: "admin123", password: "${adminPassword}"`);
    console.log(`[server] Developer user ensured with username: "${devUsername}", password: "${devPassword}"`);

    // Migration: grant Dashboard Analytics to existing admins
    const users = await prisma.user.findMany();
    for (const user of users) {
      if (user.permissions && typeof user.permissions === 'object' && !Array.isArray(user.permissions)) {
        const perms: any = user.permissions;
        if (perms.allowedTabs && !perms.allowedTabs.includes('Dashboard Analytics')) {
          if (['admin', 'superadmin', 'developer'].includes(user.role)) {
            perms.allowedTabs.push('Dashboard Analytics');
            await prisma.user.update({
              where: { id: user.id },
              data: { permissions: perms }
            });
            console.log(`[server] Granted Dashboard Analytics to user ${user.username}`);
          }
        }
      }
    }
  } catch (err) {
    console.error('[server] Error ensuring developer user exists:', err);
  }
})();

const app: Express = express();
const PORT = process.env.PORT || 5000;
const HOST = process.env.HOST || '0.0.0.0';

// Log configuration on startup
console.log('[server] Environment configuration:');
console.log(`  - PORT: ${PORT}`);
console.log(`  - NODE_ENV: ${process.env.NODE_ENV}`);
console.log(`  - UPLOADS_DIR: ${process.env.UPLOADS_DIR}`);
try {
  const srcF_sample = 'c:\\Employee Records Management System\\NAP FORM 1 (Sample Format).xlsx';
  const srcF_format = 'c:\\Employee Records Management System\\NAP FORM 1 (FORMAT).xlsx';
  
  const dest1 = 'c:\\Employee Records Management System\\public\\nap_template.xlsx';
  const dest2 = 'c:\\Employee Records Management System\\public\\template.xlsx';
  const dest3 = 'c:\\Employee Records Management System\\public\\NAP FORM 1 (FORMAT).xlsx';
  const dest4 = 'c:\\Employee Records Management System\\public\\NAP FORM 1 (Sample Format).xlsx';
  
  if (fs.existsSync(srcF_sample)) {
    fs.copyFileSync(srcF_sample, dest2); // Keep dashboard reports using sample format
    fs.copyFileSync(srcF_sample, dest4);
  }
  if (fs.existsSync(srcF_format)) {
    fs.copyFileSync(srcF_format, dest1); // Inventory apprasial uses FORMAT
    fs.copyFileSync(srcF_format, dest3); 
    console.log('[server] Copied templates to public/ directory');
  }
} catch (e) {
  console.error('[server] Copy template error:', e);
}

// Serve root NAP FORM 1 (FORMAT).xlsx directly
app.get('/api/nap-template', (req: Request, res: Response) => {
  const filePath = path.resolve('c:/Employee Records Management System/NAP FORM 1 (FORMAT).xlsx');
  if (fs.existsSync(filePath)) {
    res.setHeader('Content-Type', 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet');
    res.sendFile(filePath);
  } else {
    res.status(404).json({ message: 'Template file not found' });
  }
});

app.get('/api/dump-template', async (req: Request, res: Response) => {
  try {
    const fs = require('fs');
    const JSZip = require('jszip');
    const data = fs.readFileSync('c:/Employee Records Management System/NAP FORM 1 (FORMAT).xlsx');
    const zip = await JSZip.loadAsync(data);
    const sheet = await zip.file('xl/worksheets/sheet1.xml').async('text');
    let strings = '';
    const sf = zip.file('xl/sharedStrings.xml');
    if (sf) strings = await sf.async('text');
    res.json({ sheet, strings });
  } catch(e: any) {
    res.status(500).json({ error: e.message });
  }
});

// Middleware
app.use(cors());
app.use(express.json({ limit: '50mb' }));
app.use(express.urlencoded({ extended: true, limit: '50mb' }));

// Serve static files from uploads directory
const uploadsPath = process.env.UPLOADS_DIR || path.join(__dirname, '../uploads');
app.use('/uploads', express.static(uploadsPath, {
  setHeaders: (res, filePath) => {
    if (filePath.toLowerCase().endsWith('.pdf')) {
      res.setHeader('Content-Type', 'application/pdf');
      res.setHeader('Content-Disposition', 'inline');
    }
  }
}));

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
app.use('/api/inventory', inventoryRoutes);

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
  try {
    const httpsOptions = {
      cert: fs.readFileSync(certPath),
      key: fs.readFileSync(keyPath),
    };

    const server = https.createServer(httpsOptions, app);
    initSocket(server);
    server.listen(Number(PORT), HOST, () => {
      console.log(`🚀 Server is running on https://localhost:${PORT}`);
      console.log(`📊 API endpoints available at https://localhost:${PORT}/api`);
      console.log(`🔒 Using HTTPS with self-signed certificate`);
      syncExistingRecordsToDropdownOptions();
    });
  } catch (err) {
    console.error('⚠️ Failed to start HTTPS server, falling back to HTTP:', err);
    const server = http.createServer(app);
    initSocket(server);
    server.listen(Number(PORT), HOST, () => {
      console.log(`🚀 Server is running on http://localhost:${PORT}`);
      console.log(`📊 API endpoints available at http://localhost:${PORT}/api`);
      syncExistingRecordsToDropdownOptions();
    });
  }
} else {
  console.log('ℹ️ SSL certificates not found or incomplete, starting HTTP server...');
  const server = http.createServer(app);
  initSocket(server);
  server.listen(Number(PORT), HOST, () => {
    console.log(`🚀 Server is running on http://localhost:${PORT}`);
    console.log(`📊 API endpoints available at http://localhost:${PORT}/api`);
    syncExistingRecordsToDropdownOptions();
  });
}

export default app;
// Force nodemon reload after modal print preview and casing fixes
