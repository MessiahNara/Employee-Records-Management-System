const fs = require('fs');
const path = require('path');
const { PrismaClient } = require('@prisma/client');

const prisma = new PrismaClient();
const documentsDir = path.join(__dirname, 'uploads', 'documents');

const formatFolderName = (firstName, lastName, middleName) => {
  let surname = lastName.trim().toUpperCase();
  let first = firstName.trim().toUpperCase();
  const middle = middleName ? middleName.trim().toUpperCase() : '';

  let suffix = '';
  const suffixRegex = /(?:,|\s)+(JR\.?|SR\.?|I{2,3}|IV|V|VI{1,3})$/i;

  let match = surname.match(suffixRegex);
  if (match) {
    let rawSuffix = match[1].toUpperCase();
    if (['JR', 'JR.', 'SR', 'SR.'].includes(rawSuffix)) {
      suffix = rawSuffix.replace(/\.?$/, '.');
    } else {
      suffix = rawSuffix;
    }
    surname = surname.replace(suffixRegex, '').trim();
  } else {
    match = first.match(suffixRegex);
    if (match) {
      let rawSuffix = match[1].toUpperCase();
      if (['JR', 'JR.', 'SR', 'SR.'].includes(rawSuffix)) {
        suffix = rawSuffix.replace(/\.?$/, '.');
      } else {
        suffix = rawSuffix;
      }
      first = first.replace(suffixRegex, '').trim();
    }
  }

  let formatted = surname;
  if (suffix) {
    formatted += `, ${suffix}`;
  }
  formatted += `, ${first}`;
  if (middle) {
    formatted += ` ${middle}`;
  }
  return formatted;
};

function moveFilesRecursively(srcDir, destDir) {
  if (!fs.existsSync(destDir)) {
    fs.mkdirSync(destDir, { recursive: true });
  }

  const items = fs.readdirSync(srcDir);
  for (const item of items) {
    const srcPath = path.join(srcDir, item);
    const destPath = path.join(destDir, item);

    if (fs.lstatSync(srcPath).isDirectory()) {
      moveFilesRecursively(srcPath, destPath);
    } else {
      // If file exists, add timestamp to avoid overwrite (similar to multer logic)
      if (fs.existsSync(destPath)) {
        const ext = path.extname(item);
        const base = path.basename(item, ext);
        const newDestPath = path.join(destDir, `${base}-${Date.now()}${ext}`);
        fs.renameSync(srcPath, newDestPath);
      } else {
        fs.renameSync(srcPath, destPath);
      }
    }
  }
  // Remove empty directory
  try {
    fs.rmdirSync(srcDir);
  } catch (e) {
    console.warn(`Could not remove old directory ${srcDir}: ${e.message}`);
  }
}

async function main() {
  try {
    if (!fs.existsSync(documentsDir)) {
      console.log(`Directory not found: ${documentsDir}`);
      return;
    }

    const employees = await prisma.employee.findMany();
    let renamedCount = 0;
    let mergedCount = 0;
    let dbUpdateCount = 0;

    for (const employee of employees) {
      const oldName = `${employee.firstName} ${employee.middleName ? employee.middleName + ' ' : ''}${employee.lastName}`
        .trim()
        .replace(/[/\\?%*:|"<>]/g, '-')
        .replace(/\.+$/, '');

      const newName = formatFolderName(employee.firstName, employee.lastName, employee.middleName)
        .replace(/[/\\?%*:|"<>]/g, '-')
        .replace(/\.+$/, '');

      if (oldName === newName) continue;

      const oldPath = path.join(documentsDir, oldName);
      const newPath = path.join(documentsDir, newName);

      if (fs.existsSync(oldPath)) {
        console.log(`Processing: "${oldName}" -> "${newName}"`);
        
        if (!fs.existsSync(newPath)) {
          // Simple rename
          fs.renameSync(oldPath, newPath);
          renamedCount++;
          console.log(`  -> Renamed directory.`);
        } else {
          // Merge contents
          console.log(`  -> Target directory already exists, merging contents...`);
          moveFilesRecursively(oldPath, newPath);
          mergedCount++;
        }
      }

      // 2. UPDATE DATABASE PATHS
      // We must update the `filePath` in the database to reflect the new path format
      // Path format: '.../uploads/documents/OLDNAME/Category/file.pdf'
      
      const docs = await prisma.document.findMany({
        where: { employeeId: employee.id }
      });

      for (const doc of docs) {
        if (doc.filePath && doc.filePath.includes(oldName)) {
          // Replace only the folder name part in the path
          // For safety, we replace the exact path segment
          const oldSegment = path.join('documents', oldName);
          const newSegment = path.join('documents', newName);
          
          let newFilePath = doc.filePath.replace(oldSegment, newSegment);
          
          // Fallback if path separators differ
          if (newFilePath === doc.filePath) {
             const oldSegmentAlt = `documents/${oldName}`.replace(/\\/g, '/');
             const newSegmentAlt = `documents/${newName}`.replace(/\\/g, '/');
             newFilePath = doc.filePath.replace(oldSegmentAlt, newSegmentAlt);
          }
          if (newFilePath === doc.filePath) {
             const oldSegmentAlt2 = `documents\\${oldName}`.replace(/\//g, '\\');
             const newSegmentAlt2 = `documents\\${newName}`.replace(/\//g, '\\');
             newFilePath = doc.filePath.replace(oldSegmentAlt2, newSegmentAlt2);
          }

          if (newFilePath !== doc.filePath) {
            await prisma.document.update({
              where: { id: doc.id },
              data: { filePath: newFilePath }
            });
            dbUpdateCount++;
          }
        }
      }
    }

    console.log(`\nMigration complete!`);
    console.log(`Folders renamed: ${renamedCount}`);
    console.log(`Folders merged: ${mergedCount}`);
    console.log(`Database records updated: ${dbUpdateCount}`);
  } catch (err) {
    console.error('Error during migration:', err);
  } finally {
    await prisma.$disconnect();
  }
}

main();
