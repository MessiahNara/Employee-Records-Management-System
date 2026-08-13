import PizZip from 'pizzip';
import Docxtemplater from 'docxtemplater';
import { saveAs } from 'file-saver';

export interface DisposalRecord {
  itemNo: string;
  seriesTitle: string;
  period: string;
  retention: string;
}

export const generateDisposalWord = async (records: DisposalRecord[], volume: string, telephone: string) => {
  try {
    // 1. Fetch the template
    const response = await fetch('./NAP-FORM-3-Template.docx');
    if (!response.ok) {
      throw new Error(`Failed to load template: ${response.statusText}. Ensure NAP-FORM-3-Template.docx exists in the public/ folder`);
    }
    const templateData = await response.arrayBuffer();

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
