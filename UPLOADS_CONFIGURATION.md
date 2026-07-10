# Upload Directories Configuration

## Overview

Both client uploads (from remote computers) and server uploads are automatically configured to use the installation directory structure.

---

## Upload Paths

### Server Installation (Standalone)

When the **Server Installer** is installed, uploads are stored at:

```
C:\Program Files\Employee Records Management System - Server\uploads\
├── profile-pictures/       # Employee profile photos (JPG/PNG)
└── documents/              # Employee documents (PDF)
```

### Document Upload Path

**Documents uploaded from client computers go to:**
```
C:\Program Files\Employee Records Management System - Server\uploads\documents\
```

**Subdirectories are automatically created per employee:**
```
C:\Program Files\Employee Records Management System - Server\uploads\documents\
├── John Doe/
│   ├── Identification/
│   │   └── passport.pdf
│   └── Medical Records/
│       └── physical_exam.pdf
├── Jane Smith/
│   ├── Contracts/
│   │   └── employment_contract.pdf
│   └── Certifications/
│       └── license.pdf
└── [Employee Name]/
    └── [Category]/
        └── [document_files].pdf
```

### Profile Picture Upload Path

**Profile pictures uploaded from client computers go to:**
```
C:\Program Files\Employee Records Management System - Server\uploads\profile-pictures\
```

**File naming convention:**
```
[employee-id]-[timestamp].jpg
[employee-id]-[timestamp].png
```

---

## How It Works

### 1. Server Startup (Embedded Server)

When the server starts, the Electron main process:

1. Determines the installation path automatically
2. Creates the uploads directory structure:
   ```
   uploadsDir = C:\Program Files\Employee Records Management System - Server\uploads
   ```
3. Creates subdirectories: `profile-pictures` and `documents`
4. Passes the `UPLOADS_DIR` path to the Node.js server process

### 2. Client Upload (Remote Computer)

When a **client computer** uploads a document:

1. Client app sends POST request to server: `/api/documents`
2. Server receives the upload
3. Server stores file to: `C:\Program Files\Employee Records Management System - Server\uploads\documents\[Employee Name]\[Category]\[filename].pdf`
4. Server stores metadata in database (SQLite)
5. Database record includes file path for retrieval

### 3. Serving Files to Clients

When clients need to view/download files:

1. Client requests: `/uploads/documents/[path]`
2. Server Express static middleware serves files from:
   ```
   C:\Program Files\Employee Records Management System - Server\uploads\
   ```
3. Files are sent to client over network

---

## Environment Variable Configuration

The `UPLOADS_DIR` environment variable is set by the Electron main process:

**In `electron/main.cjs`:**
```javascript
const uploadsDir = path.join(path.dirname(process.execPath), 'uploads');

serverProcess = utilityProcess.fork(serverBundlePath, [], {
  env: {
    UPLOADS_DIR: uploadsDir,  // C:\Program Files\Employee Records Management System - Server\uploads
    // ... other env vars
  }
});
```

**In `server/src/middleware/upload.ts`:**
```typescript
const documentsDir = process.env.UPLOADS_DIR
  ? path.join(process.env.UPLOADS_DIR, 'documents')
  : path.join(__dirname, '../../uploads/documents');
```

---

## File Upload Rules

### Profile Pictures
- **Allowed Formats**: JPG, JPEG, PNG
- **Upload Endpoint**: `POST /api/employees/{id}/profile-picture`
- **Storage Location**: `uploads/profile-pictures/`
- **Restrictions**: 
  - ZIP and RAR archives are **explicitly rejected**
  - Single file per employee
  - Browser MIME type quirks supported (image/pjpeg, image/x-png)

### Documents
- **Allowed Formats**: PDF only
- **Upload Endpoint**: `POST /api/documents`
- **Storage Location**: `uploads/documents/[Employee Name]/[Category]/`
- **Required Fields**:
  - `employeeName`: Employee name (sanitized to filesystem-safe)
  - `category`: Document category (sanitized)
  - `file`: PDF file
- **Subdirectories**: Auto-created per employee and category

---

## File Access

### Retrieving Files

**Profile Picture:**
```
GET /uploads/profile-pictures/{filename}
Example: /uploads/profile-pictures/EMP001-1234567890.jpg
```

**Document:**
```
GET /uploads/documents/{employeeName}/{category}/{filename}
Example: /uploads/documents/John Doe/Medical Records/physical_exam.pdf
```

