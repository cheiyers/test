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
          colWidths: [50, 50],
          rowHeights: [33.3, 33.3, 33.4],
          merges: [],
          cells: null,
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
    this.selectedCell = null; // { r, c }
    this.cellRange = null; // { r1, c1, r2, c2 }
    this.orderRow = null;
    this.columns = [];
    this._drag = null;
    this._editingCell = null;
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
      const el = self.elements.find((x) => x.id === id);
      if (!el) return;

      // Table cell / resizer interactions
      if (el.type === 'table') {
        const colResizer = e.target.closest('.tbl-col-resizer');
        const rowResizer = e.target.closest('.tbl-row-resizer');
        const cellNode = e.target.closest('.tbl-cell');
        if (colResizer || rowResizer || cellNode) {
          LabelTable.ensureGrid(el);
          const firstSelect = self.selectedId !== id;
          self.selectedId = id;
          if (firstSelect) {
            self.canvas.querySelectorAll('.el').forEach((n) => {
              n.classList.toggle('selected', n.dataset.id === id);
            });
            self._ensureTableChrome(el);
          }

          if (colResizer) {
            const ci = Number(colResizer.dataset.col);
            self._drag = {
              mode: 'col-resize',
              id,
              col: ci,
              startX: e.clientX,
              widths: el.colWidths.slice(),
              scale: self._scale(),
            };
            self.onSelect(el);
            e.preventDefault();
            e.stopPropagation();
            return;
          }
          if (rowResizer) {
            const ri = Number(rowResizer.dataset.row);
            self._drag = {
              mode: 'row-resize',
              id,
              row: ri,
              startY: e.clientY,
              heights: el.rowHeights.slice(),
              scale: self._scale(),
            };
            self.onSelect(el);
            e.preventDefault();
            e.stopPropagation();
            return;
          }
          if (cellNode) {
            const r = Number(cellNode.dataset.r);
            const c = Number(cellNode.dataset.c);
            const origin = LabelTable.findMergeAt(el, r, c);
            const rr = origin ? origin.r : r;
            const cc = origin ? origin.c : c;
            if (e.shiftKey && self.selectedCell) {
              self.cellRange = { r1: self.selectedCell.r, c1: self.selectedCell.c, r2: rr, c2: cc };
            } else {
              self.selectedCell = { r: rr, c: cc };
              self.cellRange = { r1: rr, c1: cc, r2: rr, c2: cc };
            }
            self._drag = {
              mode: 'cell-select',
              id,
              startR: self.cellRange.r1,
              startC: self.cellRange.c1,
            };
            self._paintTableSelection(el);
            self.onSelect(el);
            e.preventDefault();
            e.stopPropagation();
            return;
          }
        }
      }

      self.select(id);
      const isHandle = e.target.classList.contains('handle');
      const selected = self.getSelected();
      if (!selected) return;
      self._drag = {
        mode: isHandle ? 'resize' : 'move',
        id,
        startX: e.clientX,
        startY: e.clientY,
        origX: selected.x,
        origY: selected.y,
        origW: selected.w,
        origH: selected.h,
        scale: self._scale(),
      };
      e.preventDefault();
    });

    this.canvas.addEventListener('dblclick', (e) => {
      const cellNode = e.target.closest('.tbl-cell');
      if (!cellNode) return;
      const elNode = cellNode.closest('.el');
      if (!elNode) return;
      const el = self.elements.find((x) => x.id === elNode.dataset.id);
      if (!el || el.type !== 'table') return;
      const r = Number(cellNode.dataset.r);
      const c = Number(cellNode.dataset.c);
      self.startCellEdit(el, r, c, cellNode);
      e.preventDefault();
    });

    const onMove = (e) => {
      if (!self._drag) return;
      const d = self._drag;
      const el = self.elements.find((x) => x.id === d.id);
      if (!el) return;

      if (d.mode === 'cell-select') {
        const cellNode = document.elementFromPoint(e.clientX, e.clientY);
        const td = cellNode && cellNode.closest && cellNode.closest('.tbl-cell');
        if (td && td.closest('.el') && td.closest('.el').dataset.id === d.id) {
          const r = Number(td.dataset.r);
          const c = Number(td.dataset.c);
          const origin = LabelTable.findMergeAt(el, r, c);
          const rr = origin ? origin.r : r;
          const cc = origin ? origin.c : c;
          self.cellRange = { r1: d.startR, c1: d.startC, r2: rr, c2: cc };
          self.selectedCell = { r: d.startR, c: d.startC };
          self._paintTableSelection(el);
          self.onSelect(el);
        }
        return;
      }

      if (d.mode === 'col-resize') {
        const dxPct = ((e.clientX - d.startX) / (el.w * d.scale)) * 100;
        const widths = d.widths.slice();
        const i = d.col;
        if (i < 0 || i >= widths.length - 1) return;
        const pair = widths[i] + widths[i + 1];
        let left = Math.min(pair - 5, Math.max(5, widths[i] + dxPct));
        widths[i] = Math.round(left * 10) / 10;
        widths[i + 1] = Math.round((pair - left) * 10) / 10;
        el.colWidths = widths;
        LabelTable.syncLegacyStrings(el);
        self._applyTableMetrics(el);
        return;
      }

      if (d.mode === 'row-resize') {
        const dyPct = ((e.clientY - d.startY) / (el.h * d.scale)) * 100;
        const heights = d.heights.slice();
        const i = d.row;
        if (i < 0 || i >= heights.length - 1) return;
        const pair = heights[i] + heights[i + 1];
        let top = Math.min(pair - 5, Math.max(5, heights[i] + dyPct));
        heights[i] = Math.round(top * 10) / 10;
        heights[i + 1] = Math.round((pair - top) * 10) / 10;
        el.rowHeights = heights;
        self._applyTableMetrics(el);
        return;
      }

      const dx = (e.clientX - d.startX) / d.scale;
      const dy = (e.clientY - d.startY) / d.scale;
      if (d.mode === 'move') {
        el.x = Math.round((d.origX + dx) * 10) / 10;
        el.y = Math.round((d.origY + dy) * 10) / 10;
      } else if (d.mode === 'resize') {
        el.w = Math.max(2, Math.round((d.origW + dx) * 10) / 10);
        el.h = Math.max(2, Math.round((d.origH + dy) * 10) / 10);
      }
      self.render();
      self.onChange();
      self.onSelect(el);
    };

    const endDrag = () => {
      if (self._drag && (self._drag.mode === 'col-resize' || self._drag.mode === 'row-resize')) {
        self.onChange();
      }
      self._drag = null;
    };
    window.addEventListener('pointermove', onMove);
    window.addEventListener('pointerup', endDrag);
    window.addEventListener('pointercancel', endDrag);

    this.canvas.addEventListener('keydown', (e) => {
      if (e.target.classList && e.target.classList.contains('tbl-editor')) return;
      if (!self.selectedId) return;
      if (e.key === 'Delete' || e.key === 'Backspace') {
        if (e.target.tagName === 'INPUT' || e.target.tagName === 'TEXTAREA' || e.target.tagName === 'SELECT') return;
        // If a cell is selected, clear cell text instead of deleting element on Backspace
        const el = self.getSelected();
        if (el && el.type === 'table' && self.selectedCell && e.key === 'Backspace') {
          LabelTable.updateCell(el, self.selectedCell.r, self.selectedCell.c, { text: '' });
          self.render();
          self.onChange();
          self.onSelect(el);
          e.preventDefault();
          return;
        }
        e.preventDefault();
        self.removeSelected();
      }
      if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === 'd') {
        e.preventDefault();
        self.duplicateSelected();
      }
      if (e.key === 'Enter' && self.getSelected() && self.getSelected().type === 'table' && self.selectedCell) {
        const el = self.getSelected();
        const td = self.canvas.querySelector(`.el[data-id="${el.id}"] .tbl-cell[data-r="${self.selectedCell.r}"][data-c="${self.selectedCell.c}"]`);
        if (td) self.startCellEdit(el, self.selectedCell.r, self.selectedCell.c, td);
        e.preventDefault();
        return;
      }
      const step = e.shiftKey ? 1 : 0.5;
      const el = self.getSelected();
      if (!el) return;
      if (el.type === 'table' && self.selectedCell) return; // don't nudge whole table while editing cells
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
    if (type === 'table') LabelTable.ensureGrid(el);
    if (this.columns.length) {
      if (type === 'text' || type === 'barcode' || type === 'qrcode') {
        el.column = this.columns[0];
      }
    }
    // cascade position
    el.x = 4 + (this.elements.length % 5) * 2;
    el.y = 4 + (this.elements.length % 5) * 2;
    this.elements.push(el);
    this.selectedCell = null;
    this.cellRange = null;
    this.select(el.id);
    this.render();
    this.onChange();
    return el;
  };

  Designer.prototype.getSelected = function () {
    return this.elements.find((e) => e.id === this.selectedId) || null;
  };

  Designer.prototype.select = function (id, opts) {
    opts = opts || {};
    if (this.selectedId !== id) {
      if (!opts.keepCell) {
        this.selectedCell = null;
        this.cellRange = null;
      }
      this._finishCellEdit();
    }
    const prev = this.selectedId;
    this.selectedId = id;
    if (prev !== id) {
      this.render();
    } else if (id) {
      this.canvas.querySelectorAll('.el').forEach((n) => {
        n.classList.toggle('selected', n.dataset.id === id);
      });
    }
    this.onSelect(this.getSelected());
  };

  /** Add row/col resize handles without rebuilding the whole table DOM. */
  Designer.prototype._ensureTableChrome = function (el) {
    if (!el || el.type !== 'table') return;
    const root = this.canvas.querySelector(`.el[data-id="${el.id}"]`);
    if (!root) return;
    const wrap = root.querySelector('.tbl-wrap');
    if (!wrap) return;
    if (wrap.querySelector('.tbl-col-resizer') || wrap.querySelector('.tbl-row-resizer')) return;

    let acc = 0;
    for (let c = 0; c < el.cols - 1; c++) {
      acc += el.colWidths[c];
      const handle = document.createElement('div');
      handle.className = 'tbl-col-resizer';
      handle.dataset.col = String(c);
      handle.style.left = acc + '%';
      wrap.appendChild(handle);
    }
    acc = 0;
    for (let r = 0; r < el.rows - 1; r++) {
      acc += el.rowHeights[r];
      const handle = document.createElement('div');
      handle.className = 'tbl-row-resizer';
      handle.dataset.row = String(r);
      handle.style.top = acc + '%';
      wrap.appendChild(handle);
    }
  };

  Designer.prototype._applyTableMetrics = function (el) {
    const root = this.canvas.querySelector(`.el[data-id="${el.id}"]`);
    if (!root) return;
    const wrap = root.querySelector('.tbl-wrap');
    if (!wrap) return;
    const cols = wrap.querySelectorAll('colgroup col');
    cols.forEach((col, i) => {
      if (el.colWidths[i] != null) col.style.width = el.colWidths[i] + '%';
    });
    const rows = wrap.querySelectorAll('tr');
    rows.forEach((tr, i) => {
      if (el.rowHeights[i] != null) tr.style.height = el.rowHeights[i] + '%';
    });
    let acc = 0;
    wrap.querySelectorAll('.tbl-col-resizer').forEach((handle) => {
      const i = Number(handle.dataset.col);
      acc = el.colWidths.slice(0, i + 1).reduce((a, b) => a + b, 0);
      handle.style.left = acc + '%';
    });
    wrap.querySelectorAll('.tbl-row-resizer').forEach((handle) => {
      const i = Number(handle.dataset.row);
      acc = el.rowHeights.slice(0, i + 1).reduce((a, b) => a + b, 0);
      handle.style.top = acc + '%';
    });
  };

  Designer.prototype._paintTableSelection = function (el) {
    if (!el || el.type !== 'table') return;
    const root = this.canvas.querySelector(`.el[data-id="${el.id}"]`);
    if (!root) return;
    this._ensureTableChrome(el);
    const range = this.cellRange;
    const inRange = (r, c) => {
      if (!range) return false;
      const top = Math.min(range.r1, range.r2);
      const left = Math.min(range.c1, range.c2);
      const bottom = Math.max(range.r1, range.r2);
      const right = Math.max(range.c1, range.c2);
      return r >= top && r <= bottom && c >= left && c <= right;
    };
    root.querySelectorAll('.tbl-cell').forEach((td) => {
      const r = Number(td.dataset.r);
      const c = Number(td.dataset.c);
      td.classList.toggle('tbl-cell-active', !!(this.selectedCell && this.selectedCell.r === r && this.selectedCell.c === c));
      td.classList.toggle('tbl-cell-range', inRange(r, c));
    });
  };

  Designer.prototype.updateSelected = function (patch) {
    const el = this.getSelected();
    if (!el) return;
    if (el.type === 'table' && (patch.rows != null || patch.cols != null)) {
      LabelTable.resizeGrid(el, patch.rows != null ? patch.rows : el.rows, patch.cols != null ? patch.cols : el.cols);
      delete patch.rows;
      delete patch.cols;
    }
    Object.assign(el, patch);
    if (el.type === 'table') {
      if (patch.tableCells != null && patch.cells == null) {
        el.cells = null; // force rebuild from legacy string
      }
      LabelTable.ensureGrid(el);
    }
    this.render();
    this.onChange();
    this.onSelect(el);
  };

  Designer.prototype.startCellEdit = function (el, r, c, cellNode) {
    this._finishCellEdit();
    LabelTable.ensureGrid(el);
    const origin = LabelTable.findMergeAt(el, r, c);
    const rr = origin ? origin.r : r;
    const cc = origin ? origin.c : c;
    this.selectedCell = { r: rr, c: cc };
    this.cellRange = { r1: rr, c1: cc, r2: rr, c2: cc };
    const cell = LabelTable.getCell(el, rr, cc);
    const editor = document.createElement('textarea');
    editor.className = 'tbl-editor';
    editor.value = cell.text || '';
    editor.style.position = 'absolute';
    editor.style.left = '0';
    editor.style.top = '0';
    editor.style.width = '100%';
    editor.style.height = '100%';
    editor.style.border = 'none';
    editor.style.outline = '2px solid #1fb8a8';
    editor.style.resize = 'none';
    editor.style.padding = '2px 3px';
    editor.style.font = 'inherit';
    editor.style.fontSize = cellNode.style.fontSize || 'inherit';
    editor.style.fontWeight = cell.fontWeight || '400';
    editor.style.fontStyle = cell.fontStyle || 'normal';
    editor.style.color = cell.color || '#0f172a';
    editor.style.textAlign = cell.align || 'left';
    editor.style.background = '#fffef5';
    editor.style.zIndex = '5';
    cellNode.innerHTML = '';
    cellNode.appendChild(editor);
    this._editingCell = { elId: el.id, r: rr, c: cc, editor };
    editor.focus();
    editor.select();
    const commit = () => {
      if (!this._editingCell || this._editingCell.editor !== editor) return;
      LabelTable.updateCell(el, rr, cc, { text: editor.value });
      this._editingCell = null;
      this.render();
      this.onChange();
      this.onSelect(el);
    };
    editor.addEventListener('blur', commit);
    editor.addEventListener('keydown', (ev) => {
      if (ev.key === 'Escape') {
        this._editingCell = null;
        this.render();
        this.onSelect(el);
        ev.preventDefault();
      } else if (ev.key === 'Enter' && !ev.shiftKey) {
        editor.blur();
        ev.preventDefault();
      }
      ev.stopPropagation();
    });
  };

  Designer.prototype._finishCellEdit = function () {
    if (!this._editingCell) return;
    const { elId, r, c, editor } = this._editingCell;
    const el = this.elements.find((x) => x.id === elId);
    if (el && editor) {
      LabelTable.updateCell(el, r, c, { text: editor.value });
    }
    this._editingCell = null;
  };

  Designer.prototype.mergeSelectedCells = function () {
    const el = this.getSelected();
    if (!el || el.type !== 'table' || !this.cellRange) return false;
    const { r1, c1, r2, c2 } = this.cellRange;
    const ok = LabelTable.mergeRange(el, r1, c1, r2, c2);
    if (ok) {
      this.selectedCell = { r: Math.min(r1, r2), c: Math.min(c1, c2) };
      this.cellRange = { r1: this.selectedCell.r, c1: this.selectedCell.c, r2: this.selectedCell.r, c2: this.selectedCell.c };
      this.render();
      this.onChange();
      this.onSelect(el);
    }
    return ok;
  };

  Designer.prototype.unmergeSelectedCell = function () {
    const el = this.getSelected();
    if (!el || el.type !== 'table' || !this.selectedCell) return false;
    const ok = LabelTable.unmergeAt(el, this.selectedCell.r, this.selectedCell.c);
    if (ok) {
      this.render();
      this.onChange();
      this.onSelect(el);
    }
    return ok;
  };

  Designer.prototype.updateSelectedCell = function (patch) {
    const el = this.getSelected();
    if (!el || el.type !== 'table' || !this.selectedCell) return;
    LabelTable.updateCell(el, this.selectedCell.r, this.selectedCell.c, patch);
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
    LabelTable.ensureGrid(el);
    const map = LabelTable.getVisibleCellMap(el);
    const table = document.createElement('table');
    const wrap = document.createElement('div');
    wrap.className = 'tbl-wrap';
    wrap.style.width = '100%';
    wrap.style.height = '100%';
    wrap.style.position = 'relative';

    const defaultPt = Number(el.tableFontSize) || 8;
    table.style.fontSize = (defaultPt * (96 / 72) * this.zoom) + 'px';
    table.style.width = '100%';
    table.style.height = '100%';

    const colgroup = document.createElement('colgroup');
    el.colWidths.forEach((w) => {
      const col = document.createElement('col');
      col.style.width = w + '%';
      colgroup.appendChild(col);
    });
    table.appendChild(colgroup);

    const selected = el.id === this.selectedId;
    const range = selected ? this.cellRange : null;
    const inRange = (r, c) => {
      if (!range) return false;
      const top = Math.min(range.r1, range.r2);
      const left = Math.min(range.c1, range.c2);
      const bottom = Math.max(range.r1, range.r2);
      const right = Math.max(range.c1, range.c2);
      return r >= top && r <= bottom && c >= left && c <= right;
    };

    for (let r = 0; r < el.rows; r++) {
      const tr = document.createElement('tr');
      tr.style.height = el.rowHeights[r] + '%';
      for (let c = 0; c < el.cols; c++) {
        const vis = map[r][c];
        if (!vis.show) continue;
        const cell = el.cells[r][c];
        const td = document.createElement('td');
        td.className = 'tbl-cell';
        td.dataset.r = String(r);
        td.dataset.c = String(c);
        if (vis.rowspan > 1) td.rowSpan = vis.rowspan;
        if (vis.colspan > 1) td.colSpan = vis.colspan;
        td.style.borderColor = el.borderColor || '#334155';
        td.style.textAlign = cell.align || 'left';
        td.style.verticalAlign = cell.vAlign || 'middle';
        td.style.fontWeight = cell.fontWeight || '400';
        td.style.fontStyle = cell.fontStyle || 'normal';
        td.style.color = cell.color || '#0f172a';
        const pt = cell.fontSize != null ? Number(cell.fontSize) : defaultPt;
        td.style.fontSize = (pt * (96 / 72) * this.zoom) + 'px';
        td.textContent = LabelTable.evaluateCellText(cell, row);
        if (selected && this.selectedCell && this.selectedCell.r === r && this.selectedCell.c === c) {
          td.classList.add('tbl-cell-active');
        }
        if (selected && inRange(r, c)) td.classList.add('tbl-cell-range');
        tr.appendChild(td);
      }
      table.appendChild(tr);
    }
    wrap.appendChild(table);

    if (selected) {
      // column resizers
      let acc = 0;
      for (let c = 0; c < el.cols - 1; c++) {
        acc += el.colWidths[c];
        const handle = document.createElement('div');
        handle.className = 'tbl-col-resizer';
        handle.dataset.col = String(c);
        handle.style.left = acc + '%';
        wrap.appendChild(handle);
      }
      // row resizers
      acc = 0;
      for (let r = 0; r < el.rows - 1; r++) {
        acc += el.rowHeights[r];
        const handle = document.createElement('div');
        handle.className = 'tbl-row-resizer';
        handle.dataset.row = String(r);
        handle.style.top = acc + '%';
        wrap.appendChild(handle);
      }
    }

    node.appendChild(wrap);
  };

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
    this.elements.forEach((el) => {
      if (el.type === 'table') LabelTable.ensureGrid(el);
    });
    this.selectedId = null;
    this.selectedCell = null;
    this.cellRange = null;
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
        LabelTable.ensureGrid(el);
        const grid = [];
        for (let r = 0; r < el.rows; r++) {
          const rowCells = [];
          for (let c = 0; c < el.cols; c++) {
            rowCells.push(LabelTable.evaluateCellText(el.cells[r][c], row || {}));
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
