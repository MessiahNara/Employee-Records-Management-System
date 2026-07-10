#!/usr/bin/env node
/**
 * Build the client-only app that connects to a remote server.
 * Usage: node scripts/build-client.cjs <server-ip>
 * Example: node scripts/build-client.cjs 192.168.2.187
 */
const { execSync } = require('child_process');
const fs = require('fs');
const path = require('path');

const serverIp = process.argv[2] || '192.168.2.187';
const serverUrl = `https://${serverIp}:5000`;
const configPath = path.join(__dirname, '../electron/client-config.json');
const outDir = path.join(__dirname, '../dist-electron/client');
const installerName = 'Employee Records Management System - Client Setup 1.0.0.exe';
const installerPath = path.join(outDir, installerName);
const renamedInstaller = path.join(outDir, `ERMS-Client-Setup.exe`);

console.log(`\n🔧 Building Employee Records Management System (Client) installer...`);
console.log(`   Server: ${serverUrl}\n`);

try {
  // Write client config pointing to HTTPS server
  fs.writeFileSync(configPath, JSON.stringify({ serverUrl }, null, 2));
  console.log(`✅ Created client-config.json → ${serverUrl}`);

  // Step 1: Build frontend (no VITE_API_URL - client uses IPC to get server URL)
  console.log('\n📦 Step 1: Building frontend...');
  execSync(`npm run build`, { stdio: 'inherit' });

  // Step 2: Package with electron-builder using client config (no server bundle needed)
  console.log('\n📦 Step 2: Packaging installer (this may take a moment)...');
  try {
    execSync(`npx electron-builder --config electron-builder-client.json`, {
      stdio: 'inherit',
      env: {
        ...process.env,
        CSC_IDENTITY_AUTO_DISCOVERY: 'false',
        WIN_CSC_IDENTITY_AUTO_DISCOVERY: 'false',
      },
    });
  } catch {
    if (!fs.existsSync(installerPath)) {
      throw new Error('Installer .exe was not created. Packaging failed.');
    }
    console.log('⚠️  electron-builder warning ignored — installer is ready.');
  }

  // Rename installer
  if (fs.existsSync(renamedInstaller)) fs.unlinkSync(renamedInstaller);
  fs.renameSync(installerPath, renamedInstaller);

  console.log(`\n✅ Client installer build complete!`);
  console.log(`   File: dist-electron\\client\\ERMS-Client-Setup.exe`);
  console.log(`   Server: ${serverUrl}`);
  console.log(`   → Copy installer to client PCs and run it`);

} catch (err) {
  console.error('\n❌ Build failed:', err.message);
  process.exit(1);
} finally {
  if (fs.existsSync(configPath)) {
    fs.unlinkSync(configPath);
    console.log('🧹 Cleaned up client-config.json');
  }
}
