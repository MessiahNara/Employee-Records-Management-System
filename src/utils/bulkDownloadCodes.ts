import QRCode from 'qrcode';
import JsBarcode from 'jsbarcode';
import { jsPDF } from 'jspdf';
import { Employee } from '../types/employee';

/**
 * Generate a barcode as a data URL for embedding in PDF
 */
function generateBarcodeDataURL(employeeId: string): string {
  const svg = document.createElementNS('http://www.w3.org/2000/svg', 'svg');
  JsBarcode(svg, employeeId, {
    format: 'CODE128',
    width: 2,
    height: 50,
    displayValue: true,
    fontSize: 12,
    font: 'bold 12px Arial, sans-serif',
    fontOptions: 'bold',
    background: '#ffffff',
    lineColor: '#000000',
    margin: 2,
    textMargin: 2,
  });

  const svgData = new XMLSerializer().serializeToString(svg);
  const svgBlob = new Blob([svgData], { type: 'image/svg+xml;charset=utf-8' });
  const url = URL.createObjectURL(svgBlob);
  return url;
}

/**
 * Convert an SVG blob URL to a PNG data URL for embedding in jsPDF
 */
function svgUrlToPngDataUrl(svgUrl: string, width: number, height: number): Promise<string> {
  return new Promise((resolve, reject) => {
    const img = new Image();
    img.onload = () => {
      const canvas = document.createElement('canvas');
      canvas.width = width;
      canvas.height = height;
      const ctx = canvas.getContext('2d');
      if (!ctx) {
        URL.revokeObjectURL(svgUrl);
        reject(new Error('Could not get canvas context'));
        return;
      }
      ctx.fillStyle = '#ffffff';
      ctx.fillRect(0, 0, width, height);
      ctx.drawImage(img, 0, 0, width, height);
      URL.revokeObjectURL(svgUrl);
      resolve(canvas.toDataURL('image/png'));
    };
    img.onerror = (err) => {
      URL.revokeObjectURL(svgUrl);
      reject(new Error('Could not load barcode image'));
    };
    img.src = svgUrl;
  });
}

/**
 * Format employee name as "FIRSTNAME M. LASTNAME"
 */
function formatEmployeeName(employee: Employee): string {
  const firstName = (employee.firstName || '').trim();
  const middleName = (employee.middleName || '').trim();
  const lastName = (employee.lastName || '').trim();

  let name = firstName;
  if (middleName) {
    // Use middle initial with period
    name += ` ${middleName.charAt(0).toUpperCase()}.`;
  }
  name += ` ${lastName}`;
  return name.trim();
}

/**
 * Sort employees by last name alphabetically (A-Z)
 */
function sortByLastName(employees: Employee[]): Employee[] {
  return [...employees].sort((a, b) => {
    const lastNameA = (a.lastName || '').toLowerCase();
    const lastNameB = (b.lastName || '').toLowerCase();
    if (lastNameA !== lastNameB) return lastNameA.localeCompare(lastNameB);
    // If same last name, sort by first name
    const firstNameA = (a.firstName || '').toLowerCase();
    const firstNameB = (b.firstName || '').toLowerCase();
    return firstNameA.localeCompare(firstNameB);
  });
}



// ============================================================
// PDF Layout Constants for Barcode Download
// ============================================================
// Legal paper dimensions in mm: 8.5" x 13"
const LEGAL_WIDTH_MM = 215.9;   // 8.5 inches
const LEGAL_HEIGHT_MM = 330.2;  // 13 inches

// Layout: 2 columns x 9 rows = 18 barcodes per page
const COLS = 2;
const ROWS = 9;
const BARCODES_PER_PAGE = COLS * ROWS;

// Margins (mm)
const MARGIN_TOP = 12;
const MARGIN_BOTTOM = 10;
const MARGIN_LEFT = 12;
const MARGIN_RIGHT = 12;

// Available area
const AVAIL_WIDTH = LEGAL_WIDTH_MM - MARGIN_LEFT - MARGIN_RIGHT;
const AVAIL_HEIGHT = LEGAL_HEIGHT_MM - MARGIN_TOP - MARGIN_BOTTOM;

// Cell dimensions
const CELL_WIDTH = AVAIL_WIDTH / COLS;
const CELL_HEIGHT = AVAIL_HEIGHT / ROWS;

