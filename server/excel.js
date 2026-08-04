'use strict';

const XLSX = require('xlsx');

function readExcelBuffer(buffer) {
  const workbook = XLSX.read(buffer, { type: 'buffer', cellDates: true });
  const sheetName = workbook.SheetNames[0];
  if (!sheetName) return { headers: [], rows: [], sheetName: null };
  const sheet = workbook.Sheets[sheetName];
  const aoa = XLSX.utils.sheet_to_json(sheet, { header: 1, defval: '', raw: false });
  if (!aoa.length) return { headers: [], rows: [], sheetName };

  const headers = (aoa[0] || []).map((h, i) => {
    const name = String(h == null ? '' : h).trim();
    return name || `列${i + 1}`;
  });

  const rows = [];
  for (let i = 1; i < aoa.length; i++) {
    const arr = aoa[i] || [];
    const allEmpty = headers.every((_, idx) => String(arr[idx] ?? '').trim() === '');
    if (allEmpty) continue;
    const obj = {};
    headers.forEach((h, idx) => {
      obj[h] = arr[idx] == null ? '' : String(arr[idx]).trim();
    });
    rows.push({ lineNo: i, data: obj });
  }
  return { headers, rows, sheetName };
}

function pickField(rowData, fieldName) {
  if (!fieldName) return '';
  if (Object.prototype.hasOwnProperty.call(rowData, fieldName)) {
    return String(rowData[fieldName] ?? '').trim();
  }
  // case-insensitive fallback
  const key = Object.keys(rowData).find((k) => k.toLowerCase() === String(fieldName).toLowerCase());
  return key ? String(rowData[key] ?? '').trim() : '';
}

function buildMatchKey(rowData, matchFields) {
  return (matchFields || []).map((f) => pickField(rowData, f)).join('||');
}

function toNumber(val, fallback = 1) {
  if (val === '' || val == null) return fallback;
  const n = Number(String(val).replace(/,/g, ''));
  return Number.isFinite(n) ? n : fallback;
}

function exportRowsToBuffer(rows, sheetName = 'Sheet1') {
  const ws = XLSX.utils.json_to_sheet(rows);
  const wb = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(wb, ws, sheetName);
  return XLSX.write(wb, { type: 'buffer', bookType: 'xlsx' });
}

module.exports = {
  readExcelBuffer,
  pickField,
  buildMatchKey,
  toNumber,
  exportRowsToBuffer
};
