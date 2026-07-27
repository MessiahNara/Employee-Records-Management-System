const ExcelJS = require('exceljs');

async function analyze() {
    const workbook = new ExcelJS.Workbook();
    await workbook.xlsx.readFile('c:\\Employee Records Management System\\NAP FORM 1 (FORMAT).xlsx');
    
    const ws = workbook.worksheets[0];
    
    let report = `Sheet Name: ${ws.name}\n`;
    report += `Page Setup: ${JSON.stringify(ws.pageSetup)}\n`;
    
    report += `\nColumns:\n`;
    for(let i = 1; i <= ws.columnCount; i++) {
        const col = ws.getColumn(i);
        if(col.width) report += `Col ${i}: width=${col.width}\n`;
    }

    report += `\nMerged Cells:\n`;
    for(const merge in ws._merges) {
        report += `${ws._merges[merge].model.left}:${ws._merges[merge].model.top} to ${ws._merges[merge].model.right}:${ws._merges[merge].model.bottom}\n`;
    }

    report += `\nCells:\n`;
    ws.eachRow({ includeEmpty: false }, (row, rowNumber) => {
        if(row.height) report += `Row ${rowNumber} height: ${row.height}\n`;
        row.eachCell({ includeEmpty: false }, (cell, colNumber) => {
            let val = cell.value;
            if(val && typeof val === 'object' && val.richText) {
                val = val.richText.map(rt => rt.text).join('');
            }
            let styleStr = '';
            if(cell.font) styleStr += `font=${JSON.stringify(cell.font)} `;
            if(cell.alignment) styleStr += `align=${JSON.stringify(cell.alignment)} `;
            if(cell.border) styleStr += `border=${JSON.stringify(cell.border)} `;
            if(cell.fill) styleStr += `fill=${JSON.stringify(cell.fill)} `;
            
            report += `Cell [${rowNumber},${colNumber}]: val="${val}" style=[${styleStr}]\n`;
        });
    });

    const fs = require('fs');
    fs.writeFileSync('c:\\Employee Records Management System\\nap_form_analysis.txt', report);
}

analyze().catch(console.error);