// Barcode image dimensions within each cell (mm)
const BARCODE_IMG_WIDTH = 80;
const BARCODE_IMG_HEIGHT = 22;

// Name rendering
const NAME_FONT_SIZE_PT = 13; // Font size 13 in points
const SPACING_NAME_TO_BARCODE = 2;

// Cutting guideline border style
const BORDER_DASH_LENGTH = 2;    // mm
const BORDER_GAP_LENGTH = 1.5;   // mm
const BORDER_LINE_WIDTH = 0.3;   // mm
const BORDER_COLOR_R = 150;
const BORDER_COLOR_G = 150;
const BORDER_COLOR_B = 150;



/**
 * Draw dashed cutting guideline borders for the entire grid on a page.
 * Draws horizontal and vertical dashed lines forming the grid.
 */
function drawCuttingBorders(doc: jsPDF, employeeCountOnPage: number) {
  doc.setDrawColor(BORDER_COLOR_R, BORDER_COLOR_G, BORDER_COLOR_B);
  doc.setLineWidth(BORDER_LINE_WIDTH);

  // Calculate how many rows are actually used on this page
  const totalRows = Math.ceil(employeeCountOnPage / COLS);

  // Draw horizontal dashed lines (top of grid + between rows + bottom of last row)
  for (let r = 0; r <= totalRows; r++) {
    const y = MARGIN_TOP + r * CELL_HEIGHT;
    drawDashedLine(doc, MARGIN_LEFT, y, MARGIN_LEFT + COLS * CELL_WIDTH, y);
  }

  // Draw vertical dashed lines (left of grid + between columns + right of grid)
  for (let c = 0; c <= COLS; c++) {
    const x = MARGIN_LEFT + c * CELL_WIDTH;
    const bottomY = MARGIN_TOP + totalRows * CELL_HEIGHT;
    drawDashedLine(doc, x, MARGIN_TOP, x, bottomY);
  }
}

/**
 * Draw a single dashed line segment
 */
function drawDashedLine(doc: jsPDF, x1: number, y1: number, x2: number, y2: number) {
  const dx = x2 - x1;
  const dy = y2 - y1;
  const lineLength = Math.sqrt(dx * dx + dy * dy);
  const segmentLength = BORDER_DASH_LENGTH + BORDER_GAP_LENGTH;
  const segments = Math.floor(lineLength / segmentLength);

  const ux = dx / lineLength; // unit vector x
  const uy = dy / lineLength; // unit vector y

  for (let s = 0; s < segments; s++) {
    const startDist = s * segmentLength;
    const endDist = startDist + BORDER_DASH_LENGTH;

    const sx = x1 + ux * startDist;
    const sy = y1 + uy * startDist;
    const ex = x1 + ux * Math.min(endDist, lineLength);
    const ey = y1 + uy * Math.min(endDist, lineLength);

    doc.line(sx, sy, ex, ey);
  }

  // Draw remaining dash if there's space
  const remaining = lineLength - segments * segmentLength;
  if (remaining > 0) {
    const sx = x1 + ux * segments * segmentLength;
    const sy = y1 + uy * segments * segmentLength;
    const dashLen = Math.min(remaining, BORDER_DASH_LENGTH);
    const ex = sx + ux * dashLen;
    const ey = sy + uy * dashLen;
    doc.line(sx, sy, ex, ey);
  }
}

/**
 * Generate a PDF with barcodes arranged in 2x9 grid on legal paper
 * Sorted by last name, only selected employees
 * Name font: Aptos, size 13
 * Dashed cutting guideline borders around each cell
 */
