const fs = require('fs');
function rm(f, ranges) {
    let lines = fs.readFileSync(f, 'utf8').split('\n');
    let keep = [];
    for (let i = 0; i < lines.length; i++) {
        let n = i + 1;
        let ok = true;
        for (let r of ranges) {
            if (n >= r[0] && n <= r[1]) {
                ok = false;
                break;
            }
        }
        if (ok) keep.push(lines[i]);
    }
    fs.writeFileSync(f, keep.join('\n'));
}

rm('c:/Employee Records Management System/src/pages/Dashboard.tsx', [[4, 4], [137, 453], [455, 785], [2204, 2326], [2606, 2804]]);
rm('c:/Employee Records Management System/src/pages/InventoryAppraisal.tsx', [[12, 12], [1527, 1985]]);
console.log('Deleted chunks.');
