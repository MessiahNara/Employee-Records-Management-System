# Network Connection Setup Guide

## Overview
This guide explains how to connect the Client application from another computer to the Server application running on a different machine.

## Scenario: Two Computer Setup
- **Computer A** (Server): Running "Employee Records Management System - Server"
- **Computer B** (Client): Running "Employee Records Management System - Client" (connecting to Computer A)

---

## Step 1: Start the Server on Computer A

1. Launch **"Employee Records Management System - Server"** on Computer A
2. The application will start automatically with an embedded server
3. Open **Developer Tools** by pressing **F12**
4. Click the **Console** tab at the bottom
5. Look for the startup messages showing:
   ```
   🚀 Server is running on http://localhost:5000
   🌐 LAN access URLs:
      http://192.168.1.100:5000
      http://192.168.1.105:5000
   ```

6. **Copy one of the IP addresses** shown under "🌐 LAN access URLs:"
   - Choose the IP address that matches your network
   - Example: `http://192.168.1.100:5000`

---

## Step 2: Install Client on Computer B

1. Run the installer: **"Employee Records Management System - Client Setup 1.0.0.exe"**
2. Follow the installation wizard
3. Complete the installation

---

## Step 3: Configure Server URL on Computer B

1. Launch the Client application on Computer B
2. Once logged in, go to **Settings** → **System**
3. Scroll down to **"Server Configuration"** section
4. In the **"Server URL"** field, paste the IP address you copied from Computer A
   - Example: `http://192.168.1.100:5000`
5. Click **"Save Server URL"**
6. You'll see a message: "Server URL saved successfully. Please restart the application for changes to take effect."
7. **Close and restart** the Client application

---

## Step 4: Verify Connection

After restarting the Client, the application should now connect to the Server on Computer A.

### If Connection Still Fails:

1. **Check the Server is Running**
   - Verify Computer A's Server application is still running
   - Check the Console (F12) to see if it's showing network errors

2. **Verify Network Connectivity**
   - From Computer B, try to ping Computer A:
     ```powershell
     ping 192.168.1.100
     ```
   - Replace with the actual IP address shown in the Server console

3. **Check Firewall**
   - Windows Firewall may be blocking port 5000
   - Make sure Windows Firewall allows the application or port 5000

4. **Verify IP Address Format**
   - The URL should be: `http://192.168.1.100:5000` (with HTTP, not HTTPS)
   - Include the port number (5000)

5. **Reset to Default**
   - If you want to go back to the default server:
   - Go to Settings → System → Server Configuration
   - Click "Reset to Default"
   - Restart the application

---

## Troubleshooting

### "Unable to reach the server" Error
- The Client cannot connect to the Server at the IP address specified
- Solution: Double-check the IP address in the Console output on Computer A

### Firewall is Blocking Connection
- Windows Firewall may block the connection
- **Allow through Firewall:**
  1. Open Windows Defender Firewall → Allow an app through firewall
  2. Find "Employee Records Management System - Server"
  3. Check both "Private" and "Public" checkboxes
  4. Click OK

### Server Shows Different IP Addresses
- Your computer may have multiple network adapters
- Try each IP address until one works
- The first one is usually the correct one for your local network

### Using Hostnames Instead of IP Addresses
- Instead of IP addresses, you can use the computer's hostname
- Example: `http://computer-name:5000`
- Check Windows: Settings → System → About → "Device name"

---

## Advanced: Static IP Assignment

For reliable connection, consider giving Computer A a static IP address:

1. On Computer A, go to **Network Settings**
2. Find your network connection
3. Change from "Dynamic (DHCP)" to "Static IP"
4. Use an IP address in your network range (e.g., 192.168.1.100)
5. Use this static IP in the Client's Server Configuration

---

## Common Network Configurations

| Scenario | IP Address Example | Notes |
|----------|-------------------|-------|
| Same Wi-Fi Network | `http://192.168.1.100:5000` | Most common setup |
| Direct Ethernet Cable | `http://192.168.1.x:5000` | Requires manual network setup |
| Via Hostname | `http://mycomputer:5000` | Easier if hostname resolves |
| Behind Router | `http://192.168.x.x:5000` | Check subnet mask |

---

## Quick Reference

### On Server Computer (Computer A):
- Press **F12** to see IP addresses in Console
- Look for: "🌐 LAN access URLs:"

### On Client Computer (Computer B):
- Settings → System → Server Configuration
- Paste IP address and click "Save Server URL"
- Restart application

---

## Still Need Help?

1. Verify the Server application is running on Computer A
2. Check the exact IP addresses shown in the Console (F12)
3. Ensure both computers are on the same network
4. Verify no firewall is blocking the connection
5. Check that you used the correct format: `http://[IP_ADDRESS]:5000`
