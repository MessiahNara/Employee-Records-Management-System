const fs = require('fs');
const path = require('path');
const logoPath = path.join(__dirname, 'public', 'template_logo.png');
const base64 = fs.readFileSync(logoPath, 'base64');
const tsContent = `export const LOGO_BASE64 = 'data:image/png;base64,${base64}';\n`;
fs.writeFileSync(path.join(__dirname, 'src', 'utils', 'logoBase64.ts'), tsContent);
console.log('Done!');
