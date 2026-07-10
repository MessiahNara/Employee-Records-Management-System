const { execSync } = require('child_process');
const fs = require('fs');
const path = require('path');

const certDir = path.join(__dirname, 'certs');

// Create certs directory if it doesn't exist
if (!fs.existsSync(certDir)) {
  fs.mkdirSync(certDir, { recursive: true });
}

const certPath = path.join(certDir, 'cert.pem');
const keyPath = path.join(certDir, 'key.pem');

// Check if certificates already exist
if (fs.existsSync(certPath) && fs.existsSync(keyPath)) {
  console.log('✅ SSL certificates already exist');
  console.log(`   - Certificate: ${certPath}`);
  console.log(`   - Key: ${keyPath}`);
  process.exit(0);
}

console.log('🔐 Generating self-signed SSL certificate...');

try {
  // Generate self-signed certificate using OpenSSL
  const command = `openssl req -x509 -newkey rsa:2048 -keyout "${keyPath}" -out "${certPath}" -days 365 -nodes -subj "/CN=192.168.2.187"`;
  
  execSync(command, { stdio: 'inherit' });
  
  console.log('✅ SSL certificates generated successfully!');
  console.log(`   - Certificate: ${certPath}`);
  console.log(`   - Key: ${keyPath}`);
} catch (error) {
  console.error('❌ Failed to generate certificates:', error.message);
  console.log('\n⚠️  OpenSSL might not be installed or not in PATH.');
  console.log('You can install OpenSSL from: https://slproweb.com/products/Win32OpenSSL.html');
  process.exit(1);
}
