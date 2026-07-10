/**
 * ERMS Windows Service Installer (NSSM-based)
 *
 * Usage:
 *   node install-service.cjs install   <installDir>
 *   node install-service.cjs uninstall
 *   node install-service.cjs start
 *   node install-service.cjs stop
 *   node install-service.cjs status
 */

'use strict';

const { execFileSync } = require('child_process');
const path   = require('path');
const fs     = require('fs');

const SERVICE_NAME    = 'ERMSBackendServer';
const SERVICE_DISPLAY = 'ERMS Backend Server';
const SERVICE_DESC    = 'Employee Records Management System - Backend API Server';

// ── Resolve paths ─────────────────────────────────────────────────────────────
const action     = process.argv[2] || 'install';
const installDir = process.argv[3]
  ? path.resolve(process.argv[3])
  : path.resolve(path.dirname(__dirname)); // one level up from service/

const resourcesDir = path.join(installDir, 'resources');
const serviceDir   = path.join(resourcesDir, 'service');
const runnerScript = path.join(serviceDir, 'service-runner.cjs');
const nssmExe      = path.join(serviceDir, 'nssm.exe');
const logDir       = path.join(installDir, 'logs');

function log(msg) { console.log(`[service-installer] ${msg}`); }

// Run NSSM command, return { ok, out }
function nssm(...args) {
  try {
    const out = execFileSync(nssmExe, args, {
      encoding: 'utf8',
      windowsHide: true,
      timeout: 15000,
    });
    return { ok: true, out: out.trim() };
  } catch (err) {
    return { ok: false, out: (err.stdout || '') + (err.stderr || '') + err.message };
  }
}

function resolveNodeExe() {
  try {
    const out = execFileSync('where', ['node'], { encoding: 'utf8', windowsHide: true });
    const p = out.trim().split(/\r?\n/)[0];
    if (p && fs.existsSync(p)) return p;
  } catch (_e) {}
  return 'node.exe';
}

// ── Actions ───────────────────────────────────────────────────────────────────

function install() {
  log(`Installing ERMS Backend Service using NSSM...`);
  log(`  Install dir  : ${installDir}`);
  log(`  Runner       : ${runnerScript}`);
  log(`  NSSM         : ${nssmExe}`);

  if (!fs.existsSync(nssmExe)) {
    log(`ERROR: nssm.exe not found at ${nssmExe}`);
    process.exit(1);
  }
  if (!fs.existsSync(runnerScript)) {
    log(`ERROR: service-runner.cjs not found at ${runnerScript}`);
    process.exit(1);
  }

  const nodeExe = resolveNodeExe();
  log(`  Node.exe     : ${nodeExe}`);

  // Ensure log dir exists
  try { fs.mkdirSync(logDir, { recursive: true }); } catch (_e) {}

  // Remove existing service first (idempotent)
  nssm('stop', SERVICE_NAME);
  nssm('remove', SERVICE_NAME, 'confirm');

  // Install service: nssm wraps node.exe so Windows gets proper service signals
  const r = nssm('install', SERVICE_NAME, nodeExe);
  if (!r.ok) { log(`ERROR installing service: ${r.out}`); process.exit(1); }
  log(`Service installed.`);

  // Set the script as the application argument
  nssm('set', SERVICE_NAME, 'AppParameters', `"${runnerScript}"`);

  // Working directory = resources (so .env is found)
  nssm('set', SERVICE_NAME, 'AppDirectory', resourcesDir);

  // Display name & description
  nssm('set', SERVICE_NAME, 'DisplayName', SERVICE_DISPLAY);
  nssm('set', SERVICE_NAME, 'Description', SERVICE_DESC);

  // Auto-start on boot
  nssm('set', SERVICE_NAME, 'Start', 'SERVICE_AUTO_START');

  // Run as SYSTEM
  nssm('set', SERVICE_NAME, 'ObjectName', 'LocalSystem');

  // Log stdout/stderr to files
  nssm('set', SERVICE_NAME, 'AppStdout', path.join(logDir, 'erms-service.log'));
  nssm('set', SERVICE_NAME, 'AppStderr', path.join(logDir, 'erms-service-error.log'));
  nssm('set', SERVICE_NAME, 'AppRotateFiles', '1');
  nssm('set', SERVICE_NAME, 'AppRotateOnline', '1');
  nssm('set', SERVICE_NAME, 'AppRotateBytes', '5242880'); // 5MB

  // Restart on failure
  nssm('set', SERVICE_NAME, 'AppExit', 'Default', 'Restart');
  nssm('set', SERVICE_NAME, 'AppRestartDelay', '5000');

  // Start the service now
  const startResult = nssm('start', SERVICE_NAME);
  if (startResult.ok) {
    log(`✅ ERMS Backend Service started successfully.`);
  } else {
    log(`WARNING: Service installed but could not start immediately: ${startResult.out}`);
    log(`It will start automatically on next reboot.`);
  }

  log(`✅ Service installation complete.`);
  log(`   The server will start automatically when Windows boots.`);
  log(`   Logs: ${logDir}`);
}

function uninstall() {
  log(`Uninstalling service "${SERVICE_NAME}"...`);
  nssm('stop', SERVICE_NAME);
  const r = nssm('remove', SERVICE_NAME, 'confirm');
  log(r.ok ? `✅ Service removed.` : `WARNING: ${r.out}`);
}

function start() {
  const r = nssm('start', SERVICE_NAME);
  log(r.ok ? `✅ Service started.` : `ERROR: ${r.out}`);
}

function stop() {
  const r = nssm('stop', SERVICE_NAME);
  log(r.ok ? `✅ Service stopped.` : `ERROR: ${r.out}`);
}

function status() {
  const r = nssm('status', SERVICE_NAME);
  log(`Service "${SERVICE_NAME}": ${r.out || 'not installed'}`);
}

// ── Entry point ───────────────────────────────────────────────────────────────
switch (action.toLowerCase()) {
  case 'install':   install();   break;
  case 'uninstall': uninstall(); break;
  case 'start':     start();     break;
  case 'stop':      stop();      break;
  case 'status':    status();    break;
  default:
    log(`Unknown action: ${action}`);
    log(`Usage: node install-service.cjs [install|uninstall|start|stop|status] [installDir]`);
    process.exit(1);
}
