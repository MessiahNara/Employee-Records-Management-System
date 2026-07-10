# Server Connection Troubleshooting Guide

## "Unable to Reach the Server" Error

This error occurs when the client application cannot connect to the backend server. This guide will help you diagnose and fix the issue.

---

## Quick Checklist

- [ ] Is the application still loading? (Give it 60+ seconds on first run)
- [ ] Is the application running on the correct computer? (Server app vs Client app)
- [ ] For remote connections: Is the Server URL correct in Settings?
- [ ] Is Windows Firewall blocking the connection?
- [ ] Has the database been corrupted?

---

## Scenario 1: Server Application (Local Server)

### Symptoms
- "Unable to reach the server" error when starting the application
- The application is running on the **Server** computer

### Solution

#### Step 1: Wait for Server Startup
The application may be initializing the database on first run. This can take **60+ seconds**.
- **Do NOT close the application**
- Wait at least **2-3 minutes** for the first start
- After the first start, subsequent launches should be faster

#### Step 2: Check Server Logs
1. Press **F12** to open Developer Tools
2. Go to the **Console** tab
3. Look for messages starting with `[server]`:
   ```
   [server] Starting backend server...
   [server] ✅ Uploads directory ready: C:\Program Files\...
   [server] ✅ Ready after X attempt(s) (5.5s)
   ```

#### Step 3: Check for Errors in Console
If you see error messages like:
- `[server] ❌ Process exited with code X`
- `[server] Error initializing database`
- `ENOENT: no such file or directory`

**Possible Cause**: Database or Prisma files are corrupted or missing.

**Solution**:
1. Uninstall the application from Control Panel → Programs
2. Delete the installation folder: `C:\Program Files\Employee Records Management System - Server`
3. Delete the database: `%APPDATA%\Employee Records Management System` (if exists)
4. Reinstall the application from the installer

#### Step 4: Check Firewall
Windows Firewall may be blocking the server:

1. Open **Windows Defender Firewall** → **Allow an app through firewall**
2. Look for **"Employee Records Management System"**
3. Make sure **both "Private" and "Public"** are checked
4. Click **OK** and try again

If the app is not in the list:
1. Click **"Allow another app"**
2. Click **"Browse"** and find the installation folder
3. Select **"Employee Records Management System.exe"**
4. Click **"Open"** and then **"Add"**

#### Step 5: Check Disk Space
The database needs space to initialize:
1. Right-click the drive where the app is installed
2. Select **"Properties"**
3. Verify you have at least **1 GB** of free space

If not, delete old files or install on a different drive.

#### Step 6: Run as Administrator
1. Right-click the application shortcut
2. Select **"Run as administrator"**
3. Click **"Yes"** when prompted

---

## Scenario 2: Client Application (Remote Server)

### Symptoms
- "Unable to reach the server" error or timeout when starting
- The application is running on a **different computer** than the Server
- You're trying to connect to a remote Server computer

### Solution

#### Step 1: Find the Server IP Address
On the **Server computer**:
1. Open the Server application
2. Press **F12** to open Developer Tools
3. Go to the **Console** tab
4. Look for the line:
   ```
   🌐 LAN access URLs:
      http://192.168.1.100:5000
      http://192.168.1.105:5000
   ```
5. **Copy one of these IP addresses**

#### Step 2: Configure Server URL on Client Computer
On the **Client computer**:
1. Open the Client application
2. Once you see the login screen (even with error), press **F12**
3. If the error persists, you may need to manually set the Server URL:
   - Go to **Settings** → **System** → **Server Configuration**
   - Paste the IP address from Step 1
   - Click **"Save Server URL"**
   - Restart the application

#### Step 3: Verify Network Connectivity
On the **Client computer**, open PowerShell and run:
```powershell
ping 192.168.1.100
```
Replace `192.168.1.100` with the actual Server IP address.

If you see `Reply from...`:
✅ Network connection is working

