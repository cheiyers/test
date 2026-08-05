(function (global) {
  const FORMULA_HINT = '公式示例：left:4 / right:3 / upper / lower / trim / num+1 / replace:旧:新 / mid:2:3 / padleft:6:0';

  function uid(prefix) {
    return (prefix || 'e') + Math.random().toString(36).slice(2, 8);
  }

  function escapeHtml(str) {
    return String(str ?? '').replace(/[&<>"']/g, (c) => ({
      '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;'
    }[c]));
  }

  function defaultTable() {
    return {
      id: uid('tbl'),
      type: 'table',
      x: 3, y: 3, w: 70, h: 40,
      rows: 2,
      cols: 2,
      colWidths: [50, 50],
      cells: [
        {
          r: 0, c: 0, rowspan: 1, colspan: 2, contentType: 'text',
          segments: [
            { type: 'text', value: '订单:' },
            { type: 'field', field: 'order_no', formula: '' }
          ],
          text: '', fontSize: 11, align: 'left', bold: true
        },
        {
          r: 1, c: 0, rowspan: 1, colspan: 1, contentType: 'text',
          segments: [{ type: 'field', field: 'part_no', formula: '' }],
          text: '', fontSize: 10, align: 'center', bold: false
        },
        {
          r: 1, c: 1, rowspan: 1, colspan: 1, contentType: 'qr',
          segments: [{ type: 'field', field: 'package_code', formula: '' }],
          text: '', fontSize: 10, align: 'center', bold: false
        }
      ]
    };
  }

  async function openTemplateEditor(host, tpl, ctx) {
    const draft = JSON.parse(JSON.stringify(tpl));
    draft.code_segments = draft.code_segments || [];
    draft.code_fields = draft.code_fields || [];
    let selectedElId = null;
    let selectedCellKey = null; // "r,c"
    let fieldMeta = { fields: ['order_no', 'part_no', 'qty', 'mother_part_no', 'package_code', 'child_code'], formulas: [] };
    try {
      fieldMeta = await API.get(`/templates/meta/field-options?label_type=${draft.label_type}`);
    } catch (_) {}

    host.innerHTML = `
      <div class="card">
        <h3>模板编辑器 — ${draft.label_type === 'master' ? '总包订单字段' : '配件订单字段'}</h3>
        <p class="muted">${fieldMeta.has_order_data ? '已检测到导入订单列，可直接点选拼接。' : '尚未导入订单时仍可手动填写列名；导入后会自动出现列清单。'}</p>
        <div class="row">
          <label class="field"><span>名称</span><input id="tplName" value="${escapeHtml(draft.name)}" /></label>
          <label class="field"><span>宽 mm</span><input id="tplW" type="number" value="${draft.width_mm}" /></label>
          <label class="field"><span>高 mm</span><input id="tplH" type="number" value="${draft.height_mm}" /></label>
          <label class="field"><span>默认码类型</span>
            <select id="tplCodeType">
              <option value="qr" ${draft.code_type === 'qr' ? 'selected' : ''}>二维码</option>
              <option value="barcode" ${draft.code_type === 'barcode' ? 'selected' : ''}>一维码</option>
            </select>
          </label>
          <label class="field"><span>标签码内容模式</span>
            <select id="tplCodeMode">
              <option value="unique" ${draft.code_mode === 'unique' ? 'selected' : ''}>系统唯一编号</option>
              <option value="fields" ${draft.code_mode === 'fields' ? 'selected' : ''}>字段/公式拼接</option>
            </select>
          </label>
        </div>
        <div id="codeSegBox" class="seg-builder" style="margin-top:10px"></div>
        <div class="editor-layout" style="margin-top:12px">
          <div class="palette">
            <button class="btn secondary" data-add="text" type="button">+ 固定文字</button>
            <button class="btn secondary" data-add="field" type="button">+ 绑定字段</button>
            <button class="btn secondary" data-add="code" type="button">+ 条码/二维码</button>
            <button class="btn" data-add="table" type="button">+ 表格</button>
            <p class="muted" style="font-size:12px;margin-top:10px">选中元素后，拖动边缘/角落手柄可放大缩小；拖动本体可移动位置。</p>
            <p class="muted" style="font-size:12px">表格支持合并单元格；单元格内容可选文本或条码，并用订单列 + 任意字符 + 公式拼接。</p>
            <p class="muted" style="font-size:11px">${FORMULA_HINT}</p>
          </div>
          <div class="canvas-wrap"><div class="label-canvas" id="labelCanvas"></div></div>
          <div class="props" id="elProps"><p class="muted">选中元素后编辑属性</p></div>
        </div>
        <div class="row" style="margin-top:12px">
          <button class="btn" id="saveTplBtn" type="button">保存模板</button>
        </div>
      </div>
    `;

    const $ = (sel, el = host) => el.querySelector(sel);
    const $$ = (sel, el = host) => [...el.querySelectorAll(sel)];

    function syncMeta() {
      draft.name = $('#tplName').value;
      draft.width_mm = Number($('#tplW').value) || 100;
      draft.height_mm = Number($('#tplH').value) || 50;
      draft.code_type = $('#tplCodeType').value;
      draft.code_mode = $('#tplCodeMode').value;
    }

    function renderCodeSegBox() {
      const box = $('#codeSegBox');
      if (draft.code_mode !== 'fields') {
        box.innerHTML = '<p class="muted">当前使用系统唯一编号作为扫码主码。</p>';
        return;
      }
      box.innerHTML = `
        <h4 style="margin:0 0 8px">标签主码拼接（字段间可插入任意字符）</h4>
        <div id="codeSegments"></div>
        <div class="row" style="margin-top:8px">
          <button class="btn secondary" id="addCodeField" type="button">+ 订单字段</button>
          <button class="btn secondary" id="addCodeText" type="button">+ 任意字符</button>
        </div>
        <div class="muted" style="margin-top:6px">预览：<code id="codePreview"></code></div>
      `;
      const list = $('#codeSegments');
      (draft.code_segments || []).forEach((seg, idx) => {
        list.appendChild(segmentEditorRow(seg, idx, (next) => {
          draft.code_segments[idx] = next;
          $('#codePreview').textContent = Expr.segmentsPreview(draft.code_segments);
        }, () => {
          draft.code_segments.splice(idx, 1);
          renderCodeSegBox();
        }));
      });
      $('#codePreview').textContent = Expr.segmentsPreview(draft.code_segments);
      $('#addCodeField').onclick = () => {
        draft.code_segments.push({ type: 'field', field: fieldMeta.fields[0] || 'order_no', formula: '' });
        renderCodeSegBox();
      };
      $('#addCodeText').onclick = () => {
        draft.code_segments.push({ type: 'text', value: '-' });
        renderCodeSegBox();
      };
    }

    function segmentEditorRow(seg, idx, onChange, onRemove) {
      const wrap = document.createElement('div');
      wrap.className = 'seg-row';
      if (seg.type === 'text') {
        wrap.innerHTML = `
          <span class="tag info">字符</span>
          <input data-k="value" value="${escapeHtml(seg.value || '')}" placeholder="任意字符，如 - / _ 空格" />
          <button class="btn danger" type="button" data-rm>删</button>
        `;
      } else {
        wrap.innerHTML = `
          <span class="tag ok">字段</span>
          <select data-k="field">
            ${fieldMeta.fields.map((f) => `<option value="${escapeHtml(f)}" ${f === seg.field ? 'selected' : ''}>${escapeHtml(f)}</option>`).join('')}
            ${seg.field && !fieldMeta.fields.includes(seg.field) ? `<option value="${escapeHtml(seg.field)}" selected>${escapeHtml(seg.field)}</option>` : ''}
          </select>
          <input data-k="fieldManual" placeholder="或手输列名" value="" style="max-width:120px" />
          <input data-k="formula" value="${escapeHtml(seg.formula || '')}" placeholder="公式，可空" />
          <button class="btn danger" type="button" data-rm>删</button>
        `;
      }
      wrap.querySelectorAll('[data-k]').forEach((input) => {
        input.addEventListener('input', () => {
          const next = { ...seg };
          if (input.dataset.k === 'fieldManual' && input.value.trim()) {
            next.field = input.value.trim();
          } else if (input.dataset.k === 'field') {
            next.field = input.value;
          } else if (input.dataset.k === 'formula') {
            next.formula = input.value;
          } else if (input.dataset.k === 'value') {
            next.value = input.value;
          }
          onChange(next);
        });
      });
      wrap.querySelector('[data-rm]').onclick = onRemove;
      return wrap;
    }

    const RESIZE_HANDLES = ['nw', 'n', 'ne', 'e', 'se', 's', 'sw', 'w'];

    function handlesHtml(selected) {
      if (!selected) return '';
      return RESIZE_HANDLES.map((dir) => `<span class="resize-handle ${dir}" data-resize="${dir}"></span>`).join('');
    }

    function applyNodeBox(node, el, pxPerMm) {
      node.style.left = `${el.x * pxPerMm}px`;
      node.style.top = `${el.y * pxPerMm}px`;
      node.style.width = `${el.w * pxPerMm}px`;
      node.style.height = `${el.h * pxPerMm}px`;
    }

    function fmtMm(v) {
      return Number(v).toFixed(1);
    }

    function syncSizeInputs(el) {
      const setVal = (id, v) => {
        const input = $(`#${id}`);
        if (input) input.value = fmtMm(v);
      };
      setVal('elX', el.x);
      setVal('elY', el.y);
      const hint = $('#elSizeHint');
      if (hint) hint.textContent = `${fmtMm(el.w)} × ${fmtMm(el.h)} mm`;
    }

    function renderCanvas() {
      syncMeta();
      const canvas = $('#labelCanvas');
      const pxPerMm = 3.2;
      canvas.style.width = `${draft.width_mm * pxPerMm}px`;
      canvas.style.height = `${draft.height_mm * pxPerMm}px`;
      canvas.innerHTML = draft.elements.map((el) => {
        const selected = el.id === selectedElId ? 'selected' : '';
        if (el.type === 'table') {
          Expr.ensureTableCells(el);
          const occupied = Expr.buildOccupiedMap(el.rows, el.cols, el.cells);
          let html = `<div class="label-el table ${selected}" data-id="${el.id}" style="left:${el.x * pxPerMm}px;top:${el.y * pxPerMm}px;width:${el.w * pxPerMm}px;height:${el.h * pxPerMm}px"><div class="el-body"><table class="label-table-edit">`;
          for (let r = 0; r < el.rows; r++) {
            html += '<tr>';
            for (let c = 0; c < el.cols; c++) {
              const cell = occupied[r][c];
              if (cell === 'skip') continue;
              const key = `${r},${c}`;
              const active = selectedElId === el.id && selectedCellKey === key ? 'cell-active' : '';
              const preview = Expr.segmentsPreview(cell.segments) || cell.contentType || '';
              html += `<td class="${active}" data-cell="${key}" rowspan="${cell.rowspan || 1}" colspan="${cell.colspan || 1}">${escapeHtml(preview || '空')}</td>`;
            }
            html += '</tr>';
          }
          html += `</table></div>${handlesHtml(!!selected)}</div>`;
          return html;
        }
        if (el.type === 'code') {
          return `<div class="label-el code ${selected}" data-id="${el.id}" style="left:${el.x * pxPerMm}px;top:${el.y * pxPerMm}px;width:${el.w * pxPerMm}px;height:${el.h * pxPerMm}px"><div class="el-body">CODE</div>${handlesHtml(!!selected)}</div>`;
        }
        const text = Expr.segmentsPreview(el.segments) || el.text || '';
        return `<div class="label-el ${selected}" data-id="${el.id}" style="left:${el.x * pxPerMm}px;top:${el.y * pxPerMm}px;width:${el.w * pxPerMm}px;height:${el.h * pxPerMm}px;font-size:${el.fontSize || 12}px;text-align:${el.align || 'left'};font-weight:${el.bold ? 700 : 400}"><div class="el-body">${escapeHtml(text)}</div>${handlesHtml(!!selected)}</div>`;
      }).join('');

      $$('.label-el', canvas).forEach((node) => {
        node.addEventListener('mousedown', (ev) => {
          if (ev.target.closest('[data-resize]')) return;
          startDrag(ev, node, pxPerMm);
        });
        node.addEventListener('click', (ev) => {
          if (ev.target.closest('[data-resize]')) return;
          if (node.dataset.didDrag === '1') {
            node.dataset.didDrag = '';
            return;
          }
          ev.stopPropagation();
          selectedElId = node.dataset.id;
          const td = ev.target.closest('td[data-cell]');
          selectedCellKey = td ? td.dataset.cell : null;
          renderCanvas();
          renderProps();
        });
        $$('[data-resize]', node).forEach((handle) => {
          handle.addEventListener('mousedown', (ev) => {
            ev.preventDefault();
            ev.stopPropagation();
            startResize(ev, node, handle.dataset.resize, pxPerMm);
          });
        });
      });
    }

    function startDrag(ev, node, pxPerMm) {
      const el = draft.elements.find((e) => e.id === node.dataset.id);
      if (!el) return;
      ev.preventDefault();
      selectedElId = el.id;
      const startX = ev.clientX;
      const startY = ev.clientY;
      const ox = el.x;
      const oy = el.y;
      const maxX = Math.max(0, draft.width_mm - el.w);
      const maxY = Math.max(0, draft.height_mm - el.h);
      let moved = false;
      node.classList.add('dragging');
      const onMove = (e2) => {
        const nx = Math.min(maxX, Math.max(0, ox + (e2.clientX - startX) / pxPerMm));
        const ny = Math.min(maxY, Math.max(0, oy + (e2.clientY - startY) / pxPerMm));
        if (Math.abs(nx - ox) > 0.05 || Math.abs(ny - oy) > 0.05) moved = true;
        el.x = nx;
        el.y = ny;
        applyNodeBox(node, el, pxPerMm);
        syncSizeInputs(el);
      };
      const onUp = () => {
        node.classList.remove('dragging');
        if (moved) node.dataset.didDrag = '1';
        window.removeEventListener('mousemove', onMove);
        window.removeEventListener('mouseup', onUp);
        if (moved) renderProps();
      };
      window.addEventListener('mousemove', onMove);
      window.addEventListener('mouseup', onUp);
    }

    function startResize(ev, node, dir, pxPerMm) {
      const el = draft.elements.find((e) => e.id === node.dataset.id);
      if (!el) return;
      selectedElId = el.id;
      const startX = ev.clientX;
      const startY = ev.clientY;
      const ox = el.x;
      const oy = el.y;
      const ow = el.w;
      const oh = el.h;
      const minSize = 4; // mm
      node.classList.add('resizing');
      const onMove = (e2) => {
        const dx = (e2.clientX - startX) / pxPerMm;
        const dy = (e2.clientY - startY) / pxPerMm;
        let x = ox;
        let y = oy;
        let w = ow;
        let h = oh;

        if (dir.includes('e')) w = ow + dx;
        if (dir.includes('s')) h = oh + dy;
        if (dir.includes('w')) {
          w = ow - dx;
          x = ox + dx;
        }
        if (dir.includes('n')) {
          h = oh - dy;
          y = oy + dy;
        }

        if (w < minSize) {
          if (dir.includes('w')) x = ox + ow - minSize;
          w = minSize;
        }
        if (h < minSize) {
          if (dir.includes('n')) y = oy + oh - minSize;
          h = minSize;
        }

        // keep inside label canvas
        if (x < 0) {
          w += x;
          x = 0;
        }
        if (y < 0) {
          h += y;
          y = 0;
        }
        if (x + w > draft.width_mm) w = draft.width_mm - x;
        if (y + h > draft.height_mm) h = draft.height_mm - y;
        w = Math.max(minSize, w);
        h = Math.max(minSize, h);

        el.x = x;
        el.y = y;
        el.w = w;
        el.h = h;
        applyNodeBox(node, el, pxPerMm);
        syncSizeInputs(el);
      };
      const onUp = () => {
        node.classList.remove('resizing');
        window.removeEventListener('mousemove', onMove);
        window.removeEventListener('mouseup', onUp);
        renderCanvas();
        renderProps();
      };
      window.addEventListener('mousemove', onMove);
      window.addEventListener('mouseup', onUp);
    }

    function renderProps() {
      const box = $('#elProps');
      const el = draft.elements.find((e) => e.id === selectedElId);
      if (!el) {
        box.innerHTML = '<p class="muted">选中元素后编辑属性</p>';
        return;
      }

      if (el.type === 'table') {
        Expr.ensureTableCells(el);
        const [cr, cc] = (selectedCellKey || '0,0').split(',').map(Number);
        let cell = el.cells.find((c) => c.r === cr && c.c === cc);
        if (!cell) {
          selectedCellKey = '0,0';
          cell = el.cells.find((c) => c.r === 0 && c.c === 0);
        }
        box.innerHTML = `
          <h4>表格属性</h4>
          <p class="size-hint">宽高请在画布拖动手柄调整：当前 <strong id="elSizeHint">${fmtMm(el.w)} × ${fmtMm(el.h)} mm</strong></p>
          <div class="grid-2">
            <label class="field"><span>行数</span><input id="tRows" type="number" min="1" value="${el.rows}" /></label>
            <label class="field"><span>列数</span><input id="tCols" type="number" min="1" value="${el.cols}" /></label>
            <label class="field"><span>X mm</span><input id="elX" type="number" step="0.5" value="${fmtMm(el.x)}" /></label>
            <label class="field"><span>Y mm</span><input id="elY" type="number" step="0.5" value="${fmtMm(el.y)}" /></label>
          </div>
          <div class="row" style="margin-top:8px">
            <button class="btn secondary" id="applyTable" type="button">应用行列/位置</button>
            <button class="btn secondary" id="mergeRight" type="button">向右合并</button>
            <button class="btn secondary" id="mergeDown" type="button">向下合并</button>
            <button class="btn secondary" id="splitCell" type="button">拆分单元格</button>
          </div>
          <hr style="border:none;border-top:1px solid #c9d8cf;margin:12px 0" />
          <h4>当前单元格 (${cell.r + 1}, ${cell.c + 1})</h4>
          <label class="field"><span>内容类型</span>
            <select id="cellType">
              <option value="text" ${cell.contentType === 'text' ? 'selected' : ''}>文本</option>
              <option value="qr" ${cell.contentType === 'qr' ? 'selected' : ''}>二维码</option>
              <option value="barcode" ${cell.contentType === 'barcode' ? 'selected' : ''}>一维码</option>
            </select>
          </label>
          <div class="grid-2">
            <label class="field"><span>字号</span><input id="cellSize" type="number" value="${cell.fontSize || 10}" /></label>
            <label class="field"><span>对齐</span>
              <select id="cellAlign"><option value="left">左</option><option value="center">中</option><option value="right">右</option></select>
            </label>
          </div>
          <label class="field"><span><input type="checkbox" id="cellBold" ${cell.bold ? 'checked' : ''}/> 加粗</span></label>
          <h4 style="margin-top:10px">内容拼接</h4>
          <div id="cellSegs"></div>
          <div class="row" style="margin-top:8px">
            <button class="btn secondary" id="addCellField" type="button">+ 订单字段</button>
            <button class="btn secondary" id="addCellText" type="button">+ 任意字符</button>
            <button class="btn" id="applyCell" type="button">应用单元格</button>
          </div>
          <div class="muted" style="margin-top:6px">预览：<code id="cellPreview"></code></div>
          <div class="row" style="margin-top:12px"><button class="btn danger" id="delEl" type="button">删除表格</button></div>
        `;
        $('#cellAlign').value = cell.align || 'center';
        const segHost = $('#cellSegs');
        (cell.segments || []).forEach((seg, idx) => {
          segHost.appendChild(segmentEditorRow(seg, idx, (next) => {
            cell.segments[idx] = next;
            $('#cellPreview').textContent = Expr.segmentsPreview(cell.segments);
          }, () => {
            cell.segments.splice(idx, 1);
            renderProps();
          }));
        });
        $('#cellPreview').textContent = Expr.segmentsPreview(cell.segments);

        $('#applyTable').onclick = () => {
          el.rows = Math.max(1, Number($('#tRows').value) || 1);
          el.cols = Math.max(1, Number($('#tCols').value) || 1);
          el.x = Number($('#elX').value);
          el.y = Number($('#elY').value);
          el.colWidths = Array.from({ length: el.cols }, () => 100 / el.cols);
          // drop cells outside
          el.cells = (el.cells || []).filter((c) => c.r < el.rows && c.c < el.cols);
          Expr.ensureTableCells(el);
          selectedCellKey = '0,0';
          renderCanvas();
          renderProps();
        };
        $('#mergeRight').onclick = () => mergeCell(el, cell, 'right');
        $('#mergeDown').onclick = () => mergeCell(el, cell, 'down');
        $('#splitCell').onclick = () => {
          cell.rowspan = 1;
          cell.colspan = 1;
          Expr.ensureTableCells(el);
          renderCanvas();
          renderProps();
        };
        $('#addCellField').onclick = () => {
          cell.segments = cell.segments || [];
          cell.segments.push({ type: 'field', field: fieldMeta.fields[0] || 'order_no', formula: '' });
          renderProps();
        };
        $('#addCellText').onclick = () => {
          cell.segments = cell.segments || [];
          cell.segments.push({ type: 'text', value: '-' });
          renderProps();
        };
        $('#applyCell').onclick = () => {
          cell.contentType = $('#cellType').value;
          cell.fontSize = Number($('#cellSize').value) || 10;
          cell.align = $('#cellAlign').value;
          cell.bold = $('#cellBold').checked;
          renderCanvas();
          renderProps();
        };
        $('#delEl').onclick = () => {
          draft.elements = draft.elements.filter((e) => e.id !== el.id);
          selectedElId = null;
          selectedCellKey = null;
          renderCanvas();
          renderProps();
        };
        return;
      }

      // text / field / code
      if (!Array.isArray(el.segments)) {
        if (el.type === 'code') {
          el.segments = draft.code_mode === 'fields' && draft.code_segments?.length
            ? JSON.parse(JSON.stringify(draft.code_segments))
            : [{ type: 'field', field: draft.label_type === 'master' ? 'package_code' : 'child_code', formula: '' }];
        } else if (el.bind) {
          el.segments = [
            ...(el.text && !el.text.includes('{') ? [{ type: 'text', value: el.text.replace(/[:：]\s*$/, '：') }] : []),
            { type: 'field', field: el.bind, formula: el.formula || '' }
          ];
        } else if (el.text) {
          el.segments = [{ type: 'text', value: el.text }];
        } else {
          el.segments = [];
        }
      }

      box.innerHTML = `
        <h4>元素属性</h4>
        <p class="size-hint">宽高请在画布拖动手柄调整：当前 <strong id="elSizeHint">${fmtMm(el.w)} × ${fmtMm(el.h)} mm</strong></p>
        <div class="grid-2">
          <label class="field"><span>X mm</span><input id="elX" type="number" step="0.5" value="${fmtMm(el.x)}" /></label>
          <label class="field"><span>Y mm</span><input id="elY" type="number" step="0.5" value="${fmtMm(el.y)}" /></label>
        </div>
        ${el.type === 'code' ? `
          <label class="field"><span>码类型</span>
            <select id="elCodeType">
              <option value="qr" ${(el.codeType || draft.code_type) === 'qr' ? 'selected' : ''}>二维码</option>
              <option value="barcode" ${(el.codeType || draft.code_type) === 'barcode' ? 'selected' : ''}>一维码</option>
            </select>
          </label>` : `
          <label class="field"><span>字号</span><input id="elSize" type="number" value="${el.fontSize || 12}" /></label>
          <label class="field"><span>对齐</span>
            <select id="elAlign"><option value="left">左</option><option value="center">中</option><option value="right">右</option></select>
          </label>
          <label class="field"><span><input type="checkbox" id="elBold" ${el.bold ? 'checked' : ''}/> 加粗</span></label>
        `}
        <h4 style="margin-top:10px">内容拼接（订单列 / 任意字符 / 公式）</h4>
        <div id="elSegs"></div>
        <div class="row" style="margin-top:8px">
          <button class="btn secondary" id="addElField" type="button">+ 订单字段</button>
          <button class="btn secondary" id="addElText" type="button">+ 任意字符</button>
          <button class="btn" id="applyEl" type="button">应用</button>
          <button class="btn danger" id="delEl" type="button">删除</button>
        </div>
        <div class="muted" style="margin-top:6px">预览：<code id="elPreview"></code></div>
      `;
      if ($('#elAlign')) $('#elAlign').value = el.align || 'left';
      const segHost = $('#elSegs');
      (el.segments || []).forEach((seg, idx) => {
        segHost.appendChild(segmentEditorRow(seg, idx, (next) => {
          el.segments[idx] = next;
          $('#elPreview').textContent = Expr.segmentsPreview(el.segments);
        }, () => {
          el.segments.splice(idx, 1);
          renderProps();
        }));
      });
      $('#elPreview').textContent = Expr.segmentsPreview(el.segments);
      $('#addElField').onclick = () => {
        el.segments.push({ type: 'field', field: fieldMeta.fields[0] || 'order_no', formula: '' });
        renderProps();
      };
      $('#addElText').onclick = () => {
        el.segments.push({ type: 'text', value: '-' });
        renderProps();
      };
      $('#applyEl').onclick = () => {
        el.x = Number($('#elX').value);
        el.y = Number($('#elY').value);
        if (el.type === 'code') {
          el.codeType = $('#elCodeType').value;
        } else {
          el.fontSize = Number($('#elSize').value) || 12;
          el.align = $('#elAlign').value;
          el.bold = $('#elBold').checked;
          el.text = Expr.segmentsPreview(el.segments);
        }
        renderCanvas();
      };
      $('#delEl').onclick = () => {
        draft.elements = draft.elements.filter((e) => e.id !== el.id);
        selectedElId = null;
        renderCanvas();
        renderProps();
      };
    }

    function mergeCell(table, cell, dir) {
      Expr.ensureTableCells(table);
      if (dir === 'right') {
        const nextC = cell.c + (cell.colspan || 1);
        if (nextC >= table.cols) return alert('右侧没有可合并的单元格');
        const right = table.cells.find((c) => c.r === cell.r && c.c === nextC);
        if (!right || (right.rowspan || 1) !== (cell.rowspan || 1)) return alert('右侧单元格行跨度不一致，无法合并');
        cell.colspan = (cell.colspan || 1) + (right.colspan || 1);
        table.cells = table.cells.filter((c) => !(c.r === right.r && c.c === right.c));
      } else {
        const nextR = cell.r + (cell.rowspan || 1);
        if (nextR >= table.rows) return alert('下方没有可合并的单元格');
        const down = table.cells.find((c) => c.r === nextR && c.c === cell.c);
        if (!down || (down.colspan || 1) !== (cell.colspan || 1)) return alert('下方单元格列跨度不一致，无法合并');
        cell.rowspan = (cell.rowspan || 1) + (down.rowspan || 1);
        table.cells = table.cells.filter((c) => !(c.r === down.r && c.c === down.c));
      }
      renderCanvas();
      renderProps();
    }

    $$('[data-add]').forEach((btn) => {
      btn.onclick = () => {
        const type = btn.dataset.add;
        const id = uid(type === 'table' ? 'tbl' : 'e');
        if (type === 'table') {
          const t = defaultTable();
          t.id = id;
          if (draft.label_type === 'master') {
            t.cells[1].segments = [{ type: 'field', field: 'mother_part_no', formula: '' }];
            t.cells[2].segments = [{ type: 'field', field: 'package_code', formula: '' }];
          }
          draft.elements.push(t);
          selectedCellKey = '0,0';
        } else if (type === 'text') {
          draft.elements.push({
            id, type: 'text', x: 5, y: 5, w: 40, h: 8,
            text: '文字', fontSize: 12, align: 'left', bold: false,
            segments: [{ type: 'text', value: '文字' }]
          });
        } else if (type === 'field') {
          draft.elements.push({
            id, type: 'field', x: 5, y: 15, w: 50, h: 8,
            text: '', fontSize: 11, align: 'left', bold: false, bind: 'order_no',
            segments: [
              { type: 'text', value: '' },
              { type: 'field', field: fieldMeta.fields[0] || 'order_no', formula: '' }
            ]
          });
        } else {
          draft.elements.push({
            id, type: 'code', x: 55, y: 10, w: 30, h: 30,
            text: '', fontSize: 10, align: 'center', bold: false,
            codeType: draft.code_type,
            segments: [{ type: 'field', field: draft.label_type === 'master' ? 'package_code' : 'child_code', formula: '' }]
          });
        }
        selectedElId = id;
        renderCanvas();
        renderProps();
      };
    });

    $('#saveTplBtn').onclick = async () => {
      syncMeta();
      draft.code_fields = (draft.code_segments || [])
        .filter((s) => s.type === 'field')
        .map((s) => s.field)
        .filter(Boolean);
      try {
        if (draft.id) await API.put(`/templates/${draft.id}`, draft);
        else await API.post('/templates', draft);
        if (ctx?.onSaved) ctx.onSaved();
      } catch (err) {
        alert(err.message);
      }
    };

    $('#tplCodeMode').onchange = () => {
      syncMeta();
      renderCodeSegBox();
    };
    ['tplName', 'tplW', 'tplH', 'tplCodeType'].forEach((id) => {
      $(`#${id}`).addEventListener('change', renderCanvas);
    });

    renderCodeSegBox();
    renderCanvas();
  }

  global.openTemplateEditor = openTemplateEditor;
})(window);
