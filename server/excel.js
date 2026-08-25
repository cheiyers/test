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
  return (matchFields || []).map((f) => {
    if (typeof f === 'string') return pickField(rowData, f);
    return pickField(rowData, f.field || f.name || '');
  }).join('||');
}

/** Normalize link/match field defs to { left, right } or { bom, order } */
function normalizePairs(list, leftKey = 'master_field', rightKey = 'accessory_field') {
  if (!Array.isArray(list)) return [];
  return list.map((item) => {
    if (typeof item === 'string') {
      return { left: item, right: item, label: item };
    }
    const left = item[leftKey] || item.master_field || item.bom_field || item.left || item.field || '';
    const right = item[rightKey] || item.accessory_field || item.order_field || item.right || item.field || left;
    return { left, right, label: item.label || `${left}${left === right ? '' : '↔' + right}` };
  }).filter((p) => p.left && p.right);
}

function buildPairKey(rowData, pairs, side = 'left') {
  return (pairs || []).map((p) => pickField(rowData, side === 'left' ? p.left : p.right)).join('||');
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
  normalizePairs,
  buildPairKey,
  toNumber,
  exportRowsToBuffer
};
