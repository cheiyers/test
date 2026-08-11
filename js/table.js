/**
 * Table model helpers: normalize legacy tables, merge cells, style cells.
 */
(function (global) {
  'use strict';

  function defaultCell(text, patch) {
    return Object.assign({
      text: text == null ? '' : String(text),
      align: 'left',
      fontSize: null, // null = use table default
      fontWeight: '400',
      fontStyle: 'normal',
      color: '#0f172a',
      vAlign: 'middle',
    }, patch || {});
  }

  function parseLegacyCell(raw) {
    const src = String(raw == null ? '' : raw);
    const m = src.match(/^\*\*([\s\S]*)\*\*$/);
    return defaultCell(m ? m[1] : src, { fontWeight: m ? '700' : '400' });
  }

  function ensureGrid(el) {
    if (!el || el.type !== 'table') return el;
    const rows = Math.max(1, Number(el.rows) || 1);
    const cols = Math.max(1, Number(el.cols) || 1);
    el.rows = rows;
    el.cols = cols;

    if (!Array.isArray(el.cells) || el.cells.length !== rows || el.cells.some((r) => !Array.isArray(r) || r.length !== cols)) {
      const lines = String(el.tableCells || '').split(/\n/);
      const aligns = String(el.colAligns || '').split('|').map((x) => x.trim());
      const grid = [];
      for (let r = 0; r < rows; r++) {
        const parts = (lines[r] || '').split('|');
        const row = [];
        for (let c = 0; c < cols; c++) {
          const cell = parseLegacyCell(parts[c] != null ? parts[c] : '');
          if (aligns[c]) cell.align = aligns[c];
          row.push(cell);
        }
        grid.push(row);
      }
      el.cells = grid;
    } else {
      for (let r = 0; r < rows; r++) {
        for (let c = 0; c < cols; c++) {
          el.cells[r][c] = defaultCell(el.cells[r][c].text, el.cells[r][c]);
        }
      }
    }

    if (!Array.isArray(el.colWidths) || el.colWidths.length !== cols) {
      let fromStr = [];
      if (typeof el.colWidths === 'string' && el.colWidths) {
        fromStr = el.colWidths.split('|').map((x) => parseFloat(String(x).replace('%', ''))).filter((n) => Number.isFinite(n) && n > 0);
      } else if (typeof el.colWidthsStr === 'string' && el.colWidthsStr) {
        fromStr = el.colWidthsStr.split('|').map((x) => parseFloat(String(x).replace('%', ''))).filter((n) => Number.isFinite(n) && n > 0);
      }
      if (fromStr.length === cols) {
        el.colWidths = normalizeWeights(fromStr);
      } else if (Array.isArray(el.colWidths) && el.colWidths.length) {
        const padded = el.colWidths.slice(0, cols);
        while (padded.length < cols) padded.push(100 / cols);
        el.colWidths = normalizeWeights(padded.map(Number));
      } else {
        el.colWidths = normalizeWeights(Array(cols).fill(1));
      }
    } else {
      el.colWidths = normalizeWeights(el.colWidths.map(Number));
    }

    if (!Array.isArray(el.rowHeights) || el.rowHeights.length !== rows) {
      el.rowHeights = normalizeWeights(Array(rows).fill(1));
    } else {
      el.rowHeights = normalizeWeights(el.rowHeights.map(Number));
    }

    if (!Array.isArray(el.merges)) el.merges = [];
    el.merges = el.merges
      .map((m) => ({
        r: Number(m.r) || 0,
        c: Number(m.c) || 0,
        rowspan: Math.max(1, Number(m.rowspan) || 1),
        colspan: Math.max(1, Number(m.colspan) || 1),
      }))
      .filter((m) => m.r < rows && m.c < cols);

    syncLegacyStrings(el);
    return el;
  }

  function normalizeWeights(arr) {
    const nums = arr.map((n) => (Number.isFinite(n) && n > 0 ? n : 1));
    const sum = nums.reduce((a, b) => a + b, 0) || 1;
    return nums.map((n) => Math.round((n / sum) * 1000) / 10);
  }

  function syncLegacyStrings(el) {
    const rows = el.rows;
    const cols = el.cols;
    const lines = [];
    for (let r = 0; r < rows; r++) {
      const parts = [];
      for (let c = 0; c < cols; c++) {
        const cell = el.cells[r][c];
        const t = cell.text || '';
        parts.push(cell.fontWeight === '700' || cell.fontWeight === 'bold' ? `**${t}**` : t);
      }
      lines.push(parts.join('|'));
    }
    el.tableCells = lines.join('\n');
    el.colAligns = el.cells[0].map((c) => c.align || 'left').join('|');
    el.colWidthsStr = el.colWidths.map((w) => w + '%').join('|');
  }

  function resizeGrid(el, newRows, newCols) {
    ensureGrid(el);
    const oldR = el.rows;
    const oldC = el.cols;
    const rows = Math.max(1, Number(newRows) || 1);
    const cols = Math.max(1, Number(newCols) || 1);
    const cells = [];
    for (let r = 0; r < rows; r++) {
      const row = [];
      for (let c = 0; c < cols; c++) {
        if (r < oldR && c < oldC) row.push(defaultCell(el.cells[r][c].text, el.cells[r][c]));
        else row.push(defaultCell(''));
      }
      cells.push(row);
    }
    el.rows = rows;
    el.cols = cols;
    el.cells = cells;
    el.colWidths = normalizeWeights(
      cols <= oldC ? el.colWidths.slice(0, cols) : el.colWidths.concat(Array(cols - oldC).fill(100 / cols))
    );
    el.rowHeights = normalizeWeights(
      rows <= oldR ? el.rowHeights.slice(0, rows) : el.rowHeights.concat(Array(rows - oldR).fill(100 / rows))
    );
    el.merges = (el.merges || []).filter((m) => m.r < rows && m.c < cols).map((m) => ({
      ...m,
      rowspan: Math.min(m.rowspan, rows - m.r),
      colspan: Math.min(m.colspan, cols - m.c),
    }));
    syncLegacyStrings(el);
    return el;
  }

  function findMergeAt(el, r, c) {
    ensureGrid(el);
    return (el.merges || []).find((m) => (
      r >= m.r && r < m.r + m.rowspan && c >= m.c && c < m.c + m.colspan
    )) || null;
  }

  function isMergeOrigin(el, r, c) {
    const m = findMergeAt(el, r, c);
    return m ? (m.r === r && m.c === c) : true;
  }

  function getVisibleCellMap(el) {
    ensureGrid(el);
    const map = [];
    for (let r = 0; r < el.rows; r++) {
      map[r] = [];
      for (let c = 0; c < el.cols; c++) {
        const m = findMergeAt(el, r, c);
        if (!m) map[r][c] = { show: true, rowspan: 1, colspan: 1, originR: r, originC: c };
        else if (m.r === r && m.c === c) map[r][c] = { show: true, rowspan: m.rowspan, colspan: m.colspan, originR: r, originC: c };
        else map[r][c] = { show: false, rowspan: 0, colspan: 0, originR: m.r, originC: m.c };
      }
    }
    return map;
  }

  function mergeRange(el, r1, c1, r2, c2) {
    ensureGrid(el);
    const top = Math.min(r1, r2);
    const left = Math.min(c1, c2);
    const bottom = Math.max(r1, r2);
    const right = Math.max(c1, c2);
    if (top === bottom && left === right) return false;

    // remove overlapping merges
    el.merges = (el.merges || []).filter((m) => {
      const mr2 = m.r + m.rowspan - 1;
      const mc2 = m.c + m.colspan - 1;
      return mr2 < top || m.r > bottom || mc2 < left || m.c > right;
    });

    el.merges.push({
      r: top,
      c: left,
      rowspan: bottom - top + 1,
      colspan: right - left + 1,
    });
    syncLegacyStrings(el);
    return true;
  }

  function unmergeAt(el, r, c) {
    ensureGrid(el);
    const before = el.merges.length;
    el.merges = (el.merges || []).filter((m) => !(
      r >= m.r && r < m.r + m.rowspan && c >= m.c && c < m.c + m.colspan
    ));
    syncLegacyStrings(el);
    return el.merges.length !== before;
  }

  function updateCell(el, r, c, patch) {
    ensureGrid(el);
    const m = findMergeAt(el, r, c);
    const rr = m ? m.r : r;
    const cc = m ? m.c : c;
    el.cells[rr][cc] = defaultCell(el.cells[rr][cc].text, Object.assign({}, el.cells[rr][cc], patch));
    syncLegacyStrings(el);
    return el.cells[rr][cc];
  }

  function getCell(el, r, c) {
    ensureGrid(el);
    const m = findMergeAt(el, r, c);
    const rr = m ? m.r : r;
    const cc = m ? m.c : c;
    return el.cells[rr][cc];
  }

  function buildCellsFromLabels(rowsSpec) {
    // rowsSpec: [{label, value, labelAlign, valueBold}]
    return rowsSpec.map((row) => ([
      defaultCell(row.label, { align: row.labelAlign || 'right', fontWeight: '400' }),
      defaultCell(row.value, { align: 'left', fontWeight: row.valueBold ? '700' : '400' }),
    ]));
  }

  function evaluateCellText(cell, rowData) {
    return LabelFormula.evaluate(cell && cell.text != null ? cell.text : '', rowData || {});
  }

  global.LabelTable = {
    defaultCell,
    ensureGrid,
    resizeGrid,
    findMergeAt,
    isMergeOrigin,
    getVisibleCellMap,
    mergeRange,
    unmergeAt,
    updateCell,
    getCell,
    buildCellsFromLabels,
    evaluateCellText,
    syncLegacyStrings,
    normalizeWeights,
  };
})(typeof window !== 'undefined' ? window : globalThis);