async function generateBarcodePDF(
  employees: Employee[],
  onProgress?: (current: number, total: number) => void
): Promise<void> {
  // Sort by last name alphabetically
  const sorted = sortByLastName(employees);

  // Create PDF - Legal size, portrait
  const doc = new jsPDF({
    orientation: 'portrait',
    unit: 'mm',
    format: [LEGAL_WIDTH_MM, LEGAL_HEIGHT_MM],
  });


  // Pre-calculate page breaks for border drawing
  const totalPages = Math.ceil(sorted.length / BARCODES_PER_PAGE);

  for (let page = 0; page < totalPages; page++) {
    if (page > 0) {
      doc.addPage([LEGAL_WIDTH_MM, LEGAL_HEIGHT_MM], 'portrait');
    }

    const startIdx = page * BARCODES_PER_PAGE;
    const endIdx = Math.min(startIdx + BARCODES_PER_PAGE, sorted.length);
    const employeesOnPage = endIdx - startIdx;

    // Draw cutting guideline borders for this page
    drawCuttingBorders(doc, employeesOnPage);

    // Draw each barcode cell
    for (let i = startIdx; i < endIdx; i++) {
      const employee = sorted[i];
      const posInPage = i - startIdx;
      const col = posInPage % COLS;
      const row = Math.floor(posInPage / COLS);

      // Cell origin
      const cellX = MARGIN_LEFT + col * CELL_WIDTH;
      const cellY = MARGIN_TOP + row * CELL_HEIGHT;

      // Center content within cell
      const contentCenterX = cellX + CELL_WIDTH / 2;

      // Employee name in Arial (helvetica) font size 13
      const name = formatEmployeeName(employee);
      doc.setFontSize(NAME_FONT_SIZE_PT);
      doc.setFont('helvetica', 'bold');
      doc.setTextColor(0, 0, 0);

      const maxNameWidth = CELL_WIDTH - 8;
      const nameLines: string[] = doc.splitTextToSize(name, maxNameWidth);
      const nameLineHeightMm = 4.8;
      const nameExtraHeight = (nameLines.length - 1) * nameLineHeightMm;

      // Calculate vertical position so name + barcode are centered
      const totalContentHeight = nameExtraHeight + SPACING_NAME_TO_BARCODE + BARCODE_IMG_HEIGHT;
      const nameFirstLineY = cellY + Math.max(5, (CELL_HEIGHT - totalContentHeight) / 2 + 3);

      doc.text(nameLines, contentCenterX, nameFirstLineY, { align: 'center' });

      // Generate barcode image
      try {
        const svgUrl = generateBarcodeDataURL(employee.id);
        const pngDataUrl = await svgUrlToPngDataUrl(svgUrl, 400, 120);

        // Barcode image centered below all lines of the name
        const barcodeX = contentCenterX - BARCODE_IMG_WIDTH / 2;
        const barcodeY = nameFirstLineY + nameExtraHeight + SPACING_NAME_TO_BARCODE;

        doc.addImage(pngDataUrl, 'PNG', barcodeX, barcodeY, BARCODE_IMG_WIDTH, BARCODE_IMG_HEIGHT);
      } catch (error) {
        console.error(`Error generating barcode for ${employee.id}:`, error);
        doc.setFontSize(7);
        doc.setTextColor(200, 0, 0);
        doc.text(`[Barcode error: ${employee.id}]`, contentCenterX, cellY + 20, { align: 'center' });
        doc.setTextColor(0, 0, 0);
      }

      if (onProgress) {
        onProgress(i + 1, sorted.length);
      }
    }
  }

  // Save the PDF
  const timestamp = new Date().toISOString().split('T')[0];
  const filename = `barcodes_${timestamp}.pdf`;
  doc.save(filename);
}


/**
 * Generate a QR code as a PNG data URL for embedding in PDF
 */
function generateQRCodeDataUrl(employee: Employee, sizePx: number): Promise<string> {
  const employeeName = `${employee.firstName} ${employee.middleName || ''} ${employee.lastName}`.trim();
  const value = `Employee ID: ${employee.id}\nName: ${employeeName}\nPosition: ${employee.positionFunction || 'N/A'}\nOffice: ${employee.officeHospitalName || 'N/A'}`;

  return new Promise((resolve, reject) => {
    const qrCanvas = document.createElement('canvas');
    QRCode.toCanvas(qrCanvas, value, {
      width: sizePx,
      margin: 1,
      color: { dark: '#000000', light: '#ffffff' }
    }, (error) => {
      if (error) {
        reject(error);
        return;
      }
      resolve(qrCanvas.toDataURL('image/png'));
    });
  });
}

// QR Code cell layout dimensions (mm)
const QR_IMG_SIZE = 28; // QR code square size in the cell

/**
 * Generate a PDF with QR codes arranged in 2x9 grid on legal paper
 * Each cell: Name + ID on the left, QR code on the right
 * Sorted by last name, only selected employees
 */
