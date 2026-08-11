(function (global) {
  'use strict';

  const MM_TO_PX = 3.7795275591;

  function uid() {
    return 'el_' + Math.random().toString(36).slice(2, 10);
  }

  function defaultsFor(type) {
    const base = {
      id: uid(),
      type,
      name: '',
      x: 4,
      y: 4,
      w: 30,
      h: 8,
      bindMode: 'static',
      staticValue: '',
      column: '',
      prefix: '',
      suffix: '',
      joinColumns: [],
      joinSep: '-',
      joinSkipEmpty: true,
      formula: '',
    };
    switch (type) {
      case 'text':
        return {
          ...base,
          name: '文本',
          staticValue: '文本内容',
          fontSize: 10,
          fontWeight: '400',
          textAlign: 'left',
          color: '#0f172a',
          h: 6,
          w: 40,
        };
      case 'barcode':
        return {
          ...base,
          name: '条码',
          staticValue: '1234567890',
          barcodeFormat: 'CODE128',
          barcodeShowText: true,
          w: 45,
          h: 14,
        };
      case 'qrcode':
        return {
          ...base,
          name: '二维码',
          staticValue: 'https://example.com',
          qrLevel: 'M',
          w: 18,
          h: 18,
        };
      case 'table':
        return {
          ...base,
          name: '表格',
          rows: 3,
          cols: 2,
          tableCells: '字段|值\n品名|{{品名}}\n数量|{{数量}}',
          borderColor: '#334155',
          tableFontSize: 8,
          colAligns: 'left|left',
          colWidths: '',
          w: 50,
          h: 22,
          bindMode: 'static',
        };
      case 'line':
        return {
          ...base,
          name: '线条',
          strokeWidth: 0.3,
          strokeColor: '#0f172a',
          w: 50,
          h: 2,
        };
      case 'rect':
        return {
          ...base,
          name: '矩形',
          rectStroke: '#0f172a',
          rectStrokeWidth: 0.3,
          rectFill: '#ffffff',
          rectTransparent: true,
          w: 40,
          h: 20,
        };
      case 'image':
        return {
          ...base,
          name: '图片',
          imageData: '',
          imageFit: true,
          w: 20,
          h: 20,
        };
      default:
        return base;
    }
  }

  function Designer(options) {
    this.canvas = options.canvas;
    this.stage = options.stage;
    this.onChange = options.onChange || function () {};
    this.onSelect = options.onSelect || function () {};
    this.width = 60;
    this.height = 40;
    this.zoom = 1.2;
    this.elements = [];
    this.selectedId = null;
    this.orderRow = null;
    this.columns = [];
    this._drag = null;
    this._bindEvents();
    this.resizeCanvas();
  }

  Designer.prototype._bindEvents = function () {
    const self = this;
    this.canvas.addEventListener('pointerdown', (e) => {
      const elNode = e.target.closest('.el');
      if (!elNode) {
        self.select(null);
        return;
      }
      const id = elNode.dataset.id;
      self.select(id);
      const isHandle = e.target.classList.contains('handle');
      const el = self.getSelected();
      if (!el) return;
      const rect = self.canvas.getBoundingClientRect();
      const scale = self._scale();
      self._drag = {
        mode: isHandle ? 'resize' : 'move',
        id,
        startX: e.clientX,
        startY: e.clientY,
        origX: el.x,
        origY: el.y,
        origW: el.w,
        origH: el.h,
        scale,
      };
      elNode.setPointerCapture(e.pointerId);
      e.preventDefault();
    });

    this.canvas.addEventListener('pointermove', (e) => {
      if (!self._drag) return;
      const d = self._drag;
      const el = self.elements.find((x) => x.id === d.id);
      if (!el) return;
      const dx = (e.clientX - d.startX) / d.scale;
      const dy = (e.clientY - d.startY) / d.scale;
      if (d.mode === 'move') {
        el.x = Math.round((d.origX + dx) * 10) / 10;
        el.y = Math.round((d.origY + dy) * 10) / 10;
      } else {
        el.w = Math.max(2, Math.round((d.origW + dx) * 10) / 10);
        el.h = Math.max(2, Math.round((d.origH + dy) * 10) / 10);
      }
      self.render();
      self.onChange();
      self.onSelect(el);
    });

    const endDrag = () => { self._drag = null; };
    this.canvas.addEventListener('pointerup', endDrag);
    this.canvas.addEventListener('pointercancel', endDrag);

    this.canvas.addEventListener('keydown', (e) => {
      if (!self.selectedId) return;
      if (e.key === 'Delete' || e.key === 'Backspace') {
        if (e.target.tagName === 'INPUT' || e.target.tagName === 'TEXTAREA' || e.target.tagName === 'SELECT') return;
        e.preventDefault();
        self.removeSelected();
      }
      if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === 'd') {
        e.preventDefault();
        self.duplicateSelected();
      }
      const step = e.shiftKey ? 1 : 0.5;
      const el = self.getSelected();
      if (!el) return;
      let moved = false;
      if (e.key === 'ArrowLeft') { el.x -= step; moved = true; }
      if (e.key === 'ArrowRight') { el.x += step; moved = true; }
      if (e.key === 'ArrowUp') { el.y -= step; moved = true; }
      if (e.key === 'ArrowDown') { el.y += step; moved = true; }
      if (moved) {
        e.preventDefault();
        self.render();
        self.onChange();
        self.onSelect(el);
      }
    });
  };

  Designer.prototype._scale = function () {
    return MM_TO_PX * this.zoom;
  };

  Designer.prototype.setSize = function (w, h) {
    this.width = Number(w) || 60;
    this.height = Number(h) || 40;
    this.resizeCanvas();
    this.render();
    this.onChange();
  };

  Designer.prototype.setZoom = function (z) {
    this.zoom = Number(z) || 1;
    this.resizeCanvas();
    this.render();
  };

  Designer.prototype.resizeCanvas = function () {
    const s = this._scale();
    this.canvas.style.width = this.width * s + 'px';
    this.canvas.style.height = this.height * s + 'px';
  };

  Designer.prototype.setOrderContext = function (row, columns) {
    this.orderRow = row || null;
    this.columns = columns || [];
    this.render();
  };

  Designer.prototype.addElement = function (type) {
    const el = defaultsFor(type);
    if (this.columns.length) {
      if (type === 'text' || type === 'barcode' || type === 'qrcode') {
        el.column = this.columns[0];
      }
    }
    // cascade position
    el.x = 4 + (this.elements.length % 5) * 2;
    el.y = 4 + (this.elements.length % 5) * 2;
    this.elements.push(el);
    this.select(el.id);
    this.render();
    this.onChange();
    return el;
  };

  Designer.prototype.getSelected = function () {
    return this.elements.find((e) => e.id === this.selectedId) || null;
  };

  Designer.prototype.select = function (id) {
    this.selectedId = id;
    this.render();
    this.onSelect(this.getSelected());
  };

  Designer.prototype.updateSelected = function (patch) {
    const el = this.getSelected();
    if (!el) return;
    Object.assign(el, patch);
    this.render();
    this.onChange();
    this.onSelect(el);
  };

  Designer.prototype.removeSelected = function () {
    if (!this.selectedId) return;
    this.elements = this.elements.filter((e) => e.id !== this.selectedId);
    this.selectedId = null;
    this.render();
    this.onChange();
    this.onSelect(null);
  };

  Designer.prototype.duplicateSelected = function () {
    const el = this.getSelected();
    if (!el) return;
    const copy = JSON.parse(JSON.stringify(el));
    copy.id = uid();
    copy.name = (el.name || el.type) + ' 副本';
    copy.x += 2;
    copy.y += 2;
    this.elements.push(copy);
    this.select(copy.id);
    this.onChange();
  };

  Designer.prototype.bringFront = function () {
    const el = this.getSelected();
    if (!el) return;
    this.elements = this.elements.filter((e) => e.id !== el.id).concat([el]);
    this.render();
    this.onChange();
  };

  Designer.prototype.sendBack = function () {
    const el = this.getSelected();
    if (!el) return;
    this.elements = [el].concat(this.elements.filter((e) => e.id !== el.id));
    this.render();
    this.onChange();
  };

  Designer.prototype.getBinding = function (el) {
    return {
      mode: el.bindMode || 'static',
      staticValue: el.staticValue,
      column: el.column,
      prefix: el.prefix,
      suffix: el.suffix,
      joinColumns: el.joinColumns || [],
      joinSep: el.joinSep,
      joinSkipEmpty: el.joinSkipEmpty !== false,
      formula: el.formula,
    };
  };

  Designer.prototype.resolveContent = function (el, row) {
    if (el.type === 'line' || el.type === 'rect' || el.type === 'image') {
      return el.staticValue || '';
    }
    if (el.type === 'table') return el.tableCells || '';
    return LabelFormula.resolveBinding(this.getBinding(el), row || this.orderRow || {}, el.staticValue);
  };

  Designer.prototype.render = function () {
    const s = this._scale();
    const row = this.orderRow || {};
    this.canvas.innerHTML = '';
    this.elements.forEach((el) => {
      const node = document.createElement('div');
      node.className = 'el el-' + el.type + (el.id === this.selectedId ? ' selected' : '');
      node.dataset.id = el.id;
      node.style.left = el.x * s + 'px';
      node.style.top = el.y * s + 'px';
      node.style.width = el.w * s + 'px';
      node.style.height = el.h * s + 'px';

      const handle = document.createElement('div');
      handle.className = 'handle';
      node.appendChild(handle);

      if (el.type === 'text') this._renderText(node, el, row, s);
      else if (el.type === 'barcode') this._renderBarcode(node, el, row);
      else if (el.type === 'qrcode') this._renderQr(node, el, row);
      else if (el.type === 'table') this._renderTable(node, el, row, s);
      else if (el.type === 'line') this._renderLine(node, el, s);
      else if (el.type === 'rect') this._renderRect(node, el, s);
      else if (el.type === 'image') this._renderImage(node, el);

      this.canvas.appendChild(node);
    });
  };

  Designer.prototype._renderText = function (node, el, row, s) {
    const content = this.resolveContent(el, row);
    const span = document.createElement('div');
    span.className = 'el-text';
    span.style.width = '100%';
    span.style.height = '100%';
    span.style.fontSize = (el.fontSize || 10) * (s / MM_TO_PX) * (96 / 72) / this.zoom * this.zoom + 'px';
    // fontSize pt -> px: pt * (96/72) * zoom relative to canvas scale
    const pt = Number(el.fontSize) || 10;
    span.style.fontSize = (pt * (96 / 72) * this.zoom) + 'px';
    span.style.fontWeight = el.fontWeight || '400';
    span.style.textAlign = el.textAlign || 'left';
    span.style.color = el.color || '#0f172a';
    span.textContent = content;
    node.appendChild(span);
  };

  Designer.prototype._renderBarcode = function (node, el, row) {
    const content = this.resolveContent(el, row) || '0';
    if (typeof JsBarcode === 'undefined') {
      const fallback = document.createElement('div');
      fallback.style.cssText = 'font-size:10px;color:#64748b;padding:4px;';
      fallback.textContent = content;
      node.appendChild(fallback);
      return;
    }
    const svg = document.createElementNS('http://www.w3.org/2000/svg', 'svg');
    const barHeight = Math.max(20, Math.floor(el.h * this._scale() * (el.barcodeShowText === false ? 0.9 : 0.7)));
    try {
      JsBarcode(svg, content, {
        format: el.barcodeFormat || 'CODE128',
        displayValue: el.barcodeShowText !== false,
        margin: 0,
        fontSize: 12,
        width: 1.5,
        height: barHeight,
      });
    } catch (err) {
      const fallback = document.createElement('div');
      fallback.style.cssText = 'font-size:10px;color:#b91c1c;padding:4px;';
      fallback.textContent = '条码错误: ' + content;
      node.appendChild(fallback);
      return;
    }
    svg.style.width = '100%';
    svg.style.height = '100%';
    node.appendChild(svg);
  };

  Designer.prototype._renderQr = function (node, el, row) {
    const content = this.resolveContent(el, row) || ' ';
    if (typeof QRCode === 'undefined') {
      const fallback = document.createElement('div');
      fallback.style.cssText = 'font-size:10px;color:#64748b;padding:4px;border:1px dashed #cbd5e1;width:100%;height:100%;display:flex;align-items:center;justify-content:center;text-align:center;';
      fallback.textContent = 'QR';
      node.appendChild(fallback);
      return;
    }
    const size = Math.max(32, Math.floor(Math.min(
      (el.w * this._scale()),
      (el.h * this._scale())
    )));
    const levelMap = { L: QRCode.CorrectLevel.L, M: QRCode.CorrectLevel.M, Q: QRCode.CorrectLevel.Q, H: QRCode.CorrectLevel.H };
    const holder = document.createElement('div');
    holder.style.width = '100%';
    holder.style.height = '100%';
    holder.style.display = 'flex';
    holder.style.alignItems = 'center';
    holder.style.justifyContent = 'center';
    try {
      // eslint-disable-next-line no-new
      new QRCode(holder, {
        text: String(content),
        width: size,
        height: size,
        colorDark: '#000000',
        colorLight: '#ffffff',
        correctLevel: levelMap[el.qrLevel] || QRCode.CorrectLevel.M,
      });
      const media = holder.querySelector('canvas, img');
      if (media) {
        media.style.width = '100%';
        media.style.height = '100%';
        media.style.objectFit = 'contain';
        media.style.maxWidth = '100%';
        media.style.maxHeight = '100%';
      }
      node.appendChild(holder);
    } catch (err) {
      const fallback = document.createElement('div');
      fallback.style.cssText = 'font-size:10px;color:#b91c1c;padding:4px;';
      fallback.textContent = '二维码错误';
      node.appendChild(fallback);
    }
  };

  Designer.prototype._renderTable = function (node, el, row, s) {
    const rows = Math.max(1, Number(el.rows) || 1);
    const cols = Math.max(1, Number(el.cols) || 1);
    const lines = String(el.tableCells || '').split(/\n/);
    const aligns = String(el.colAligns || '').split('|').map((x) => x.trim());
    const widths = String(el.colWidths || '').split('|').map((x) => x.trim());
    const table = document.createElement('table');
    const pt = Number(el.tableFontSize) || 8;
    table.style.fontSize = (pt * (96 / 72) * this.zoom) + 'px';
    if (widths.some(Boolean)) {
      const colgroup = document.createElement('colgroup');
      for (let c = 0; c < cols; c++) {
        const col = document.createElement('col');
        if (widths[c]) col.style.width = widths[c];
        colgroup.appendChild(col);
      }
      table.appendChild(colgroup);
    }
    for (let r = 0; r < rows; r++) {
      const tr = document.createElement('tr');
      const cells = (lines[r] || '').split('|');
      for (let c = 0; c < cols; c++) {
        const td = document.createElement('td');
        td.style.borderColor = el.borderColor || '#334155';
        td.style.textAlign = aligns[c] || 'left';
        const raw = cells[c] != null ? cells[c] : '';
        const parsed = parseStyledCell(raw, row);
        td.textContent = parsed.text;
        if (parsed.bold) td.style.fontWeight = '700';
        tr.appendChild(td);
      }
      table.appendChild(tr);
    }
    node.appendChild(table);
  };

  function parseStyledCell(raw, row) {
    const src = String(raw == null ? '' : raw);
    const m = src.match(/^\*\*([\s\S]*)\*\*$/);
    const expr = m ? m[1] : src;
    return {
      text: LabelFormula.evaluate(expr, row || {}),
      bold: !!m,
    };
  }

  Designer.prototype._renderLine = function (node, el, s) {
    const line = document.createElement('div');
    line.className = 'line-visual';
    line.style.borderTopWidth = (el.strokeWidth || 0.3) * s + 'px';
    line.style.borderTopColor = el.strokeColor || '#0f172a';
    node.appendChild(line);
  };

  Designer.prototype._renderRect = function (node, el, s) {
    const rect = document.createElement('div');
    rect.className = 'rect-visual';
    rect.style.border = `${(el.rectStrokeWidth || 0.3) * s}px solid ${el.rectStroke || '#0f172a'}`;
    rect.style.background = el.rectTransparent ? 'transparent' : (el.rectFill || '#fff');
    node.appendChild(rect);
  };

  Designer.prototype._renderImage = function (node, el) {
    if (!el.imageData) {
      const ph = document.createElement('div');
      ph.style.cssText = 'width:100%;height:100%;display:flex;align-items:center;justify-content:center;font-size:11px;color:#94a3b8;border:1px dashed #cbd5e1;';
      ph.textContent = '图片';
      node.appendChild(ph);
      return;
    }
    const img = document.createElement('img');
    img.src = el.imageData;
    img.alt = el.name || 'image';
    img.style.width = '100%';
    img.style.height = '100%';
    img.style.objectFit = el.imageFit !== false ? 'contain' : 'fill';
    node.appendChild(img);
  };

  Designer.prototype.toJSON = function () {
    return {
      width: this.width,
      height: this.height,
      elements: JSON.parse(JSON.stringify(this.elements)),
    };
  };

  Designer.prototype.loadJSON = function (data) {
    this.width = data.width || 60;
    this.height = data.height || 40;
    this.elements = Array.isArray(data.elements) ? data.elements : [];
    this.selectedId = null;
    this.resizeCanvas();
    this.render();
    this.onSelect(null);
    this.onChange();
  };

  Designer.prototype.clear = function () {
    this.elements = [];
    this.selectedId = null;
    this.render();
    this.onSelect(null);
    this.onChange();
  };

  /** Build resolved snapshot for print/export for a given order row. */
  Designer.prototype.snapshotForRow = function (row) {
    const elements = this.elements.map((el) => {
      let content = '';
      if (el.type === 'table') {
        const rows = Math.max(1, Number(el.rows) || 1);
        const cols = Math.max(1, Number(el.cols) || 1);
        const lines = String(el.tableCells || '').split(/\n/);
        const grid = [];
        for (let r = 0; r < rows; r++) {
          const cells = (lines[r] || '').split('|');
          const rowCells = [];
          for (let c = 0; c < cols; c++) {
            rowCells.push(parseStyledCell(cells[c] != null ? cells[c] : '', row || {}).text);
          }
          grid.push(rowCells);
        }
        content = grid.map((r) => r.join(' | ')).join('\n');
      } else if (el.type !== 'line' && el.type !== 'rect') {
        content = this.resolveContent(el, row || {});
      }
      return {
        ...el,
        content,
      };
    });
    return {
      width: this.width,
      height: this.height,
      elements,
      order: row || {},
    };
  };

  global.LabelDesigner = Designer;
  global.LabelDesignerDefaults = defaultsFor;
})(typeof window !== 'undefined' ? window : globalThis);
