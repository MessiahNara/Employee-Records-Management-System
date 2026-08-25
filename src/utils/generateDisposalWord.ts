import PizZip from 'pizzip';
import Docxtemplater from 'docxtemplater';
import { saveAs } from 'file-saver';
import { NAP_FORM_3_TEMPLATE_BASE64 } from './napForm3TemplateBase64';

export interface DisposalRecord {
  itemNo: string;
  seriesTitle: string;
  period: string;
  retention: string;
}

function base64ToArrayBuffer(base64: string): ArrayBuffer {
  const binaryString = atob(base64);
  const len = binaryString.length;
  const bytes = new Uint8Array(len);
  for (let i = 0; i < len; i++) {
    bytes[i] = binaryString.charCodeAt(i);
  }
  return bytes.buffer;
}

function isZipBuffer(buf: ArrayBuffer): boolean {
  if (!buf || buf.byteLength < 4) return false;
  const bytes = new Uint8Array(buf, 0, 4);
  // Zip files (including docx) start with PK\x03\x04 (0x50, 0x4B, 0x03, 0x04)
  return bytes[0] === 0x50 && bytes[1] === 0x4B && bytes[2] === 0x03 && bytes[3] === 0x04;
}

async function loadTemplateBuffer(): Promise<ArrayBuffer> {
  // 1. If embedded base64 template is available, use it immediately (zero network dependency)
  if (NAP_FORM_3_TEMPLATE_BASE64) {
    try {
      const embedded = base64ToArrayBuffer(NAP_FORM_3_TEMPLATE_BASE64);
      if (isZipBuffer(embedded)) {
        return embedded;
      }
    } catch (e) {
      console.warn('Failed to parse embedded NAP Form 3 base64 template, trying fetch...', e);
    }
  }

  // 2. Fallback to fetching from public directory
  const paths = [
    './NAP-FORM-3-Template.docx',
    '/NAP-FORM-3-Template.docx',
    'NAP-FORM-3-Template.docx',
  ];

  for (const p of paths) {
    try {
      const response = await fetch(p);
      if (response.ok) {
        const buf = await response.arrayBuffer();
        if (isZipBuffer(buf)) {
          return buf;
        }
      }
    } catch {
      // Continue to next path
    }
  }

  throw new Error('Failed to load NAP Form 3 Word template.');
}

export const generateDisposalWord = async (records: DisposalRecord[], volume: string, telephone: string) => {
  try {
    // 1. Fetch or load the template
    const templateData = await loadTemplateBuffer();

    // 2. Load into PizZip
    const zip = new PizZip(templateData);

    // 3. Initialize docxtemplater
    const doc = new Docxtemplater(zip, {
      paragraphLoop: true,
      linebreaks: true,
    });

    // 4. Set the data
    const dateOpts: Intl.DateTimeFormatOptions = { month: 'long', day: 'numeric', year: 'numeric' };
    const currentDate = new Date().toLocaleDateString('en-US', dateOpts);

    doc.render({
      currentDate: currentDate,
      volume: volume || ' ', // fallback to empty space if none provided
      telephone: telephone || ' ', 
      records: records,
    });

    // 5. Generate blob
    const blob = doc.getZip().generate({
      type: 'blob',
      mimeType: 'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
    });

    // 6. Save file
    const dateStr = new Date().toISOString().split('T')[0];
    saveAs(blob, `NAP-FORM-3-${dateStr}.docx`);
    return true;
  } catch (error) {
    console.error('Error generating DOCX:', error);
    throw error;
  }
};