async function generateQRCodePDF(
  employees: Employee[],
  onProgress?: (current: number, total: number) => void
): Promise<void> {
  const sorted = sortByLastName(employees);

  const doc = new jsPDF({
    orientation: 'portrait',
    unit: 'mm',
    format: [LEGAL_WIDTH_MM, LEGAL_HEIGHT_MM],
  });

  const totalPages = Math.ceil(sorted.length / BARCODES_PER_PAGE);

  for (let page = 0; page < totalPages; page++) {
    if (page > 0) {
      doc.addPage([LEGAL_WIDTH_MM, LEGAL_HEIGHT_MM], 'portrait');
    }

    const startIdx = page * BARCODES_PER_PAGE;
    const endIdx = Math.min(startIdx + BARCODES_PER_PAGE, sorted.length);
    const employeesOnPage = endIdx - startIdx;

    // Draw cutting guideline borders
    drawCuttingBorders(doc, employeesOnPage);

    for (let i = startIdx; i < endIdx; i++) {
      const employee = sorted[i];
      const posInPage = i - startIdx;
      const col = posInPage % COLS;
      const row = Math.floor(posInPage / COLS);

      const cellX = MARGIN_LEFT + col * CELL_WIDTH;
      const cellY = MARGIN_TOP + row * CELL_HEIGHT;

      // QR code on the right side of the cell
      const qrX = cellX + CELL_WIDTH - QR_IMG_SIZE - 4; // 4mm padding from right
      const qrY = cellY + (CELL_HEIGHT - QR_IMG_SIZE) / 2; // vertically centered

      // Employee name and ID on the left side
      const textX = cellX + 4; // 4mm padding from left
      const textAreaWidth = CELL_WIDTH - QR_IMG_SIZE - 10; // space for text

      // Employee name - bold, Arial size 13
      const name = formatEmployeeName(employee);
      doc.setFontSize(NAME_FONT_SIZE_PT);
      doc.setFont('helvetica', 'bold');
      doc.setTextColor(0, 0, 0);

      // Split name into multiple lines if needed to fit width
      const nameLines: string[] = doc.splitTextToSize(name, textAreaWidth);
      const nameLineHeightMm = 4.8;
      const spacingToId = 5.2;

      // Calculate vertical placement so the entire text block (name + ID) is centered
      const totalTextSpan = (nameLines.length - 1) * nameLineHeightMm + spacingToId;
      const nameFirstLineY = cellY + Math.max(5, (CELL_HEIGHT - totalTextSpan) / 2 + (nameLines.length === 1 ? 0.5 : 0));

      doc.text(nameLines, textX, nameFirstLineY, { align: 'left' });

      // Employee ID placed dynamically below all lines of the name
      const idY = nameFirstLineY + (nameLines.length - 1) * nameLineHeightMm + spacingToId;
      doc.setFontSize(11);
      doc.setFont('helvetica', 'bold');
      doc.setTextColor(0, 0, 0);
      doc.text(employee.id, textX, idY, { align: 'left' });

      // Reset text color
      doc.setTextColor(0, 0, 0);

      // Generate QR code image
      try {
        const qrDataUrl = await generateQRCodeDataUrl(employee, 300);
        doc.addImage(qrDataUrl, 'PNG', qrX, qrY, QR_IMG_SIZE, QR_IMG_SIZE);
      } catch (error) {
        console.error(`Error generating QR code for ${employee.id}:`, error);
        doc.setFontSize(7);
        doc.setTextColor(200, 0, 0);
        doc.text('[QR Error]', qrX + QR_IMG_SIZE / 2, qrY + QR_IMG_SIZE / 2, { align: 'center' });
        doc.setTextColor(0, 0, 0);
      }

      if (onProgress) {
        onProgress(i + 1, sorted.length);
      }
    }
  }

  const timestamp = new Date().toISOString().split('T')[0];
  const filename = `qr-codes_${timestamp}.pdf`;
  doc.save(filename);
}

/**
 * Bulk download barcodes or QR codes as PDF
 */
export async function bulkDownloadCodes(
  employees: Employee[],
  type: 'barcode' | 'qrcode',
  onProgress?: (current: number, total: number) => void
): Promise<void> {
  if (type === 'barcode') {
    await generateBarcodePDF(employees, onProgress);
  } else {
    await generateQRCodePDF(employees, onProgress);
  }
}