If you see `Request timed out`:
❌ Cannot reach the Server computer
- Check both computers are on the same network
- Check Server firewall settings (see Step 4 below)

#### Step 4: Test Server Connection
On the **Client computer**, open PowerShell and run:
```powershell
Test-NetConnection -ComputerName 192.168.1.100 -Port 5000
```

If you see `TcpTestSucceeded : True`:
✅ Server port is reachable

If you see `TcpTestSucceeded : False`:
❌ Firewall is blocking the connection
- Follow the Firewall solution in Scenario 1, Step 4 on the **Server computer**

#### Step 5: Check Server is Still Running
On the **Server computer**:
1. Press **F12** to open Developer Tools
2. Check the Console tab for errors
3. If you see error messages, the server may have crashed
4. Restart the Server application

---

## Scenario 3: Database Corruption

### Symptoms
- Server logs show `ENOENT`, `EACCES`, or database errors
- The error persists even after waiting and restarting
- The application worked before but now shows connection errors

### Solution

#### For Server Installation

1. **Backup your data** (if important):
   - Go to the application's Documents tab
   - Export/download any important files

2. **Delete the corrupted database**:
   - Open File Explorer
   - Navigate to: `%APPDATA%` (C:\Users\[YourUsername]\AppData\Roaming)
   - Delete the folder: **"Employee Records Management System"** (if it exists)

3. **Reinstall the application**:
   - Uninstall from Control Panel → Programs
   - Restart your computer
   - Run the installer again
   - Wait for database initialization (60+ seconds on first run)

4. **Re-import your data** (if needed):
   - Use the bulk upload features to restore employee data

---

## Advanced Diagnostics

### Check Server Process
On the **Server computer**:
1. Open **Task Manager** (Ctrl+Shift+Esc)
2. Look for **"Employee Records Management System"**
3. Check CPU and Memory usage:
   - If CPU is very high (>80%), the server may be stuck
   - Click **"End Task"** and restart

### Check Application Logs
Logs are displayed in the Developer Console (F12):
- Messages starting with `[server]` show server status
- Messages starting with `[upload]` show file upload activity
- Messages starting with `[permissions]` show permission issues

Copy these logs and include them when reporting issues.

### Restart Services
If nothing else works:
1. Open **Task Manager**
2. Restart the application completely
3. Wait 2-3 minutes for initialization
4. Try again

---

## When to Reinstall

Reinstall the application if:
- Error messages mention "ENOENT" or "file not found"
- The database folder seems corrupted
- The application worked before but now never starts properly
- Previous troubleshooting steps didn't help

**Before reinstalling**:
1. Export/backup any important employee records
2. Document the exact error messages you're seeing
3. Note the Server IP addresses from the Console

---

## Need Help?

If the issue persists:
1. Take a screenshot of the error message
2. Open Developer Tools (F12) and note all `[server]` messages
3. Include the date/time the issue started
4. Note whether this is a fresh install or an existing one that stopped working
5. Provide as much detail as possible about your setup

---

## Quick Reference

| Issue | Solution |
|-------|----------|
| First startup takes 60+ seconds | Wait, this is normal during database initialization |
| "Unable to reach server" on first load | Wait longer (up to 2-3 minutes), especially if storage is slow |
| Can't connect from another computer | Find Server IP in Console (F12), set in Client Settings |
| Firewall blocking connection | Allow app through Windows Firewall |
| Database error messages | Delete database folder, reinstall app, wait for reinitialization |
| Server keeps crashing | Check Task Manager for high CPU/memory, consider SSD upgrade |

---

## Performance Notes

**First Start**: 60-180 seconds (database initialization)  
**Subsequent Starts**: 10-20 seconds  
**Normal Operation**: Should be smooth, no lag

If startup is slower than this on subsequent runs, check:
- Hard drive health (Task Manager → Performance)
- Windows Firewall (may be scanning files)
- Windows Update (may be running in background)
