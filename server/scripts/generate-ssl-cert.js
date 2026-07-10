const fs = require('fs');
const path = require('path');
const { execSync } = require('child_process');

const certDir = path.join(__dirname, '../certs');
const certPath = path.join(certDir, 'server-cert.pem');
const keyPath = path.join(certDir, 'server-key.pem');

// Create certs directory
if (!fs.existsSync(certDir)) {
  fs.mkdirSync(certDir, { recursive: true });
  console.log('✅ Created certs directory');
}

// Check if certificates already exist
if (fs.existsSync(certPath) && fs.existsSync(keyPath)) {
  console.log('✅ SSL certificates already exist at:');
  console.log(`   - Certificate: ${certPath}`);
  console.log(`   - Key: ${keyPath}`);
  process.exit(0);
}

console.log('🔐 Generating self-signed SSL certificate for 192.168.2.187...\n');

// Create OpenSSL config file for SAN (Subject Alternative Name)
const opensslConfig = `
[req]
default_bits = 2048
prompt = no
default_md = sha256
distinguished_name = dn
req_extensions = v3_req

[dn]
C = US
ST = State
L = City
O = Development
CN = 192.168.2.187

[v3_req]
subjectAltName = @alt_names

[alt_names]
IP.1 = 192.168.2.187
DNS.1 = 192.168.2.187
`;

const configPath = path.join(certDir, 'openssl.cnf');
fs.writeFileSync(configPath, opensslConfig);

try {
  // Generate private key and certificate
  const command = `openssl req -x509 -newkey rsa:2048 -nodes -sha256 -days 365 -keyout "${keyPath}" -out "${certPath}" -config "${configPath}"`;
  
  execSync(command, { stdio: 'inherit' });
  
  // Clean up config file
  fs.unlinkSync(configPath);
  
  console.log('\n✅ SSL certificates generated successfully!');
  console.log(`   - Certificate: ${certPath}`);
  console.log(`   - Key: ${keyPath}`);
  console.log('\n📝 These certificates are valid for IP: 192.168.2.187');
  
} catch (error) {
  console.error('\n❌ Failed to generate certificates:', error.message);
  console.log('\n⚠️  OpenSSL is required but not found in PATH.');
  console.log('Please install OpenSSL:');
  console.log('  - Windows: https://slproweb.com/products/Win32OpenSSL.html');
  console.log('  - Or use Git Bash which includes OpenSSL');
  process.exit(1);
}
