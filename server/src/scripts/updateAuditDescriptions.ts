/**
 * Script to update existing audit logs with human-readable descriptions
 * Run this once to migrate old audit logs
 */

import prisma from '../lib/prisma';
import { generateAuditDescription, getEmployeeName } from '../utils/auditHelper';

async function updateAuditDescriptions() {
  console.log('Starting audit log description update...');

  try {
    // Fetch all audit logs
    const auditLogs = await prisma.auditLog.findMany({
      orderBy: {
        createdAt: 'desc',
      },
    });

    console.log(`Found ${auditLogs.length} audit logs to update`);

    let updated = 0;
    let skipped = 0;

    for (const log of auditLogs) {
      try {
        // Parse existing details if it's JSON
        let existingDetails: any = null;
        if (log.details) {
          try {
            existingDetails = JSON.parse(log.details);
          } catch {
            // If it's not JSON, it might already be a description
            // Skip if it looks like a human-readable sentence
            if (log.details.includes(' ') && !log.details.startsWith('{')) {
              console.log(`Skipping log ${log.id} - already has description`);
              skipped++;
              continue;
            }
          }
        }

        // Get entity name
        let entityName = 'Unknown';
        
        // Try to fetch employee if it's an employee entity
        if (log.entity === 'employee' && log.entityId) {
          try {
            const employee = await prisma.employee.findUnique({
              where: { id: log.entityId },
            });
            if (employee) {
              entityName = getEmployeeName(employee);
            }
          } catch {
            // Employee might have been deleted
            entityName = log.entityId;
          }
        } else if (existingDetails?.name) {
          entityName = existingDetails.name;
        }

        // Extract user name from userId (you may want to fetch from users table)
        const userName = log.userId === 'system' ? 'System' : 'Admin';

        // Generate human-readable description
        const description = generateAuditDescription({
          action: log.action,
          entity: log.entity,
          entityName: entityName,
          userName: userName,
          details: existingDetails,
        });

        // Update the audit log
        await prisma.auditLog.update({
          where: { id: log.id },
          data: {
            details: description,
          },
        });

        updated++;
        console.log(`Updated log ${log.id}: ${description}`);
      } catch (error) {
        console.error(`Error updating log ${log.id}:`, error);
      }
    }

    console.log(`\nUpdate complete!`);
    console.log(`Updated: ${updated}`);
    console.log(`Skipped: ${skipped}`);
    console.log(`Total: ${auditLogs.length}`);
  } catch (error) {
    console.error('Error updating audit descriptions:', error);
    throw error;
  } finally {
    await prisma.$disconnect();
  }
}

// Run the script
updateAuditDescriptions()
  .then(() => {
    console.log('Script completed successfully');
    process.exit(0);
  })
  .catch((error) => {
    console.error('Script failed:', error);
    process.exit(1);
  });
