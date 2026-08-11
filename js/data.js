(function (global) {
  'use strict';

  function parseCSV(text) {
    const rows = [];
    let row = [];
    let cell = '';
    let i = 0;
    let inQuotes = false;
    const s = String(text || '').replace(/^\uFEFF/, '');
    while (i < s.length) {
      const ch = s[i];
      if (inQuotes) {
        if (ch === '"') {
          if (s[i + 1] === '"') { cell += '"'; i += 2; continue; }
          inQuotes = false; i++; continue;
        }
        cell += ch; i++; continue;
      }
      if (ch === '"') { inQuotes = true; i++; continue; }
      if (ch === ',') { row.push(cell); cell = ''; i++; continue; }
      if (ch === '\n') { row.push(cell); rows.push(row); row = []; cell = ''; i++; continue; }
      if (ch === '\r') { i++; continue; }
      cell += ch; i++;
    }
    if (cell.length || row.length) { row.push(cell); rows.push(row); }
    return rows.filter((r) => r.some((c) => String(c).trim() !== ''));
  }

  function rowsToObjects(matrix) {
    if (!matrix.length) return { columns: [], rows: [] };
    const columns = matrix[0].map((c, idx) => {
      const name = String(c == null ? '' : c).trim();
      return name || `列${idx + 1}`;
    });
    const rows = matrix.slice(1).map((r) => {
      const obj = {};
      columns.forEach((col, i) => {
        obj[col] = r[i] == null ? '' : String(r[i]);
      });
      return obj;
    });
    return { columns, rows };
  }

  function parseJSONOrders(text) {
    const data = JSON.parse(text);
    if (Array.isArray(data)) {
      const columns = data.length ? Object.keys(data[0]) : [];
      const rows = data.map((r) => {
        const obj = {};
        columns.forEach((c) => { obj[c] = r[c] == null ? '' : String(r[c]); });
        return obj;
      });
      return { columns, rows };
    }
    if (data && Array.isArray(data.rows)) {
      const columns = data.columns || (data.rows[0] ? Object.keys(data.rows[0]) : []);
      return {
        columns,
        rows: data.rows.map((r) => {
          const obj = {};
          columns.forEach((c) => { obj[c] = r[c] == null ? '' : String(r[c]); });
          return obj;
        }),
      };
    }
    throw new Error('JSON 格式需为数组或 { columns, rows }');
  }

  async function importFile(file) {
    const name = (file.name || '').toLowerCase();
    if (name.endsWith('.json')) {
      const text = await file.text();
      return parseJSONOrders(text);
    }
    if (name.endsWith('.csv')) {
      const text = await file.text();
      return rowsToObjects(parseCSV(text));
    }
    if (name.endsWith('.xlsx') || name.endsWith('.xls')) {
      if (typeof XLSX === 'undefined') throw new Error('Excel 库未加载');
      const buf = await file.arrayBuffer();
      const wb = XLSX.read(buf, { type: 'array' });
      const sheet = wb.Sheets[wb.SheetNames[0]];
      const matrix = XLSX.utils.sheet_to_json(sheet, { header: 1, defval: '' });
      return rowsToObjects(matrix);
    }
    throw new Error('仅支持 CSV / Excel / JSON');
  }

  function exportLabelsExcel(labels, filename) {
    if (typeof XLSX === 'undefined') throw new Error('Excel 库未加载');
    // Each label becomes a sheet row with flattened element texts + optional image notes
    const maxEls = Math.max(0, ...labels.map((l) => (l.elements || []).length));
    const headers = ['标签序号', '宽度mm', '高度mm'];
    for (let i = 0; i < maxEls; i++) {
      headers.push(`元素${i + 1}_名称`, `元素${i + 1}_类型`, `元素${i + 1}_内容`);
    }
    // Also include original order fields if present
    const orderCols = new Set();
    labels.forEach((l) => {
      Object.keys(l.order || {}).forEach((k) => orderCols.add(k));
    });
    const orderColList = Array.from(orderCols);
    headers.push(...orderColList.map((c) => `订单_${c}`));

    const aoa = [headers];
    labels.forEach((label, idx) => {
      const row = [idx + 1, label.width, label.height];
      const els = label.elements || [];
      for (let i = 0; i < maxEls; i++) {
        const el = els[i];
        if (!el) { row.push('', '', ''); continue; }
        row.push(el.name || '', el.type || '', el.content || '');
      }
      orderColList.forEach((c) => row.push((label.order && label.order[c]) || ''));
      aoa.push(row);
    });

    const ws = XLSX.utils.aoa_to_sheet(aoa);
    const wb = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(wb, ws, '标签数据');

    // Second sheet: printable HTML snapshot note
    const meta = XLSX.utils.aoa_to_sheet([
      ['说明'],
      ['本文件由标签设计器导出，可用于外部打印软件或二次处理。'],
      ['「标签数据」工作表包含每个标签元素解析后的内容与原始订单字段。'],
      ['如需按模板版式打印，请在设计器中直接使用「打印」功能。'],
    ]);
    XLSX.utils.book_append_sheet(wb, meta, '说明');
    XLSX.writeFile(wb, filename || 'labels-export.xlsx');
  }

  /** Export one visual sheet per label as HTML table approximation for Excel-friendly layout. */
  function exportVisualExcel(labels, filename) {
    if (typeof XLSX === 'undefined') throw new Error('Excel 库未加载');
    const wb = XLSX.utils.book_new();
    labels.slice(0, 50).forEach((label, idx) => {
      const lines = (label.elements || [])
        .filter((e) => e.content)
        .map((e) => [e.name || e.type, e.content]);
      if (!lines.length) lines.push(['(空模板)', '']);
      const ws = XLSX.utils.aoa_to_sheet([['字段', '内容'], ...lines]);
      XLSX.utils.book_append_sheet(wb, ws, `标签${idx + 1}`.slice(0, 31));
    });
    XLSX.writeFile(wb, filename || 'labels-visual.xlsx');
  }

  global.LabelData = {
    importFile,
    parseCSV,
    rowsToObjects,
    exportLabelsExcel,
    exportVisualExcel,
  };
})(typeof window !== 'undefined' ? window : globalThis);
