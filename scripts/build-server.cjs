#!/usr/bin/env node
/**
 * Build the standalone server app (full self-contained install with local DB).
 * This is the app that runs on the main/server computer.
 * Usage: node scripts/build-server.cjs
 */
const { execSync } = require('child_process');
const fs = require('fs');
const pkg = require('../package.json');

const outDir = path.join(__dirname, '../dist-electron/server');
const installerName = `Employee Records Management System - Server Setup ${pkg.version}.exe`;
const installerPath = path.join(outDir, installerName);
const renamedInstaller = path.join(outDir, 'ERMS-Server-Setup.exe');

console.log(`\n🔧 Building Employee Records Management System (Server) installer...\n`);

// Ensure SSL certs exist
const certPath = path.join(__dirname, '../server/certs/server-cert.pem');
const keyPath = path.join(__dirname, '../server/certs/server-key.pem');
if (!fs.existsSync(certPath) || !fs.existsSync(keyPath)) {
  console.log('🔐 SSL certificates not found. Generating...');
  execSync('node scripts/generate-ssl-cert-node.js', { stdio: 'inherit' });
}

try {
  // Step 1: Build frontend
  console.log('\n📦 Step 1: Building frontend...');
  execSync(`npm run build`, { stdio: 'inherit' });

  // Step 2: Build server bundle
  console.log('\n📦 Step 2: Building server bundle...');
  execSync(`npm run build:server`, { stdio: 'inherit' });

  // Step 3: Package with electron-builder using server config
  console.log('\n📦 Step 3: Packaging installer (this may take a moment)...');
  try {
    execSync(`npx electron-builder --config electron-builder-server.json`, {
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

  // Rename to ERMS-Server-Setup.exe
  if (fs.existsSync(renamedInstaller)) fs.unlinkSync(renamedInstaller);
  fs.renameSync(installerPath, renamedInstaller);

  console.log(`\n✅ Server installer build complete!`);
  console.log(`   File: dist-electron\\server\\ERMS-Server-Setup.exe`);
  console.log(`   → Install on the server PC (requires PostgreSQL + configured .env)`);

} catch (err) {
  console.error('\n❌ Build failed:', err.message);
  process.exit(1);
}
