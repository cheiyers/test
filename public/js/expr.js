(function (global) {
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
    if (m) return val.substr(Math.max(0, Number(m[1]) - 1), Number(m[2]));
    m = f.match(/^padleft:(\d+):(.*)$/i);
    if (m) return val.padStart(Number(m[1]), m[2] === '' ? '0' : m[2]);
    m = f.match(/^padright:(\d+):(.*)$/i);
    if (m) return val.padEnd(Number(m[1]), m[2] === '' ? '0' : m[2]);
    m = f.match(/^replace:(.*?):(.*)$/i);
    if (m) return val.split(m[1]).join(m[2]);
    m = f.match(/^num([+\-*/])(-?\d+(?:\.\d+)?)$/i);
    if (m) {
      const n = Number(String(val).replace(/,/g, ''));
      const x = Number(m[2]);
      if (!Number.isFinite(n) || !Number.isFinite(x)) return val;
      if (m[1] === '+') return String(n + x);
      if (m[1] === '-') return String(n - x);
      if (m[1] === '*') return String(n * x);
      if (m[1] === '/') return String(x === 0 ? n : n / x);
    }
    return val;
  }

  function evalSegments(segments, data) {
    if (!Array.isArray(segments) || !segments.length) return '';
    return segments.map((seg) => {
      if (!seg) return '';
      if (seg.type === 'text') return seg.value == null ? '' : String(seg.value);
      if (seg.type === 'field') return applyFormula(getField(data, seg.field), seg.formula);
      return '';
    }).join('');
  }

  function evalTemplateText(text, data) {
    if (text == null) return '';
    return String(text).replace(/\{([^}|]+)(?:\|([^}]*))?\}/g, (_, field, formula) =>
      applyFormula(getField(data, field.trim()), formula ? formula.trim() : '')
    );
  }

  function resolveElementContent(el, data, fallbackCode) {
    if (el && Array.isArray(el.segments) && el.segments.length) return evalSegments(el.segments, data);
    if (el && el.type === 'code') return fallbackCode || evalTemplateText(el.text || '', data);
    if (el && el.bind && !(el.text || '').includes('{')) {
      return applyFormula(getField(data, el.bind), el.formula || '');
    }
    return evalTemplateText(el?.text || '', data);
  }

  function resolveCellContent(cell, data, fallbackCode) {
    if (!cell) return '';
    if (Array.isArray(cell.segments) && cell.segments.length) return evalSegments(cell.segments, data);
    if (cell.contentType === 'qr' || cell.contentType === 'barcode') {
      return fallbackCode || evalTemplateText(cell.text || '', data);
    }
    return evalTemplateText(cell.text || '', data);
  }

  function segmentsPreview(segments) {
    if (!Array.isArray(segments) || !segments.length) return '';
    return segments.map((s) => {
      if (s.type === 'text') return s.value || '';
      if (s.type === 'field') return `{${s.field || '?'}${s.formula ? '|' + s.formula : ''}}`;
      return '';
    }).join('');
  }

  function buildOccupiedMap(rows, cols, cells) {
    const occupied = Array.from({ length: rows }, () => Array(cols).fill(null));
    (cells || []).forEach((cell) => {
      const rs = cell.rowspan || 1;
      const cs = cell.colspan || 1;
      for (let r = cell.r; r < cell.r + rs && r < rows; r++) {
        for (let c = cell.c; c < cell.c + cs && c < cols; c++) {
          occupied[r][c] = (r === cell.r && c === cell.c) ? cell : 'skip';
        }
      }
    });
    return occupied;
  }

  function ensureTableCells(table) {
    const rows = table.rows || 2;
    const cols = table.cols || 2;
    if (!Array.isArray(table.cells)) table.cells = [];
    const occupied = buildOccupiedMap(rows, cols, table.cells);
    for (let r = 0; r < rows; r++) {
      for (let c = 0; c < cols; c++) {
        if (!occupied[r][c]) {
          table.cells.push({
            r, c, rowspan: 1, colspan: 1,
            contentType: 'text',
            segments: [{ type: 'text', value: '' }],
            text: '',
            fontSize: 10,
            align: 'center',
            bold: false
          });
        }
      }
    }
    table.cells = table.cells.filter((cell) => cell.r < rows && cell.c < cols);
    return table;
  }

  function normalizePercents(arr, count) {
    const n = Math.max(1, Number(count) || 1);
    let next = Array.isArray(arr) ? arr.slice(0, n).map(Number) : [];
    while (next.length < n) next.push(0);
    next = next.map((v) => (Number.isFinite(v) && v > 0 ? v : 0));
    const sum = next.reduce((a, b) => a + b, 0);
    if (sum <= 0) return Array.from({ length: n }, () => 100 / n);
    return next.map((v) => (v / sum) * 100);
  }

  function resizePercents(arr, count) {
    const n = Math.max(1, Number(count) || 1);
    const cur = Array.isArray(arr)
      ? arr.map(Number).filter((v) => Number.isFinite(v) && v > 0)
      : [];
    if (!cur.length) return Array.from({ length: n }, () => 100 / n);
    if (cur.length === n) return normalizePercents(cur, n);
    if (cur.length > n) return normalizePercents(cur.slice(0, n), n);
    const avg = cur.reduce((a, b) => a + b, 0) / cur.length;
    return normalizePercents(cur.concat(Array.from({ length: n - cur.length }, () => avg)), n);
  }

  /** 调整某一项百分比，其余项按原比例分摊剩余 */
  function setPercentAt(arr, index, value, count) {
    const n = Math.max(1, Number(count) || 1);
    const idx = Math.max(0, Math.min(n - 1, Number(index) || 0));
    const next = normalizePercents(arr, n);
    if (n === 1) return [100];
    const v = Math.max(5, Math.min(95, Number(value) || 5));
    const others = next.reduce((s, x, i) => (i === idx ? s : s + x), 0);
    const remain = 100 - v;
    if (others <= 0) {
      return next.map((_, i) => (i === idx ? v : remain / (n - 1)));
    }
    return next.map((x, i) => (i === idx ? v : (x / others) * remain));
  }

  function ensureTableLayout(table) {
    ensureTableCells(table);
    table.rows = Math.max(1, Number(table.rows) || 1);
    table.cols = Math.max(1, Number(table.cols) || 1);
    table.colWidths = resizePercents(table.colWidths, table.cols);
    table.rowHeights = resizePercents(table.rowHeights, table.rows);
    return table;
  }

  global.Expr = {
    getField,
    applyFormula,
    evalSegments,
    evalTemplateText,
    resolveElementContent,
    resolveCellContent,
    segmentsPreview,
    buildOccupiedMap,
    ensureTableCells,
    normalizePercents,
    resizePercents,
    setPercentAt,
    ensureTableLayout
  };
})(window);
