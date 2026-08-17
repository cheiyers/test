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

  function formatCodeCaption(text, opts = {}) {
    let s = String(text || '');
    const max = Number(opts.codeTextMaxLen) || 0;
    if (max > 0 && s.length > max) s = `${s.slice(0, max)}…`;
    return s;
  }

  /** 码图 + 可选下方文字 */
  function renderCodeBlock(host, contentType, text, widthMm, heightMm, opts = {}, options = {}) {
    host.innerHTML = '';
    host.style.display = 'flex';
    host.style.flexDirection = 'column';
    host.style.alignItems = 'center';
    host.style.justifyContent = 'center';
    host.style.width = '100%';
    host.style.height = '100%';
    host.style.overflow = 'hidden';
    host.style.boxSizing = 'border-box';

    const showText = !!opts.showCodeText;
    const fontPt = Number(opts.codeTextFontSize) || 8;
    const textHmm = showText ? Math.max(2.5, fontPt * 0.4 + 1.2) : 0;
    const codeHmm = Math.max(4, (Number(heightMm) || 20) - textHmm);
    const codeWmm = Number(widthMm) || 20;
    const pxW = Math.max(24, codeWmm * 3.5);
    const pxH = Math.max(24, codeHmm * 3.5);

    const codeHost = document.createElement('div');
    codeHost.style.flex = '1 1 auto';
    codeHost.style.width = '100%';
    codeHost.style.height = `${codeHmm}mm`;
    codeHost.style.display = 'grid';
    codeHost.style.placeItems = 'center';
    codeHost.style.overflow = 'hidden';
    host.appendChild(codeHost);

    if (options.previewOnly) {
      codeHost.textContent = (contentType || 'code').toUpperCase();
      codeHost.style.fontSize = '9px';
      codeHost.style.color = '#888';
      codeHost.style.border = '1px dashed #aaa';
    } else {
      fillCode(codeHost, contentType, text, pxW, pxH);
    }

    if (showText) {
      const caption = document.createElement('div');
      caption.className = 'code-caption';
      caption.textContent = formatCodeCaption(text, opts);
      caption.style.flex = '0 0 auto';
      caption.style.width = '100%';
      caption.style.maxHeight = `${textHmm}mm`;
      caption.style.overflow = 'hidden';
      caption.style.fontSize = `${fontPt}pt`;
      caption.style.lineHeight = '1.15';
      caption.style.textAlign = opts.codeTextAlign || 'center';
      caption.style.fontWeight = opts.codeTextBold ? '700' : '400';
      caption.style.wordBreak = 'break-all';
      caption.style.paddingTop = '0.3mm';
      host.appendChild(caption);
    }
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

    const elH = Math.max(1, Number(el.h) || 10);
    const borderMm = 0.27;
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
          const host = document.createElement('div');
          // 单元格高度按行高估算
          const cellHmm = ((pct / 100) * usableH) * ((cell && cell.rowspan) || 1);
          const cellWmm = (Number(el.w) || 30) * ((Number(colWidths[c]) || (100 / cols)) / 100);
          td.appendChild(host);
          renderCodeBlock(host, contentType, text, cellWmm, cellHmm, {
            showCodeText: !!(cell && cell.showCodeText),
            codeTextFontSize: (cell && cell.codeTextFontSize) || 7,
            codeTextAlign: (cell && cell.codeTextAlign) || (cell && cell.align) || 'center',
            codeTextBold: !!(cell && cell.codeTextBold),
            codeTextMaxLen: (cell && cell.codeTextMaxLen) || 0
          }, options);
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

    // 先表格后二维码/文字，与设计器叠放一致（非表格在上）
    const paintOrder = [...(tpl.elements || [])].sort((a, b) => {
      const at = a.type === 'table' ? 0 : 1;
      const bt = b.type === 'table' ? 0 : 1;
      return at - bt;
    });
    paintOrder.forEach((el) => {
      const node = document.createElement('div');
      node.style.position = 'absolute';
      node.style.left = `${el.x}mm`;
      node.style.top = `${el.y}mm`;
      node.style.width = `${el.w}mm`;
      node.style.height = `${el.h}mm`;
      node.style.overflow = 'hidden';
      node.style.boxSizing = 'border-box';
      node.style.lineHeight = '1.15';
      node.style.zIndex = el.type === 'table' ? '1' : '3';

      if (el.type === 'table') {
        node.appendChild(renderTableElement(el, label.data, label.scan_id || label.code, options));
      } else if (el.type === 'code') {
        let content = Expr.resolveElementContent(el, label.data, label.code);
        // 不再强制追加唯一码；按模板片段原样输出
        if (!content) content = label.scan_id || label.code || '';
        const type = el.codeType || tpl.code_type || 'qr';
        renderCodeBlock(node, type, content, el.w, el.h, {
          showCodeText: !!el.showCodeText,
          codeTextFontSize: el.codeTextFontSize || 8,
          codeTextAlign: el.codeTextAlign || 'center',
          codeTextBold: !!el.codeTextBold,
          codeTextMaxLen: el.codeTextMaxLen || 0
        }, options);
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

  global.LabelRender = { renderLabelTo, renderTableElement, fillCode, renderCodeBlock };
})(window);
