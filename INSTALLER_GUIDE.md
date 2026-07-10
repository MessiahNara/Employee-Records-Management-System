# Employee Records Management System - Installer Guide

## Overview

The Employee Records Management System now provides two separate installers for flexible deployment:

1. **Server Installer** - Backend infrastructure (Express.js, Prisma, Database)
2. **Client Installer** - Frontend UI (React, Electron) with configurable server URL

This allows you to deploy the server and clients independently across different machines.

---

## Installers Location

All installers are located in `dist-electron/`:

- **Server Installer**: `dist-electron/server/Employee Records Management System - Server Setup 1.0.0.exe`
- **Client Installer**: `dist-electron/client/Employee Records Management System - Client Setup 1.0.0.exe`
- **Full Installer** (Combined): `dist-electron/full/Employee Records Management System Setup 1.0.0.exe` (if built with `npm run electron:build:full`)

---

## Installation Instructions

### Option 1: Single Machine Installation (Full Installer)

Use the combined full installer if you want both server and client on one machine:

```bash
npm run electron:build:full
```

Then run: `dist-electron/full/Employee Records Management System Setup 1.0.0.exe`

---

### Option 2: Separate Server & Client Installation (Recommended)

#### Step 1: Install Server

1. Run: `dist-electron/server/Employee Records Management System - Server Setup 1.0.0.exe`
2. Follow the installation wizard
3. The server will be installed as a system-wide application
4. Server runs on **port 5000** by default
5. Note the server machine's IP address or hostname

#### Step 2: Install Client(s)

1. Run: `dist-electron/client/Employee Records Management System - Client Setup 1.0.0.exe`
2. Follow the installation wizard
3. Launch the application after installation

#### Step 3: Configure Client to Connect to Server

1. Once the client launches, navigate to **Settings** (gear icon)
2. Go to the **System** tab
3. Find **Server Configuration** section
4. Enter the server address:
   - Format: `http://SERVER_IP:5000` or `https://server.example.com`
   - Examples:
     - `http://192.168.1.100:5000` (Local Network)
     - `https://emis.company.com` (Remote Server with HTTPS)
     - `emis.company.local:5000` (Local Domain)
5. Click **Save Server URL**
6. **Restart the application** for changes to take effect

---

## Build Commands

### Build Server Installer Only
```bash
npm run electron:build:server-installer
```

### Build Client Installer Only
```bash
npm run electron:build:client-installer
```

### Build Full Installer (Combined)
```bash
npm run electron:build:full
```

### Rebuild All Installers
```bash
npm run electron:build:full && npm run electron:build:server-installer && npm run electron:build:client-installer
```

---

## Installer Specifications

### Server Installer

**Package Contents:**
- Node.js runtime environment
- Express.js backend server
- Prisma ORM & database setup
- Database migrations
- SSL/TLS support (configurable)
- Automatic service startup

**System Requirements:**
- Windows 7 or higher
- 500 MB disk space
- Administrator privileges for installation
- Port 5000 available (or configured port)

**Installation Type:**
- Per-Machine (system-wide)
- Service/Daemon capable
- Starts automatically on system boot

**Default Configuration:**
- Port: 5000
- Host: 0.0.0.0 (accessible from any network interface)
- Environment: Production

### Client Installer

**Package Contents:**
- React frontend application
- Electron desktop wrapper
- Configurable server URL storage
- Local browser cache & session storage
- Desktop shortcuts and Start Menu entries

**System Requirements:**
- Windows 7 or higher
- 300 MB disk space
- User privileges sufficient (no admin required)
- Network connectivity to server

**Installation Type:**
- Per-User (user-specific)
- Desktop and Start Menu shortcuts
- Auto-starts with Windows login (optional)

**Configuration Storage:**
- Server URL saved in browser localStorage
- Persists across application restarts

---

## Deployment Scenarios

### Scenario 1: Local Network Deployment

