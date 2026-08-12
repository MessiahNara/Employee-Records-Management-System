const { execSync } = require('child_process');
const fs = require('fs');
try {
  const output = execSync('git ls-files "server/uploads"').toString();
  fs.writeFileSync('c:\\Employee Records Management System\\scratch\\git_output.txt', output || 'No files tracked');
} catch (e) {
  fs.writeFileSync('c:\\Employee Records Management System\\scratch\\git_output.txt', e.message);
}
