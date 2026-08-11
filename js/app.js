(function () {
  'use strict';

  const state = {
    templateId: null,
    templateName: '未命名模板',
    columns: [],
    orders: [],
    orderIndex: 0,
  };

  const $ = (sel) => document.querySelector(sel);
  const $$ = (sel) => Array.from(document.querySelectorAll(sel));

  const designer = new LabelDesigner({
    canvas: $('#label-canvas'),
    stage: $('#canvas-stage'),
    onChange: () => {
      persistSession();
      updateBindPreview();
    },
    onSelect: (el) => syncPropsForm(el),
  });

  function currentOrder() {
    if (!state.orders.length) return {};
    return state.orders[state.orderIndex] || {};
  }

  function refreshOrderUI() {
    const summary = $('#order-summary');
    const nav = $('#order-nav');
    const cols = $('#columns-list');
    cols.innerHTML = '';

    if (!state.orders.length) {
      summary.innerHTML = '<p class="muted">尚未导入订单。可直接设计模板并空白打印，或导入 CSV / Excel。</p>';
      nav.hidden = true;
      designer.setOrderContext({}, state.columns);
      fillColumnSelects();
      return;
    }

    summary.innerHTML = `<strong>${state.orders.length}</strong> 条订单 · <span class="muted">${state.columns.length} 列</span>`;
    nav.hidden = false;
    $('#order-index').textContent = `${state.orderIndex + 1} / ${state.orders.length}`;
    state.columns.forEach((c) => {
      const chip = document.createElement('span');
      chip.className = 'col-chip';
      chip.textContent = c;
      chip.title = '点击填入当前组件绑定';
      chip.addEventListener('click', () => {
        const el = designer.getSelected();
        if (!el) return;
        if (el.bindMode === 'join') {
          const set = new Set(el.joinColumns || []);
          if (set.has(c)) set.delete(c); else set.add(c);
          designer.updateSelected({ joinColumns: Array.from(set) });
        } else if (el.bindMode === 'formula') {
          designer.updateSelected({ formula: (el.formula || '') + `{{${c}}}` });
        } else if (el.type === 'table') {
          if (designer.selectedCell) {
            const cell = LabelTable.getCell(el, designer.selectedCell.r, designer.selectedCell.c);
            designer.updateSelectedCell({ text: (cell.text || '') + `{{${c}}}` });
          } else {
            designer.updateSelected({ tableCells: (el.tableCells || '') + `{{${c}}}` });
          }
        } else {
          designer.updateSelected({ bindMode: 'column', column: c });
        }
        syncPropsForm(designer.getSelected());
      });
      cols.appendChild(chip);
    });

    designer.setOrderContext(currentOrder(), state.columns);
    fillColumnSelects();
    updateBindPreview();
  }

  function fillColumnSelects() {
    const colSel = $('#props-form [name="column"]');
    const joinSel = $('#props-form [name="joinColumns"]');
    if (!colSel || !joinSel) return;
    const opts = state.columns.length ? state.columns : ['(无列)'];
    colSel.innerHTML = opts.map((c) => `<option value="${escapeAttr(c)}">${escapeHtml(c)}</option>`).join('');
    joinSel.innerHTML = state.columns.map((c) => `<option value="${escapeAttr(c)}">${escapeHtml(c)}</option>`).join('');
  }

  function escapeHtml(s) {
    return String(s).replace(/[&<>"']/g, (ch) => ({
      '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;',
    })[ch]);
  }
  function escapeAttr(s) { return escapeHtml(s); }

  function syncPropsForm(el) {
    const empty = $('#props-empty');
    const form = $('#props-form');
    if (!el) {
      empty.hidden = false;
      form.hidden = true;
      return;
    }
    empty.hidden = true;
    form.hidden = false;

    $$('.props-section').forEach((sec) => {
      const types = (sec.dataset.for || '').split(',').map((x) => x.trim());
      sec.hidden = !types.includes(el.type);
    });

    const set = (name, value) => {
      const input = form.elements[name];
      if (!input) return;
      if (input.type === 'checkbox') input.checked = !!value;
      else if (input.multiple) {
        const values = Array.isArray(value) ? value : [];
        Array.from(input.options).forEach((o) => { o.selected = values.includes(o.value); });
      } else {
        input.value = value == null ? '' : value;
      }
    };

    set('name', el.name);
    set('x', el.x);
    set('y', el.y);
    set('w', el.w);
    set('h', el.h);
    set('bindMode', el.bindMode || 'static');
    set('staticValue', el.staticValue);
    set('column', el.column || (state.columns[0] || ''));
    set('prefix', el.prefix);
    set('suffix', el.suffix);
    set('joinColumns', el.joinColumns || []);
    set('joinSep', el.joinSep != null ? el.joinSep : '-');
    set('joinSkipEmpty', el.joinSkipEmpty !== false);
    set('formula', el.formula);
    set('fontSize', el.fontSize);
    set('fontWeight', el.fontWeight);
    set('textAlign', el.textAlign);
    set('color', el.color || '#0f172a');
    set('barcodeFormat', el.barcodeFormat || 'CODE128');
    set('barcodeShowText', el.barcodeShowText !== false);
    set('qrLevel', el.qrLevel || 'M');
    set('rows', el.rows);
    set('cols', el.cols);
    set('tableCells', el.tableCells);
    set('borderColor', el.borderColor || '#334155');
    set('tableFontSize', el.tableFontSize);
    set('strokeWidth', el.strokeWidth);
    set('strokeColor', el.strokeColor || '#0f172a');
    set('rectStroke', el.rectStroke || '#0f172a');
    set('rectStrokeWidth', el.rectStrokeWidth);
    set('rectFill', el.rectFill || '#ffffff');
    set('rectTransparent', !!el.rectTransparent);
    set('imageFit', el.imageFit !== false);

    showBindMode(el.bindMode || 'static');
    syncCellProps(el);
    updateBindPreview();
  }

  function syncCellProps(el) {
    const empty = $('#cell-props-empty');
    const form = $('#cell-props-form');
    if (!empty || !form) return;
    if (!el || el.type !== 'table' || !designer.selectedCell) {
      empty.hidden = false;
      form.hidden = true;
      return;
    }
    empty.hidden = true;
    form.hidden = false;
    LabelTable.ensureGrid(el);
    const cell = LabelTable.getCell(el, designer.selectedCell.r, designer.selectedCell.c);
    const root = $('#props-form');
    const set = (name, value) => {
      const input = root.elements[name];
      if (!input) return;
      input.value = value == null ? '' : value;
    };
    set('cellText', cell.text || '');
    set('cellFontSize', cell.fontSize != null ? cell.fontSize : (el.tableFontSize || 8));
    set('cellFontWeight', cell.fontWeight || '400');
    set('cellFontStyle', cell.fontStyle || 'normal');
    set('cellAlign', cell.align || 'left');
    set('cellColor', cell.color || '#0f172a');
  }

  function showBindMode(mode) {
    $$('.bind-block').forEach((b) => {
      b.hidden = b.dataset.mode !== mode;
    });
  }

  function updateBindPreview() {
    const el = designer.getSelected();
    const box = $('#bind-preview');
    if (!el || !box) return;
    if (el.type === 'table') {
      if (designer.selectedCell) {
        const cell = LabelTable.getCell(el, designer.selectedCell.r, designer.selectedCell.c);
        box.textContent = LabelTable.evaluateCellText(cell, currentOrder()) || '—';
      } else {
        box.textContent = '选中单元格以预览';
      }
      return;
    }
    if (el.type === 'line' || el.type === 'rect' || el.type === 'image') {
      box.textContent = '—';
      return;
    }
    box.textContent = designer.resolveContent(el, currentOrder()) || '—';
  }

  function readFormPatch() {
    const form = $('#props-form');
    const g = (name) => form.elements[name];
    const joinSel = g('joinColumns');
    const joinColumns = joinSel ? Array.from(joinSel.selectedOptions).map((o) => o.value) : [];
    const patch = {
      name: g('name').value,
      x: Number(g('x').value),
      y: Number(g('y').value),
      w: Number(g('w').value),
      h: Number(g('h').value),
      bindMode: g('bindMode').value,
      staticValue: g('staticValue').value,
      column: g('column').value,
      prefix: g('prefix').value,
      suffix: g('suffix').value,
      joinColumns,
      joinSep: g('joinSep').value,
      joinSkipEmpty: g('joinSkipEmpty').checked,
      formula: g('formula').value,
      fontSize: Number(g('fontSize').value),
      fontWeight: g('fontWeight').value,
      textAlign: g('textAlign').value,
      color: g('color').value,
      barcodeFormat: g('barcodeFormat').value,
      barcodeShowText: g('barcodeShowText').checked,
      qrLevel: g('qrLevel').value,
      rows: Number(g('rows').value),
      cols: Number(g('cols').value),
      borderColor: g('borderColor').value,
      tableFontSize: Number(g('tableFontSize').value),
      strokeWidth: Number(g('strokeWidth').value),
      strokeColor: g('strokeColor').value,
      rectStroke: g('rectStroke').value,
      rectStrokeWidth: Number(g('rectStrokeWidth').value),
      rectFill: g('rectFill').value,
      rectTransparent: g('rectTransparent').checked,
      imageFit: g('imageFit').checked,
    };
    // Only push legacy tableCells when advanced editor changed (keep cells in sync)
    if (g('tableCells')) patch.tableCells = g('tableCells').value;
    return patch;
  }

  function applyForm(ev) {
    if (!designer.getSelected()) return;
    const target = ev && ev.target;
    const cellFields = ['cellText', 'cellFontSize', 'cellFontWeight', 'cellFontStyle', 'cellAlign', 'cellColor'];
    if (target && cellFields.includes(target.name)) {
      applyCellForm();
      return;
    }
    const patch = readFormPatch();
    // Avoid wiping rich cells unless advanced textarea was the source
    if (target && target.name !== 'tableCells') {
      delete patch.tableCells;
    } else if (patch.tableCells != null) {
      // rebuild from string
      const el = designer.getSelected();
      if (el && el.type === 'table') {
        el.cells = null;
      }
    }
    designer.updateSelected(patch);
    showBindMode(patch.bindMode);
    updateBindPreview();
  }

  function applyCellForm() {
    const el = designer.getSelected();
    if (!el || el.type !== 'table' || !designer.selectedCell) return;
    const form = $('#props-form');
    const g = (name) => form.elements[name];
    designer.updateSelectedCell({
      text: g('cellText').value,
      fontSize: Number(g('cellFontSize').value),
      fontWeight: g('cellFontWeight').value,
      fontStyle: g('cellFontStyle').value,
      align: g('cellAlign').value,
      color: g('cellColor').value,
    });
    // refresh legacy textarea display
    form.elements.tableCells.value = el.tableCells || '';
    updateBindPreview();
  }

  function setTemplateName(name) {
    state.templateName = name || '未命名模板';
    $('#template-name').textContent = state.templateName;
  }

  function persistSession() {
    LabelStorage.saveSession({
      templateId: state.templateId,
      templateName: state.templateName,
      design: designer.toJSON(),
      columns: state.columns,
      orders: state.orders.slice(0, 500),
      orderIndex: state.orderIndex,
      zoom: designer.zoom,
    });
  }

  function loadSession() {
    const s = LabelStorage.loadSession();
    if (!s || !LabelStorage.isCurrentSeed(s)) return false;
    state.templateId = s.templateId || null;
    setTemplateName(s.templateName || '未命名模板');
    state.columns = s.columns || [];
    state.orders = s.orders || [];
    state.orderIndex = Math.min(s.orderIndex || 0, Math.max(0, state.orders.length - 1));
    if (s.design) designer.loadJSON(s.design);
    if (s.zoom) {
      $('#zoom').value = Math.round(s.zoom * 100);
      $('#zoom-label').textContent = Math.round(s.zoom * 100) + '%';
      designer.setZoom(s.zoom);
    }
    syncSizeInputs();
    refreshOrderUI();
    return !!(s.design && s.design.elements && s.design.elements.length);
  }

  function seedDemoTemplate() {
    const tpl = (LabelDefaults.templates && LabelDefaults.templates[0]) || null;
    if (tpl) {
      designer.loadJSON(tpl.design);
      state.templateId = tpl.id;
      setTemplateName(tpl.name);
    } else {
      designer.clear();
      designer.setSize(80, 40);
      setTemplateName('线缆产品标签');
    }
    state.columns = LabelDefaults.sampleColumns.slice();
    state.orders = LabelDefaults.sampleOrders.map((r) => ({ ...r }));
    state.orderIndex = 0;
    designer.setZoom(Number($('#zoom').value) / 100 || 1.2);
    syncSizeInputs();
    refreshOrderUI();
    designer.select(null);
    persistSession();
  }

  function syncSizeInputs() {
    $('#label-width').value = designer.width;
    $('#label-height').value = designer.height;
    const preset = `${designer.width}x${designer.height}`;
    const sel = $('#label-preset');
    const found = Array.from(sel.options).some((o) => o.value === preset);
    sel.value = found ? preset : 'custom';
  }

  function collectSnapshots(range) {
    if (range === 'blank' || !state.orders.length) {
      return [designer.snapshotForRow({})];
    }
    if (range === 'current') {
      return [designer.snapshotForRow(currentOrder())];
    }
    return state.orders.map((row) => designer.snapshotForRow(row));
  }

  function renderTemplatesList() {
    const list = $('#templates-list');
    const items = LabelStorage.list();
    if (!items.length) {
      list.innerHTML = '<li class="muted">暂无已保存方案</li>';
      return;
    }
    list.innerHTML = '';
    items.forEach((t) => {
      const li = document.createElement('li');
      const meta = document.createElement('div');
      meta.className = 'meta';
      const badge = t.builtin ? '<span class="tpl-badge">默认</span> ' : '';
      const desc = t.description ? ` · ${escapeHtml(t.description)}` : '';
      meta.innerHTML = `<strong>${badge}${escapeHtml(t.name)}</strong><span>${t.builtin ? '内置模板' : new Date(t.updatedAt).toLocaleString()} · ${t.design?.width || '?'}×${t.design?.height || '?'} mm${desc}</span>`;
      const actions = document.createElement('div');
      actions.className = 'actions';
      const loadBtn = document.createElement('button');
      loadBtn.type = 'button';
      loadBtn.className = 'btn tiny primary';
      loadBtn.textContent = '加载';
      loadBtn.addEventListener('click', () => {
        state.templateId = t.id;
        setTemplateName(t.name);
        designer.loadJSON(t.design || { width: 80, height: 40, elements: [] });
        syncSizeInputs();
        persistSession();
        $('#templates-modal').close();
      });
      actions.appendChild(loadBtn);
      if (!t.builtin) {
        const delBtn = document.createElement('button');
        delBtn.type = 'button';
        delBtn.className = 'btn tiny danger';
        delBtn.textContent = '删除';
        delBtn.addEventListener('click', () => {
          if (confirm('确定删除方案「' + t.name + '」？')) {
            LabelStorage.removeTemplate(t.id);
            if (state.templateId === t.id) state.templateId = null;
            renderTemplatesList();
          }
        });
        actions.appendChild(delBtn);
      }
      li.append(meta, actions);
      list.appendChild(li);
    });
  }

  // --- Event wiring ---
  $$('.tool').forEach((btn) => {
    btn.addEventListener('click', () => {
      designer.addElement(btn.dataset.type);
      syncPropsForm(designer.getSelected());
    });
  });

  $('#props-form').addEventListener('input', applyForm);
  $('#props-form').addEventListener('change', applyForm);

  $('#btn-merge-cells').addEventListener('click', () => {
    if (!designer.mergeSelectedCells()) {
      alert('请先拖动框选至少两个单元格再合并');
    }
  });
  $('#btn-unmerge-cells').addEventListener('click', () => {
    if (!designer.unmergeSelectedCell()) {
      alert('当前单元格没有合并区域');
    }
  });

  $('#btn-delete-el').addEventListener('click', () => designer.removeSelected());
  $('#btn-duplicate-el').addEventListener('click', () => designer.duplicateSelected());
  $('#btn-bring-front').addEventListener('click', () => designer.bringFront());
  $('#btn-send-back').addEventListener('click', () => designer.sendBack());

  $('#label-preset').addEventListener('change', (e) => {
    const v = e.target.value;
    if (v === 'custom') return;
    const [w, h] = v.split('x').map(Number);
    designer.setSize(w, h);
    syncSizeInputs();
  });
  $('#label-width').addEventListener('change', () => {
    designer.setSize($('#label-width').value, $('#label-height').value);
    syncSizeInputs();
  });
  $('#label-height').addEventListener('change', () => {
    designer.setSize($('#label-width').value, $('#label-height').value);
    syncSizeInputs();
  });
  $('#zoom').addEventListener('input', (e) => {
    const z = Number(e.target.value) / 100;
    $('#zoom-label').textContent = e.target.value + '%';
    designer.setZoom(z);
    persistSession();
  });

  $('#order-file').addEventListener('change', async (e) => {
    const file = e.target.files && e.target.files[0];
    e.target.value = '';
    if (!file) return;
    try {
      const data = await LabelData.importFile(file);
      state.columns = data.columns;
      state.orders = data.rows;
      state.orderIndex = 0;
      try {
        refreshOrderUI();
        persistSession();
      } catch (renderErr) {
        console.error(renderErr);
      }
      alert(`已导入 ${data.rows.length} 条订单，${data.columns.length} 列。`);
    } catch (err) {
      alert('导入失败: ' + (err.message || err));
    }
  });

  $('#btn-clear-orders').addEventListener('click', () => {
    state.orders = [];
    state.columns = [];
    state.orderIndex = 0;
    refreshOrderUI();
    persistSession();
  });

  $('#prev-order').addEventListener('click', () => {
    if (!state.orders.length) return;
    state.orderIndex = (state.orderIndex - 1 + state.orders.length) % state.orders.length;
    refreshOrderUI();
    persistSession();
  });
  $('#next-order').addEventListener('click', () => {
    if (!state.orders.length) return;
    state.orderIndex = (state.orderIndex + 1) % state.orders.length;
    refreshOrderUI();
    persistSession();
  });

  $('#btn-new').addEventListener('click', () => {
    if (!confirm('新建空白标签？未保存的更改将丢失（可先点保存模板）。')) return;
    state.templateId = null;
    setTemplateName('未命名模板');
    designer.clear();
    designer.setSize(60, 40);
    syncSizeInputs();
    persistSession();
  });

  $('#btn-save').addEventListener('click', () => {
    $('#save-name').value = state.templateName || '';
    renderTemplatesList();
    $('#templates-modal').showModal();
  });
  $('#btn-templates').addEventListener('click', () => {
    $('#save-name').value = state.templateName || '';
    renderTemplatesList();
    $('#templates-modal').showModal();
  });
  $('#btn-save-named').addEventListener('click', () => {
    const name = ($('#save-name').value || '').trim() || '未命名模板';
    const saved = LabelStorage.saveTemplate({
      id: state.templateId || undefined,
      name,
      design: designer.toJSON(),
    });
    state.templateId = saved.id;
    setTemplateName(saved.name);
    persistSession();
    renderTemplatesList();
    alert('方案已保存到本机浏览器。');
  });

  $('#btn-print').addEventListener('click', () => {
    const range = $('#print-range');
    if (!state.orders.length) {
      range.value = 'blank';
    } else if (range.value === 'blank') {
      // keep
    } else {
      range.value = state.orders.length > 1 ? 'all' : 'current';
    }
    $('#print-modal').showModal();
  });

  $('#print-mode').addEventListener('change', () => {
    $('#a4-cols-wrap').hidden = $('#print-mode').value !== 'a4';
  });

  $('#btn-do-print').addEventListener('click', async () => {
    const range = $('#print-range').value;
    const mode = $('#print-mode').value;
    const a4cols = Number($('#a4-cols').value) || 2;
    const snaps = collectSnapshots(range);
    $('#print-modal').close();
    try {
      await LabelPrint.printLabels(snaps, { mode, a4cols });
    } catch (err) {
      alert('打印失败: ' + (err.message || err));
    }
  });

  $('#btn-export-excel').addEventListener('click', () => {
    const range = state.orders.length ? 'all' : 'blank';
    const snaps = collectSnapshots(range);
    try {
      LabelData.exportLabelsExcel(snaps, `${state.templateName || 'labels'}.xlsx`);
    } catch (err) {
      alert('导出失败: ' + (err.message || err));
    }
  });

  $('#image-file').addEventListener('change', (e) => {
    const file = e.target.files && e.target.files[0];
    e.target.value = '';
    if (!file || !designer.getSelected()) return;
    const reader = new FileReader();
    reader.onload = () => {
      designer.updateSelected({ imageData: reader.result });
    };
    reader.readAsDataURL(file);
  });

  // Restore / demo
  const restored = loadSession();
  if (!restored) seedDemoTemplate();
  refreshOrderUI();
})();
