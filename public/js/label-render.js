(function (global) {
  /** 按容器边长生成足够清晰的码图像素 */
  function boxToGenPx(host, fallbackMm) {
    const rect = host.getBoundingClientRect();
    const side = Math.max(rect.width || 0, rect.height || 0);
    if (side >= 8) return Math.max(64, Math.round(side * 2));
    return Math.max(64, Math.round(Number(fallbackMm || 20) * (96 / 25.4) * 2));
  }

  /** 让 qrcodejs / JsBarcode 输出铺满容器 */
  function fitGraphicToHost(host) {
    if (!host) return;
    host.style.width = '100%';
    host.style.height = '100%';
    host.style.overflow = 'hidden';
    host.style.boxSizing = 'border-box';
    host.querySelectorAll(':scope > div, :scope > canvas, :scope > img, :scope > svg, :scope > table').forEach((el) => {
      el.style.width = '100%';
      el.style.height = '100%';
      el.style.maxWidth = '100%';
      el.style.maxHeight = '100%';
      el.style.display = 'block';
      el.style.margin = '0';
      el.style.padding = '0';
      el.style.boxSizing = 'border-box';
      if (el.tagName === 'IMG' || el.tagName === 'CANVAS') {
        el.style.objectFit = 'contain';
        el.style.objectPosition = 'left top';
      }
      if (el.tagName === 'SVG') {
        el.setAttribute('preserveAspectRatio', 'xMinYMin meet');
        el.style.width = '100%';
        el.style.height = '100%';
      }
      el.querySelectorAll('canvas, img, table').forEach((inner) => {
        inner.style.width = '100%';
        inner.style.height = '100%';
        inner.style.maxWidth = '100%';
        inner.style.maxHeight = '100%';
        inner.style.display = 'block';
        inner.style.margin = '0';
        inner.style.padding = '0';
        if (inner.tagName === 'IMG' || inner.tagName === 'CANVAS') {
          inner.style.objectFit = 'contain';
          inner.style.objectPosition = 'left top';
        }
      });
    });
  }

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
          height: Math.max(20, heightPx || 40),
          width: 1.4
        });
        svg.setAttribute('preserveAspectRatio', 'xMinYMin meet');
        fitGraphicToHost(host);
      } catch {
        host.textContent = value;
      }
      return;
    }
    if (global.QRCode) {
      const box = document.createElement('div');
      box.style.width = '100%';
      box.style.height = '100%';
      host.appendChild(box);
      const size = Math.max(48, Math.min(widthPx || 80, heightPx || 80));
      // eslint-disable-next-line no-new
      new global.QRCode(box, {
        text: value,
        width: size,
        height: size,
        correctLevel: global.QRCode.CorrectLevel.M
      });
      fitGraphicToHost(host);
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

  /**
   * 码图 + 可选下方文字。
   * 尺寸一律相对父容器（% / cqw），设计器像素框与打印 mm 框拖动缩放都会即时生效。
   * 二维码：左上角正方形，边长 = min(宽, 可用高)。
   */
  function renderCodeBlock(host, contentType, text, widthMm, heightMm, opts = {}, options = {}) {
    host.innerHTML = '';
    // 不要改写 host 的 width/height：打印时父节点已是 el.w/el.h（mm），
    // 若设成 100% 会铺满整张标签，导致手动调整的大小完全无效。
    host.style.display = 'flex';
    host.style.flexDirection = 'column';
    host.style.alignItems = 'flex-start';
    host.style.justifyContent = 'flex-start';
    host.style.overflow = 'hidden';
    host.style.boxSizing = 'border-box';
    if (!host.style.width) host.style.width = '100%';
    if (!host.style.height) host.style.height = '100%';
    // containerType 在部分布局下会导致子元素高度塌缩，二维码改用 100% 铺满父框

    const showText = !!opts.showCodeText;
    const fontPt = Number(opts.codeTextFontSize) || 8;
    const wMm = Math.max(1, Number(widthMm) || 20);
    const hMm = Math.max(1, Number(heightMm) || 20);
    const textHmm = showText ? Math.max(2.5, fontPt * 0.4 + 1.2) : 0;
    const codeHmm = Math.max(1, hMm - textHmm);
    const isQr = contentType !== 'barcode';
    const textPct = showText ? Math.min(45, (textHmm / hMm) * 100) : 0;
    const codePct = Math.max(55, 100 - textPct);

    const codeHost = document.createElement('div');
    codeHost.className = 'code-graphic';
    codeHost.style.flex = '0 0 auto';
    codeHost.style.overflow = 'hidden';
    codeHost.style.boxSizing = 'border-box';
    codeHost.style.position = 'relative';

    if (isQr) {
      // 父框由设计器强制为正方形，码图铺满即可随宽高即时变化
      codeHost.style.width = '100%';
      codeHost.style.height = showText ? `${codePct}%` : '100%';
      codeHost.style.aspectRatio = '1 / 1';
      codeHost.style.maxWidth = '100%';
      codeHost.style.maxHeight = showText ? `${codePct}%` : '100%';
    } else {
      codeHost.style.width = '100%';
      codeHost.style.height = `${codePct}%`;
      codeHost.style.minHeight = '40%';
    }
    host.appendChild(codeHost);

    if (options.previewOnly) {
      codeHost.textContent = isQr ? 'QR' : 'BAR';
      codeHost.style.display = 'grid';
      codeHost.style.placeItems = 'center';
      codeHost.style.fontSize = '10px';
      codeHost.style.color = '#888';
      codeHost.style.border = '1px dashed #aaa';
      codeHost.style.background = '#fafafa';
    } else {
      const paint = () => {
        const px = boxToGenPx(codeHost, Math.min(wMm, codeHmm));
        fillCode(codeHost, contentType, text, px, isQr ? px : Math.max(px, boxToGenPx(codeHost, codeHmm)));
      };
      if (host.isConnected && codeHost.getBoundingClientRect().width > 2) paint();
      else requestAnimationFrame(paint);
    }

    if (showText) {
      const caption = document.createElement('div');
      caption.className = 'code-caption';
      caption.textContent = formatCodeCaption(text, opts);
      caption.style.flex = '0 0 auto';
      caption.style.width = '100%';
      caption.style.maxHeight = `${textPct}%`;
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
          host.style.width = '100%';
          host.style.height = '100%';
          const cellHmm = ((pct / 100) * usableH) * ((cell && cell.rowspan) || 1);
          const cellWmm = (Number(el.w) || 30) * ((Number(colWidths[c]) || (100 / cols)) / 100)
            * ((cell && cell.colspan) || 1);
          td.style.verticalAlign = 'top';
          td.style.padding = '0';
          td.style.height = `${cellHmm}mm`;
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
