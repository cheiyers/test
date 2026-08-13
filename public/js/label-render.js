(function (global) {
  function fillCode(host, contentType, text, widthPx, heightPx) {
    host.innerHTML = '';
    const value = String(text || '');
    if (!value) {
      host.textContent = '';
      return;
    }
    if (contentType === 'barcode' && global.JsBarcode) {
      const svg = document.createElementNS('http://www.w3.org/2000/svg', 'svg');
      host.appendChild(svg);
      try {
        global.JsBarcode(svg, value, {
          format: 'CODE128',
          displayValue: false,
          margin: 0,
          height: Math.max(20, (heightPx || 40) - 4),
          width: 1.1
        });
      } catch {
        host.textContent = value;
      }
      return;
    }
    if (global.QRCode) {
      const box = document.createElement('div');
      host.appendChild(box);
      const size = Math.max(40, Math.min(widthPx || 80, heightPx || 80) - 4);
      // eslint-disable-next-line no-new
      new global.QRCode(box, {
        text: value,
        width: size,
        height: size,
        correctLevel: global.QRCode.CorrectLevel.M
      });
      return;
    }
    host.textContent = value;
  }

  function ensureCodeHasScanId(content, scanId) {
    const c = String(content || '');
    const id = String(scanId || '');
    if (!id) return c;
    if (!c) return id;
    if (c.includes(id)) return c;
    return `${c}|${id}`;
  }

  function renderTableElement(el, data, codeFallback, options = {}) {
    const table = document.createElement('table');
    table.className = 'label-table';
    table.style.width = '100%';
    table.style.height = '100%';
    table.style.borderCollapse = 'collapse';
    table.style.borderSpacing = '0';
    table.style.tableLayout = 'fixed';
    table.style.boxSizing = 'border-box';

    const rows = el.rows || 1;
    const cols = el.cols || 1;
    Expr.ensureTableLayout(el);
    const occupied = Expr.buildOccupiedMap(rows, cols, el.cells);
    const colWidths = el.colWidths || Array.from({ length: cols }, () => 100 / cols);
    const rowHeights = el.rowHeights || Array.from({ length: rows }, () => 100 / rows);

    // 百分比行高 + 边框在固定高度容器内常把末行挤没；改为按元件高度(mm)分配，并预留边框厚度
    const elH = Math.max(1, Number(el.h) || 10);
    const borderMm = 0.27; // ≈1 CSS px @ 96dpi
    const usableH = Math.max(1, elH - borderMm * (rows + 1));

    const colgroup = document.createElement('colgroup');
    for (let c = 0; c < cols; c++) {
      const col = document.createElement('col');
      col.style.width = `${colWidths[c] || (100 / cols)}%`;
      colgroup.appendChild(col);
    }
    table.appendChild(colgroup);

    for (let r = 0; r < rows; r++) {
      const tr = document.createElement('tr');
      const pct = Number(rowHeights[r]) || (100 / rows);
      tr.style.height = `${(pct / 100) * usableH}mm`;
      for (let c = 0; c < cols; c++) {
        const cell = occupied[r][c];
        if (cell === 'skip') continue;
        const td = document.createElement('td');
        td.style.border = '1px solid #333';
        td.style.padding = '0 1px';
        td.style.lineHeight = '1.15';
        td.style.verticalAlign = 'middle';
        td.style.textAlign = (cell && cell.align) || 'center';
        td.style.fontSize = `${(cell && cell.fontSize) || 10}pt`;
        td.style.fontWeight = cell && cell.bold ? '700' : '400';
        td.style.overflow = 'hidden';
        td.style.boxSizing = 'border-box';
        td.style.wordBreak = 'break-word';
        td.rowSpan = (cell && cell.rowspan) || 1;
        td.colSpan = (cell && cell.colspan) || 1;

        const contentType = (cell && cell.contentType) || 'text';
        let text = Expr.resolveCellContent(cell, data, codeFallback);
        if (contentType === 'qr' || contentType === 'barcode') {
          text = ensureCodeHasScanId(text, codeFallback || data?.child_code || data?.package_code);
          const host = document.createElement('div');
          host.style.width = '100%';
          host.style.height = '100%';
          host.style.minHeight = '20px';
          host.style.display = 'grid';
          host.style.placeItems = 'center';
          td.appendChild(host);
          if (!options.previewOnly) {
            fillCode(host, contentType, text, 72, 48);
          } else {
            host.textContent = contentType.toUpperCase();
            host.style.fontSize = '9px';
            host.style.color = '#888';
          }
        } else {
          td.textContent = text;
        }
        tr.appendChild(td);
      }
      table.appendChild(tr);
    }
    return table;
  }

  function renderLabelTo(container, label, options = {}) {
    const tpl = label.template;
    if (!tpl) return;
    container.innerHTML = '';
    container.style.position = 'relative';
    container.style.width = `${tpl.width_mm}mm`;
    container.style.height = `${tpl.height_mm}mm`;
    container.style.overflow = 'hidden';
    container.style.background = '#fff';
    container.style.boxSizing = 'border-box';
    container.style.margin = '0';
    container.style.padding = '0';

    (tpl.elements || []).forEach((el) => {
      const node = document.createElement('div');
      node.style.position = 'absolute';
      node.style.left = `${el.x}mm`;
      node.style.top = `${el.y}mm`;
      node.style.width = `${el.w}mm`;
      node.style.height = `${el.h}mm`;
      node.style.overflow = 'hidden';
      node.style.boxSizing = 'border-box';
      node.style.lineHeight = '1.15';

      if (el.type === 'table') {
        node.appendChild(renderTableElement(el, label.data, label.scan_id || label.code, options));
      } else if (el.type === 'code') {
        node.style.display = 'grid';
        node.style.placeItems = 'center';
        let content = Expr.resolveElementContent(el, label.data, label.code);
        content = ensureCodeHasScanId(content, label.scan_id || label.data?.child_code || label.data?.package_code || label.code);
        const type = el.codeType || tpl.code_type || 'qr';
        if (options.previewOnly) {
          node.textContent = 'CODE';
          node.style.fontSize = '10px';
          node.style.color = '#888';
          node.style.border = '1px dashed #aaa';
        } else {
          fillCode(node, type, content, el.w * 3.5, el.h * 3.5);
        }
      } else {
        node.style.fontSize = `${el.fontSize || 11}pt`;
        node.style.textAlign = el.align || 'left';
        node.style.fontWeight = el.bold ? '700' : '400';
        node.style.whiteSpace = 'pre-wrap';
        node.style.wordBreak = 'break-word';
        node.textContent = Expr.resolveElementContent(el, label.data, label.code);
      }
      container.appendChild(node);
    });
  }

  global.LabelRender = { renderLabelTo, renderTableElement, fillCode };
})(window);