### Filesystem Path

All files are accessible directly at:
```
C:\Program Files\Employee Records Management System - Server\uploads\[type]\[path]
```

---

## Multi-Computer Deployment

### Scenario: Server on Machine A, Clients on Machines B & C

```
┌─────────────────────────────────────────────┐
│ Machine A: Server Installer                 │
│ Location: C:\Program Files\...\uploads\    │
│ - Profile pictures stored here              │
│ - Documents stored here                     │
└─────────────────────────────────────────────┘
         ↑                 ↑
         │ Network (port 5000) │
         │                 │
┌────────┴──────┐  ┌──────┴────────┐
│Machine B      │  │ Machine C     │
│Client Upload  │  │ Client Upload │
└───────────────┘  └───────────────┘
```

**How it works:**
1. Client B uploads document → Server A receives → Stored at `C:\Program Files\...\Server\uploads\documents\`
2. Client C uploads picture → Server A receives → Stored at `C:\Program Files\...\Server\uploads\profile-pictures\`
3. All clients can download/view files from Server A

---

## Troubleshooting

### Documents Not Uploading

1. **Check server is running**
   - Verify port 5000 is accessible from client

2. **Check permissions**
   - Ensure server service has write permissions to:
     ```
     C:\Program Files\Employee Records Management System - Server\uploads\
     ```

3. **Check directory existence**
   - Navigate to `C:\Program Files\Employee Records Management System - Server\uploads\`
   - Verify `documents` subdirectory exists
   - If missing, restart server to recreate

4. **Check client-server connection**
   - In Settings → System → Server Configuration
   - Verify server URL is correct (e.g., `http://192.168.1.100:5000`)

### Files Not Visible After Upload

1. **Database issue**
   - Server logs file was uploaded but database record missing
   - Check server error logs

2. **File path issue**
   - Check file was created at expected location in File Explorer
   - Look in: `C:\Program Files\Employee Records Management System - Server\uploads\documents\`

3. **Client cache issue**
   - Clear browser cache (F12 → Application → Clear Site Data)
   - Refresh page

---

## Backup & Restore

### Backup Upload Files

To backup all uploaded files and documents:

```batch
# Command to backup uploads folder
xcopy "C:\Program Files\Employee Records Management System - Server\uploads\*" "D:\Backup\uploads\" /E /I /Y
```

### Restore Upload Files

```batch
# Command to restore from backup
xcopy "D:\Backup\uploads\*" "C:\Program Files\Employee Records Management System - Server\uploads\" /E /I /Y
```

---

## Security Considerations

1. **File Permissions**
   - Server runs as Administrator (Windows service)
   - Uploads directory is writable by server process
   - Recommended: Restrict network access to server on port 5000

2. **File Type Validation**
   - Server validates PDF files on upload
   - MIME type checking prevents non-PDF documents
   - Browser-side validation prevents ZIP/RAR uploads for profile pictures

3. **Filename Sanitization**
   - Employee names and categories are sanitized to be filesystem-safe
   - Special characters removed/replaced with hyphens
   - Prevents directory traversal attacks

---

## Disk Space Management

### Estimated Storage

- **Profile Picture**: ~200-500 KB per employee (JPG/PNG)
- **PDF Document**: ~500 KB - 5 MB per document (varies)

**Example for 500 employees with documents:**
```
Profile Pictures: 500 × 300 KB = ~150 MB
Documents: 500 employees × 10 docs × 1 MB = ~5 GB
Total: ~5.2 GB
```

### Cleanup

To remove old/unused files:
1. Stop the server
2. Navigate to `C:\Program Files\Employee Records Management System - Server\uploads\`
3. Delete files manually or use scripts
4. Restart server

---

## Configuration Summary

| Setting | Value |
|---------|-------|
| Profile Pictures Path | `C:\Program Files\Employee Records Management System - Server\uploads\profile-pictures` |
| Documents Path | `C:\Program Files\Employee Records Management System - Server\uploads\documents` |
| Base Uploads Path | `C:\Program Files\Employee Records Management System - Server\uploads` |
| Environment Variable | `UPLOADS_DIR` |
| File Access URL | `http://[server-ip]:5000/uploads/` |
| Allowed Profile Formats | JPG, JPEG, PNG |
| Allowed Document Formats | PDF only |
| Max Concurrent Uploads | Unlimited (server dependent) |

