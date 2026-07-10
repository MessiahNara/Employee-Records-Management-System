import JSZip from 'jszip';
import { saveAs } from 'file-saver';
import QRCode from 'qrcode';
import JsBarcode from 'jsbarcode';
import { Employee } from '../types/employee';

interface GenerateCodeImageOptions {
  employee: Employee;
  type: 'barcode' | 'qrcode';
}

/**
 * Generate a barcode or QR code image for an employee
 */
async function generateCodeImage(options: GenerateCodeImageOptions): Promise<Blob> {
  const { employee, type } = options;
  
  console.log(`Generating ${type} for employee:`, employee.id, employee.firstName, employee.lastName);
  
  const employeeName = `${employee.firstName} ${employee.middleName || ''} ${employee.lastName}`.trim();
  const value = type === 'barcode' 
    ? employee.id 
    : `Employee ID: ${employee.id}\nName: ${employeeName}\nPosition: ${employee.positionFunction || 'N/A'}\nOffice: ${employee.officeHospitalName || 'N/A'}`;

  return new Promise((resolve, reject) => {
    try {
      const scale = type === 'qrcode' ? 5 : 3;
      const padding = 40;
      const textHeight = 80;
      const codeWidth = type === 'qrcode' ? 200 : 300;
      const codeHeight = type === 'qrcode' ? 200 : 100;

      // Create canvas
      const canvas = document.createElement('canvas');
      const ctx = canvas.getContext('2d');
      
      if (!ctx) {
        reject(new Error('Could not get canvas context'));
        return;
      }

      canvas.width = (codeWidth + padding * 2) * scale;
      canvas.height = (codeHeight + padding * 2 + textHeight) * scale;

      // Fill white background
      ctx.fillStyle = '#ffffff';
      ctx.fillRect(0, 0, canvas.width, canvas.height);

      // Add employee name
      ctx.fillStyle = '#1f2937';
      ctx.font = `bold ${16 * scale}px Arial, sans-serif`;
      ctx.textAlign = 'center';
      
      // Word wrap for long names
      const maxWidth = (codeWidth - 10) * scale;
      const words = employeeName.split(' ');
      let line = '';
      let y = (padding + 15) * scale;
      
      for (let i = 0; i < words.length; i++) {
        const testLine = line + words[i] + ' ';
        const metrics = ctx.measureText(testLine);
        
        if (metrics.width > maxWidth && i > 0) {
          ctx.fillText(line.trim(), canvas.width / 2, y);
          line = words[i] + ' ';
          y += 20 * scale;
        } else {
          line = testLine;
        }
      }
      ctx.fillText(line.trim(), canvas.width / 2, y);

      if (type === 'qrcode') {
        // Generate QR code directly to canvas
        
        // Create temporary canvas for QR code
        const qrCanvas = document.createElement('canvas');
        
        QRCode.toCanvas(qrCanvas, value, {
          width: codeWidth * scale,
          margin: 2,
          color: {
            dark: '#000000',
            light: '#ffffff'
          }
        }, (error) => {
          if (error) {
            console.error('QR code generation error:', error);
            reject(error);
            return;
          }
          
          // Draw QR code on main canvas
          ctx.drawImage(
            qrCanvas,
            padding * scale,
            (padding + textHeight) * scale,
            codeWidth * scale,
            codeHeight * scale
          );
          
          // Convert to blob
          canvas.toBlob((blob) => {
            if (blob) {
              resolve(blob);
            } else {
              reject(new Error('Could not create blob'));
            }
          }, 'image/png');
        });
      } else {
        // Generate barcode
        
        // Create temporary SVG for barcode
        const svg = document.createElementNS('http://www.w3.org/2000/svg', 'svg');
        
        try {
          JsBarcode(svg, employee.id, {
            format: 'CODE128',
            width: 2,
            height: 60,
            displayValue: true,
            fontSize: 14,
            background: '#ffffff',
            lineColor: '#000000'
          });
          
          // Convert SVG to image
          const svgData = new XMLSerializer().serializeToString(svg);
          const img = new Image();
          const svgBlob = new Blob([svgData], { type: 'image/svg+xml;charset=utf-8' });
          const url = URL.createObjectURL(svgBlob);
          
          img.onload = () => {
            
            // Draw barcode on main canvas
            ctx.drawImage(
              img,
              padding * scale,
              (padding + textHeight) * scale,
              codeWidth * scale,
              codeHeight * scale
            );
            
            URL.revokeObjectURL(url);
            
            // Convert to blob
            canvas.toBlob((blob) => {
              if (blob) {
                resolve(blob);
              } else {
                reject(new Error('Could not create blob'));
              }
            }, 'image/png');
          };
          
          img.onerror = (error) => {
            console.error('Barcode image load error:', error);
            URL.revokeObjectURL(url);
            reject(new Error('Could not load barcode image'));
          };
          
          img.src = url;
        } catch (error) {
          console.error('Barcode generation error:', error);
          reject(error);
        }
      }
    } catch (error) {
      console.error('Image generation error:', error);
      reject(error);
    }
  });
}

/**
 * Generate safe filename from employee name
 */
function getSafeFilename(employee: Employee): string {
  const name = `${employee.firstName}_${employee.lastName}`;
  return name.replace(/[^a-z0-9_]/gi, '_');
}

/**
 * Bulk download barcodes or QR codes as ZIP
 */
export async function bulkDownloadCodes(
  employees: Employee[],
  type: 'barcode' | 'qrcode',
  onProgress?: (current: number, total: number) => void
): Promise<void> {
  try {
    const zip = new JSZip();
    const folderName = type === 'barcode' ? 'barcodes' : 'qr-codes';
    const folder = zip.folder(folderName);

    if (!folder) {
      throw new Error('Could not create ZIP folder');
    }

    let successCount = 0;
    let errorCount = 0;

    // Generate images for each employee
    for (let i = 0; i < employees.length; i++) {
      const employee = employees[i];
      
      if (onProgress) {
        onProgress(i + 1, employees.length);
      }

      try {
        const blob = await generateCodeImage({ employee, type });
        const filename = `${getSafeFilename(employee)}.png`;
        folder.file(filename, blob);
        successCount++;
      } catch (error) {
        errorCount++;
        console.error(`✗ Error generating ${type} for employee ${employee.id}:`, error);
        // Continue with other employees
      }
    }

    console.log(`Generation complete: ${successCount} succeeded, ${errorCount} failed`);

    if (successCount === 0) {
      throw new Error('All images failed to generate. Please check console for details.');
    }

    // Generate ZIP file
    console.log('Creating ZIP file...');
    const zipBlob = await zip.generateAsync({ type: 'blob' });
    console.log(`ZIP file created, size: ${zipBlob.size} bytes`);
    
    // Download ZIP
    const timestamp = new Date().toISOString().split('T')[0];
    const zipFilename = `${folderName}_${timestamp}.zip`;
    console.log(`Downloading ZIP as: ${zipFilename}`);
    saveAs(zipBlob, zipFilename);
    
    // Return info about partial failures (don't throw error)
    if (errorCount > 0) {
      console.warn(`Warning: ${errorCount} out of ${employees.length} images failed to generate.`);
    }
  } catch (error) {
    console.error('Error creating ZIP file:', error);
    throw error;
  }
}