```
[Server Machine - Server Installer]
    ↑
    | Network (HTTP on port 5000)
    ↓
[Client Machines - Client Installer]
```

**Setup Steps:**
1. Install server on central machine (e.g., `192.168.1.10`)
2. Install client on each user workstation
3. Configure each client to `http://192.168.1.10:5000`

---

### Scenario 2: Remote/Cloud Deployment

```
[Cloud Server - Server Installer]
    ↑
    | Internet (HTTPS)
    ↓
[Client Machines Anywhere - Client Installer]
```

**Setup Steps:**
1. Install server on cloud instance with domain (e.g., `emis.company.com`)
2. Configure SSL/TLS certificates
3. Install client on user machines
4. Configure each client to `https://emis.company.com`

---

### Scenario 3: Hybrid Deployment

```
[Central Server - Server Installer]
    ↑
    |
    ├─→ [Office A Clients - Client Installer]
    ├─→ [Office B Clients - Client Installer]
    └─→ [Remote Users - Client Installer]
```

All clients configured to connect to central server via network or VPN.

---

## Server Configuration

The server installer includes a `.env` file for configuration:

### Environment Variables

```env
# Database
DATABASE_URL=file:./prisma/dev.db

# Server
PORT=5000
NODE_ENV=production

# Session Security
SESSION_SECRET=your-secret-key-here

# Logging
LOG_LEVEL=info
```

Modify these settings after installation as needed.

---

## Client Server URL Configuration

### Via Settings UI

1. Open **Settings** (gear icon)
2. Switch to **System** tab
3. Scroll to **Server Configuration**
4. Enter server URL
5. Save and restart

### Via Local Storage

If needed, you can manually edit localStorage by:
1. Opening Developer Tools (F12)
2. Going to Application → Local Storage
3. Finding the `serverUrl` key
4. Editing the value directly

### Reset to Default

- Click **Reset to Default** button in Settings
- Client will connect to embedded server if available
- Application restart required

---

## Troubleshooting

### Client Can't Connect to Server

1. **Verify server is running**
   - On server machine, check if port 5000 is listening: `netstat -an | find ":5000"`

2. **Check network connectivity**
   - Ping the server: `ping SERVER_IP`
   - Check firewall rules on both machines

3. **Verify server URL format**
   - Should include protocol: `http://` or `https://`
   - Should include port if not standard (80/443): `:5000`
   - Example: `http://192.168.1.100:5000`

4. **Check application logs**
   - Server logs: Windows Event Viewer or server console
   - Client logs: Developer Tools (F12) → Console

### Server Won't Start

1. **Port already in use**
   - Change PORT in `.env`
   - Restart service

2. **Database issues**
   - Run migrations: `npm run db:migrate`
   - Check database file permissions

3. **Insufficient privileges**
   - Run installer as Administrator
   - Check file permissions in installation directory

---

## Profile Picture Upload

### Single Upload
- Per-employee in **Employee Details** page
- Accepts: JPG, JPEG, PNG
- Rejects: ZIP, RAR archives

### Bulk Upload
- In **Settings** → **System** → **Bulk Profile Picture Upload**
- Name files as: `EMPLOYEE_ID.jpg` (e.g., `EMP001.jpg`)
- Drag-drop or click to select multiple PNG/JPG files
- ZIP/RAR files are explicitly rejected
- Results show matched/unmatched/failed uploads

---

## Version & Build Info

- **Version**: 1.0.0
- **Electron**: 28.3.3
- **React**: 18.2.0
- **Node.js Target**: 18+
- **Database**: SQLite (Prisma)

---

## Support & Documentation

- **Profile Picture Upload**: Enable PNG/JPG direct upload
- **Bulk Operations**: Import employee photos by ID
- **Server Configuration**: Connect to remote backend
- **Security**: Super Admin authorization required for user profile changes

---

## License

Employee Records Management System
© HRMDO - All Rights Reserved

