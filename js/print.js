(function (global) {
  'use strict';

  const MM = 3.7795275591;

  function createLabelDOM(snapshot, options) {
    options = options || {};
    const scale = options.scale || 1; // mm to CSS mm via width/height in mm
    const root = document.createElement('div');
    root.className = 'print-label';
    root.style.width = snapshot.width + 'mm';
    root.style.height = snapshot.height + 'mm';
    root.style.position = 'relative';
    root.style.overflow = 'hidden';
    root.style.background = '#fff';
    root.style.color = '#000';
    root.style.boxSizing = 'border-box';

    const tasks = [];

    (snapshot.elements || []).forEach((el) => {
      const node = document.createElement('div');
      node.style.position = 'absolute';
      node.style.left = el.x + 'mm';
      node.style.top = el.y + 'mm';
      node.style.width = el.w + 'mm';
      node.style.height = el.h + 'mm';
      node.style.boxSizing = 'border-box';
      node.style.overflow = 'hidden';

      if (el.type === 'text') {
        node.style.fontSize = (el.fontSize || 10) + 'pt';
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
        line.style.borderTop = `${el.strokeWidth || 0.3}mm solid ${el.strokeColor || '#000'}`;
        node.appendChild(line);
      } else if (el.type === 'rect') {
        const rect = document.createElement('div');
        rect.style.width = '100%';
        rect.style.height = '100%';
        rect.style.border = `${el.rectStrokeWidth || 0.3}mm solid ${el.rectStroke || '#000'}`;
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
        }
      } else if (el.type === 'table') {
        LabelTable.ensureGrid(el);
        const map = LabelTable.getVisibleCellMap(el);
        const table = document.createElement('table');
        table.style.width = '100%';
        table.style.height = '100%';
        table.style.borderCollapse = 'collapse';
        table.style.tableLayout = 'fixed';
        const defaultPt = Number(el.tableFontSize) || 8;
        table.style.fontSize = defaultPt + 'pt';
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
            td.style.border = `0.2mm solid ${el.borderColor || '#334155'}`;
            td.style.padding = '0.3mm 0.5mm';
            td.style.verticalAlign = cell.vAlign || 'middle';
            td.style.textAlign = cell.align || 'left';
            td.style.fontWeight = cell.fontWeight || '400';
            td.style.fontStyle = cell.fontStyle || 'normal';
            td.style.color = cell.color || '#000';
            const pt = cell.fontSize != null ? Number(cell.fontSize) : defaultPt;
            td.style.fontSize = pt + 'pt';
            td.textContent = LabelTable.evaluateCellText(cell, snapshot.order || {});
            tr.appendChild(td);
          }
          table.appendChild(tr);
        }
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
          node.style.fontSize = '8pt';
        }
      } else if (el.type === 'qrcode') {
        const value = el.content || ' ';
        if (typeof QRCode === 'undefined') {
          node.textContent = value;
          node.style.fontSize = '7pt';
        } else {
          const levelMap = { L: QRCode.CorrectLevel.L, M: QRCode.CorrectLevel.M, Q: QRCode.CorrectLevel.Q, H: QRCode.CorrectLevel.H };
          const holder = document.createElement('div');
          holder.style.width = '100%';
          holder.style.height = '100%';
          try {
            // eslint-disable-next-line no-new
            new QRCode(holder, {
              text: String(value),
              width: 256,
              height: 256,
              colorDark: '#000000',
              colorLight: '#ffffff',
              correctLevel: levelMap[el.qrLevel] || QRCode.CorrectLevel.M,
            });
            const media = holder.querySelector('canvas, img');
            if (media) {
              media.style.width = '100%';
              media.style.height = '100%';
              media.style.objectFit = 'contain';
            }
            node.appendChild(holder);
          } catch {
            node.textContent = value;
            node.style.fontSize = '7pt';
          }
        }
      }

      root.appendChild(node);
    });

    return { root, ready: Promise.all(tasks) };
  }

  async function printLabels(snapshots, settings) {
    const root = document.getElementById('print-root');
    root.innerHTML = '';
    const mode = settings.mode || 'label';
    const a4cols = Number(settings.a4cols) || 2;

    // inject page style
    let style = document.getElementById('print-page-style');
    if (!style) {
      style = document.createElement('style');
      style.id = 'print-page-style';
      document.head.appendChild(style);
    }

    const readyList = [];

    if (mode === 'label') {
      const w = snapshots[0] ? snapshots[0].width : 60;
      const h = snapshots[0] ? snapshots[0].height : 40;
      style.textContent = `@page { size: ${w}mm ${h}mm; margin: 0; }`;
      snapshots.forEach((snap) => {
        const { root: label, ready } = createLabelDOM(snap);
        root.appendChild(label);
        readyList.push(ready);
      });
    } else {
      style.textContent = `@page { size: A4; margin: 0; }`;
      let sheet = null;
      snapshots.forEach((snap, i) => {
        if (i % (a4cols * 4) === 0 || !sheet) {
          sheet = document.createElement('div');
          sheet.className = 'print-sheet';
          sheet.style.gridTemplateColumns = `repeat(${a4cols}, ${snap.width}mm)`;
          root.appendChild(sheet);
        }
        const { root: label, ready } = createLabelDOM(snap);
        sheet.appendChild(label);
        readyList.push(ready);
      });
    }

    await Promise.all(readyList);
    // allow layout
    await new Promise((r) => requestAnimationFrame(() => requestAnimationFrame(r)));
    window.print();
  }

  global.LabelPrint = {
    createLabelDOM,
    printLabels,
  };
})(typeof window !== 'undefined' ? window : globalThis);
