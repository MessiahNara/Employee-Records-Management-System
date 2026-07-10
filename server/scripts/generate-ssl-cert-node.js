const forge = require('node-forge');
const fs = require('fs');
const path = require('path');

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

try {
  // Generate a keypair
  console.log('Generating RSA key pair...');
  const keys = forge.pki.rsa.generateKeyPair(2048);
  
  // Create a certificate
  console.log('Creating certificate...');
  const cert = forge.pki.createCertificate();
  cert.publicKey = keys.publicKey;
  cert.serialNumber = '01';
  cert.validity.notBefore = new Date();
  cert.validity.notAfter = new Date();
  cert.validity.notAfter.setFullYear(cert.validity.notBefore.getFullYear() + 1);
  
  const attrs = [{
    name: 'commonName',
    value: '192.168.2.187'
  }, {
    name: 'countryName',
    value: 'US'
  }, {
    shortName: 'ST',
    value: 'State'
  }, {
    name: 'localityName',
    value: 'City'
  }, {
    name: 'organizationName',
    value: 'Development'
  }];
  
  cert.setSubject(attrs);
  cert.setIssuer(attrs);
  
  // Add Subject Alternative Name extension for IP address
  cert.setExtensions([{
    name: 'subjectAltName',
    altNames: [{
      type: 7, // IP address type
      ip: '192.168.2.187'
    }]
  }, {
    name: 'basicConstraints',
    cA: true
  }, {
    name: 'keyUsage',
    keyCertSign: true,
    digitalSignature: true,
    nonRepudiation: true,
    keyEncipherment: true,
    dataEncipherment: true
  }, {
    name: 'extKeyUsage',
    serverAuth: true,
    clientAuth: true
  }]);
  
  // Self-sign certificate
  console.log('Signing certificate...');
  cert.sign(keys.privateKey, forge.md.sha256.create());
  
  // Convert to PEM format
  const pemCert = forge.pki.certificateToPem(cert);
  const pemKey = forge.pki.privateKeyToPem(keys.privateKey);
  
  // Write to files
  fs.writeFileSync(certPath, pemCert);
  fs.writeFileSync(keyPath, pemKey);
  
  console.log('\n✅ SSL certificates generated successfully!');
  console.log(`   - Certificate: ${certPath}`);
  console.log(`   - Key: ${keyPath}`);
  console.log('\n📝 Certificate details:');
  console.log(`   - Valid for IP: 192.168.2.187`);
  console.log(`   - Valid from: ${cert.validity.notBefore}`);
  console.log(`   - Valid until: ${cert.validity.notAfter}`);
  console.log('\n⚠️  This is a self-signed certificate for development use only.');
  
} catch (error) {
  console.error('\n❌ Failed to generate certificates:', error.message);
  console.log('\n⚠️  Make sure node-forge is installed:');
  console.log('     npm install node-forge');
  process.exit(1);
}
