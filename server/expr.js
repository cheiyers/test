'use strict';

/**
 * Evaluate content segments against a data row.
 * Segment:
 *   { type: 'text', value: '任意字符' }
 *   { type: 'field', field: '列名', formula: 'left:3' | 'upper' | 'num+1' | ... }
 */

function getField(data, field) {
  if (!field || !data) return '';
  if (Object.prototype.hasOwnProperty.call(data, field)) {
    return data[field] == null ? '' : String(data[field]);
  }
  const key = Object.keys(data).find((k) => k.toLowerCase() === String(field).toLowerCase());
  return key ? String(data[key] ?? '') : '';
}

function applyFormula(raw, formula) {
  let val = raw == null ? '' : String(raw);
  if (!formula) return val;
  const f = String(formula).trim();
  if (!f) return val;

  if (f === 'trim') return val.trim();
  if (f === 'upper') return val.toUpperCase();
  if (f === 'lower') return val.toLowerCase();

  let m = f.match(/^left:(\d+)$/i);
  if (m) return val.slice(0, Number(m[1]));

  m = f.match(/^right:(\d+)$/i);
  if (m) return val.slice(-Number(m[1]));

  m = f.match(/^mid:(\d+):(\d+)$/i);
  if (m) {
    const start = Math.max(0, Number(m[1]) - 1);
    return val.substr(start, Number(m[2]));
  }

  m = f.match(/^padleft:(\d+):(.*)$/i);
  if (m) {
    const len = Number(m[1]);
    const ch = m[2] === '' ? '0' : m[2];
    return val.padStart(len, ch);
  }

  m = f.match(/^padright:(\d+):(.*)$/i);
  if (m) {
    const len = Number(m[1]);
    const ch = m[2] === '' ? '0' : m[2];
    return val.padEnd(len, ch);
  }

  m = f.match(/^replace:(.*?):(.*)$/i);
  if (m) return val.split(m[1]).join(m[2]);

  m = f.match(/^num([+\-*/])(-?\d+(?:\.\d+)?)$/i);
  if (m) {
    const n = Number(String(val).replace(/,/g, ''));
    const x = Number(m[2]);
    if (!Number.isFinite(n) || !Number.isFinite(x)) return val;
    const op = m[1];
    let out = n;
    if (op === '+') out = n + x;
    if (op === '-') out = n - x;
    if (op === '*') out = n * x;
    if (op === '/') out = x === 0 ? n : n / x;
    return String(out);
  }

  return val;
}

function evalSegments(segments, data) {
  if (!Array.isArray(segments) || !segments.length) return '';
  return segments.map((seg) => {
    if (!seg) return '';
    if (seg.type === 'text') return seg.value == null ? '' : String(seg.value);
    if (seg.type === 'field') {
      const raw = getField(data, seg.field);
      return applyFormula(raw, seg.formula);
    }
    return '';
  }).join('');
}

/** Support legacy {field} / {field|formula} text templates */
function evalTemplateText(text, data) {
  if (text == null) return '';
  return String(text).replace(/\{([^}|]+)(?:\|([^}]*))?\}/g, (_, field, formula) => {
    return applyFormula(getField(data, field.trim()), formula ? formula.trim() : '');
  });
}

function resolveElementContent(el, data, fallbackCode) {
  if (el && Array.isArray(el.segments) && el.segments.length) {
    return evalSegments(el.segments, data);
  }
  if (el && el.type === 'code') {
    return fallbackCode || evalTemplateText(el.text || '', data);
  }
  if (el && el.bind && !(el.text || '').includes('{')) {
    return applyFormula(getField(data, el.bind), el.formula || '');
  }
  return evalTemplateText(el?.text || '', data);
}

function resolveCellContent(cell, data, fallbackCode) {
  if (!cell) return '';
  if (Array.isArray(cell.segments) && cell.segments.length) {
    return evalSegments(cell.segments, data);
  }
  if (cell.contentType === 'qr' || cell.contentType === 'barcode') {
    return fallbackCode || evalTemplateText(cell.text || '', data);
  }
  return evalTemplateText(cell.text || '', data);
}

module.exports = {
  getField,
  applyFormula,
  evalSegments,
  evalTemplateText,
  resolveElementContent,
  resolveCellContent
};
