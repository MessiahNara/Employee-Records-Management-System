# Document Upload Diagnostics Guide

## Overview
The application has been updated with enhanced logging to help diagnose where documents are being uploaded. This guide will help you test and troubleshoot the document upload issue.

## Step 1: Uninstall Previous Version
1. Open **Control Panel** → **Programs and Features**
2. Find **"Employee Records Management System - Server"**
3. Click **Uninstall** and follow the prompts
4. Delete the installation folder if it still exists:
   ```
   C:\Program Files\Employee Records Management System - Server
   ```

## Step 2: Install New Version with Logging
1. Run the new server installer:
   ```
   dist-electron\server\Employee Records Management System - Server Setup 1.0.0.exe
   ```
2. Follow the installation prompts
3. Once installed, the application will start automatically

## Step 3: View Server Logs
The server logs will show important diagnostics when it starts up.

### Method 1: View Logs in Real-Time
1. Open the desktop application
2. Open **Developer Tools** (press **F12**)
3. Go to the **Console** tab
4. You should see server startup messages like:
   ```
   [server] Environment configuration:
     - PORT: 5000
     - NODE_ENV: production
     - UPLOADS_DIR: C:\Program Files\Employee Records Management System - Server\uploads
     - __dirname: ...
   
   [upload] Document upload configuration:
     - UPLOADS_DIR env: C:\Program Files\Employee Records Management System - Server\uploads
     - documentsDir resolved: C:\Program Files\Employee Records Management System - Server\uploads\documents
     - __dirname: ...
   ```

### Method 2: View Logs in Application Output
The application's output can also be viewed in the Electron dev tools.

## Step 4: Test Document Upload
1. Go to an **Employee** record
2. Navigate to the **Documents** tab
3. Upload a document (PDF, Word, etc.)
4. Watch the console output - you should see:
   ```
   [document] Upload received: {
     fileName: "your-file.pdf",
     filePath: "C:\Program Files\Employee Records Management System - Server\uploads\documents\...",
     mimeType: "application/pdf",
     size: 12345
   }
   ```

## Step 5: Verify File Location
1. Open Windows File Explorer
2. Navigate to:
   ```
   C:\Program Files\Employee Records Management System - Server\uploads\documents
   ```
3. Your uploaded files should appear here

## Common Issues & Solutions

### Issue: Files not appearing in uploads folder
**Possible Causes:**
1. **UPLOADS_DIR is showing as "undefined"** in the console
   - Solution: Check that the Electron main process is correctly passing the environment variable
   
2. **documentsDir shows a relative path like "../../uploads/documents"**
   - Solution: The environment variable wasn't set; files are being saved to a fallback location
   - Check: `%LOCALAPPDATA%\...` or other temp directories

3. **No server logs appear in console**
   - Solution: The server process may not have started
   - Check Developer Tools > Console for server startup errors

### Issue: Permission Denied error
**Solution:** Run the application as Administrator
1. Right-click the application shortcut
2. Select "Run as Administrator"

### Issue: Files go to wrong location
**Solution:** Check the exact path shown in the console logs and search for files there

## Sending Diagnostics

If you continue to experience issues, please:
1. Open Developer Tools (F12)
2. Copy all console messages that mention `[server]` or `[upload]` or `[document]`
3. Screenshot the file explorer showing the uploads folder structure
4. Share these details for further investigation

## Key Paths to Check

| Path | Purpose |
|------|---------|
| `C:\Program Files\Employee Records Management System - Server\uploads\documents` | Primary document storage |
| `C:\Program Files\Employee Records Management System - Server\uploads\profile-pictures` | Profile picture storage |
| `%APPDATA%\...` | Fallback location if env var not set |
| `%TEMP%\...` | Temporary file storage |

## Additional Info
- **Application Version:** 1.0.0
- **Framework:** Electron 28.3.3
- **Server Runtime:** Node.js 18+
- **File Upload Handler:** Multer 2.1.1
