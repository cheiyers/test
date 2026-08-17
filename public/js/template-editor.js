(function (global) {
  const FORMULA_HINT = 'Excel 风格嵌套：FORMAT(,"yyyy-mm-dd")、IF(LEFT(TRIM(),2)="SO","订单","其他")、UPPER(LEFT(TRIM(),4))；当前值用空参或 VALUE()';

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
      rowHeights: [40, 60],
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
    let fieldMeta = {
      fields: ['order_no', 'part_no', 'qty', 'mother_part_no', 'package_code', 'child_code'],
      formulas: Expr.FORMULA_CATALOG || [],
      formula_help: [],
      scan_id_field: draft.label_type === 'child' ? 'child_code' : 'package_code'
    };
    try {
      fieldMeta = await API.get(`/templates/meta/field-options?label_type=${draft.label_type}`);
      if (!fieldMeta.formulas?.length) fieldMeta.formulas = Expr.FORMULA_CATALOG || [];
      if (!fieldMeta.scan_id_field) {
        fieldMeta.scan_id_field = draft.label_type === 'child' ? 'child_code' : 'package_code';
      }
    } catch (_) {}

    host.innerHTML = `
      <div class="card">
        <h3>模板编辑器 — ${draft.label_type === 'master' ? '总包订单字段' : '配件订单字段'}</h3>
        <p class="muted">${fieldMeta.has_order_data ? '已检测到导入订单列，可直接点选拼接。' : '尚未导入订单时仍可手动填写列名；导入后会自动出现列清单。'}</p>
        <div class="flash info" style="margin-bottom:10px">
          系统唯一码字段为 <code>${escapeHtml(fieldMeta.scan_id_field)}</code>（可选写入条码）。
          条码内容可自由拼接订单字段、固定文字、今日日期、序列号等；<strong>唯一码非必须</strong>。
          若模板用于「订单批次打印」，需在条码中包含该唯一码，才会出现在打印模板列表中。
          序列号可自定义连接符、数字/英文样式、位数与起始值，打印时按张递增。
        </div>
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
              <option value="unique" ${draft.code_mode === 'unique' ? 'selected' : ''}>仅系统唯一码</option>
              <option value="fields" ${draft.code_mode === 'fields' ? 'selected' : ''}>自定义拼接（唯一码可选）</option>
            </select>
          </label>
        </div>
        <details class="formula-help" style="margin-top:10px">
          <summary>公式说明与示例（点击展开）</summary>
          <ul class="muted" style="margin:8px 0 0;padding-left:18px;font-size:12px;line-height:1.6">
            ${(fieldMeta.formula_help || []).map((h) => `<li>${escapeHtml(h)}</li>`).join('') || `<li>${escapeHtml(FORMULA_HINT)}</li>`}
            ${(fieldMeta.formulas || []).filter((f) => f.value).slice(0, 18).map((f) =>
              `<li><code>${escapeHtml(f.value)}</code> — ${escapeHtml(f.label)}${f.hint ? `（${escapeHtml(f.hint)}）` : ''}</li>`
            ).join('')}
          </ul>
        </details>
        <datalist id="formulaDatalist">
          ${(fieldMeta.formulas || []).filter((f) => f.value).map((f) =>
            `<option value="${escapeHtml(f.value)}">${escapeHtml(f.label || f.value)}</option>`
          ).join('')}
        </datalist>
        <div id="codeSegBox" class="seg-builder" style="margin-top:10px"></div>
        <div class="editor-layout" style="margin-top:12px">
          <div class="palette">
            <button class="btn secondary" data-add="text" type="button">+ 固定文字</button>
            <button class="btn secondary" data-add="field" type="button">+ 绑定字段</button>
            <button class="btn secondary" data-add="code" type="button">+ 条码/二维码</button>
            <button class="btn" data-add="table" type="button">+ 表格</button>
            <p class="muted" style="font-size:12px;margin-top:10px">可用上方滑块放大画布；选中元素后拖动手柄缩放。表格内拖动单元格右边线调列宽、下边线调行高。</p>
            <p class="muted" style="font-size:12px">表格支持合并单元格；单元格内容可选文本或条码，并用订单列 + 任意字符 + 公式拼接。</p>
            <p class="muted" style="font-size:11px">${FORMULA_HINT}</p>
          </div>
          <div class="canvas-panel">
            <div class="canvas-toolbar">
              <span class="canvas-toolbar-label">画布缩放</span>
              <button class="btn secondary btn-icon" id="zoomOut" type="button" title="缩小">−</button>
              <input id="zoomRange" type="range" min="2" max="16" step="0.5" />
              <button class="btn secondary btn-icon" id="zoomIn" type="button" title="放大">+</button>
              <span class="muted" id="zoomLabel"></span>
              <button class="btn secondary" id="zoomFit" type="button">适应窗口</button>
              <button class="btn secondary" id="zoomReset" type="button">默认</button>
            </div>
            <div class="canvas-wrap" id="canvasWrap"><div class="label-canvas" id="labelCanvas"></div></div>
          </div>
          <div class="props" id="elProps"><p class="muted">选中元素后编辑属性</p></div>
        </div>
        <div class="row" style="margin-top:12px">
          <button class="btn" id="saveTplBtn" type="button">保存模板</button>
        </div>
      </div>
    `;

    const $ = (sel, el = host) => el.querySelector(sel);
    const $$ = (sel, el = host) => [...el.querySelectorAll(sel)];

    const ZOOM_MIN = 2;
    const ZOOM_MAX = 16;
    const ZOOM_DEFAULT = 6;
    const ZOOM_KEY = 'labelTplCanvasZoom';
    let canvasZoom = clampZoom(Number(localStorage.getItem(ZOOM_KEY) || ZOOM_DEFAULT));

    function clampZoom(v) {
      const n = Number(v);
      if (!Number.isFinite(n)) return ZOOM_DEFAULT;
      return Math.min(ZOOM_MAX, Math.max(ZOOM_MIN, Math.round(n * 2) / 2));
    }

    function setCanvasZoom(next, { persist = true, rerender = true } = {}) {
      canvasZoom = clampZoom(next);
      const range = $('#zoomRange');
      const label = $('#zoomLabel');
      if (range) range.value = String(canvasZoom);
      if (label) label.textContent = `${canvasZoom.toFixed(1)}×（约 ${Math.round(canvasZoom * 100 / 3.78)}% 实物）`;
      if (persist) {
        try { localStorage.setItem(ZOOM_KEY, String(canvasZoom)); } catch (_) {}
      }
      if (rerender) renderCanvas();
    }

    function fitCanvasZoom() {
      const wrap = $('#canvasWrap');
      if (!wrap) return;
      syncMeta();
      const pad = 48;
      const availW = Math.max(160, wrap.clientWidth - pad);
      const availH = Math.max(160, wrap.clientHeight - pad);
      const zW = availW / Math.max(1, draft.width_mm);
      const zH = availH / Math.max(1, draft.height_mm);
      setCanvasZoom(Math.min(zW, zH));
    }

    function syncMeta() {
      draft.name = $('#tplName').value;
      draft.width_mm = Number($('#tplW').value) || 100;
      draft.height_mm = Number($('#tplH').value) || 50;
      draft.code_type = $('#tplCodeType').value;
      draft.code_mode = $('#tplCodeMode').value;
    }

    function renderCodeSegBox() {
      const box = $('#codeSegBox');
      const idField = fieldMeta.scan_id_field || Expr.scanIdField(draft.label_type);
      if (draft.code_mode !== 'fields') {
        box.innerHTML = `<p class="muted">当前默认条码内容仅为系统唯一码 <code>${escapeHtml(idField)}</code>。单个码元素仍可自行配置拼接内容。</p>`;
        return;
      }
      draft.code_segments = Array.isArray(draft.code_segments) ? draft.code_segments : [];
      box.innerHTML = `
        <h4 style="margin:0 0 8px">条码内容拼接（唯一码可选；订单打印需含唯一码）</h4>
        <p class="muted" style="font-size:12px;margin:0 0 8px">唯一码字段：<code>${escapeHtml(idField)}</code>。可加订单字段、固定文字、今日（<code>__today__</code>）。含唯一码的模板才会出现在订单批次打印列表。</p>
        <div id="codeSegments"></div>
        <div class="row" style="margin-top:8px">
          <button class="btn secondary" id="addCodeScanId" type="button">+ 唯一码</button>
          <button class="btn secondary" id="addCodeField" type="button">+ 订单字段</button>
          <button class="btn secondary" id="addCodeText" type="button">+ 任意字符</button>
          <button class="btn secondary" id="addCodeSerial" type="button">+ 序列号</button>
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
      $('#addCodeScanId').onclick = () => {
        draft.code_segments = Expr.ensureScanIdInSegments(draft.code_segments, draft.label_type);
        renderCodeSegBox();
      };
      $('#addCodeField').onclick = () => {
        draft.code_segments.push({ type: 'field', field: fieldMeta.fields[0] || 'order_no', formula: '' });
        renderCodeSegBox();
      };
      $('#addCodeText').onclick = () => {
        draft.code_segments.push({ type: 'text', value: '-' });
        renderCodeSegBox();
      };
      $('#addCodeSerial').onclick = () => {
        draft.code_segments.push(defaultSerialSeg());
        renderCodeSegBox();
      };
    }


    function fieldLabel(name) {
      const f = String(name || '');
      if (f === '__today__' || f === '今日' || f === '今日日期' || f.toLowerCase() === 'today') return '今日日期 (__today__)';
      if (f === 'package_code') return '总包唯一码 (package_code)';
      if (f === 'child_code') return '配件唯一码 (child_code)';
      return f;
    }

    function isTodayFieldName(field) {
      const f = String(field || '').trim().toLowerCase();
      return f === '__today__' || f === 'today' || f === '今日' || f === '今日日期';
    }

    function fieldOptionsHtml(selected) {
      const list = fieldMeta.fields || [];
      const withToday = [...new Set(['__today__', ...list])];
      return withToday.map((f) => {
        const sel = f === (selected || '') ? 'selected' : '';
        return `<option value="${escapeHtml(f)}" ${sel}>${escapeHtml(fieldLabel(f))}</option>`;
      }).join('');
    }

    function formulaOptionsHtml(selected) {
      const list = fieldMeta.formulas || Expr.FORMULA_CATALOG || [];
      return list.map((f) => {
        const val = f.value || '';
        const sel = val === (selected || '') ? 'selected' : '';
        return `<option value="${escapeHtml(val)}" ${sel}>${escapeHtml(f.label || val || '无（原值）')}</option>`;
      }).join('');
    }

    function segmentEditorRow(seg, idx, onChange, onRemove) {
      const wrap = document.createElement('div');
      wrap.className = 'seg-row';
      const idField = fieldMeta.scan_id_field || Expr.scanIdField(draft.label_type);
      if (seg.type === 'text') {
        wrap.innerHTML = `
          <span class="tag info">字符</span>
          <input data-k="value" value="${escapeHtml(seg.value || '')}" placeholder="任意字符，如 - / _ 空格" />
          <button class="btn danger" type="button" data-rm>删</button>
        `;
      } else if (seg.type === 'serial') {
        const style = Expr.normalizeSerialStyle ? Expr.normalizeSerialStyle(seg.style) : (seg.style || 'numeric');
        wrap.innerHTML = `
          <span class="tag warn">序列号</span>
          <label class="muted" style="font-size:12px">连接符
            <input data-k="connector" value="${escapeHtml(seg.connector != null ? seg.connector : '-')}" placeholder="如 - / _" style="width:56px" title="主内容与序列号之间的字符，可留空" />
          </label>
          <label class="muted" style="font-size:12px">样式
            <select data-k="style" style="max-width:110px">
              <option value="numeric" ${style === 'numeric' ? 'selected' : ''}>数字 001</option>
              <option value="upper" ${style === 'upper' ? 'selected' : ''}>大写英文 AAA</option>
              <option value="lower" ${style === 'lower' ? 'selected' : ''}>小写英文 aaa</option>
              <option value="alnum" ${style === 'alnum' ? 'selected' : ''}>数字+大写 0-9A-Z</option>
            </select>
          </label>
          <label class="muted" style="font-size:12px">位数
            <input data-k="width" type="number" min="1" max="12" value="${Number(seg.width) || 3}" style="width:56px" />
          </label>
          <label class="muted" style="font-size:12px">起始
            <input data-k="start" value="${escapeHtml(seg.start != null ? seg.start : (style === 'upper' ? 'A' : style === 'lower' ? 'a' : '1'))}" placeholder="1 / A" style="width:64px" />
          </label>
          <span class="muted" style="font-size:11px">例 ${escapeHtml((Expr.formatSerialSeg && Expr.formatSerialSeg(seg, 0)) || '')}</span>
          <button class="btn danger" type="button" data-rm>删</button>
        `;
      } else {
        const isScanId = String(seg.field || '').toLowerCase() === String(idField).toLowerCase();
        const isToday = isTodayFieldName(seg.field);
        wrap.innerHTML = `
          <span class="tag ${isScanId ? 'warn' : (isToday ? 'info' : 'ok')}">${isScanId ? '唯一码' : (isToday ? '今日' : '字段')}</span>
          <select data-k="field">
            ${fieldOptionsHtml(seg.field)}
            ${seg.field && !(fieldMeta.fields || []).includes(seg.field) && seg.field !== '__today__' ? `<option value="${escapeHtml(seg.field)}" selected>${escapeHtml(seg.field)}</option>` : ''}
          </select>
          <input data-k="fieldManual" placeholder="或手输列名" value="" style="max-width:120px" />
          <select data-k="formulaPick" title="选择常用公式" style="max-width:160px">
            ${formulaOptionsHtml(seg.formula || '')}
          </select>
          <input data-k="formula" list="formulaDatalist" value="${escapeHtml(seg.formula || '')}" placeholder="公式，可空；今日可用 FORMAT(TODAY(),&quot;yyyy-mm-dd&quot;)" />
          <button class="btn danger" type="button" data-rm>删</button>
        `;
      }
      wrap.querySelectorAll('[data-k]').forEach((input) => {
        const evt = input.tagName === 'SELECT' ? 'change' : 'input';
        input.addEventListener(evt, () => {
          const next = { ...seg };
          if (input.dataset.k === 'fieldManual' && input.value.trim()) {
            next.field = input.value.trim();
          } else if (input.dataset.k === 'field') {
            next.field = input.value;
          } else if (input.dataset.k === 'formulaPick') {
            next.formula = input.value;
            const manual = wrap.querySelector('[data-k="formula"]');
            if (manual) manual.value = input.value;
          } else if (input.dataset.k === 'formula') {
            next.formula = input.value;
          } else if (input.dataset.k === 'value') {
            next.value = input.value;
          } else if (input.dataset.k === 'connector') {
            next.connector = input.value;
          } else if (input.dataset.k === 'style') {
            next.style = input.value;
          } else if (input.dataset.k === 'width') {
            next.width = Number(input.value) || 3;
          } else if (input.dataset.k === 'start') {
            next.start = input.value;
          }
          onChange(next);
          // live sample for serial
          if (next.type === 'serial') {
            const tip = wrap.querySelector('.muted[style*="font-size:11px"]');
            if (tip && Expr.formatSerialSeg) tip.textContent = '例 ' + Expr.formatSerialSeg(next, 0);
          }
        });
      });
      wrap.querySelector('[data-rm]').onclick = onRemove;
      return wrap;
    }

    function defaultSerialSeg() {
      return { type: 'serial', connector: '-', style: 'numeric', width: 3, start: '1' };
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

    function editorFontPx(pt) {
      // 与打印一致：1pt = 25.4/72 mm，画布 zoom = px/mm
      // 旧公式 /3.2 会把字画小约 11%，设计时看似铺满，打印却裁掉末行
      return Math.max(6, (Number(pt) || 10) * (25.4 / 72) * canvasZoom);
    }

    function renderCanvas() {
      syncMeta();
      const canvas = $('#labelCanvas');
      if (!canvas) return;
      const pxPerMm = canvasZoom;
      canvas.style.width = `${draft.width_mm * pxPerMm}px`;
      canvas.style.height = `${draft.height_mm * pxPerMm}px`;
      canvas.innerHTML = draft.elements.map((el) => {
        const selected = el.id === selectedElId ? 'selected' : '';
        if (el.type === 'table') {
          Expr.ensureTableLayout(el);
          const occupied = Expr.buildOccupiedMap(el.rows, el.cols, el.cells);
          const borderPx = Math.max(1, pxPerMm * 0.27);
          const usableHpx = Math.max(1, el.h * pxPerMm - borderPx * (el.rows + 1));
          let html = `<div class="label-el table ${selected}" data-id="${el.id}" style="left:${el.x * pxPerMm}px;top:${el.y * pxPerMm}px;width:${el.w * pxPerMm}px;height:${el.h * pxPerMm}px"><div class="el-body"><table class="label-table-edit"><colgroup>`;
          for (let c = 0; c < el.cols; c++) {
            html += `<col style="width:${el.colWidths[c]}%">`;
          }
          html += '</colgroup>';
          for (let r = 0; r < el.rows; r++) {
            const rowPx = ((Number(el.rowHeights[r]) || (100 / el.rows)) / 100) * usableHpx;
            html += `<tr style="height:${rowPx}px">`;
            for (let c = 0; c < el.cols; c++) {
              const cell = occupied[r][c];
              if (cell === 'skip') continue;
              const key = `${r},${c}`;
              const active = selectedElId === el.id && selectedCellKey === key ? 'cell-active' : '';
              const preview = Expr.segmentsPreview(cell.segments) || cell.contentType || '';
              const fs = editorFontPx(cell.fontSize || 10);
              const endCol = c + (cell.colspan || 1) - 1;
              const endRow = r + (cell.rowspan || 1) - 1;
              const colHandle = endCol < el.cols - 1
                ? `<span class="cell-resize col" data-col-boundary="${endCol}" title="拖动调整列宽"></span>`
                : '';
              const rowHandle = endRow < el.rows - 1
                ? `<span class="cell-resize row" data-row-boundary="${endRow}" title="拖动调整行高"></span>`
                : '';
              html += `<td class="${active}" data-cell="${key}" rowspan="${cell.rowspan || 1}" colspan="${cell.colspan || 1}" style="font-size:${fs}px">${escapeHtml(preview || '空')}${colHandle}${rowHandle}</td>`;
            }
            html += '</tr>';
          }
          html += `</table></div>${handlesHtml(!!selected)}</div>`;
          return html;
        }
        if (el.type === 'code') {
          const tip = el.showCodeText ? 'CODE<br/><span style="font-size:9px">内容</span>' : 'CODE';
          return `<div class="label-el code ${selected}" data-id="${el.id}" style="left:${el.x * pxPerMm}px;top:${el.y * pxPerMm}px;width:${el.w * pxPerMm}px;height:${el.h * pxPerMm}px"><div class="el-body" style="display:flex;flex-direction:column;align-items:center;justify-content:center;text-align:center;line-height:1.2">${tip}</div>${handlesHtml(!!selected)}</div>`;
        }
        const text = Expr.segmentsPreview(el.segments) || el.text || '';
        const fs = editorFontPx(el.fontSize || 12);
        return `<div class="label-el ${selected}" data-id="${el.id}" style="left:${el.x * pxPerMm}px;top:${el.y * pxPerMm}px;width:${el.w * pxPerMm}px;height:${el.h * pxPerMm}px;font-size:${fs}px;text-align:${el.align || 'left'};font-weight:${el.bold ? 700 : 400}"><div class="el-body">${escapeHtml(text)}</div>${handlesHtml(!!selected)}</div>`;
      }).join('');

      $$('.label-el', canvas).forEach((node) => {
        node.addEventListener('mousedown', (ev) => {
          if (ev.target.closest('[data-resize], .cell-resize')) return;
          startDrag(ev, node, pxPerMm);
        });
        node.addEventListener('click', (ev) => {
          if (ev.target.closest('[data-resize], .cell-resize')) return;
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
        $$('[data-col-boundary]', node).forEach((handle) => {
          handle.addEventListener('mousedown', (ev) => {
            ev.preventDefault();
            ev.stopPropagation();
            startCellAxisResize(ev, node, 'col', Number(handle.dataset.colBoundary));
          });
        });
        $$('[data-row-boundary]', node).forEach((handle) => {
          handle.addEventListener('mousedown', (ev) => {
            ev.preventDefault();
            ev.stopPropagation();
            startCellAxisResize(ev, node, 'row', Number(handle.dataset.rowBoundary));
          });
        });
      });
    }

    function syncCellLayoutInputs(el) {
      if (!el || el.type !== 'table') return;
      Expr.ensureTableLayout(el);
      const [cr, cc] = (selectedCellKey || '0,0').split(',').map(Number);
      const colInput = $('#cellColW');
      const rowInput = $('#cellRowH');
      if (colInput && Number.isFinite(cc)) colInput.value = el.colWidths[cc]?.toFixed(1) || '';
      if (rowInput && Number.isFinite(cr)) rowInput.value = el.rowHeights[cr]?.toFixed(1) || '';
      const hint = $('#cellLayoutHint');
      if (hint) {
        hint.textContent = `列宽 ${el.colWidths.map((v) => v.toFixed(0) + '%').join(' / ')}；行高 ${el.rowHeights.map((v) => v.toFixed(0) + '%').join(' / ')}`;
      }
    }

    function applyTableLayoutStyles(node, el) {
      Expr.ensureTableLayout(el);
      const cols = $$('col', node);
      cols.forEach((col, i) => {
        if (el.colWidths[i] != null) col.style.width = `${el.colWidths[i]}%`;
      });
      const rows = $$('tr', node);
      rows.forEach((tr, i) => {
        if (el.rowHeights[i] != null) tr.style.height = `${el.rowHeights[i]}%`;
      });
    }

    function startCellAxisResize(ev, node, axis, boundary) {
      const el = draft.elements.find((e) => e.id === node.dataset.id);
      if (!el || el.type !== 'table') return;
      Expr.ensureTableLayout(el);
      const tableEl = node.querySelector('.label-table-edit');
      if (!tableEl) return;
      selectedElId = el.id;
      const start = axis === 'col' ? ev.clientX : ev.clientY;
      const totalPx = axis === 'col' ? tableEl.getBoundingClientRect().width : tableEl.getBoundingClientRect().height;
      if (totalPx <= 0) return;
      const arr = axis === 'col' ? el.colWidths.slice() : el.rowHeights.slice();
      if (boundary < 0 || boundary >= arr.length - 1) return;
      const a0 = arr[boundary];
      const b0 = arr[boundary + 1];
      const pair = a0 + b0;
      const minPct = 5;
      ev.target.classList.add('active');
      node.classList.add('resizing');
      const onMove = (e2) => {
        const deltaPx = (axis === 'col' ? e2.clientX - start : e2.clientY - start);
        const deltaPct = (deltaPx / totalPx) * 100;
        let a = Math.max(minPct, Math.min(pair - minPct, a0 + deltaPct));
        let b = pair - a;
        arr[boundary] = a;
        arr[boundary + 1] = b;
        if (axis === 'col') el.colWidths = arr.slice();
        else el.rowHeights = arr.slice();
        applyTableLayoutStyles(node, el);
        syncCellLayoutInputs(el);
      };
      const onUp = () => {
        ev.target.classList.remove('active');
        node.classList.remove('resizing');
        window.removeEventListener('mousemove', onMove);
        window.removeEventListener('mouseup', onUp);
        renderCanvas();
        renderProps();
      };
      window.addEventListener('mousemove', onMove);
      window.addEventListener('mouseup', onUp);
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
        Expr.ensureTableLayout(el);
        const [cr, cc] = (selectedCellKey || '0,0').split(',').map(Number);
        let cell = el.cells.find((c) => c.r === cr && c.c === cc);
        if (!cell) {
          selectedCellKey = '0,0';
          cell = el.cells.find((c) => c.r === 0 && c.c === 0);
        }
        const colW = el.colWidths[cell.c] ?? (100 / el.cols);
        const rowH = el.rowHeights[cell.r] ?? (100 / el.rows);
        box.innerHTML = `
          <h4>表格属性</h4>
          <p class="size-hint">表格外框拖动手柄调整；单元格拖右边线调列宽、下边线调行高。<br/>当前外框 <strong id="elSizeHint">${fmtMm(el.w)} × ${fmtMm(el.h)} mm</strong></p>
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
          <p class="muted" id="cellLayoutHint" style="font-size:12px;margin:0 0 8px">列宽 ${el.colWidths.map((v) => v.toFixed(0) + '%').join(' / ')}；行高 ${el.rowHeights.map((v) => v.toFixed(0) + '%').join(' / ')}</p>
          <div class="grid-2">
            <label class="field"><span>本列宽 %</span><input id="cellColW" type="number" min="5" max="95" step="0.5" value="${colW.toFixed(1)}" /></label>
            <label class="field"><span>本行高 %</span><input id="cellRowH" type="number" min="5" max="95" step="0.5" value="${rowH.toFixed(1)}" /></label>
          </div>
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
          <label class="field"><span><input type="checkbox" id="cellShowCodeText" ${cell.showCodeText ? 'checked' : ''}/> 码下方显示内容文字（二维码/一维码）</span></label>
          <div class="grid-2" id="cellCodeTextOpts" style="${cell.showCodeText ? '' : 'display:none'}">
            <label class="field"><span>内容字号 pt</span><input id="cellCodeTextSize" type="number" min="5" max="36" value="${cell.codeTextFontSize || 7}" /></label>
            <label class="field"><span>内容对齐</span>
              <select id="cellCodeTextAlign">
                <option value="left" ${cell.codeTextAlign === 'left' ? 'selected' : ''}>左</option>
                <option value="center" ${(cell.codeTextAlign || 'center') === 'center' ? 'selected' : ''}>中</option>
                <option value="right" ${cell.codeTextAlign === 'right' ? 'selected' : ''}>右</option>
              </select>
            </label>
            <label class="field"><span><input type="checkbox" id="cellCodeTextBold" ${cell.codeTextBold ? 'checked' : ''}/> 内容加粗</span></label>
            <label class="field"><span>最大字符（0=不限）</span><input id="cellCodeTextMax" type="number" min="0" max="200" value="${cell.codeTextMaxLen || 0}" /></label>
          </div>
          <h4 style="margin-top:10px">内容拼接</h4>
          <div id="cellSegs"></div>
          <div class="row" style="margin-top:8px">
            <button class="btn secondary" id="addCellScanId" type="button">+ 唯一码</button>
            <button class="btn secondary" id="addCellField" type="button">+ 订单字段</button>
            <button class="btn secondary" id="addCellText" type="button">+ 任意字符</button>
            <button class="btn secondary" id="addCellSerial" type="button">+ 序列号</button>
            <button class="btn" id="applyCell" type="button">应用单元格</button>
          </div>
          <div class="muted" style="margin-top:6px">预览：<code id="cellPreview"></code></div>
          <div class="row" style="margin-top:12px"><button class="btn danger" id="delEl" type="button">删除表格</button></div>
        `;
        $('#cellAlign').value = cell.align || 'center';
        if ($('#cellShowCodeText')) {
          $('#cellShowCodeText').onchange = () => {
            const on = $('#cellShowCodeText').checked;
            const box = $('#cellCodeTextOpts');
            if (box) box.style.display = on ? '' : 'none';
          };
        }
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
          const prevRows = el.rows;
          el.rows = Math.max(1, Number($('#tRows').value) || 1);
          el.cols = Math.max(1, Number($('#tCols').value) || 1);
          el.x = Number($('#elX').value);
          el.y = Number($('#elY').value);
          el.colWidths = Expr.resizePercents(el.colWidths, el.cols);
          el.rowHeights = Expr.resizePercents(el.rowHeights, el.rows);
          // 行数增加时自动增高表格，避免多行挤在原高度里看不见
          if (el.rows > prevRows) {
            const perRow = Math.max(4, (el.h || 40) / Math.max(1, prevRows));
            el.h = Math.min(draft.height_mm - el.y, Math.max(el.h || 40, perRow * el.rows));
          }
          // drop cells outside
          el.cells = (el.cells || []).filter((c) => c.r < el.rows && c.c < el.cols);
          Expr.ensureTableLayout(el);
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
        $('#addCellScanId').onclick = () => {
          cell.segments = Expr.ensureScanIdInSegments(cell.segments || [], draft.label_type);
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
        $('#addCellSerial').onclick = () => {
          cell.segments = cell.segments || [];
          cell.segments.push(defaultSerialSeg());
          renderProps();
        };
        $('#applyCell').onclick = () => {
          cell.contentType = $('#cellType').value;
          cell.fontSize = Number($('#cellSize').value) || 10;
          cell.align = $('#cellAlign').value;
          cell.bold = $('#cellBold').checked;
          cell.showCodeText = !!( $('#cellShowCodeText') && $('#cellShowCodeText').checked );
          cell.codeTextFontSize = Number($('#cellCodeTextSize')?.value) || 7;
          cell.codeTextAlign = $('#cellCodeTextAlign')?.value || 'center';
          cell.codeTextBold = !!( $('#cellCodeTextBold') && $('#cellCodeTextBold').checked );
          cell.codeTextMaxLen = Number($('#cellCodeTextMax')?.value) || 0;
          if ($('#cellColW')) {
            el.colWidths = Expr.setPercentAt(el.colWidths, cell.c, Number($('#cellColW').value), el.cols);
          }
          if ($('#cellRowH')) {
            el.rowHeights = Expr.setPercentAt(el.rowHeights, cell.r, Number($('#cellRowH').value), el.rows);
          }
          Expr.ensureTableLayout(el);
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
          </label>
          <label class="field"><span><input type="checkbox" id="elShowCodeText" ${el.showCodeText ? 'checked' : ''}/> 在码下方显示内容文字</span></label>
          <div class="grid-2" id="elCodeTextOpts" style="${el.showCodeText ? '' : 'display:none'}">
            <label class="field"><span>内容字号 pt</span><input id="elCodeTextSize" type="number" min="5" max="36" value="${el.codeTextFontSize || 8}" /></label>
            <label class="field"><span>内容对齐</span>
              <select id="elCodeTextAlign">
                <option value="left" ${el.codeTextAlign === 'left' ? 'selected' : ''}>左</option>
                <option value="center" ${(el.codeTextAlign || 'center') === 'center' ? 'selected' : ''}>中</option>
                <option value="right" ${el.codeTextAlign === 'right' ? 'selected' : ''}>右</option>
              </select>
            </label>
            <label class="field"><span><input type="checkbox" id="elCodeTextBold" ${el.codeTextBold ? 'checked' : ''}/> 内容加粗</span></label>
            <label class="field"><span>最大字符（0=不限）</span><input id="elCodeTextMax" type="number" min="0" max="200" value="${el.codeTextMaxLen || 0}" /></label>
          </div>` : `
          <label class="field"><span>字号</span><input id="elSize" type="number" value="${el.fontSize || 12}" /></label>
          <label class="field"><span>对齐</span>
            <select id="elAlign"><option value="left">左</option><option value="center">中</option><option value="right">右</option></select>
          </label>
          <label class="field"><span><input type="checkbox" id="elBold" ${el.bold ? 'checked' : ''}/> 加粗</span></label>
        `}
        <h4 style="margin-top:10px">内容拼接（订单列 / 任意字符 / 公式）</h4>
        <div id="elSegs"></div>
        <div class="row" style="margin-top:8px">
          <button class="btn secondary" id="addElScanId" type="button">+ 唯一码</button>
          <button class="btn secondary" id="addElField" type="button">+ 订单字段</button>
          <button class="btn secondary" id="addElText" type="button">+ 任意字符</button>
          <button class="btn secondary" id="addElSerial" type="button">+ 序列号</button>
          <button class="btn" id="applyEl" type="button">应用</button>
          <button class="btn danger" id="delEl" type="button">删除</button>
        </div>
        <div class="muted" style="margin-top:6px">预览：<code id="elPreview"></code></div>
      `;
      if ($('#elAlign')) $('#elAlign').value = el.align || 'left';
      if ($('#elShowCodeText')) {
        $('#elShowCodeText').onchange = () => {
          const on = $('#elShowCodeText').checked;
          const box = $('#elCodeTextOpts');
          if (box) box.style.display = on ? '' : 'none';
        };
      }
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
      $('#addElScanId').onclick = () => {
        el.segments = Expr.ensureScanIdInSegments(el.segments || [], draft.label_type);
        renderProps();
      };
      $('#addElField').onclick = () => {
        el.segments.push({ type: 'field', field: fieldMeta.fields[0] || 'order_no', formula: '' });
        renderProps();
      };
      $('#addElText').onclick = () => {
        el.segments.push({ type: 'text', value: '-' });
        renderProps();
      };
      $('#addElSerial').onclick = () => {
        el.segments.push(defaultSerialSeg());
        renderProps();
      };
      $('#applyEl').onclick = () => {
        el.x = Number($('#elX').value);
        el.y = Number($('#elY').value);
        if (el.type === 'code') {
          el.codeType = $('#elCodeType').value;
          el.showCodeText = !!( $('#elShowCodeText') && $('#elShowCodeText').checked );
          el.codeTextFontSize = Number($('#elCodeTextSize')?.value) || 8;
          el.codeTextAlign = $('#elCodeTextAlign')?.value || 'center';
          el.codeTextBold = !!( $('#elCodeTextBold') && $('#elCodeTextBold').checked );
          el.codeTextMaxLen = Number($('#elCodeTextMax')?.value) || 0;
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
      draft.code_segments = Array.isArray(draft.code_segments) ? draft.code_segments : [];
      draft.elements = (draft.elements || []).map((el) => {
        const copy = { ...el };
        return copy;
      });
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

    $('#zoomOut').onclick = () => setCanvasZoom(canvasZoom - 0.5);
    $('#zoomIn').onclick = () => setCanvasZoom(canvasZoom + 0.5);
    $('#zoomRange').oninput = (ev) => setCanvasZoom(ev.target.value);
    $('#zoomFit').onclick = () => fitCanvasZoom();
    $('#zoomReset').onclick = () => setCanvasZoom(ZOOM_DEFAULT);

    renderCodeSegBox();
    setCanvasZoom(canvasZoom, { persist: false, rerender: true });
  }

  global.openTemplateEditor = openTemplateEditor;
})(window);
