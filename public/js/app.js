(() => {
  const $ = (sel, el = document) => el.querySelector(sel);
  const $$ = (sel, el = document) => [...el.querySelectorAll(sel)];

  const state = {
    page: 'home',
    currentPackageId: null,
    templateDraft: null,
    selectedElId: null
  };

  const ROLE_MENUS = {
    admin: ['home', 'bom', 'orders', 'count', 'templates', 'print', 'scan', 'history'],
    importer: ['home', 'bom', 'orders', 'count', 'templates', 'print', 'history'],
    scanner: ['home', 'scan', 'history']
  };

  const PAGE_LABELS = {
    home: '首页',
    bom: 'BOM 管理',
    orders: '订单关联',
    count: '计数订单',
    templates: '标签模板',
    print: '生成打印',
    scan: '扫码',
    history: '记录报表'
  };

  function flash(container, message, type = 'info') {
    if (!container) return;
    container.innerHTML = `<div class="flash ${type}">${escapeHtml(message)}</div>`;
  }

  function escapeHtml(str) {
    return String(str ?? '').replace(/[&<>"']/g, (c) => ({
      '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;'
    }[c]));
  }

  function statusTag(status) {
    const map = {
      unscanned: ['未扫', 'muted'],
      scanning: ['扫码中', 'info'],
      complete: ['已齐套', 'ok'],
      shortage: ['有缺漏', 'warn'],
      pending: ['待处理', 'muted'],
      success: ['成功', 'ok'],
      failed: ['失败', 'fail'],
      unmatched: ['未匹配', 'warn'],
      draft: ['草稿', 'muted'],
      associated: ['已关联', 'info'],
      labelled: ['已生成标签', 'ok'],
      ready: ['可计数', 'info'],
      done: ['已完成', 'ok'],
      counting: ['计数中', 'info'],
      skipped: ['已跳过', 'muted']
    };
    const [text, cls] = map[status] || [status, 'muted'];
    return `<span class="tag ${cls}">${text}</span>`;
  }

  function canImport() {
    return API.user && (API.user.role === 'admin' || API.user.role === 'importer');
  }

  async function boot() {
    $('#loginForm').addEventListener('submit', onLogin);
    $('#logoutBtn').addEventListener('click', onLogout);
    if (API.token) {
      try {
        const data = await API.get('/auth/me');
        API.user = data.user;
        showApp();
      } catch {
        API.setToken('');
        showLogin();
      }
    } else {
      showLogin();
    }
  }

  async function onLogin(e) {
    e.preventDefault();
    const fd = new FormData(e.target);
    try {
      const data = await API.post('/auth/login', {
        username: fd.get('username'),
        password: fd.get('password')
      });
      API.setToken(data.token);
      API.user = data.user;
      showApp();
    } catch (err) {
      flash($('#loginFlash'), err.message, 'error');
    }
  }

  async function onLogout() {
    try { await API.post('/auth/logout', { token: API.token }); } catch {}
    API.setToken('');
    API.user = null;
    showLogin();
  }

  function showLogin() {
    $('#loginView').classList.remove('hidden');
    $('#appView').classList.add('hidden');
  }

  function showApp() {
    $('#loginView').classList.add('hidden');
    $('#appView').classList.remove('hidden');
    $('#userInfo').textContent = `${API.user.display_name}（${roleName(API.user.role)}）`;
    renderNav();
    const menus = ROLE_MENUS[API.user.role] || ROLE_MENUS.scanner;
    state.page = menus.includes('home') ? 'home' : menus[0];
    const toggle = $('#menuToggle');
    if (toggle && !toggle.dataset.bound) {
      toggle.dataset.bound = '1';
      toggle.addEventListener('click', () => {
        $('#mainNav')?.classList.toggle('mobile-open');
      });
    }
    navigate(state.page);
  }

  function roleName(role) {
    return { admin: '管理员', importer: '导入打印', scanner: '扫码入库' }[role] || role;
  }

  function renderNav() {
    const menus = ROLE_MENUS[API.user.role] || [];
    $('#mainNav').innerHTML = menus.map((p) =>
      `<button type="button" data-page="${p}" class="${state.page === p ? 'active' : ''}">${PAGE_LABELS[p]}</button>`
    ).join('');
    $$('#mainNav button').forEach((btn) => {
      btn.addEventListener('click', () => {
        $('#mainNav')?.classList.remove('mobile-open');
        navigate(btn.dataset.page);
      });
    });
  }

  function checkboxList(id, options, selected = []) {
    const selectedSet = new Set(selected);
    return `<div class="check-list" id="${id}">
      ${(options || []).map((opt, i) => {
        const val = typeof opt === 'string' ? opt : opt.value;
        const label = typeof opt === 'string' ? opt : (opt.label || opt.value);
        const checked = selectedSet.has(val) ? 'checked' : '';
        return `<label class="check-item"><input type="checkbox" value="${escapeHtml(val)}" ${checked}/> <span>${escapeHtml(label)}</span></label>`;
      }).join('') || '<span class="muted">暂无可选列</span>'}
    </div>`;
  }

  function checkedValues(listEl) {
    if (!listEl) return [];
    return [...listEl.querySelectorAll('input[type="checkbox"]:checked')].map((x) => x.value);
  }

  async function navigate(page) {
    state.page = page;
    renderNav();
    const root = $('#pageRoot');
    root.innerHTML = '<div class="card">加载中…</div>';
    try {
      if (page === 'home') await renderHome(root);
      else if (page === 'bom') await renderBom(root);
      else if (page === 'orders') await renderOrders(root);
      else if (page === 'count') await renderCount(root);
      else if (page === 'templates') await renderTemplates(root);
      else if (page === 'print') await renderPrint(root);
      else if (page === 'scan') await renderScan(root);
      else if (page === 'history') await renderHistory(root);
    } catch (err) {
      root.innerHTML = `<div class="card"><div class="flash error">${escapeHtml(err.message)}</div></div>`;
    }
  }

  async function renderHome(root) {
    const [boms, batches, packages] = await Promise.all([
      canImport() ? API.get('/boms') : Promise.resolve({ items: [] }),
      canImport() ? API.get('/batches') : Promise.resolve({ items: [] }),
      API.get('/scan/packages')
    ]);
    const pkg = packages.items || [];
    const complete = pkg.filter((p) => p.status === 'complete').length;
    const shortage = pkg.filter((p) => p.status === 'shortage').length;
    const scanning = pkg.filter((p) => p.status === 'scanning').length;

    root.innerHTML = `
      <div class="card">
        <h2>工作台</h2>
        <p class="muted">按流程：上传 BOM → 导入总包/配件订单并关联 → 生成打印标签 → 扫码入库校验。</p>
        <div class="stat-grid" style="margin-top:14px">
          <div class="stat"><div class="n">${boms.items?.length || 0}</div><div class="l">BOM 版本</div></div>
          <div class="stat"><div class="n">${batches.items?.length || 0}</div><div class="l">订单批次</div></div>
          <div class="stat"><div class="n">${complete}</div><div class="l">已齐套总包</div></div>
          <div class="stat"><div class="n">${shortage + scanning}</div><div class="l">进行中/缺漏</div></div>
        </div>
      </div>
      <div class="card">
        <h3>快捷入口</h3>
        <div class="row">
          ${canImport() ? '<button class="btn" data-go="bom">上传 BOM</button><button class="btn secondary" data-go="orders">导入订单关联</button><button class="btn secondary" data-go="print">生成打印</button>' : ''}
          <button class="btn" data-go="scan">开始扫码</button>
          <button class="btn secondary" data-go="history">查看记录</button>
        </div>
      </div>
    `;
    $$('[data-go]', root).forEach((b) => b.addEventListener('click', () => navigate(b.dataset.go)));
  }

  // ---------------- BOM ----------------
  async function renderBom(root) {
    const list = await API.get('/boms');
    const rules = await API.get('/mappings?file_type=bom');
    root.innerHTML = `
      <div class="card">
        <h2>BOM 管理</h2>
        <p class="muted">支持 ERP 风格 BOM：含母件行（物料类型=母件）与子件行。上传后选择 BOM单号即可导入。</p>
        <div id="bomFlash"></div>
        <div class="grid-2">
          <div>
            <h3>上传 BOM</h3>
            <p class="muted" style="margin:0 0 10px;font-size:13px">
              模板含：BOM单号、顺序号、物料代码/名称、规格型号、物料类型、辅助属性、单位/用量、费用、损耗率、发料仓库、备注、审核状态等。第一行填母件信息，后续行填子件。
            </p>
            <div class="row" style="margin-bottom:10px">
              <a class="btn secondary" href="/templates/bom_import_template.xlsx" download>下载 BOM 导入模板</a>
            </div>
            <label class="field"><span>Excel 文件</span><input type="file" id="bomFile" accept=".xlsx,.xls" /></label>
            <div class="row" style="margin-top:10px">
              <button class="btn secondary" id="bomPreviewBtn" type="button">预览并映射</button>
            </div>
            <div id="bomMapBox" class="hidden" style="margin-top:12px"></div>
          </div>
          <div>
            <h3>已保存映射规则</h3>
            <div class="table-wrap">
              <table>
                <thead><tr><th>名称</th><th>默认</th><th></th></tr></thead>
                <tbody>
                  ${(rules.items || []).map((r) => `
                    <tr>
                      <td>${escapeHtml(r.name)}</td>
                      <td>${r.is_default ? '是' : ''}</td>
                      <td><button class="btn secondary" data-apply-rule='${escapeHtml(JSON.stringify(r))}' type="button">使用</button></td>
                    </tr>`).join('') || '<tr><td colspan="3">暂无</td></tr>'}
                </tbody>
              </table>
            </div>
          </div>
        </div>
      </div>
      <div class="card">
        <h3>BOM 列表</h3>
        <div class="table-wrap">
          <table>
            <thead><tr><th>名称</th><th>母件料号</th><th>版本</th><th>子件数</th><th>上传时间</th><th></th></tr></thead>
            <tbody>
              ${(list.items || []).map((b) => `
                <tr>
                  <td>${escapeHtml(b.name)}</td>
                  <td>${escapeHtml(b.mother_part_no)}</td>
                  <td>${escapeHtml(b.version_label)}</td>
                  <td>${b.line_count}</td>
                  <td>${escapeHtml(b.created_at)}</td>
                  <td>
                    <button class="btn secondary" data-view="${b.id}" type="button">查看</button>
                    <button class="btn danger" data-del="${b.id}" type="button">删除</button>
                  </td>
                </tr>`).join('') || '<tr><td colspan="6">暂无 BOM</td></tr>'}
            </tbody>
          </table>
        </div>
        <div id="bomDetail" style="margin-top:12px"></div>
      </div>
    `;

    let previewHeaders = [];
    let appliedRule = rules.items?.find((r) => r.is_default) || null;

    $('#bomPreviewBtn', root).addEventListener('click', async () => {
      const file = $('#bomFile', root).files[0];
      if (!file) return flash($('#bomFlash', root), '请选择文件', 'error');
      const fd = new FormData();
      fd.append('file', file);
      try {
        const data = await API.upload('/boms/preview', fd);
        previewHeaders = data.headers;
        renderBomMapper(data, appliedRule);
        flash($('#bomFlash', root), `已解析 ${data.total_rows} 行`, 'success');
      } catch (err) {
        flash($('#bomFlash', root), err.message, 'error');
      }
    });

    function renderBomMapper(data, rule) {
      const map = rule?.mapping || {};
      const matchFields = rule?.match_fields || [];
      const sug = data.suggested || {};
      const erpMode = data.import_mode === 'erp' && (data.bom_groups || []).length;
      const opts = (selected) => previewHeaders.map((h) =>
        `<option value="${escapeHtml(h)}" ${h === selected ? 'selected' : ''}>${escapeHtml(h)}</option>`
      ).join('');
      const defaultMatch = matchFields.length
        ? matchFields
        : [sug.part_no, sug.spec, sug.aux].filter(Boolean);
      const box = $('#bomMapBox', root);
      box.classList.remove('hidden');

      if (erpMode) {
        box.innerHTML = `
          <div class="flash info">已识别 ERP 风格 BOM（含 BOM单号 + 物料类型）。请选择要导入的 BOM单号；母件信息来自「物料类型=母件」那一行。</div>
          <label class="field"><span>名称</span><input id="bomName" value="${escapeHtml(data.filename)}" /></label>
          <label class="field"><span>版本说明</span><input id="bomVersion" placeholder="如 2026-08-04 上午版" /></label>
          <label class="field"><span>选择 BOM单号（将导入其母件+子件）</span>
            <select id="mapBomNo">
              ${(data.bom_groups || []).map((g) => `
                <option value="${escapeHtml(g.bom_no)}" ${map.bom_no_value === g.bom_no ? 'selected' : ''}>
                  ${escapeHtml(g.bom_no)} ｜ 母件 ${escapeHtml(g.mother_part_no)} ${escapeHtml(g.mother_name || '')} ｜ 子件 ${g.child_count} 行
                </option>`).join('')}
            </select>
          </label>
          <div id="motherInfoBox" class="muted" style="margin:8px 0;font-size:13px"></div>
          <div class="grid-3" style="margin-top:8px">
            <label class="field"><span>物料代码列</span><select id="mapPart"><option value="">请选择</option>${opts(map.part_no || sug.part_no)}</select></label>
            <label class="field"><span>用量列</span><select id="mapQty"><option value="">默认 1</option>${opts(map.qty || sug.qty)}</select></label>
            <label class="field"><span>物料类型列</span><select id="mapType"><option value="">请选择</option>${opts(map.material_type || sug.material_type)}</select></label>
          </div>
          <div class="grid-2" style="margin-top:8px">
            <label class="field"><span>规格型号列（匹配用，可选）</span><select id="mapSpec"><option value="">无</option>${opts(map.spec || sug.spec)}</select></label>
            <label class="field"><span>辅助属性列（匹配用，可选）</span><select id="mapAux"><option value="">无</option>${opts(map.aux || sug.aux)}</select></label>
          </div>
          <label class="field" style="margin-top:8px"><span>参与匹配的列（可多选，需与配件订单一致）</span>
            <select id="mapMatch" multiple size="6">${previewHeaders.map((h) =>
              `<option value="${escapeHtml(h)}" ${defaultMatch.includes(h) ? 'selected' : ''}>${escapeHtml(h)}</option>`
            ).join('')}</select>
          </label>
          <label class="field" style="margin-top:8px"><span><input type="checkbox" id="saveRule" checked /> 保存为映射规则</span></label>
          <label class="field"><span><input type="checkbox" id="setDefault" checked /> 设为该类型默认规则</span></label>
          <div class="row" style="margin-top:10px"><button class="btn" id="bomImportBtn" type="button">确认导入</button></div>
          <div class="table-wrap" style="margin-top:12px;max-height:320px;overflow:auto">
            <table><thead><tr>${data.headers.map((h) => `<th>${escapeHtml(h)}</th>`).join('')}</tr></thead>
            <tbody>${data.preview_rows.map((r) => `<tr>${data.headers.map((h) => `<td>${escapeHtml(r[h])}</td>`).join('')}</tr>`).join('')}</tbody>
            </table>
          </div>
        `;

        const refreshMotherInfo = () => {
          const bomNo = $('#mapBomNo', box).value;
          const g = (data.bom_groups || []).find((x) => x.bom_no === bomNo);
          if (!g) {
            $('#motherInfoBox', box).textContent = '';
            return;
          }
          $('#motherInfoBox', box).innerHTML = `
            <strong>母件信息预览：</strong>
            代码 ${escapeHtml(g.mother_part_no)} ｜
            名称 ${escapeHtml(g.mother_name || '-')} ｜
            规格 ${escapeHtml(g.mother_spec || '-')} ｜
            子件 ${g.child_count} 行
          `;
        };
        $('#mapBomNo', box).addEventListener('change', refreshMotherInfo);
        refreshMotherInfo();

        $('#bomImportBtn', box).addEventListener('click', async () => {
          const file = $('#bomFile', root).files[0];
          const matchSel = [...$('#mapMatch', box).selectedOptions].map((o) => o.value);
          const mapping = {
            mode: 'erp',
            bom_no: sug.bom_no || 'BOM单号',
            bom_no_value: $('#mapBomNo', box).value,
            material_type: $('#mapType', box).value,
            part_no: $('#mapPart', box).value,
            qty: $('#mapQty', box).value || null,
            spec: $('#mapSpec', box).value || null,
            aux: $('#mapAux', box).value || null,
            match_fields: matchSel,
            save_rule: $('#saveRule', box).checked,
            set_default: $('#setDefault', box).checked,
            rule_name: `BOM-ERP-${$('#bomName', box).value}`
          };
          const fd = new FormData();
          fd.append('file', file);
          fd.append('name', $('#bomName', box).value);
          fd.append('version_label', $('#bomVersion', box).value);
          fd.append('mapping', JSON.stringify(mapping));
          try {
            const res = await API.upload('/boms/import', fd);
            flash($('#bomFlash', root), `导入成功：BOM ${res.bom_no || ''} 母件 ${res.mother_part_no}（子件 ${res.line_count} 行）`, 'success');
            navigate('bom');
          } catch (err) {
            flash($('#bomFlash', root), err.message, 'error');
          }
        });
        return;
      }

      // simple fallback
      box.innerHTML = `
        <label class="field"><span>名称</span><input id="bomName" value="${escapeHtml(data.filename)}" /></label>
        <label class="field"><span>版本说明</span><input id="bomVersion" placeholder="如 2026-08-04 上午版" /></label>
        <div class="grid-2" style="margin-top:8px">
          <label class="field"><span>1. 哪一列是母件列</span><select id="mapMother"><option value="">请选择</option>${opts(map.mother_part_no || sug.mother_part_no || sug.part_no)}</select></label>
          <label class="field"><span>2. 本 BOM 的母件是哪个</span><select id="mapMotherValue"><option value="">请先选择母件列</option></select></label>
        </div>
        <div class="grid-2" style="margin-top:8px">
          <label class="field"><span>子件料号/物料代码列</span><select id="mapPart"><option value="">请选择</option>${opts(map.part_no || sug.part_no)}</select></label>
          <label class="field"><span>数量/用量列（可选）</span><select id="mapQty"><option value="">默认 1</option>${opts(map.qty || sug.qty)}</select></label>
        </div>
        <label class="field" style="margin-top:8px"><span>参与匹配的列（可多选）</span>
          <select id="mapMatch" multiple size="5">${previewHeaders.map((h) =>
            `<option value="${escapeHtml(h)}" ${defaultMatch.includes(h) ? 'selected' : ''}>${escapeHtml(h)}</option>`
          ).join('')}</select>
        </label>
        <label class="field" style="margin-top:8px"><span><input type="checkbox" id="saveRule" checked /> 保存为映射规则</span></label>
        <label class="field"><span><input type="checkbox" id="setDefault" /> 设为该类型默认规则</span></label>
        <div class="row" style="margin-top:10px"><button class="btn" id="bomImportBtn" type="button">确认导入</button></div>
        <div class="table-wrap" style="margin-top:12px">
          <table><thead><tr>${data.headers.map((h) => `<th>${escapeHtml(h)}</th>`).join('')}</tr></thead>
          <tbody>${data.preview_rows.map((r) => `<tr>${data.headers.map((h) => `<td>${escapeHtml(r[h])}</td>`).join('')}</tr>`).join('')}</tbody>
          </table>
        </div>
      `;

      const refreshMotherValues = () => {
        const col = $('#mapMother', box).value;
        const sel = $('#mapMotherValue', box);
        const values = (col && data.distinct_by_column?.[col]) || [];
        const preferred = map.mother_value || (values.length === 1 ? values[0] : '');
        sel.innerHTML = values.length
          ? values.map((v) => `<option value="${escapeHtml(v)}" ${v === preferred ? 'selected' : ''}>${escapeHtml(v)}</option>`).join('')
          : '<option value="">该列没有可用母件值</option>';
      };
      $('#mapMother', box).addEventListener('change', refreshMotherValues);
      refreshMotherValues();

      $('#bomImportBtn', box).addEventListener('click', async () => {
        const file = $('#bomFile', root).files[0];
        const matchSel = [...$('#mapMatch', box).selectedOptions].map((o) => o.value);
        const mapping = {
          mode: 'simple',
          mother_part_no: $('#mapMother', box).value,
          mother_value: $('#mapMotherValue', box).value,
          part_no: $('#mapPart', box).value,
          qty: $('#mapQty', box).value || null,
          material_type: sug.material_type || null,
          match_fields: matchSel.length ? matchSel : [$('#mapPart', box).value].filter(Boolean),
          save_rule: $('#saveRule', box).checked,
          set_default: $('#setDefault', box).checked,
          rule_name: `BOM映射-${$('#bomName', box).value}`
        };
        if (!mapping.mother_part_no || !mapping.mother_value) {
          return flash($('#bomFlash', root), '请先选择母件列，并指定本 BOM 的母件值', 'error');
        }
        const fd = new FormData();
        fd.append('file', file);
        fd.append('name', $('#bomName', box).value);
        fd.append('version_label', $('#bomVersion', box).value);
        fd.append('mapping', JSON.stringify(mapping));
        try {
          const res = await API.upload('/boms/import', fd);
          flash($('#bomFlash', root), `导入成功：母件 ${res.mother_part_no} / ${res.version_label}（${res.line_count} 行）`, 'success');
          navigate('bom');
        } catch (err) {
          flash($('#bomFlash', root), err.message, 'error');
        }
      });
    }

    $$('[data-apply-rule]', root).forEach((btn) => {
      btn.addEventListener('click', () => {
        appliedRule = JSON.parse(btn.getAttribute('data-apply-rule'));
        flash($('#bomFlash', root), `已选择规则：${appliedRule.name}，请预览文件后自动套用`, 'info');
      });
    });

    $$('[data-view]', root).forEach((btn) => {
      btn.addEventListener('click', async () => {
        const detail = await API.get(`/boms/${btn.dataset.view}`);
        const mi = detail.mother_info || {};
        $('#bomDetail', root).innerHTML = `
          <h3>${escapeHtml(detail.name)} · ${escapeHtml(detail.version_label)}</h3>
          <p class="muted">
            BOM单号：${escapeHtml(detail.bom_no || '-')} ｜
            母件代码：${escapeHtml(detail.mother_part_no)} ｜
            匹配字段：${escapeHtml((detail.match_fields || []).join(', '))}
          </p>
          ${detail.mother_info ? `
            <div class="card" style="box-shadow:none;border-style:dashed;margin:10px 0">
              <h4 style="margin:0 0 8px">母件信息</h4>
              <div class="muted" style="font-size:13px;line-height:1.7">
                名称：${escapeHtml(mi['物料名称'] || mi.mother_name || '-')} ｜
                规格型号：${escapeHtml(mi['规格型号'] || '-')} ｜
                单位：${escapeHtml(mi['基本单位'] || mi['单位'] || '-')} ｜
                审核状态：${escapeHtml(mi['审核状态'] || '-')} ｜
                备注：${escapeHtml(mi['备注'] || '-')}
              </div>
            </div>` : ''}
          <div class="table-wrap"><table>
            <thead><tr><th>#</th><th>物料代码</th><th>数量</th><th>名称</th><th>规格</th><th>辅助属性</th></tr></thead>
            <tbody>${detail.lines.map((l) => `
              <tr>
                <td>${l.line_no}</td>
                <td>${escapeHtml(l.part_no)}</td>
                <td>${l.qty}</td>
                <td>${escapeHtml(l.raw['物料名称'] || '')}</td>
                <td>${escapeHtml(l.raw['规格型号'] || l.raw['规格'] || '')}</td>
                <td>${escapeHtml(l.raw['辅助属性'] || '')}</td>
              </tr>`).join('')}
            </tbody>
          </table></div>`;
      });
    });

    $$('[data-del]', root).forEach((btn) => {
      btn.addEventListener('click', async () => {
        if (!confirm('确认删除该 BOM？')) return;
        await API.del(`/boms/${btn.dataset.del}`);
        navigate('bom');
      });
    });
  }

  // ---------------- Orders ----------------
  async function renderOrders(root) {
    const batches = await API.get('/batches');
    const masterRules = await API.get('/mappings?file_type=master_order');
    const accRules = await API.get('/mappings?file_type=accessory_order');

    root.innerHTML = `
      <div class="card">
        <h2>订单导入与关联</h2>
        <p class="muted">流程：上传订单 → 自定义列关联总包与配件 → 按料号匹配 BOM（不比用量）→ 扫码时按配件订单判定齐套。</p>
        <div id="orderFlash"></div>
        <div class="upload-block">
          <h3>1. 上传总包订单 + 配件订单</h3>
          <div class="row" style="margin-bottom:10px">
            <a class="btn secondary" href="/templates/master_order_template.xlsx" download>下载总包订单模板</a>
            <a class="btn secondary" href="/templates/accessory_order_template.xlsx" download>下载配件订单模板</a>
          </div>
          <div class="form-grid">
            <label class="field"><span>批次名称</span><input id="batchName" placeholder="如 8月4日上午出货" /></label>
            <label class="field"><span>总包订单 Excel</span><input type="file" id="masterFile" accept=".xlsx,.xls" /></label>
            <label class="field"><span>配件订单 Excel</span><input type="file" id="accFile" accept=".xlsx,.xls" /></label>
          </div>
          <div class="row" style="margin-top:10px">
            <button class="btn secondary" id="previewOrdersBtn" type="button">预览并配置关联列</button>
          </div>
        </div>
        <div id="orderMapBox" class="hidden panel-block" style="margin-top:14px"></div>
      </div>
      <div class="card">
        <div class="row" style="justify-content:space-between;align-items:center">
          <h3 style="margin:0">批次列表</h3>
          <span class="muted" style="font-size:13px">总包规则 ${masterRules.items.length} · 配件规则 ${accRules.items.length}</span>
        </div>
        <div class="table-wrap scrollable" style="margin-top:12px"><table>
          <thead><tr><th>名称</th><th>状态</th><th>总包/配件</th><th>匹配</th><th>BOM</th><th>时间</th><th>操作</th></tr></thead>
          <tbody>
            ${(batches.items || []).map((b) => `
              <tr>
                <td>${escapeHtml(b.name)}</td>
                <td>${statusTag(b.status)}</td>
                <td>${b.master_count} / ${b.accessory_count}</td>
                <td>${b.master_ok || 0}/${b.master_fail || 0}</td>
                <td class="cell-wrap">${escapeHtml(b.bom_name || '-')}<br/><span class="muted">${escapeHtml(b.bom_version || '')}</span></td>
                <td>${escapeHtml((b.created_at || '').slice(0, 16))}</td>
                <td class="actions"><button class="btn secondary" data-open="${b.id}" type="button">打开</button>
                <button class="btn danger" data-del="${b.id}" type="button">删除</button></td>
              </tr>`).join('') || '<tr><td colspan="7">暂无批次</td></tr>'}
          </tbody>
        </table></div>
        <div id="batchDetail" class="detail-panel hidden" style="margin-top:14px"></div>
      </div>
    `;

    let masterHeaders = [];
    let accHeaders = [];
    const defaultMaster = masterRules.items.find((r) => r.is_default);
    const defaultAcc = accRules.items.find((r) => r.is_default);

    const guess = (headers, names) => headers.find((h) => names.some((n) => h === n || h.includes(n))) || '';

    $('#previewOrdersBtn', root).addEventListener('click', async () => {
      const mf = $('#masterFile', root).files[0];
      const af = $('#accFile', root).files[0];
      if (!mf || !af) return flash($('#orderFlash', root), '请选择两个 Excel 文件', 'error');
      try {
        const mfd = new FormData(); mfd.append('file', mf);
        const afd = new FormData(); afd.append('file', af);
        const [mp, ap] = await Promise.all([
          API.upload('/batches/preview', mfd),
          API.upload('/batches/preview', afd)
        ]);
        masterHeaders = mp.headers;
        accHeaders = ap.headers;
        renderOrderMaps(mp, ap);
      } catch (err) {
        flash($('#orderFlash', root), err.message, 'error');
      }
    });

    function opts(headers, selected) {
      return headers.map((h) => `<option value="${escapeHtml(h)}" ${h === selected ? 'selected' : ''}>${escapeHtml(h)}</option>`).join('');
    }

    function renderOrderMaps(mp, ap) {
      const mm = defaultMaster?.mapping || {};
      const am = defaultAcc?.mapping || {};
      const box = $('#orderMapBox', root);
      box.classList.remove('hidden');
      const mOrder = mm.order_no || guess(masterHeaders, ['订单号', '单号', '批次']);
      const aOrder = am.order_no || guess(accHeaders, ['订单号', '单号', '批次']);
      const mMother = mm.mother_part_no || guess(masterHeaders, ['物料代码', '母件', '料号']);
      const aPart = am.part_no || guess(accHeaders, ['物料代码', '子件', '料号']);
      const aQty = am.qty || guess(accHeaders, ['用量', '数量']);
      const common = masterHeaders.filter((h) => accHeaders.includes(h));
      const defaultLink = common.length ? common.filter((h) => /订单|单号|批次/.test(h)) : [];
      if (!defaultLink.length && mOrder && aOrder) {
        // will use pair UI defaults
      }

      box.innerHTML = `
        <h3>2. 字段映射</h3>
        <div class="form-grid">
          <label class="field"><span>总包显示用订单号列</span><select id="mOrder"><option value="">请选择</option>${opts(masterHeaders, mOrder)}</select></label>
          <label class="field"><span>总包母件/物料代码列</span><select id="mMother"><option value="">请选择</option>${opts(masterHeaders, mMother)}</select></label>
          <label class="field"><span>配件显示用订单号列</span><select id="aOrder"><option value="">请选择</option>${opts(accHeaders, aOrder)}</select></label>
          <label class="field"><span>配件物料代码列</span><select id="aPart"><option value="">请选择</option>${opts(accHeaders, aPart)}</select></label>
          <label class="field"><span>配件数量/用量列</span><select id="aQty"><option value="">默认1</option>${opts(accHeaders, aQty)}</select></label>
        </div>

        <h3 style="margin-top:16px">3. 总包 ↔ 配件 关联列（可多选，值须全部一致）</h3>
        <p class="muted" style="font-size:13px">先用这些列把配件挂到对应总包上，再去做 BOM 匹配。可只选订单号，也可再加批次、客户等。</p>
        <div class="grid-2">
          <div>
            <div class="section-title">总包侧列</div>
            ${checkboxList('linkMasterFields', masterHeaders, defaultLink.length ? defaultLink : (mOrder ? [mOrder] : []))}
          </div>
          <div>
            <div class="section-title">配件侧列（同名优先勾选）</div>
            ${checkboxList('linkAccFields', accHeaders, defaultLink.length ? defaultLink : (aOrder ? [aOrder] : []))}
          </div>
        </div>
        <p class="muted" style="font-size:12px;margin-top:8px">说明：两边勾选数量建议一致，并按同名列配对；若列名不同，请保证勾选顺序一一对应。</p>

        <label class="check-row" style="margin-top:12px"><input type="checkbox" id="saveMaps" checked /> 保存映射规则</label>
        <div class="row" style="margin-top:12px"><button class="btn" id="createBatchBtn" type="button">创建批次</button></div>
      `;

      $('#createBatchBtn', box).addEventListener('click', async () => {
        const mLinks = checkedValues($('#linkMasterFields', box));
        const aLinks = checkedValues($('#linkAccFields', box));
        if (!mLinks.length || !aLinks.length) {
          return flash($('#orderFlash', root), '请至少各选一列用于总包与配件关联', 'error');
        }
        const n = Math.min(mLinks.length, aLinks.length);
        const orderLinkFields = [];
        for (let i = 0; i < n; i++) {
          orderLinkFields.push({ master_field: mLinks[i], accessory_field: aLinks[i] });
        }
        const fd = new FormData();
        fd.append('name', $('#batchName', root).value || '');
        fd.append('master_file', $('#masterFile', root).files[0]);
        fd.append('accessory_file', $('#accFile', root).files[0]);
        fd.append('order_link_fields', JSON.stringify(orderLinkFields));
        fd.append('master_mapping', JSON.stringify({
          order_no: $('#mOrder', box).value || mLinks[0],
          mother_part_no: $('#mMother', box).value,
          save_rule: $('#saveMaps', box).checked,
          set_default: true,
          rule_name: '总包默认映射'
        }));
        fd.append('accessory_mapping', JSON.stringify({
          order_no: $('#aOrder', box).value || aLinks[0],
          part_no: $('#aPart', box).value,
          qty: $('#aQty', box).value || null,
          save_rule: $('#saveMaps', box).checked,
          set_default: true,
          rule_name: '配件默认映射'
        }));
        try {
          const res = await API.upload('/batches/create', fd);
          flash($('#orderFlash', root), `批次已创建：总包 ${res.master_count} 行，配件 ${res.accessory_count} 行`, 'success');
          state.openBatchId = res.id;
          await navigate('orders');
        } catch (err) {
          flash($('#orderFlash', root), err.message, 'error');
        }
      });
    }

    async function openBatch(id, forceEdit = false) {
      const detail = await API.get(`/batches/${id}`);
      const cfg = detail.match_fields || {};
      const savedLinks = cfg.order_link_fields || [];
      const savedBomFields = cfg.associate_match_fields || [];
      const mothers = [...new Set((detail.masters || []).map((m) => m.mother_part_no).filter(Boolean))];
      const candidates = [];
      for (const m of mothers) {
        const r = await API.get(`/boms?mother_part_no=${encodeURIComponent(m)}`);
        candidates.push({ mother_part_no: m, boms: r.items || [] });
      }
      const allBoms = candidates.flatMap((c) => c.boms.map((b) => ({ ...b, _mother: c.mother_part_no })));
      const accFields = detail.accessories?.[0] ? Object.keys(detail.accessories[0].raw || {}) : [];
      let bomFields = [];
      if (detail.selected_bom_id) {
        try {
          const bomDetail = await API.get(`/boms/${detail.selected_bom_id}`);
          bomFields = bomDetail.columns || [];
        } catch {}
      }
      if (!bomFields.length && allBoms[0]) {
        try {
          const bomDetail = await API.get(`/boms/${allBoms[0].id}`);
          bomFields = bomDetail.columns || [];
        } catch {}
      }

      const showEditor = forceEdit || detail.status === 'draft' || !detail.selected_bom_id;
      const pickPartCol = (headers, preferred) => {
        if (preferred && headers.includes(preferred)) return preferred;
        return headers.find((h) => /物料代码|子件料号|母件料号|^料号$|part/i.test(h)) || headers[0] || '';
      };
      const savedBomPart = savedBomFields[0]
        ? (typeof savedBomFields[0] === 'string' ? savedBomFields[0] : (savedBomFields[0].left || savedBomFields[0].bom_field))
        : '';
      const savedAccPart = savedBomFields[0]
        ? (typeof savedBomFields[0] === 'string' ? savedBomFields[0] : (savedBomFields[0].right || savedBomFields[0].order_field))
        : '';
      const defaultBomPart = pickPartCol(bomFields.length ? bomFields : accFields, savedBomPart || '物料代码');
      const defaultAccPart = pickPartCol(accFields, savedAccPart || cfg.accessory?.part_no || '物料代码');
      const partOpts = (headers, selected) => headers.map((h) =>
        `<option value="${escapeHtml(h)}" ${h === selected ? 'selected' : ''}>${escapeHtml(h)}</option>`
      ).join('');

      const panel = $('#batchDetail', root);
      panel.classList.remove('hidden');
      panel.innerHTML = `
        <div class="panel-block">
          <div class="row" style="justify-content:space-between;align-items:center">
            <h3 style="margin:0">${escapeHtml(detail.name)} ${statusTag(detail.status)}</h3>
            <button class="btn secondary" id="closeDetailBtn" type="button">关闭</button>
          </div>
          <p class="muted">总包 ${detail.masters.length} 行 · 配件 ${detail.accessories.length} 行
            ${savedLinks.length ? ` · 订单关联列：${escapeHtml(savedLinks.map((p) => p.label || `${p.left}/${p.right}`).join(' + '))}` : ''}
          </p>
          <div class="flash info">规则：先按自定义列关联总包↔配件，再仅按料号匹配 BOM；用量不在此校验，扫码时按该总包关联的配件订单判定齐套。</div>
          <div id="assocFlash"></div>
          <div id="assocEditor" class="${showEditor ? '' : 'hidden'}">
            <h4>A. 选择 BOM 版本（本批次使用一个）</h4>
            <div class="bom-pick-list">
              ${allBoms.length ? allBoms.map((b, idx) => `
                <label class="bom-pick-item">
                  <input type="radio" name="bomPick" value="${b.id}" ${idx === 0 ? 'checked' : ''}/>
                  <span>
                    <strong>${escapeHtml(b.name)}</strong> / ${escapeHtml(b.version_label)}
                    <br/><span class="muted">母件 ${escapeHtml(b.mother_part_no)} · 子件 ${b.line_count} · ${escapeHtml(b.created_at || '')}</span>
                  </span>
                </label>`).join('') : '<div class="flash warn">无候选 BOM，请先上传对应母件的 BOM</div>'}
            </div>
            <h4 style="margin-top:14px">B. 与 BOM 仅按料号匹配</h4>
            <p class="muted" style="font-size:13px">第二步只核对配件料号是否存在于 BOM，不比对用量。用量齐套在扫码时按总包关联的配件订单行判定。</p>
            <div class="form-grid" id="bomMatchWrap">
              <label class="field"><span>BOM 料号列</span>
                <select id="bomPartField"><option value="">请选择</option>${partOpts(bomFields.length ? bomFields : ['物料代码'], defaultBomPart)}</select>
              </label>
              <label class="field"><span>配件订单料号列</span>
                <select id="accPartField"><option value="">请选择</option>${partOpts(accFields, defaultAccPart)}</select>
              </label>
            </div>
            <div class="row" style="margin-top:12px">
              <button class="btn" id="assocBtn" type="button">开始关联（订单关联 + 料号匹配BOM）</button>
            </div>
          </div>
          ${!showEditor ? `
            <div class="flash success">已完成关联。BOM：${escapeHtml(detail.bom_name || '')} / ${escapeHtml(detail.bom_version || '')}</div>
            <div class="row">
              <button class="btn secondary" id="reassocBtn" type="button">重新关联</button>
              <button class="btn" data-go-print="${detail.id}" type="button">去生成标签</button>
            </div>
          ` : ''}
          <div class="result-grids" style="margin-top:14px">
            <div>
              <h4>总包订单</h4>
              <div class="table-wrap scrollable"><table>
                <thead><tr><th>#</th><th>订单号</th><th>母件</th><th>状态</th><th>说明</th></tr></thead>
                <tbody>${detail.masters.map((m) => `
                  <tr><td>${m.line_no}</td><td class="cell-wrap">${escapeHtml(m.order_no)}</td><td>${escapeHtml(m.mother_part_no)}</td>
                  <td>${statusTag(m.match_status)}</td><td class="cell-wrap">${escapeHtml(m.match_message || '')}</td></tr>`).join('')}
                </tbody>
              </table></div>
            </div>
            <div>
              <h4>配件订单</h4>
              <div class="table-wrap scrollable"><table>
                <thead><tr><th>#</th><th>订单号</th><th>料号</th><th>数量</th><th>状态</th><th>说明</th></tr></thead>
                <tbody>${detail.accessories.map((a) => `
                  <tr><td>${a.line_no}</td><td class="cell-wrap">${escapeHtml(a.order_no)}</td><td>${escapeHtml(a.part_no)}</td><td>${a.qty}</td>
                  <td>${statusTag(a.match_status)}</td><td class="cell-wrap">${escapeHtml(a.match_message || '')}</td></tr>`).join('')}
                </tbody>
              </table></div>
            </div>
          </div>
        </div>
      `;

      panel.scrollIntoView({ behavior: 'smooth', block: 'start' });
      $('#closeDetailBtn', panel)?.addEventListener('click', () => panel.classList.add('hidden'));

      const reloadBomPartOptions = async () => {
        const bomId = $('input[name="bomPick"]:checked', panel)?.value;
        const sel = $('#bomPartField', panel);
        if (!bomId || !sel) return;
        try {
          const bomDetail = await API.get(`/boms/${bomId}`);
          const cols = bomDetail.columns || [];
          const cur = sel.value;
          const preferred = pickPartCol(cols, cur || '物料代码');
          sel.innerHTML = `<option value="">请选择</option>${partOpts(cols, preferred)}`;
        } catch {}
      };
      $$('input[name="bomPick"]', panel).forEach((r) => r.addEventListener('change', reloadBomPartOptions));
      if (showEditor) reloadBomPartOptions();

      const doAssoc = async () => {
        const bomId = $('input[name="bomPick"]:checked', panel)?.value;
        if (!bomId) return flash($('#assocFlash', panel), '请选择 BOM 版本', 'error');
        const bomPart = $('#bomPartField', panel)?.value;
        const accPart = $('#accPartField', panel)?.value;
        if (!bomPart || !accPart) {
          return flash($('#assocFlash', panel), '请选择 BOM 与配件的料号列', 'error');
        }
        try {
          const res = await API.post(`/batches/${id}/associate`, {
            bom_id: bomId,
            order_link_fields: savedLinks,
            bom_match_fields: [{ bom_field: bomPart, order_field: accPart }]
          });
          flash($('#assocFlash', panel),
            `完成：订单关联 ${res.result.linked_accessories} 行；总包成功 ${res.result.master_success}/失败 ${res.result.master_failed}；配件成功 ${res.result.accessory_success}/失败 ${res.result.accessory_failed}`,
            'success');
          openBatch(id, false);
        } catch (err) {
          flash($('#assocFlash', panel), err.message, 'error');
        }
      };
      $('#assocBtn', panel)?.addEventListener('click', doAssoc);
      $('#reassocBtn', panel)?.addEventListener('click', () => openBatch(id, true));
      $$('[data-go-print]', panel).forEach((b) => b.addEventListener('click', () => {
        state.printBatchId = b.dataset.goPrint;
        navigate('print');
      }));
    }

    $$('[data-open]', root).forEach((b) => b.addEventListener('click', () => openBatch(b.dataset.open)));
    $$('[data-del]', root).forEach((b) => b.addEventListener('click', async () => {
      if (!confirm('确认删除该批次？')) return;
      await API.del(`/batches/${b.dataset.del}`);
      navigate('orders');
    }));

    if (state.openBatchId) {
      const id = state.openBatchId;
      state.openBatchId = null;
      await openBatch(id, true);
    }
  }

  // ---------------- Templates ----------------
  async function renderTemplates(root) {
    const list = await API.get('/templates');
    root.innerHTML = `
      <div class="card">
        <h2>标签模板</h2>
        <div id="tplFlash"></div>
        <div class="row">
          <button class="btn" id="newMasterTpl" type="button">新建总包模板</button>
          <button class="btn secondary" id="newChildTpl" type="button">新建子件模板</button>
        </div>
        <div class="table-wrap" style="margin-top:12px"><table>
          <thead><tr><th>名称</th><th>类型</th><th>尺寸(mm)</th><th>码模式</th><th>更新时间</th><th></th></tr></thead>
          <tbody>
            ${(list.items || []).map((t) => `
              <tr>
                <td>${escapeHtml(t.name)}</td>
                <td>${t.label_type === 'master' ? '总包' : '子件'}</td>
                <td>${t.width_mm} × ${t.height_mm}</td>
                <td>${t.code_mode === 'unique' ? '唯一编号' : '自定义拼接'} / ${t.code_type}${t.includes_scan_id ? ' · 含唯一码' : ' · 无唯一码'}</td>
                <td>${escapeHtml(t.updated_at)}</td>
                <td>
                  <button class="btn secondary" data-edit="${t.id}" type="button">编辑</button>
                  <button class="btn danger" data-del="${t.id}" type="button">删除</button>
                </td>
              </tr>`).join('')}
          </tbody>
        </table></div>
      </div>
      <div id="tplEditor"></div>
    `;

    const openEditor = (tpl) => {
      openTemplateEditor($('#tplEditor', root), tpl, {
        onSaved: () => {
          flash($('#tplFlash', root), '模板已保存', 'success');
          navigate('templates');
        }
      });
    };

    $('#newMasterTpl', root).addEventListener('click', () => openEditor({
      name: '新总包模板', label_type: 'master', width_mm: 100, height_mm: 60,
      code_mode: 'unique', code_type: 'qr', code_fields: [], code_segments: [],
      elements: [
        { id: 't1', type: 'text', x: 4, y: 4, w: 50, h: 8, text: '总包标签', fontSize: 14, align: 'left', bold: true,
          segments: [{ type: 'text', value: '总包标签' }] },
        { id: 'c1', type: 'code', x: 60, y: 10, w: 35, h: 35, text: '', fontSize: 10, align: 'center', bold: false, codeType: 'qr',
          segments: [{ type: 'field', field: 'package_code', formula: '' }] }
      ]
    }));
    $('#newChildTpl', root).addEventListener('click', () => openEditor({
      name: '新子件模板', label_type: 'child', width_mm: 80, height_mm: 50,
      code_mode: 'unique', code_type: 'qr', code_fields: [], code_segments: [],
      elements: [
        { id: 't1', type: 'text', x: 3, y: 3, w: 40, h: 7, text: '子件标签', fontSize: 13, align: 'left', bold: true,
          segments: [{ type: 'text', value: '子件标签' }] },
        { id: 'c1', type: 'code', x: 48, y: 8, w: 28, h: 28, text: '', fontSize: 10, align: 'center', bold: false, codeType: 'qr',
          segments: [{ type: 'field', field: 'child_code', formula: '' }] }
      ]
    }));

    $$('[data-edit]', root).forEach((b) => b.addEventListener('click', async () => {
      const t = await API.get(`/templates/${b.dataset.edit}`);
      openEditor(t);
    }));
    $$('[data-del]', root).forEach((b) => b.addEventListener('click', async () => {
      if (!confirm('删除该模板？')) return;
      await API.del(`/templates/${b.dataset.del}`);
      navigate('templates');
    }));
  }

  // ---------------- Print ----------------
  async function renderPrint(root) {
    const [batches, masterTpls, childTpls, allTpls] = await Promise.all([
      API.get('/batches'),
      API.get('/templates?label_type=master'),
      API.get('/templates?label_type=child'),
      API.get('/templates')
    ]);
    const labelled = (batches.items || []).filter((b) => b.status === 'associated' || b.status === 'labelled');
    const templates = allTpls.items || [...(masterTpls.items || []), ...(childTpls.items || [])];
    const orderMasterTpls = (masterTpls.items || []).filter((t) => t.includes_scan_id);
    const orderChildTpls = (childTpls.items || []).filter((t) => t.includes_scan_id);
    let printMode = 'order'; // order | manual
    let lastLabels = [];

    function tplOptions(list, emptyText) {
      if (!list.length) return `<option value="">${escapeHtml(emptyText || '暂无可用模板')}</option>`;
      return list.map((t) => `<option value="${t.id}">${escapeHtml(t.name)}（${t.width_mm}×${t.height_mm}mm）</option>`).join('');
    }

    root.innerHTML = `
      <div class="card">
        <h2>生成并打印标签</h2>
        <div class="mode-tabs" id="printModeTabs">
          <button type="button" class="mode-tab active" data-pmode="order">订单打印</button>
          <button type="button" class="mode-tab" data-pmode="manual">自定义打印</button>
        </div>
        <div id="printFlash"></div>

        <div id="orderPrintPane">
          <div class="row" style="flex-wrap:wrap;gap:12px">
            <label class="field"><span>订单批次</span>
              <select id="printBatch">
                <option value="">请选择</option>
                ${labelled.map((b) => `<option value="${b.id}" ${state.printBatchId === b.id ? 'selected' : ''}>${escapeHtml(b.name)}（成功 ${b.master_ok || 0}）</option>`).join('')}
              </select>
            </label>
            <label class="field"><span>打印范围</span>
              <select id="printScope">
                <option value="all">总包 + 配件</option>
                <option value="master">仅总包标签</option>
                <option value="child">仅配件标签</option>
              </select>
            </label>
            <label class="field"><span>总包模板（含唯一码）</span>
              <select id="printMasterTpl">${tplOptions(orderMasterTpls, '无含唯一码的总包模板')}</select>
            </label>
            <label class="field"><span>配件模板（含唯一码）</span>
              <select id="printChildTpl">${tplOptions(orderChildTpls, '无含唯一码的配件模板')}</select>
            </label>
          </div>
          <p class="muted" style="margin-top:8px;font-size:12px">订单批次打印仅列出条码/二维码中包含系统唯一码的模板；不含唯一码的模板请用「自定义打印」。</p>
          <div class="row" style="margin-top:12px;flex-wrap:wrap;gap:8px">
            <button class="btn" id="genLabelsBtn" type="button">生成标签码</button>
            <button class="btn secondary" id="loadPrintBtn" type="button">加载预览</button>
          </div>
        </div>

        <div id="manualPrintPane" class="hidden">
          <p class="muted">无需订单/BOM：选择模板后手工填写字段内容，即可预览并打印。</p>
          <div class="row" style="flex-wrap:wrap;gap:12px">
            <label class="field"><span>标签模板</span>
              <select id="manualTpl">
                <option value="">请选择</option>
                ${templates.map((t) => `<option value="${t.id}" data-type="${t.label_type}">${escapeHtml(t.name)}（${t.label_type === 'child' ? '配件' : '总包'} · ${t.width_mm}×${t.height_mm}mm）</option>`).join('')}
              </select>
            </label>
            <label class="field"><span>打印份数</span><input id="manualCopies" type="number" min="1" max="200" value="1" /></label>
            <label class="field"><span>条码/唯一码（可选）</span><input id="manualScanId" placeholder="留空则自动生成" /></label>
          </div>
          <div id="manualFields" class="manual-fields" style="margin-top:12px"></div>
          <div class="row" style="margin-top:12px">
            <button class="btn" id="manualPreviewBtn" type="button">生成预览</button>
            <button class="btn secondary" id="manualAddFieldBtn" type="button">+ 自定义字段</button>
          </div>
        </div>

        <hr style="border:none;border-top:1px solid var(--line);margin:16px 0" />
        <div class="row" style="flex-wrap:wrap;gap:12px;align-items:end">
          <label class="field"><span>打印纸张</span>
            <select id="printPaper">
              <option value="label">标签纸（按模板尺寸）</option>
              <option value="a4">A4 纵向</option>
              <option value="a4-landscape">A4 横向</option>
              <option value="letter">Letter</option>
              <option value="custom">自定义毫米</option>
            </select>
          </label>
          <label class="field hidden" id="customPaperBox"><span>自定义宽×高 mm</span>
            <div class="row" style="gap:6px">
              <input id="paperW" type="number" placeholder="宽" style="width:90px" value="210" />
              <input id="paperH" type="number" placeholder="高" style="width:90px" value="297" />
            </div>
          </label>
          <label class="field"><span>排版</span>
            <select id="printLayout">
              <option value="one">一页一张（居中）</option>
              <option value="fit">一页多张（自动排布，适合 A4）</option>
            </select>
          </label>
          <button class="btn warn" id="doPrintBtn" type="button">打印</button>
        </div>
        <p class="muted" style="margin-top:8px">打印时会按所选纸张适配电脑打印机对话框；标签纸模式会按模板毫米尺寸设置页面。</p>
      </div>
      <div class="card">
        <h3>预览</h3>
        <div id="printPreview" class="print-preview-grid"></div>
      </div>
    `;

    function setPrintMode(mode) {
      printMode = mode;
      $$('#printModeTabs .mode-tab', root).forEach((b) => b.classList.toggle('active', b.dataset.pmode === mode));
      $('#orderPrintPane', root).classList.toggle('hidden', mode !== 'order');
      $('#manualPrintPane', root).classList.toggle('hidden', mode !== 'manual');
    }

    $$('#printModeTabs .mode-tab', root).forEach((btn) => {
      btn.addEventListener('click', () => setPrintMode(btn.dataset.pmode));
    });

    $('#printPaper', root).addEventListener('change', () => {
      $('#customPaperBox', root).classList.toggle('hidden', $('#printPaper', root).value !== 'custom');
      if (lastLabels.length) renderLabels(lastLabels);
    });
    $('#printLayout', root).addEventListener('change', () => {
      if (lastLabels.length) renderLabels(lastLabels);
    });

    $('#genLabelsBtn', root).addEventListener('click', async () => {
      try {
        const res = await API.post('/labels/generate', {
          batch_id: $('#printBatch', root).value,
          master_template_id: $('#printMasterTpl', root).value,
          child_template_id: $('#printChildTpl', root).value,
          only_success: true
        });
        flash($('#printFlash', root), `已生成总包 ${res.master_created} 张、配件 ${res.child_created} 张`, 'success');
      } catch (err) {
        flash($('#printFlash', root), err.message, 'error');
      }
    });

    $('#loadPrintBtn', root).addEventListener('click', () => loadPreview());
    $('#doPrintBtn', root).addEventListener('click', () => {
      if (!$('#printSheet').innerHTML.trim()) {
        flash($('#printFlash', root), '请先加载/生成打印预览', 'error');
        return;
      }
      applyPrintPageStyle(lastLabels);
      window.print();
    });

    async function loadManualFields() {
      const id = $('#manualTpl', root).value;
      const box = $('#manualFields', root);
      if (!id) {
        box.innerHTML = '<div class="muted">请先选择模板</div>';
        return;
      }
      try {
        const res = await API.get(`/labels/templates/${id}/fields`);
        const fields = res.fields || [];
        box.innerHTML = fields.map((f) => `
          <label class="field"><span>${escapeHtml(f)}</span>
            <input data-manual-field="${escapeHtml(f)}" placeholder="填写 ${escapeHtml(f)}" />
          </label>`).join('') || '<div class="muted">模板无明显字段，可点“自定义字段”添加</div>';
      } catch (err) {
        box.innerHTML = `<div class="flash error">${escapeHtml(err.message)}</div>`;
      }
    }

    $('#manualTpl', root).addEventListener('change', loadManualFields);
    $('#manualAddFieldBtn', root).addEventListener('click', () => {
      const name = prompt('自定义字段名（需与模板中 {字段名} / 绑定字段一致）');
      if (!name || !name.trim()) return;
      const box = $('#manualFields', root);
      const f = name.trim();
      if (box.querySelector(`[data-manual-field="${f.replace(/"/g, '')}"]`)) return;
      const label = document.createElement('label');
      label.className = 'field';
      label.innerHTML = `<span>${escapeHtml(f)}</span><input data-manual-field="${escapeHtml(f)}" placeholder="填写 ${escapeHtml(f)}" />`;
      box.appendChild(label);
    });

    $('#manualPreviewBtn', root).addEventListener('click', async () => {
      const template_id = $('#manualTpl', root).value;
      if (!template_id) return flash($('#printFlash', root), '请选择模板', 'error');
      const data = {};
      $$('[data-manual-field]', root).forEach((inp) => {
        data[inp.dataset.manualField] = inp.value;
      });
      try {
        const res = await API.post('/labels/manual-preview', {
          template_id,
          data,
          copies: Number($('#manualCopies', root).value) || 1,
          scan_id: $('#manualScanId', root).value.trim()
        });
        renderLabels(res.labels || []);
        flash($('#printFlash', root), `已生成自定义标签 ${res.count} 张`, 'success');
      } catch (err) {
        flash($('#printFlash', root), err.message, 'error');
      }
    });

    async function loadPreview() {
      const batchId = $('#printBatch', root).value;
      if (!batchId) return flash($('#printFlash', root), '请选择批次', 'error');
      const scope = $('#printScope', root).value || 'all';
      try {
        const q = new URLSearchParams({
          batch_id: batchId,
          master_template_id: $('#printMasterTpl', root).value,
          child_template_id: $('#printChildTpl', root).value,
          label_type: scope
        });
        const data = await API.get(`/labels/print-data?${q.toString()}`);
        renderLabels(data.labels || []);
        const tip = scope === 'master' ? '总包' : scope === 'child' ? '配件' : '全部';
        flash($('#printFlash', root), `已加载 ${data.count} 张${tip}标签`, 'success');
      } catch (err) {
        flash($('#printFlash', root), err.message, 'error');
      }
    }

    function paperOptions() {
      return {
        paper: $('#printPaper', root).value,
        layout: $('#printLayout', root).value,
        customW: Number($('#paperW', root).value) || 210,
        customH: Number($('#paperH', root).value) || 297
      };
    }

    function applyPrintPageStyle(labels) {
      let styleEl = document.getElementById('printPageStyle');
      if (!styleEl) {
        styleEl = document.createElement('style');
        styleEl.id = 'printPageStyle';
        document.head.appendChild(styleEl);
      }
      const opts = paperOptions();
      const sample = labels[0]?.template;
      const lw = sample?.width_mm || 100;
      const lh = sample?.height_mm || 60;
      let pageCss = '';
      // 标签纸：页面尺寸与模板一致。浏览器/驱动常有亚毫米误差，内容按 99% 轻微内缩，避免底行被裁。
      const labelSafe = opts.paper === 'label';
      if (labelSafe) {
        pageCss = `@page { size: ${lw}mm ${lh}mm; margin: 0; }`;
      } else if (opts.paper === 'a4') {
        pageCss = '@page { size: A4 portrait; margin: 8mm; }';
      } else if (opts.paper === 'a4-landscape') {
        pageCss = '@page { size: A4 landscape; margin: 8mm; }';
      } else if (opts.paper === 'letter') {
        pageCss = '@page { size: letter portrait; margin: 0.4in; }';
      } else {
        pageCss = `@page { size: ${opts.customW}mm ${opts.customH}mm; margin: 5mm; }`;
      }
      styleEl.textContent = `
        ${pageCss}
        @media print {
          html, body {
            margin: 0 !important;
            padding: 0 !important;
            width: 100%;
            height: auto;
            background: #fff !important;
          }
          .print-sheet {
            display: block !important;
            position: absolute;
            left: 0;
            top: 0;
            width: 100%;
            margin: 0;
            padding: 0;
          }
          .print-label {
            box-sizing: border-box;
            -webkit-print-color-adjust: exact;
            print-color-adjust: exact;
          }
          .print-label.solo {
            page-break-after: always;
            break-after: page;
            page-break-inside: avoid;
            break-inside: avoid;
            margin: 0;
            ${labelSafe ? `
            width: ${lw}mm !important;
            height: ${lh}mm !important;
            overflow: hidden;
            transform: scale(0.99);
            transform-origin: top left;
            ` : 'margin: 0 auto;'}
          }
          .print-page { page-break-after: always; break-after: page; }
          .print-page .print-label { page-break-after: auto; break-after: auto; }
        }
      `;
    }

    function renderLabels(labels) {
      lastLabels = labels || [];
      const preview = $('#printPreview', root);
      const sheet = $('#printSheet');
      const opts = paperOptions();
      preview.innerHTML = `<p class="muted">共 ${lastLabels.length} 张，纸张=${opts.paper}，排版=${opts.layout === 'fit' ? '一页多张' : '一页一张'}。</p>`;
      sheet.innerHTML = '';
      applyPrintPageStyle(lastLabels);

      const useFit = opts.layout === 'fit' && opts.paper !== 'label';
      if (!useFit) {
        lastLabels.forEach((label, idx) => {
          const printWrap = document.createElement('div');
          printWrap.className = 'print-label solo';
          LabelRender.renderLabelTo(printWrap, label);
          sheet.appendChild(printWrap);
          if (idx < 8) appendPreviewThumb(preview, label);
        });
        return;
      }

      // A4 等大纸：按模板尺寸估算每页可排数量
      const sample = lastLabels[0]?.template;
      const lw = Number(sample?.width_mm) || 100;
      const lh = Number(sample?.height_mm) || 60;
      let pageW = 210;
      let pageH = 297;
      if (opts.paper === 'a4-landscape') { pageW = 297; pageH = 210; }
      else if (opts.paper === 'letter') { pageW = 216; pageH = 279; }
      else if (opts.paper === 'custom') { pageW = opts.customW; pageH = opts.customH; }
      const usableW = Math.max(lw, pageW - 16);
      const usableH = Math.max(lh, pageH - 16);
      const cols = Math.max(1, Math.floor(usableW / (lw + 4)));
      const rows = Math.max(1, Math.floor(usableH / (lh + 4)));
      const perPage = Math.max(1, cols * rows);

      for (let i = 0; i < lastLabels.length; i += perPage) {
        const page = document.createElement('div');
        page.className = 'print-page';
        page.style.display = 'grid';
        page.style.gridTemplateColumns = `repeat(${cols}, ${lw}mm)`;
        page.style.gap = '4mm';
        page.style.justifyContent = 'start';
        page.style.alignContent = 'start';
        lastLabels.slice(i, i + perPage).forEach((label) => {
          const printWrap = document.createElement('div');
          printWrap.className = 'print-label';
          LabelRender.renderLabelTo(printWrap, label);
          page.appendChild(printWrap);
        });
        sheet.appendChild(page);
      }
      lastLabels.slice(0, 8).forEach((label) => appendPreviewThumb(preview, label));
    }

    function appendPreviewThumb(preview, label) {
      const screenWrap = document.createElement('div');
      screenWrap.className = 'print-thumb';
      const tag = document.createElement('div');
      tag.className = 'muted';
      tag.style.fontSize = '12px';
      tag.style.marginBottom = '4px';
      tag.textContent = label.type === 'child' ? '配件' : (label.manual ? '自定义' : '总包');
      screenWrap.appendChild(tag);
      const inner = document.createElement('div');
      LabelRender.renderLabelTo(inner, label);
      screenWrap.appendChild(inner);
      preview.appendChild(screenWrap);
    }
  }

  // ---------------- Count orders ----------------
  async function renderCount(root) {
    if (!canImport()) {
      root.innerHTML = `<div class="card"><div class="flash warn">仅导入员/管理员可配置计数订单；扫码员请到「扫码 → 计数扫码」。</div></div>`;
      return;
    }

    const list = await API.get('/count/batches');
    root.innerHTML = `
      <div class="card">
        <h2>计数订单</h2>
        <p class="muted">导入订单 → 配置公式衍生列（如数量÷箱规得整箱/余数）→ 指定识别列与目标数量列 → 到「扫码 / 计数扫码」按行累计。</p>
        <div id="countFlash"></div>
        <div class="row" style="align-items:end;gap:12px;flex-wrap:wrap">
          <label class="field"><span>批次名称</span><input id="countName" placeholder="例如：8月出货计数" /></label>
          <label class="field"><span>订单 Excel</span><input id="countFile" type="file" accept=".xlsx,.xls,.csv" /></label>
          <button class="btn" id="countCreateBtn" type="button">导入创建</button>
        </div>
      </div>
      <div class="card">
        <h3>批次列表</h3>
        <div class="table-wrap">
          <table>
            <thead><tr><th>名称</th><th>状态</th><th>进度</th><th>时间</th><th></th></tr></thead>
            <tbody>
              ${(list.items || []).map((b) => `
                <tr>
                  <td>${escapeHtml(b.name)}</td>
                  <td>${statusTag(b.status)}</td>
                  <td>${b.stats?.complete || 0}/${b.stats?.total || 0}</td>
                  <td class="muted">${escapeHtml(b.created_at || '')}</td>
                  <td><button class="btn secondary" data-open-count="${b.id}" type="button">配置</button></td>
                </tr>`).join('') || '<tr><td colspan="5" class="muted">暂无计数批次</td></tr>'}
            </tbody>
          </table>
        </div>
      </div>
      <div id="countDetail"></div>
    `;

    $('#countCreateBtn', root).addEventListener('click', async () => {
      const file = $('#countFile', root).files?.[0];
      if (!file) return flash($('#countFlash', root), '请选择 Excel 文件', 'error');
      const fd = new FormData();
      fd.append('file', file);
      fd.append('name', $('#countName', root).value.trim() || file.name);
      try {
        const res = await API.upload('/count/create', fd);
        flash($('#countFlash', root), '导入成功，请配置公式列', 'success');
        await openCountBatch(res.id);
      } catch (err) {
        flash($('#countFlash', root), err.message, 'error');
      }
    });

    $$('[data-open-count]', root).forEach((btn) => {
      btn.addEventListener('click', () => openCountBatch(btn.dataset.openCount));
    });

    async function openCountBatch(id) {
      const detail = await API.get(`/count/batches/${id}`);
      const batch = detail.batch;
      const cfg = batch.config || {};
      const derived = Array.isArray(cfg.derived) ? cfg.derived : [];
      const headers = batch.headers || [];
      const panel = $('#countDetail', root);
      panel.innerHTML = `
        <div class="card">
          <div class="row" style="justify-content:space-between;align-items:center">
            <h3>${escapeHtml(batch.name)} ${statusTag(batch.status)}</h3>
            <div class="row">
              <button class="btn secondary" id="countResetBtn" type="button">重置计数进度</button>
              <button class="btn secondary" id="countDelBtn" type="button">删除批次</button>
            </div>
          </div>
          <p class="muted">原列：${headers.map(escapeHtml).join('、') || '-'}</p>

          <h4 style="margin-top:14px">1）公式衍生列</h4>
          <p class="muted">可添加多组整除拆分：源列可先加减乘除/公式调整，再÷除数得到商与余数；商/余数还可再自定义加减等。条件不满足时该衍生列为空。</p>
          <div class="formula-hint-box">
            <div><strong>公式提醒</strong>（VALUE=当前步骤的值）：</div>
            <div class="muted" style="margin-top:4px">快捷：<code>+10</code> <code>-5</code> <code>*2</code> <code>/3</code>　完整：<code>VALUE()+10</code> <code>VALUE()*2+1</code> <code>VALUE()+FIELD("调整数")</code> <code>IF(VALUE()>0,VALUE()-1,0)</code></div>
          </div>
          <div id="derivedList"></div>
          <datalist id="countFormulaHints">
            <option value="+10"></option>
            <option value="-5"></option>
            <option value="*2"></option>
            <option value="/3"></option>
            <option value="VALUE()+10"></option>
            <option value="VALUE()*2+1"></option>
            <option value="VALUE()+FIELD(&quot;调整数&quot;)"></option>
            <option value="IF(VALUE()>0,VALUE()-1,0)"></option>
          </datalist>
          <datalist id="countExprHints">
            <option value="{订单号}-{料号}"></option>
            <option value="FIELD(&quot;订单号&quot;)&amp;&quot;-&quot;&amp;FIELD(&quot;料号&quot;)"></option>
            <option value="CONCAT(FIELD(&quot;订单号&quot;),FIELD(&quot;料号&quot;))"></option>
            <option value="&quot;前缀&quot;&amp;FIELD(&quot;订单号&quot;)"></option>
          </datalist>
          <div class="row" style="margin-top:8px">
            <button class="btn secondary" id="addDivModBtn" type="button">+ 整除拆分列</button>
            <button class="btn secondary" id="addExprBtn" type="button">+ 表达式列</button>
          </div>

          <h4 style="margin-top:18px">2）计数扫码字段</h4>
          <div class="row" style="flex-wrap:wrap;gap:12px">
            <label class="field"><span>扫码识别列（匹配条码内容）</span>
              <select id="scanCodeField"></select>
            </label>
            <label class="field"><span>目标数量列（累计到达即满足）</span>
              <select id="qtyField"></select>
            </label>
          </div>

          <div class="row" style="margin-top:14px">
            <button class="btn" id="saveCountCfgBtn" type="button">保存并计算</button>
          </div>
          <div id="countCfgFlash" style="margin-top:10px"></div>

          <h4 style="margin-top:18px">预览（最多 50 行）</h4>
          <div class="table-wrap" id="countPreview"></div>
        </div>
      `;

      let rules = derived.map((r) => ({ ...r }));

      function fieldOptions(selected) {
        const derivedNames = [];
        rules.forEach((r) => {
          if (r.type === 'div_mod') {
            if (r.quotient_name) derivedNames.push(r.quotient_name);
            if (r.remainder_name) derivedNames.push(r.remainder_name);
          } else if (r.type === 'expr' && r.name) derivedNames.push(r.name);
        });
        const all = [...headers, ...derivedNames.filter((n, i, a) => n && a.indexOf(n) === i)];
        return `<option value="">请选择</option>${all.map((h) =>
          `<option value="${escapeHtml(h)}" ${h === selected ? 'selected' : ''}>${escapeHtml(h)}</option>`
        ).join('')}`;
      }

      function refreshFieldSelects() {
        const scanSel = $('#scanCodeField', panel);
        const qtySel = $('#qtyField', panel);
        const s = scanSel.value || cfg.scan_code_field || '';
        const q = qtySel.value || cfg.qty_field || '';
        scanSel.innerHTML = fieldOptions(s);
        qtySel.innerHTML = fieldOptions(q);
      }

      function renderRules() {
        const box = $('#derivedList', panel);
        box.innerHTML = rules.map((r, idx) => {
          if (r.type === 'div_mod') {
            return `<div class="derived-card" data-idx="${idx}">
              <div class="row" style="justify-content:space-between"><strong>整除拆分 #${idx + 1}</strong>
                <button class="btn secondary" data-del="${idx}" type="button">删除</button></div>
              <div class="row" style="flex-wrap:wrap;gap:8px;margin-top:8px">
                <label class="field"><span>源列</span>
                  <select data-k="source_field">${headers.map((h) =>
                    `<option value="${escapeHtml(h)}" ${h === r.source_field ? 'selected' : ''}>${escapeHtml(h)}</option>`
                  ).join('')}</select>
                </label>
                <label class="field" style="flex:1.4"><span>除前调整公式（可选）</span>
                  <input data-k="before_formula" value="${escapeHtml(r.before_formula || '')}" placeholder="如 +10 或 VALUE()*2" list="countFormulaHints" />
                </label>
                <label class="field"><span>除数</span><input data-k="divisor" type="number" value="${escapeHtml(r.divisor ?? 1)}" /></label>
              </div>
              <div class="row" style="flex-wrap:wrap;gap:8px;margin-top:8px">
                <label class="field"><span>商列名</span><input data-k="quotient_name" value="${escapeHtml(r.quotient_name || '')}" placeholder="如：整箱数" /></label>
                <label class="field" style="flex:1.4"><span>商结果调整公式（可选）</span>
                  <input data-k="quotient_formula" value="${escapeHtml(r.quotient_formula || '')}" placeholder="如 -1 或 VALUE()+FIELD(&quot;补数&quot;)" list="countFormulaHints" />
                </label>
              </div>
              <div class="row" style="flex-wrap:wrap;gap:8px;margin-top:8px">
                <label class="field"><span>余数列名</span><input data-k="remainder_name" value="${escapeHtml(r.remainder_name || '')}" placeholder="如：余数" /></label>
                <label class="field" style="flex:1.4"><span>余数结果调整公式（可选）</span>
                  <input data-k="remainder_formula" value="${escapeHtml(r.remainder_formula || '')}" placeholder="如 +0 或留空" list="countFormulaHints" />
                </label>
              </div>
              <div class="formula-chips" data-chip-target="${idx}">
                <span class="muted">点选插入：</span>
                ${['+1','-1','+10','-10','*2','/2','VALUE()+1','VALUE()-1','VALUE()*2','VALUE()+FIELD("调整数")'].map((s) =>
                  `<button type="button" class="chip" data-chip="${escapeHtml(s)}">${escapeHtml(s)}</button>`
                ).join('')}
              </div>
              <div class="row" style="flex-wrap:wrap;gap:8px;margin-top:8px">
                <label class="field"><span>条件列（可选）</span>
                  <select data-k="cond_field"><option value="">无条件</option>${headers.map((h) =>
                    `<option value="${escapeHtml(h)}" ${r.condition?.field === h ? 'selected' : ''}>${escapeHtml(h)}</option>`
                  ).join('')}</select>
                </label>
                <label class="field"><span>条件</span>
                  <select data-k="cond_op">
                    ${[['eq','等于'],['neq','不等于'],['contains','包含'],['gt','大于'],['gte','大于等于'],['lt','小于'],['lte','小于等于']].map(([v,l]) =>
                      `<option value="${v}" ${(r.condition?.op || 'eq') === v ? 'selected' : ''}>${l}</option>`
                    ).join('')}
                  </select>
                </label>
                <label class="field"><span>条件值</span><input data-k="cond_value" value="${escapeHtml(r.condition?.value || '')}" /></label>
              </div>
              <p class="muted" style="margin-top:8px;font-size:12px">计算顺序：源列 → 除前公式 → ÷除数 → 得到商/余数 → 再分别套用商/余数调整公式</p>
            </div>`;
          }
          return `<div class="derived-card" data-idx="${idx}">
            <div class="row" style="justify-content:space-between"><strong>表达式列 #${idx + 1}</strong>
              <button class="btn secondary" data-del="${idx}" type="button">删除</button></div>
            <div class="row" style="flex-wrap:wrap;gap:8px;margin-top:8px">
              <label class="field"><span>列名</span><input data-k="name" value="${escapeHtml(r.name || '')}" placeholder="如：识别码" /></label>
              <label class="field" style="flex:2"><span>公式</span>
                <input data-k="formula" value="${escapeHtml(r.formula || '')}" placeholder='{订单号}-{料号} 或 FIELD("订单号")&amp;"-"&amp;FIELD("料号")' list="countExprHints" /></label>
            </div>
            <div class="formula-chips" data-expr-chips="${idx}">
              <span class="muted">识别内容常用：</span>
              ${[
                '{订单号}',
                '{订单号}-{料号}',
                'FIELD("订单号")&"-"&FIELD("料号")',
                'CONCAT(FIELD("订单号"),FIELD("料号"))',
                '"固定前缀"&FIELD("订单号")'
              ].map((s) => `<button type="button" class="chip" data-chip="${escapeHtml(s)}">${escapeHtml(s)}</button>`).join('')}
            </div>
            <p class="muted" style="margin-top:8px;font-size:12px">
              拼识别码请用 <code>&amp;</code> 连接（不要用 +）。也支持 <code>{列名}</code> 模板。保存后看下方「识别码」列是否已算出内容。
            </p>
          </div>`;
        }).join('') || '<div class="muted">尚未添加衍生列</div>';

        $$('[data-del]', box).forEach((btn) => {
          btn.addEventListener('click', () => {
            rules.splice(Number(btn.dataset.del), 1);
            renderRules();
            refreshFieldSelects();
          });
        });
        $$('.derived-card', box).forEach((card) => {
          const idx = Number(card.dataset.idx);
          card.addEventListener('change', syncRuleFromCard);
          card.addEventListener('input', syncRuleFromCard);
          function syncRuleFromCard() {
            const r = rules[idx];
            if (!r) return;
            if (r.type === 'div_mod') {
              r.source_field = $('[data-k="source_field"]', card)?.value || '';
              r.before_formula = $('[data-k="before_formula"]', card)?.value || '';
              r.divisor = $('[data-k="divisor"]', card)?.value || '';
              r.quotient_name = $('[data-k="quotient_name"]', card)?.value || '';
              r.quotient_formula = $('[data-k="quotient_formula"]', card)?.value || '';
              r.remainder_name = $('[data-k="remainder_name"]', card)?.value || '';
              r.remainder_formula = $('[data-k="remainder_formula"]', card)?.value || '';
              const cf = $('[data-k="cond_field"]', card)?.value || '';
              if (cf) {
                r.condition = {
                  field: cf,
                  op: $('[data-k="cond_op"]', card)?.value || 'eq',
                  value: $('[data-k="cond_value"]', card)?.value || ''
                };
              } else {
                delete r.condition;
              }
            } else {
              r.name = $('[data-k="name"]', card)?.value || '';
              r.formula = $('[data-k="formula"]', card)?.value || '';
            }
            refreshFieldSelects();
          }
        });
        // 点选公式芯片 → 写入该卡片内最近聚焦的公式框
        $$('.formula-chips', box).forEach((chips) => {
          const card = chips.closest('.derived-card');
          let lastInput = card?.querySelector('[data-k="before_formula"], [data-k="formula"]');
          card?.querySelectorAll('[data-k$="_formula"], [data-k="formula"]').forEach((inp) => {
            inp.addEventListener('focus', () => { lastInput = inp; });
          });
          $$('[data-chip]', chips).forEach((btn) => {
            btn.addEventListener('click', () => {
              const target = lastInput || card?.querySelector('[data-k="before_formula"], [data-k="formula"]');
              if (!target) return;
              target.value = btn.dataset.chip || '';
              target.dispatchEvent(new Event('input', { bubbles: true }));
              target.focus();
            });
          });
        });
        refreshFieldSelects();
      }

      function renderPreview(rows) {
        const cols = [];
        headers.forEach((h) => cols.push(h));
        rules.forEach((r) => {
          if (r.type === 'div_mod') {
            if (r.quotient_name) cols.push(r.quotient_name);
            if (r.remainder_name) cols.push(r.remainder_name);
          } else if (r.name) cols.push(r.name);
        });
        const uniq = [...new Set(cols)];
        const scanField = $('#scanCodeField', panel)?.value || cfg.scan_code_field || '';
        const emptyScan = (rows || []).filter((row) => !String(row.scan_code || '').trim()).length;
        $('#countPreview', panel).innerHTML = `
          ${scanField ? `<div class="muted" style="margin-bottom:8px">当前识别列：<strong>${escapeHtml(scanField)}</strong>${emptyScan ? ` <span class="tag warn">${emptyScan} 行识别码为空，请检查表达式</span>` : ' <span class="tag ok">已生成识别码</span>'}</div>` : '<div class="flash warn">请选择扫码识别列后再保存</div>'}
          <table>
            <thead><tr><th>#</th>${uniq.map((c) => `<th>${escapeHtml(c)}</th>`).join('')}
              <th>识别码</th><th>目标</th><th>已扫</th><th>状态</th></tr></thead>
            <tbody>
              ${(rows || []).map((row) => `
                <tr>
                  <td>${row.line_no}</td>
                  ${uniq.map((c) => `<td>${escapeHtml(row.computed?.[c] ?? row.raw?.[c] ?? '')}</td>`).join('')}
                  <td>${row.scan_code ? escapeHtml(row.scan_code) : '<span class="tag warn">空</span>'}</td>
                  <td>${row.target_qty}</td>
                  <td>${row.scanned_count}</td>
                  <td>${statusTag(row.status)}</td>
                </tr>`).join('') || '<tr><td class="muted" colspan="99">无数据</td></tr>'}
            </tbody>
          </table>`;
      }

      renderRules();
      renderPreview(detail.rows || []);

      $('#addDivModBtn', panel).addEventListener('click', () => {
        rules.push({
          type: 'div_mod',
          source_field: headers[0] || '',
          divisor: 1,
          quotient_name: '整商',
          remainder_name: '余数'
        });
        renderRules();
      });
      $('#addExprBtn', panel).addEventListener('click', () => {
        rules.push({ type: 'expr', name: '', formula: '' });
        renderRules();
      });

      $('#saveCountCfgBtn', panel).addEventListener('click', async () => {
        // sync latest inputs
        $$('.derived-card', panel).forEach((card) => {
          card.dispatchEvent(new Event('change'));
        });
        try {
          const res = await API.put(`/count/batches/${id}/config`, {
            derived: rules,
            scan_code_field: $('#scanCodeField', panel).value,
            qty_field: $('#qtyField', panel).value
          });
          flash($('#countCfgFlash', panel), '已保存并重新计算', 'success');
          renderPreview(res.rows || []);
          // refresh list status lightly
          await renderCount(root);
          await openCountBatch(id);
        } catch (err) {
          flash($('#countCfgFlash', panel), err.message, 'error');
        }
      });

      $('#countResetBtn', panel).addEventListener('click', async () => {
        if (!confirm('确认重置本批次全部计数进度？')) return;
        await API.post(`/count/batches/${id}/reset-progress`, {});
        flash($('#countCfgFlash', panel), '进度已重置', 'info');
        openCountBatch(id);
      });
      $('#countDelBtn', panel).addEventListener('click', async () => {
        if (!confirm('确认删除该计数批次？')) return;
        await API.del(`/count/batches/${id}`);
        await renderCount(root);
      });
    }
  }

  // ---------------- Scan ----------------
  async function renderScan(root) {
    let mode = 'inbound'; // inbound | lookup | count
    let countBatchId = state.countBatchId || null;
    let countBusy = false;
    let scanTimer = null;

    const batches = await API.get('/count/batches').catch(() => ({ items: [] }));

    root.innerHTML = `
      <div class="card">
        <h2>扫码</h2>
        <div class="mode-tabs" id="scanModeTabs">
          <button type="button" class="mode-tab active" data-mode="inbound">扫码入库</button>
          <button type="button" class="mode-tab" data-mode="lookup">扫码查单</button>
          <button type="button" class="mode-tab" data-mode="count">计数扫码</button>
        </div>
        <p class="muted" id="scanModeHint">扫描枪输入后回车自动提交，无需再点确认。</p>
        <div id="scanFlash"></div>
        <div class="scan-hero">
          <div>
            <div id="countBatchBar" class="hidden" style="margin-bottom:10px">
              <label class="field"><span>计数批次</span>
                <select id="countBatchSel">
                  <option value="">请选择批次</option>
                  ${(batches.items || []).map((b) =>
                    `<option value="${b.id}" ${b.id === countBatchId ? 'selected' : ''}>${escapeHtml(b.name)}（${b.stats?.complete || 0}/${b.stats?.total || 0}）</option>`
                  ).join('')}
                </select>
              </label>
            </div>
            <label class="field"><span>扫描枪输入（回车自动提交）</span>
              <input class="scan-input" id="scanCode" placeholder="请扫描条码/二维码" autocomplete="off" />
            </label>
            <div class="row" style="margin-top:10px">
              <button class="btn secondary hidden" id="scanBtn" type="button">手动确认</button>
              <button class="btn secondary" id="clearPkgBtn" type="button">清空当前总包</button>
            </div>
          </div>
          <div id="pkgPanel"><div class="muted">等待扫描总包…</div></div>
        </div>
      </div>
    `;

    const input = $('#scanCode', root);
    input.focus();

    function setMode(next) {
      mode = next;
      $$('.mode-tab', root).forEach((btn) => {
        btn.classList.toggle('active', btn.dataset.mode === mode);
      });
      const hint = $('#scanModeHint', root);
      const clearBtn = $('#clearPkgBtn', root);
      const batchBar = $('#countBatchBar', root);
      if (mode === 'lookup') {
        hint.textContent = '扫码查单：扫描后自动查询，不改变入库状态。';
        clearBtn.style.display = 'none';
        batchBar.classList.add('hidden');
        renderLookup(null);
      } else if (mode === 'count') {
        hint.textContent = '计数扫码：按当前订单行识别码累计；达到目标数量后提示「已满足」并自动进入下一行。扫码回车即提交。';
        clearBtn.style.display = 'none';
        batchBar.classList.remove('hidden');
        loadCountCurrent();
      } else {
        hint.textContent = '扫码入库：先扫总包再扫配件。扫描枪回车自动提交，无需点确认。';
        clearBtn.style.display = '';
        batchBar.classList.add('hidden');
        if (state.currentPackageId) {
          API.get(`/scan/packages/${state.currentPackageId}`).then(renderPkg).catch(() => {
            state.currentPackageId = null;
            renderPkg(null);
          });
        } else {
          renderPkg(null);
        }
      }
      input.value = '';
      input.focus();
    }

    async function loadCountCurrent() {
      countBatchId = $('#countBatchSel', root).value || null;
      state.countBatchId = countBatchId;
      if (!countBatchId) {
        $('#pkgPanel', root).innerHTML = '<div class="muted">请先选择计数批次（在「计数订单」中导入并配置）</div>';
        return;
      }
      try {
        const res = await API.get(`/count/batches/${countBatchId}/current`);
        renderCountPanel(res);
      } catch (err) {
        $('#pkgPanel', root).innerHTML = `<div class="flash error">${escapeHtml(err.message)}</div>`;
      }
    }

    function renderCountPanel(res) {
      const batch = res.batch;
      const cur = res.current;
      if (!cur) {
        $('#pkgPanel', root).innerHTML = `
          <div>
            <div class="count-big ok">本批次已全部满足</div>
            <div class="muted" style="margin-top:8px">${escapeHtml(batch?.name || '')} · 完成 ${batch?.stats?.complete || 0}/${batch?.stats?.total || 0}</div>
          </div>`;
        return;
      }
      const progress = `${cur.scanned_count}/${cur.target_qty}`;
      const pct = cur.target_qty > 0 ? Math.min(100, Math.round((cur.scanned_count / cur.target_qty) * 100)) : 0;
      $('#pkgPanel', root).innerHTML = `
        <div>
          <div class="row" style="gap:8px;align-items:center;margin-bottom:8px">
            ${statusTag(cur.status)}
            <strong>第 ${cur.line_no} 行</strong>
          </div>
          <div class="count-big">${progress}</div>
          <div class="count-bar"><span style="width:${pct}%"></span></div>
          <div style="margin-top:10px"><strong>应扫识别码：</strong>${escapeHtml(cur.scan_code || '-')}</div>
          <div class="muted" style="margin-top:6px">批次：${escapeHtml(batch?.name || '')}（${batch?.stats?.complete || 0}/${batch?.stats?.total || 0}）</div>
          <div class="kv-list" style="margin-top:10px;max-height:220px;overflow:auto">
            ${Object.entries(cur.computed || {}).slice(0, 12).map(([k, v]) =>
              `<div><span class="muted">${escapeHtml(k)}</span>：${escapeHtml(v)}</div>`
            ).join('')}
          </div>
        </div>`;
    }

    const doScan = async () => {
      const code = input.value.trim();
      if (!code || countBusy) return;
      countBusy = true;
      try {
        if (mode === 'lookup') {
          const res = await API.post('/scan/lookup', { code });
          flash($('#scanFlash', root), res.message, 'success');
          renderLookup(res);
        } else if (mode === 'count') {
          if (!countBatchId) {
            flash($('#scanFlash', root), '请先选择计数批次', 'error');
            return;
          }
          const res = await API.post('/count/scan', { code, batch_id: countBatchId });
          flash($('#scanFlash', root), res.message, res.row_completed ? 'success' : 'info');
          renderCountPanel(res);
        } else {
          const res = await API.post('/scan/scan', {
            code,
            current_package_id: state.currentPackageId
          });
          if (res.scan_type === 'master') {
            state.currentPackageId = res.package.id;
            if (res.previous_shortage) {
              flash($('#scanFlash', root), `上一总包未齐套，已标记缺漏：${res.previous_shortage.package_code}`, 'warn');
            } else {
              flash($('#scanFlash', root), res.message, 'success');
            }
          } else {
            flash($('#scanFlash', root), res.message, 'success');
            if (res.package) state.currentPackageId = res.package.id;
          }
          renderPkg(res.package);
        }
        input.value = '';
        input.focus();
      } catch (err) {
        const data = err.data || {};
        if (mode === 'inbound' && data.package) {
          if (data.package.status === 'complete') {
            if (state.currentPackageId === data.package.id) state.currentPackageId = null;
          }
          renderPkg(data.package);
        }
        if (mode === 'count' && data.current) {
          renderCountPanel({ batch: data.batch, current: data.current });
        }
        if (data.previous_shortage) {
          flash($('#scanFlash', root), `${err.message}；上一总包未齐套已标记缺漏：${data.previous_shortage.package_code}`, 'warn');
        } else {
          flash($('#scanFlash', root), err.message, 'error');
        }
        input.select();
      } finally {
        countBusy = false;
      }
    };

    function rawPreview(raw, limit = 8) {
      const entries = Object.entries(raw || {}).slice(0, limit);
      if (!entries.length) return '<div class="muted">无订单明细字段</div>';
      return `<div class="kv-list">${entries.map(([k, v]) =>
        `<div><span class="muted">${escapeHtml(k)}</span>：${escapeHtml(v)}</div>`
      ).join('')}</div>`;
    }

    function renderPkg(pkg) {
      if (!pkg) {
        $('#pkgPanel', root).innerHTML = '<div class="muted">等待扫描总包…</div>';
        return;
      }
      $('#pkgPanel', root).innerHTML = `
        <div>
          <div>${statusTag(pkg.status)} <strong>${escapeHtml(pkg.order_no)}</strong></div>
          <div class="muted" style="margin:6px 0">总包码：${escapeHtml(pkg.package_code)}</div>
          <div>进度：${pkg.scanned_children}/${pkg.total_children}${pkg.status === 'complete' ? '（已齐套）' : ''}</div>
          <div class="child-list" style="margin-top:10px">
            ${(pkg.children || []).map((c) => `
              <div class="child-item ${c.scanned ? 'done' : ''}">
                <div>
                  <div>${escapeHtml(c.part_no)} × ${c.qty}</div>
                  <div class="muted" style="font-size:12px">${escapeHtml(c.child_code)}</div>
                </div>
                <div>${c.scanned ? '<span class="tag ok">已扫</span>' : '<span class="tag muted">待扫</span>'}</div>
              </div>`).join('')}
          </div>
        </div>
      `;
    }

    function renderLookup(res) {
      if (!res || !res.package) {
        $('#pkgPanel', root).innerHTML = '<div class="muted">扫码后显示订单信息…</div>';
        return;
      }
      const pkg = res.package;
      const child = res.child;
      $('#pkgPanel', root).innerHTML = `
        <div>
          <div class="row" style="gap:8px;align-items:center;margin-bottom:8px">
            <span class="tag info">${res.match_type === 'child' ? '配件码' : '总包码'}</span>
            ${statusTag(pkg.status)}
          </div>
          <div><strong>订单号：</strong>${escapeHtml(pkg.order_no || '-')}</div>
          <div class="muted" style="margin:4px 0">批次：${escapeHtml(pkg.batch_name || '-')}</div>
          <div>母件：${escapeHtml(pkg.mother_part_no || '-')}</div>
          <div class="muted" style="margin:4px 0">总包码：${escapeHtml(pkg.package_code)}</div>
          <div>齐套进度：${pkg.scanned_children}/${pkg.total_children}</div>
          ${child ? `
            <hr style="border:none;border-top:1px solid var(--line);margin:10px 0" />
            <div><strong>当前配件</strong></div>
            <div>料号：${escapeHtml(child.part_no)} × ${child.qty}</div>
            <div class="muted">配件码：${escapeHtml(child.child_code)}</div>
            <div>${child.scanned ? '<span class="tag ok">已扫</span>' : '<span class="tag muted">未扫</span>'}</div>
            <div style="margin-top:8px">${rawPreview(child.raw)}</div>
          ` : `
            <hr style="border:none;border-top:1px solid var(--line);margin:10px 0" />
            <div><strong>总包订单字段</strong></div>
            <div style="margin-top:6px">${rawPreview(pkg.master_raw)}</div>
          `}
          <div class="child-list" style="margin-top:12px">
            <div class="muted" style="margin-bottom:6px">配件清单</div>
            ${(pkg.children || []).map((c) => `
              <div class="child-item ${c.scanned ? 'done' : ''}${child && child.id === c.id ? ' cell-active' : ''}">
                <div>
                  <div>${escapeHtml(c.part_no)} × ${c.qty}</div>
                  <div class="muted" style="font-size:12px">${escapeHtml(c.child_code)}</div>
                </div>
                <div>${c.scanned ? '<span class="tag ok">已扫</span>' : '<span class="tag muted">待扫</span>'}</div>
              </div>`).join('')}
          </div>
        </div>
      `;
    }

    if (state.currentPackageId && mode === 'inbound') {
      try {
        const pkg = await API.get(`/scan/packages/${state.currentPackageId}`);
        renderPkg(pkg);
      } catch {
        state.currentPackageId = null;
      }
    }

    $$('[data-mode]', root).forEach((btn) => {
      btn.addEventListener('click', () => setMode(btn.dataset.mode));
    });
    $('#scanBtn', root).addEventListener('click', doScan);
    input.addEventListener('keydown', (e) => {
      if (e.key === 'Enter') {
        e.preventDefault();
        clearTimeout(scanTimer);
        doScan();
      }
    });
    $('#countBatchSel', root)?.addEventListener('change', loadCountCurrent);
    $('#clearPkgBtn', root).addEventListener('click', () => {
      state.currentPackageId = null;
      renderPkg(null);
      flash($('#scanFlash', root), '已清空当前总包上下文', 'info');
      input.focus();
    });
  }

  // ---------------- History ----------------
  async function renderHistory(root) {
    root.innerHTML = `
      <div class="card">
        <h2>扫码记录与报表</h2>
        <div id="histFlash"></div>
        <div class="row">
          <label class="field"><span>订单号</span><input id="qOrder" /></label>
          <label class="field"><span>开始日期</span><input id="qFrom" type="date" /></label>
          <label class="field"><span>结束日期</span><input id="qTo" type="date" /></label>
          <label class="field"><span>总包状态</span>
            <select id="qStatus">
              <option value="">全部</option>
              <option value="unscanned">未扫</option>
              <option value="scanning">扫码中</option>
              <option value="complete">已齐套</option>
              <option value="shortage">有缺漏</option>
            </select>
          </label>
        </div>
        <div class="row" style="margin-top:10px">
          <button class="btn" id="searchBtn" type="button">查询</button>
          <button class="btn secondary" id="exportBtn" type="button">导出 Excel</button>
        </div>
      </div>
      <div class="card">
        <h3>总包状态</h3>
        <div class="table-wrap" id="pkgTable"></div>
      </div>
      <div class="card">
        <h3>扫描明细</h3>
        <div class="table-wrap" id="logTable"></div>
      </div>
    `;

    const load = async () => {
      const order_no = $('#qOrder', root).value.trim();
      const date_from = $('#qFrom', root).value;
      const date_to = $('#qTo', root).value;
      const status = $('#qStatus', root).value;
      const qs = new URLSearchParams();
      if (order_no) qs.set('order_no', order_no);
      if (date_from) qs.set('date_from', date_from);
      if (date_to) qs.set('date_to', date_to);
      if (status) qs.set('status', status);
      const [pkgs, logs] = await Promise.all([
        API.get(`/scan/packages?${qs.toString()}`),
        API.get(`/scan/logs?${qs.toString()}`)
      ]);
      $('#pkgTable', root).innerHTML = `<table>
        <thead><tr><th>订单号</th><th>总包码</th><th>状态</th><th>进度</th><th>最近扫描</th></tr></thead>
        <tbody>${(pkgs.items || []).map((p) => `
          <tr>
            <td>${escapeHtml(p.order_no)}</td>
            <td>${escapeHtml(p.package_code)}</td>
            <td>${statusTag(p.status)}</td>
            <td>${p.scanned_children}/${p.total_children}</td>
            <td>${escapeHtml(p.last_scan_at || '-')}</td>
          </tr>`).join('') || '<tr><td colspan="5">无数据</td></tr>'}
        </tbody></table>`;
      $('#logTable', root).innerHTML = `<table>
        <thead><tr><th>时间</th><th>操作人</th><th>类型</th><th>码</th><th>结果</th><th>说明</th><th>订单号</th></tr></thead>
        <tbody>${(logs.items || []).map((l) => `
          <tr>
            <td>${escapeHtml(l.created_at)}</td>
            <td>${escapeHtml(l.username || '')}</td>
            <td>${escapeHtml(l.scan_type)}</td>
            <td>${escapeHtml(l.code_content)}</td>
            <td>${l.success ? statusTag('success') : statusTag('failed')}</td>
            <td>${escapeHtml(l.message || '')}</td>
            <td>${escapeHtml(l.order_no || '')}</td>
          </tr>`).join('') || '<tr><td colspan="7">无数据</td></tr>'}
        </tbody></table>`;
    };

    $('#searchBtn', root).addEventListener('click', () => load().catch((e) => flash($('#histFlash', root), e.message, 'error')));
    $('#exportBtn', root).addEventListener('click', async () => {
      const qs = new URLSearchParams();
      if ($('#qOrder', root).value.trim()) qs.set('order_no', $('#qOrder', root).value.trim());
      if ($('#qFrom', root).value) qs.set('date_from', $('#qFrom', root).value);
      if ($('#qTo', root).value) qs.set('date_to', $('#qTo', root).value);
      try {
        const res = await fetch(`/api/scan/export?${qs.toString()}`, {
          headers: { Authorization: `Bearer ${API.token}` }
        });
        if (!res.ok) throw new Error('导出失败');
        const blob = await res.blob();
        const url = URL.createObjectURL(blob);
        const a = document.createElement('a');
        a.href = url;
        a.download = 'scan-logs.xlsx';
        a.click();
        URL.revokeObjectURL(url);
      } catch (err) {
        flash($('#histFlash', root), err.message, 'error');
      }
    });

    await load();
  }

  boot();
})();
