const fs = require('fs');
const path = require('path');
const search = (dir) => {
  const files = fs.readdirSync(dir);
  for (const file of files) {
    const fp = path.join(dir, file);
    if (fs.statSync(fp).isDirectory()) search(fp);
    else if (fp.endsWith('.tsx') || fp.endsWith('.ts')) {
      const content = fs.readFileSync(fp, 'utf8');
      if (content.includes('Disposal Appraisal stage') || content.includes('Evaluate & Move to Disposal')) {
        console.log('FOUND IN:', fp);
      }
    }
  }
};
search('./src');
