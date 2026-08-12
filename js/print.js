(function (global) {
  'use strict';

  const MM = 3.7795275591;

  function waitImage(img) {
    if (!img) return Promise.resolve();
    if (img.complete && img.naturalWidth) return Promise.resolve();
    return new Promise((resolve) => {
      const done = () => resolve();
      img.addEventListener('load', done, { once: true });
      img.addEventListener('error', done, { once: true });
    });
  }

  /**
   * Render QR to a PNG data URL via qrcodejs (canvas → toDataURL).
   * Avoids display:none / async img issues that break print & html2canvas.
   */
  function qrToDataURL(text, sizePx, level) {
    if (typeof QRCode === 'undefined') return '';
    const levelMap = { L: QRCode.CorrectLevel.L, M: QRCode.CorrectLevel.M, Q: QRCode.CorrectLevel.Q, H: QRCode.CorrectLevel.H };
    const px = Math.max(64, Math.round(sizePx || 256));
    const host = document.createElement('div');
    host.style.cssText = `position:fixed;left:-10000px;top:0;width:${px}px;height:${px}px;overflow:hidden;`;
    document.body.appendChild(host);
    try {
      // eslint-disable-next-line no-new
      new QRCode(host, {
        text: String(text || ' '),
        width: px,
        height: px,
        colorDark: '#000000',
        colorLight: '#ffffff',
        correctLevel: levelMap[level] || QRCode.CorrectLevel.M,
      });
      const canvas = host.querySelector('canvas');
      if (canvas && typeof canvas.toDataURL === 'function') {
        return canvas.toDataURL('image/png');
      }
      const img = host.querySelector('img');
      return img && img.src ? img.src : '';
    } catch {
      return '';
    } finally {
      host.remove();
    }
  }

  function pct(n, total) {
    if (!total) return '0%';
    return ((Number(n) / Number(total)) * 100) + '%';
  }

  /** pt → fraction of label height (cqh), so type scales when page is filled */
  function ptToCqh(pt, labelHmm) {
    return ((Number(pt) * 25.4 / 72) / Number(labelHmm) * 100) + 'cqh';
  }

  function mmToCqh(mm, labelHmm) {
    return (Number(mm) / Number(labelHmm) * 100) + 'cqh';
  }

  function createLabelDOM(snapshot, options) {
    options = options || {};
    const fillPage = !!options.fillPage;
    const labelW = Number(snapshot.width) || 60;
    const labelH = Number(snapshot.height) || 40;

    const root = document.createElement('div');
    root.className = 'print-label' + (fillPage ? ' print-label-fill' : '');
    root.style.position = 'relative';
    root.style.overflow = 'hidden';
    root.style.background = '#fff';
    root.style.color = '#000';
    root.style.boxSizing = 'border-box';

    let host = root;
    if (fillPage) {
      // Fill the browser/printer page box; layout uses % + cqh so content scales.
      root.style.width = '100%';
      root.style.height = '100%';
      root.style.containerType = 'size';
      host = document.createElement('div');
      host.className = 'print-label-inner';
      host.style.position = 'absolute';
      host.style.left = '0';
      host.style.top = '0';
      host.style.width = '100%';
      host.style.height = '100%';
      host.style.overflow = 'hidden';
      root.appendChild(host);
    } else {
      root.style.width = labelW + 'mm';
      root.style.height = labelH + 'mm';
    }

    const tasks = [];

    (snapshot.elements || []).forEach((el) => {
      const node = document.createElement('div');
      node.style.position = 'absolute';
      node.style.boxSizing = 'border-box';
      node.style.overflow = 'hidden';
      if (fillPage) {
        node.style.left = pct(el.x, labelW);
        node.style.top = pct(el.y, labelH);
        node.style.width = pct(el.w, labelW);
        node.style.height = pct(el.h, labelH);
      } else {
        node.style.left = el.x + 'mm';
        node.style.top = el.y + 'mm';
        node.style.width = el.w + 'mm';
        node.style.height = el.h + 'mm';
      }

      if (el.type === 'text') {
        node.style.fontSize = fillPage ? ptToCqh(el.fontSize || 10, labelH) : ((el.fontSize || 10) + 'pt');
        node.style.fontWeight = el.fontWeight || '400';
        node.style.textAlign = el.textAlign || 'left';
        node.style.color = el.color || '#000';
        node.style.whiteSpace = 'pre-wrap';
        node.style.wordBreak = 'break-word';
        node.style.lineHeight = '1.25';
        node.textContent = el.content || '';
      } else if (el.type === 'line') {
        const line = document.createElement('div');
        line.style.position = 'absolute';
        line.style.left = '0';
        line.style.right = '0';
        line.style.top = '50%';
        const sw = el.strokeWidth || 0.3;
        line.style.borderTop = fillPage
          ? `${mmToCqh(sw, labelH)} solid ${el.strokeColor || '#000'}`
          : `${sw}mm solid ${el.strokeColor || '#000'}`;
        node.appendChild(line);
      } else if (el.type === 'rect') {
        const rect = document.createElement('div');
        rect.style.width = '100%';
        rect.style.height = '100%';
        const rw = el.rectStrokeWidth || 0.3;
        rect.style.border = fillPage
          ? `${mmToCqh(rw, labelH)} solid ${el.rectStroke || '#000'}`
          : `${rw}mm solid ${el.rectStroke || '#000'}`;
        rect.style.background = el.rectTransparent ? 'transparent' : (el.rectFill || '#fff');
        node.appendChild(rect);
      } else if (el.type === 'image') {
        if (el.imageData) {
          const img = document.createElement('img');
          img.src = el.imageData;
          img.style.width = '100%';
          img.style.height = '100%';
          img.style.objectFit = el.imageFit !== false ? 'contain' : 'fill';
          node.appendChild(img);
          tasks.push(waitImage(img));
        }
      } else if (el.type === 'table') {
        LabelTable.ensureGrid(el);
        const map = LabelTable.getVisibleCellMap(el);
        const table = document.createElement('table');
        const tbody = document.createElement('tbody');
        table.style.width = '100%';
        table.style.height = '100%';
        table.style.borderCollapse = 'collapse';
        table.style.tableLayout = 'fixed';
        const defaultPt = Number(el.tableFontSize) || 8;
        table.style.fontSize = fillPage ? ptToCqh(defaultPt, labelH) : (defaultPt + 'pt');
        const colgroup = document.createElement('colgroup');
        el.colWidths.forEach((w) => {
          const col = document.createElement('col');
          col.style.width = w + '%';
          colgroup.appendChild(col);
        });
        table.appendChild(colgroup);
        for (let r = 0; r < el.rows; r++) {
          const tr = document.createElement('tr');
          tr.style.height = el.rowHeights[r] + '%';
          for (let c = 0; c < el.cols; c++) {
            const vis = map[r][c];
            if (!vis.show) continue;
            const cell = el.cells[r][c];
            const td = document.createElement('td');
            if (vis.rowspan > 1) td.rowSpan = vis.rowspan;
            if (vis.colspan > 1) td.colSpan = vis.colspan;
            td.style.border = fillPage
              ? `${mmToCqh(0.2, labelH)} solid ${el.borderColor || '#334155'}`
              : `0.2mm solid ${el.borderColor || '#334155'}`;
            td.style.padding = fillPage
              ? `${mmToCqh(0.3, labelH)} ${mmToCqh(0.5, labelH)}`
              : '0.3mm 0.5mm';
            td.style.verticalAlign = cell.vAlign || 'middle';
            td.style.textAlign = cell.align || 'left';
            td.style.fontWeight = cell.fontWeight || '400';
            td.style.fontStyle = cell.fontStyle || 'normal';
            td.style.color = cell.color || '#000';
            td.style.overflow = 'hidden';
            td.style.overflowWrap = 'anywhere';
            td.style.wordBreak = 'break-word';
            td.style.whiteSpace = 'pre-wrap';
            td.style.lineHeight = '1.15';
            td.style.maxWidth = '0';
            const pt = cell.fontSize != null ? Number(cell.fontSize) : defaultPt;
            td.style.fontSize = fillPage ? ptToCqh(pt, labelH) : (pt + 'pt');
            td.textContent = LabelTable.evaluateCellText(cell, snapshot.order || {});
            tr.appendChild(td);
          }
          tbody.appendChild(tr);
        }
        table.appendChild(tbody);
        node.appendChild(table);
      } else if (el.type === 'barcode') {
        const svg = document.createElementNS('http://www.w3.org/2000/svg', 'svg');
        const value = el.content || '0';
        try {
          JsBarcode(svg, value, {
            format: el.barcodeFormat || 'CODE128',
            displayValue: !!el.barcodeShowText,
            margin: 0,
            fontSize: 10,
            width: 1.4,
            height: 40,
          });
          svg.style.width = '100%';
          svg.style.height = '100%';
          node.appendChild(svg);
        } catch {
          node.textContent = value;
          node.style.fontSize = fillPage ? ptToCqh(8, labelH) : '8pt';
        }
      } else if (el.type === 'qrcode') {
        const value = el.content || ' ';
        const sizePx = Math.max(128, Math.round(Math.min(Number(el.w) || 20, Number(el.h) || 20) * MM * 4));
        const dataUrl = qrToDataURL(value, sizePx, el.qrLevel);
        if (dataUrl) {
          const img = document.createElement('img');
          img.src = dataUrl;
          img.alt = 'QR';
          img.style.width = '100%';
          img.style.height = '100%';
          img.style.objectFit = 'contain';
          img.style.display = 'block';
          node.appendChild(img);
          tasks.push(waitImage(img));
        } else {
          node.textContent = value;
          node.style.fontSize = fillPage ? ptToCqh(7, labelH) : '7pt';
        }
      }

      host.appendChild(node);
    });

    return { root, ready: Promise.all(tasks) };
  }

  function injectPrintStyle(cssText) {
    let style = document.getElementById('print-page-style');
    if (!style) {
      style = document.createElement('style');
      style.id = 'print-page-style';
      document.head.appendChild(style);
    }
    style.textContent = cssText;
    return style;
  }

  async function printLabels(snapshots, settings) {
    const root = document.getElementById('print-root');
    root.innerHTML = '';
    const mode = settings.mode || 'label';
    const a4cols = Number(settings.a4cols) || 2;
    const readyList = [];

    root.classList.toggle('print-mode-label', mode === 'label');
    root.classList.toggle('print-mode-a4', mode === 'a4');

    if (mode === 'label') {
      const w = snapshots[0] ? Number(snapshots[0].width) : 60;
      const h = snapshots[0] ? Number(snapshots[0].height) : 40;
      // Exact page size + zero margins. Content fills the page box (see fillPage).
      injectPrintStyle(`
        @page { size: ${w}mm ${h}mm; margin: 0; }
        @media print {
          html, body {
            width: ${w}mm !important;
            height: ${h}mm !important;
            margin: 0 !important;
            padding: 0 !important;
          }
        }
      `);
      snapshots.forEach((snap) => {
        const { root: label, ready } = createLabelDOM(snap, { fillPage: true });
        // Also pin design size as fallback when % page height fails in some engines
        label.style.setProperty('--label-w', snap.width + 'mm');
        label.style.setProperty('--label-h', snap.height + 'mm');
        root.appendChild(label);
        readyList.push(ready);
      });
    } else {
      injectPrintStyle(`@page { size: A4; margin: 0; }`);
      let sheet = null;
      snapshots.forEach((snap, i) => {
        if (i % (a4cols * 4) === 0 || !sheet) {
          sheet = document.createElement('div');
          sheet.className = 'print-sheet';
          sheet.style.gridTemplateColumns = `repeat(${a4cols}, ${snap.width}mm)`;
          root.appendChild(sheet);
        }
        const { root: label, ready } = createLabelDOM(snap, { fillPage: false });
        sheet.appendChild(label);
        readyList.push(ready);
      });
    }

    await Promise.all(readyList);
    const imgs = Array.from(root.querySelectorAll('img'));
    await Promise.all(imgs.map((img) => (img.decode ? img.decode().catch(() => {}) : waitImage(img))));
    await new Promise((r) => requestAnimationFrame(() => requestAnimationFrame(r)));

    const cleanup = () => {
      document.body.classList.remove('is-printing');
    };
    document.body.classList.add('is-printing');
    window.addEventListener('afterprint', cleanup, { once: true });
    // Fallback if afterprint is skipped
    setTimeout(cleanup, 60_000);

    window.print();
  }

  /**
   * Rasterize one label (with QR/barcode as drawn) to PNG dataURL.
   * Positions/sizes follow the designer's mm layout.
   */
  async function renderLabelToDataURL(snapshot, options) {
    options = options || {};
    const dpi = Number(options.dpi) || 203; // common label printer density
    const scale = dpi / 96;

    const host = document.createElement('div');
    host.style.cssText = 'position:fixed;left:-12000px;top:0;z-index:-1;background:#fff;';
    document.body.appendChild(host);

    try {
      const { root, ready } = createLabelDOM(snapshot, { fillPage: false });
      root.style.boxShadow = 'none';
      root.style.border = 'none';
      host.appendChild(root);
      await ready;
      const imgs = Array.from(root.querySelectorAll('img'));
      await Promise.all(imgs.map((img) => (img.decode ? img.decode().catch(() => {}) : waitImage(img))));
      await new Promise((r) => requestAnimationFrame(() => requestAnimationFrame(r)));

      if (typeof html2canvas !== 'function') {
        throw new Error('html2canvas 未加载');
      }

      const canvas = await html2canvas(root, {
        backgroundColor: '#ffffff',
        scale,
        useCORS: true,
        allowTaint: true,
        logging: false,
        width: root.offsetWidth || Math.round(snapshot.width * MM),
        height: root.offsetHeight || Math.round(snapshot.height * MM),
      });
      return {
        dataUrl: canvas.toDataURL('image/png'),
        widthPx: canvas.width,
        heightPx: canvas.height,
        widthMm: snapshot.width,
        heightMm: snapshot.height,
      };
    } finally {
      host.remove();
    }
  }

  global.LabelPrint = {
    createLabelDOM,
    printLabels,
    renderLabelToDataURL,
  };
})(typeof window !== 'undefined' ? window : globalThis);
