import fs from 'fs';
import path from 'path';
import prisma from '../lib/prisma';
import { getBaseUploadsDir } from '../middleware/upload';

/**
 * Consolidates duplicate and variant employee document folders into their canonical uppercase folder.
 * Updates Prisma document records with the updated physical filePath.
 */
export async function consolidateDocumentFolders(): Promise<void> {
  try {
    const baseUploadsDir = getBaseUploadsDir();
    const localUploadsDir = path.resolve(process.cwd(), 'uploads');
    const dirsToCheck = Array.from(new Set([
      path.join(baseUploadsDir, 'documents'),
      path.join(localUploadsDir, 'documents')
    ])).filter(d => fs.existsSync(d));

    for (const documentsDir of dirsToCheck) {

    // Get all employees from DB to know canonical names
    const employees = await prisma.employee.findMany({
      select: { id: true, firstName: true, lastName: true, middleName: true },
    });

    const formatName = (first: string, last: string, middle?: string | null) => {
      let surname = last.trim().toUpperCase();
      let f = first.trim().toUpperCase();
      const m = middle ? middle.trim().toUpperCase() : '';
      return `${surname}, ${f}${m ? ' ' + m : ''}`;
    };

    const employeeMap = new Map<string, string>(); // normalized search key -> canonical folder name
    for (const emp of employees) {
      const canonical = formatName(emp.firstName, emp.lastName, emp.middleName);
      const normCanonical = canonical.replace(/,/g, ' ').replace(/\s+/g, ' ').toUpperCase().trim();
      employeeMap.set(normCanonical, canonical);
    }

    const entries = fs.readdirSync(documentsDir, { withFileTypes: true })
      .filter((d) => d.isDirectory())
      .map((d) => d.name);

    for (const folder of entries) {
      const folderNorm = folder.replace(/,/g, ' ').replace(/\s+/g, ' ').toUpperCase().trim();
      const folderTokens = folderNorm.split(' ').filter((t) => t.length > 1);

      // Find if this folder matches a canonical employee name
      let targetCanonical: string | undefined;
      for (const [empNorm, canonical] of employeeMap.entries()) {
        if (folderNorm === empNorm) {
          targetCanonical = canonical;
          break;
        }
        if (folderTokens.length >= 2 && folderTokens.every((t) => empNorm.includes(t))) {
          targetCanonical = canonical;
          break;
        }
      }

      // If matched and folder name is not already the exact canonical name
      if (targetCanonical && folder !== targetCanonical) {
        const srcPath = path.join(documentsDir, folder);
        const destPath = path.join(documentsDir, targetCanonical);

        let renamed = false;
        if (!fs.existsSync(destPath)) {
          try {
            fs.renameSync(srcPath, destPath);
            console.log(`[FolderSync] Renamed folder "${folder}" -> "${targetCanonical}"`);
            renamed = true;
          } catch (e) {
            // On Windows, renameSync can fail on case-only difference or locked handles. Fall back to merge.
          }
        }

        if (!renamed) {
          // Merge contents of srcPath into destPath
          try {
            const categories = fs.readdirSync(srcPath, { withFileTypes: true });
            for (const cat of categories) {
              const catSrc = path.join(srcPath, cat.name);
              const catDest = path.join(destPath, cat.name);
              if (!fs.existsSync(catDest)) {
                fs.mkdirSync(catDest, { recursive: true });
              }
              if (cat.isDirectory()) {
                const files = fs.readdirSync(catSrc);
                for (const f of files) {
                  const fSrc = path.join(catSrc, f);
                  const fDest = path.join(catDest, f);
                  if (!fs.existsSync(fDest)) {
                    fs.copyFileSync(fSrc, fDest);
                    try { fs.unlinkSync(fSrc); } catch (_) {}
                  }
                }
                try { fs.rmdirSync(catSrc); } catch (_) {}
              }
            }
            try {
              fs.rmdirSync(srcPath);
              console.log(`[FolderSync] Merged duplicate folder "${folder}" into "${targetCanonical}"`);
            } catch (_) {}
          } catch (mergeErr) {
            console.warn(`[FolderSync] Error merging folder "${folder}":`, mergeErr);
          }
        }
      }
    }

    // ── Migrate and merge "Pending AO" subfolders into "Administrative Order" ──
    const currentEmpFolders = fs.readdirSync(documentsDir, { withFileTypes: true })
      .filter((d) => d.isDirectory())
      .map((d) => d.name);

    for (const empFolder of currentEmpFolders) {
      const pendingAoPath = path.join(documentsDir, empFolder, 'Pending AO');
      if (fs.existsSync(pendingAoPath)) {
        const targetAoPath = path.join(documentsDir, empFolder, 'Administrative Order');
        if (!fs.existsSync(targetAoPath)) {
          fs.mkdirSync(targetAoPath, { recursive: true });
        }

        try {
          const files = fs.readdirSync(pendingAoPath);
          for (const file of files) {
            const srcFile = path.join(pendingAoPath, file);
            let destFile = path.join(targetAoPath, file);

            // Handle filename collisions
            if (fs.existsSync(destFile)) {
              const ext = path.extname(file);
              const base = path.basename(file, ext);
              destFile = path.join(targetAoPath, `${base}-${Date.now()}${ext}`);
            }

            fs.copyFileSync(srcFile, destFile);
            try { fs.unlinkSync(srcFile); } catch (_) {}
            console.log(`[FolderSync] Moved file from Pending AO to Administrative Order: ${file} in ${empFolder}`);
          }

          try {
            fs.rmdirSync(pendingAoPath);
            console.log(`[FolderSync] Removed empty Pending AO folder for ${empFolder}`);
          } catch (_) {}
        } catch (aoErr) {
          console.warn(`[FolderSync] Error migrating Pending AO in ${empFolder}:`, aoErr);
        }
      }
    }
  }

    // ── Update database Document records from 'Pending AO' to 'Administrative Order' ──
    const pendingDocs = await prisma.document.findMany({
      where: {
        OR: [
          { category: 'Pending AO' },
          { filePath: { contains: 'Pending AO' } }
        ]
      }
    });

    for (const doc of pendingDocs) {
      const newFilePath = (doc.filePath || '')
        .replace(/\\Pending AO\\/g, '\\Administrative Order\\')
        .replace(/\/Pending AO\//g, '/Administrative Order/');

      await prisma.document.update({
        where: { id: doc.id },
        data: {
          category: 'Administrative Order',
          filePath: newFilePath
        }
      });
      console.log(`[FolderSync] Updated Document DB record ${doc.id} (${doc.fileName}) -> Administrative Order`);
    }
  } catch (err) {
    console.error('[FolderSync] Error consolidating document folders:', err);
  }
}
