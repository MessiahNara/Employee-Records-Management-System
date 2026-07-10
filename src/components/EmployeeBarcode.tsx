import { useRef, useState } from 'react';
import Barcode from 'react-barcode';
import { QRCodeSVG } from 'qrcode.react';
import Button from './ui/Button';
import ImagePreviewModal from './ui/ImagePreviewModal';
import './EmployeeBarcode.css';

interface EmployeeBarcodeProps {
  employeeId: string;
  employeeName?: string;
  employeePosition?: string;
  employeeOffice?: string;
  showQRCode?: boolean;
  showDownloadButton?: boolean;
  showPrintButton?: boolean;
}

function EmployeeBarcode({ 
  employeeId,
  employeeName,
  employeePosition,
  employeeOffice,
  showQRCode = true,
  showDownloadButton = true,
  showPrintButton = true
}: EmployeeBarcodeProps) {
  const barcodeRef = useRef<HTMLDivElement>(null);
  const qrCodeRef = useRef<HTMLDivElement>(null);
  const [previewImage, setPreviewImage] = useState<string | null>(null);
  const [previewAlt, setPreviewAlt] = useState<string>('');

  // QR Code: Contains employee information as text
  // When scanned, shows all employee details directly on phone
  const qrCodeValue = [
    `Employee ID: ${employeeId}`,
    employeeName ? `Name: ${employeeName}` : '',
    employeePosition ? `Position: ${employeePosition}` : '',
    employeeOffice ? `Office: ${employeeOffice}` : '',
  ].filter(Boolean).join('\n');
  
  // Barcode: Just the employee ID for scanner input
  const barcodeValue = employeeId;

  // Handle preview click
  const handlePreviewBarcode = () => {
    if (!barcodeRef.current) return;
    const svg = barcodeRef.current.querySelector('svg');
    if (!svg) return;

    const svgData = new XMLSerializer().serializeToString(svg);
    const svgBlob = new Blob([svgData], { type: 'image/svg+xml;charset=utf-8' });
    const url = URL.createObjectURL(svgBlob);
    
    setPreviewImage(url);
    setPreviewAlt(`Barcode for ${employeeName || employeeId}`);
  };

  const handlePreviewQRCode = () => {
    if (!qrCodeRef.current) return;
    const svg = qrCodeRef.current.querySelector('svg');
    if (!svg) return;

    const svgData = new XMLSerializer().serializeToString(svg);
    const svgBlob = new Blob([svgData], { type: 'image/svg+xml;charset=utf-8' });
    const url = URL.createObjectURL(svgBlob);
    
    setPreviewImage(url);
    setPreviewAlt(`QR Code for ${employeeName || employeeId}`);
  };

  const handleClosePreview = () => {
    if (previewImage) {
      URL.revokeObjectURL(previewImage);
    }
    setPreviewImage(null);
    setPreviewAlt('');
  };

  const handleDownloadBarcode = () => {
    if (!barcodeRef.current) return;

    const svg = barcodeRef.current.querySelector('svg');
    if (!svg) return;

    // Get SVG dimensions
    const svgRect = svg.getBoundingClientRect();
    const scale = 3; // Scale up for higher resolution
    const padding = 40; // White padding around barcode
    const textHeight = 60; // Space for employee name text

    // Create canvas with padding, scale, and text area
    const canvas = document.createElement('canvas');
    const ctx = canvas.getContext('2d');
    if (!ctx) return;

    canvas.width = (svgRect.width + padding * 2) * scale;
    canvas.height = (svgRect.height + padding * 2 + textHeight) * scale;

    // Fill white background
    ctx.fillStyle = '#ffffff';
    ctx.fillRect(0, 0, canvas.width, canvas.height);

    // Add employee name text at the top
    if (employeeName) {
      ctx.fillStyle = '#1f2937';
      ctx.font = `bold ${16 * scale}px Arial, sans-serif`;
      ctx.textAlign = 'center';
      
      // Word wrap for long names
      const maxWidth = (svgRect.width - 10) * scale;
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
    }

    const svgData = new XMLSerializer().serializeToString(svg);
    const img = new Image();
    const svgBlob = new Blob([svgData], { type: 'image/svg+xml;charset=utf-8' });
    const url = URL.createObjectURL(svgBlob);

    img.onload = () => {
      // Draw barcode below the text
      ctx.drawImage(
        img, 
        padding * scale, 
        (padding + textHeight) * scale, 
        svgRect.width * scale, 
        svgRect.height * scale
      );
      
      // Download as PNG with employee name in filename
      canvas.toBlob((blob) => {
        if (!blob) return;
        const link = document.createElement('a');
        const safeName = employeeName ? employeeName.replace(/[^a-z0-9]/gi, '_') : employeeId;
        link.download = `${safeName}-barcode.png`;
        link.href = URL.createObjectURL(blob);
        link.click();
        URL.revokeObjectURL(link.href);
      });
      
      URL.revokeObjectURL(url);
    };

    img.src = url;
  };

  const handleDownloadQRCode = () => {
    if (!qrCodeRef.current) return;

    const svg = qrCodeRef.current.querySelector('svg');
    if (!svg) return;

    // Get SVG dimensions
    const svgRect = svg.getBoundingClientRect();
    const scale = 5; // Scale up for higher resolution (QR codes need more detail)
    const padding = 40; // White padding around QR code
    const textHeight = 60; // Space for employee name text

    // Create canvas with padding, scale, and text area
    const canvas = document.createElement('canvas');
    const ctx = canvas.getContext('2d');
    if (!ctx) return;

    canvas.width = (svgRect.width + padding * 2) * scale;
    canvas.height = (svgRect.height + padding * 2 + textHeight) * scale;

    // Fill white background
    ctx.fillStyle = '#ffffff';
    ctx.fillRect(0, 0, canvas.width, canvas.height);

    // Add employee name text at the top
    if (employeeName) {
      ctx.fillStyle = '#1f2937';
      ctx.font = `bold ${14 * scale}px Arial, sans-serif`;
      ctx.textAlign = 'center';
      
      // Word wrap for long names
      const maxWidth = (svgRect.width - 10) * scale;
      const words = employeeName.split(' ');
      let line = '';
      let y = (padding + 12) * scale;
      
      for (let i = 0; i < words.length; i++) {
        const testLine = line + words[i] + ' ';
        const metrics = ctx.measureText(testLine);
        
        if (metrics.width > maxWidth && i > 0) {
          ctx.fillText(line.trim(), canvas.width / 2, y);
          line = words[i] + ' ';
          y += 18 * scale;
        } else {
          line = testLine;
        }
      }
      ctx.fillText(line.trim(), canvas.width / 2, y);
    }

    const svgData = new XMLSerializer().serializeToString(svg);
    const img = new Image();
    const svgBlob = new Blob([svgData], { type: 'image/svg+xml;charset=utf-8' });
    const url = URL.createObjectURL(svgBlob);

    img.onload = () => {
      // Draw QR code below the text
      ctx.drawImage(
        img, 
        padding * scale, 
        (padding + textHeight) * scale, 
        svgRect.width * scale, 
        svgRect.height * scale
      );
      
      // Download as PNG with employee name in filename
      canvas.toBlob((blob) => {
        if (!blob) return;
        const link = document.createElement('a');
        const safeName = employeeName ? employeeName.replace(/[^a-z0-9]/gi, '_') : employeeId;
        link.download = `${safeName}-qrcode.png`;
        link.href = URL.createObjectURL(blob);
        link.click();
        URL.revokeObjectURL(link.href);
      });
      
      URL.revokeObjectURL(url);
    };

    img.src = url;
  };

  const handlePrint = () => {
    const printWindow = window.open('', '_blank');
    if (!printWindow) return;

    const barcodeHTML = barcodeRef.current?.innerHTML || '';
    const qrCodeHTML = showQRCode ? qrCodeRef.current?.innerHTML || '' : '';

    printWindow.document.write(`
      <!DOCTYPE html>
      <html>
        <head>
          <title>Employee ${employeeId} - Barcode</title>
          <style>
            body {
              font-family: Arial, sans-serif;
              padding: 20px;
              display: flex;
              flex-direction: column;
              align-items: center;
              gap: 20px;
            }
            .barcode-section, .qrcode-section {
              text-align: center;
              page-break-inside: avoid;
            }
            h3 {
              margin: 0 0 10px 0;
              font-size: 14px;
              color: #333;
            }
            .employee-id {
              margin-top: 10px;
              font-size: 12px;
              color: #666;
            }
            @media print {
              body {
                padding: 0;
              }
            }
          </style>
        </head>
        <body>
          <div class="barcode-section">
            <h3>Employee Barcode</h3>
            ${barcodeHTML}
            <div class="employee-id">ID: ${employeeId}</div>
          </div>
          ${showQRCode ? `
            <div class="qrcode-section">
              <h3>Employee QR Code</h3>
              ${qrCodeHTML}
              <div class="employee-id">Employee ID: ${employeeId}</div>
            </div>
          ` : ''}
        </body>
      </html>
    `);

    printWindow.document.close();
    setTimeout(() => {
      printWindow.print();
    }, 250);
  };

  return (
    <div className="employee-barcode">
      <div className="employee-barcode__content">
        <div className="employee-barcode__item" ref={barcodeRef}>
          <div className="employee-barcode__label">Employee Barcode</div>
          <div 
            className="employee-barcode__image-wrapper"
            onClick={handlePreviewBarcode}
            role="button"
            tabIndex={0}
            onKeyDown={(e) => {
              if (e.key === 'Enter' || e.key === ' ') {
                e.preventDefault();
                handlePreviewBarcode();
              }
            }}
            aria-label="Click to preview barcode"
          >
            <Barcode 
              value={barcodeValue} 
              width={5}
              height={140}
              fontSize={16}
              background="transparent"
              lineColor="#1f2937"
            />
          </div>
        </div>

        {showQRCode && (
          <div className="employee-barcode__item" ref={qrCodeRef}>
            <div className="employee-barcode__label">Quick Access QR</div>
            <div 
              className="employee-barcode__image-wrapper"
              onClick={handlePreviewQRCode}
              role="button"
              tabIndex={0}
              onKeyDown={(e) => {
                if (e.key === 'Enter' || e.key === ' ') {
                  e.preventDefault();
                  handlePreviewQRCode();
                }
              }}
              aria-label="Click to preview QR code"
            >
              <QRCodeSVG 
                value={qrCodeValue}
                size={160}
                level="M"
                includeMargin={false}
              />
            </div>
          </div>
        )}
      </div>

      {(showDownloadButton || showPrintButton) && (
        <div className="employee-barcode__actions">
          {showDownloadButton && (
            <>
              <Button 
                variant="secondary" 
                size="sm" 
                onClick={handleDownloadBarcode}
              >
                📥 Download Barcode
              </Button>
              {showQRCode && (
                <Button 
                  variant="secondary" 
                  size="sm" 
                  onClick={handleDownloadQRCode}
                >
                  📥 Download QR
                </Button>
              )}
            </>
          )}
          {showPrintButton && (
            <Button 
              variant="secondary" 
              size="sm" 
              onClick={handlePrint}
            >
              🖨️ Print
            </Button>
          )}
        </div>
      )}

      {/* Image Preview Modal */}
      <ImagePreviewModal
        isOpen={previewImage !== null}
        onClose={handleClosePreview}
        imageSrc={previewImage || ''}
        imageAlt={previewAlt}
      />
    </div>
  );
}

export default EmployeeBarcode;
