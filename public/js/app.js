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
    admin: ['home', 'bom', 'orders', 'templates', 'print', 'scan', 'history'],
    importer: ['home', 'bom', 'orders', 'templates', 'print', 'history'],
    scanner: ['home', 'scan', 'history']
  };

  const PAGE_LABELS = {
    home: '首页',
    bom: 'BOM 管理',
    orders: '订单关联',
    templates: '标签模板',
    print: '生成打印',
    scan: '扫码入库',
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
      labelled: ['已生成标签', 'ok']
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
      btn.addEventListener('click', () => navigate(btn.dataset.page));
    });
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
        <p class="muted">上传预览后，自选「哪一列是母件列」以及「本 BOM 的母件是哪个值」。同母件可多版本共存。</p>
        <div id="bomFlash"></div>
        <div class="grid-2">
          <div>
            <h3>上传 BOM</h3>
            <p class="muted" style="margin:0 0 10px;font-size:13px">
              可先下载模板填写。模板列：母件料号、子件料号、规格、数量、备注。上传后自选母件列与母件值。
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
      const opts = (selected) => previewHeaders.map((h) =>
        `<option value="${escapeHtml(h)}" ${h === selected ? 'selected' : ''}>${escapeHtml(h)}</option>`
      ).join('');
      const box = $('#bomMapBox', root);
      box.classList.remove('hidden');
      box.innerHTML = `
        <label class="field"><span>名称</span><input id="bomName" value="${escapeHtml(data.filename)}" /></label>
        <label class="field"><span>版本说明</span><input id="bomVersion" placeholder="如 2026-08-04 上午版" /></label>
        <div class="grid-2" style="margin-top:8px">
          <label class="field"><span>1. 哪一列是母件列</span><select id="mapMother"><option value="">请选择</option>${opts(map.mother_part_no)}</select></label>
          <label class="field"><span>2. 本 BOM 的母件是哪个</span><select id="mapMotherValue"><option value="">请先选择母件列</option></select></label>
        </div>
        <div class="grid-2" style="margin-top:8px">
          <label class="field"><span>子件料号列</span><select id="mapPart"><option value="">请选择</option>${opts(map.part_no)}</select></label>
          <label class="field"><span>数量列（可选）</span><select id="mapQty"><option value="">默认 1</option>${opts(map.qty)}</select></label>
        </div>
        <label class="field" style="margin-top:8px"><span>参与匹配的列（可多选，需与配件订单一致）</span>
          <select id="mapMatch" multiple size="5">${previewHeaders.map((h) =>
            `<option value="${escapeHtml(h)}" ${matchFields.includes(h) ? 'selected' : ''}>${escapeHtml(h)}</option>`
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
      if (map.mother_part_no) {
        $('#mapMother', box).value = map.mother_part_no;
      }
      refreshMotherValues();

      $('#bomImportBtn', box).addEventListener('click', async () => {
        const file = $('#bomFile', root).files[0];
        const matchSel = [...$('#mapMatch', box).selectedOptions].map((o) => o.value);
        const mapping = {
          mother_part_no: $('#mapMother', box).value,
          mother_value: $('#mapMotherValue', box).value,
          part_no: $('#mapPart', box).value,
          qty: $('#mapQty', box).value || null,
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
        $('#bomDetail', root).innerHTML = `
          <h3>${escapeHtml(detail.name)} · ${escapeHtml(detail.version_label)}</h3>
          <p class="muted">母件：${escapeHtml(detail.mother_part_no)} · 匹配字段：${escapeHtml((detail.match_fields || []).join(', '))}</p>
          <div class="table-wrap"><table>
            <thead><tr><th>#</th><th>料号</th><th>数量</th><th>原始行</th></tr></thead>
            <tbody>${detail.lines.map((l) => `
              <tr><td>${l.line_no}</td><td>${escapeHtml(l.part_no)}</td><td>${l.qty}</td>
              <td><code>${escapeHtml(JSON.stringify(l.raw))}</code></td></tr>`).join('')}
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
        <div id="orderFlash"></div>
        <div class="grid-2">
          <div>
            <h3>1. 上传总包订单 + 配件订单</h3>
            <div class="row" style="margin-bottom:10px">
              <a class="btn secondary" href="/templates/master_order_template.xlsx" download>下载总包订单模板</a>
              <a class="btn secondary" href="/templates/accessory_order_template.xlsx" download>下载配件订单模板</a>
            </div>
            <label class="field"><span>批次名称</span><input id="batchName" placeholder="如 8月4日上午出货" /></label>
            <label class="field"><span>总包订单 Excel</span><input type="file" id="masterFile" accept=".xlsx,.xls" /></label>
            <label class="field"><span>配件订单 Excel</span><input type="file" id="accFile" accept=".xlsx,.xls" /></label>
            <div class="row" style="margin-top:10px">
              <button class="btn secondary" id="previewOrdersBtn" type="button">预览映射</button>
            </div>
            <div id="orderMapBox" class="hidden" style="margin-top:12px"></div>
          </div>
          <div>
            <h3>已保存映射</h3>
            <p class="muted">总包规则 ${masterRules.items.length} 条 · 配件规则 ${accRules.items.length} 条</p>
            <div class="table-wrap"><table>
              <thead><tr><th>类型</th><th>名称</th><th>默认</th></tr></thead>
              <tbody>
                ${[...masterRules.items.map((r) => ({ ...r, _t: '总包' })), ...accRules.items.map((r) => ({ ...r, _t: '配件' }))]
                  .map((r) => `<tr><td>${r._t}</td><td>${escapeHtml(r.name)}</td><td>${r.is_default ? '是' : ''}</td></tr>`).join('') || '<tr><td colspan="3">暂无</td></tr>'}
              </tbody>
            </table></div>
          </div>
        </div>
      </div>
      <div class="card">
        <h3>批次列表</h3>
        <div class="table-wrap"><table>
          <thead><tr><th>名称</th><th>状态</th><th>总包/配件</th><th>匹配</th><th>BOM</th><th>创建时间</th><th></th></tr></thead>
          <tbody>
            ${(batches.items || []).map((b) => `
              <tr>
                <td>${escapeHtml(b.name)}</td>
                <td>${statusTag(b.status)}</td>
                <td>${b.master_count} / ${b.accessory_count}</td>
                <td>${b.master_ok || 0} 成功 / ${b.master_fail || 0} 失败</td>
                <td>${escapeHtml(b.bom_name || '-')} ${escapeHtml(b.bom_version || '')}</td>
                <td>${escapeHtml(b.created_at)}</td>
                <td>
                  <button class="btn secondary" data-open="${b.id}" type="button">打开</button>
                  <button class="btn danger" data-del="${b.id}" type="button">删除</button>
                </td>
              </tr>`).join('') || '<tr><td colspan="7">暂无批次</td></tr>'}
          </tbody>
        </table></div>
        <div id="batchDetail" style="margin-top:14px"></div>
      </div>
    `;

    let masterHeaders = [];
    let accHeaders = [];
    const defaultMaster = masterRules.items.find((r) => r.is_default);
    const defaultAcc = accRules.items.find((r) => r.is_default);

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
      box.innerHTML = `
        <h3>总包订单映射</h3>
        <div class="grid-2">
          <label class="field"><span>订单号/批次号列</span><select id="mOrder"><option value="">请选择</option>${opts(masterHeaders, mm.order_no)}</select></label>
          <label class="field"><span>母件料号列</span><select id="mMother"><option value="">请选择</option>${opts(masterHeaders, mm.mother_part_no)}</select></label>
        </div>
        <h3 style="margin-top:12px">配件订单映射</h3>
        <div class="grid-3">
          <label class="field"><span>订单号/批次号列</span><select id="aOrder"><option value="">请选择</option>${opts(accHeaders, am.order_no)}</select></label>
          <label class="field"><span>子件料号列</span><select id="aPart"><option value="">请选择</option>${opts(accHeaders, am.part_no)}</select></label>
          <label class="field"><span>数量列</span><select id="aQty"><option value="">默认1</option>${opts(accHeaders, am.qty)}</select></label>
        </div>
        <label class="field" style="margin-top:8px"><span><input type="checkbox" id="saveMaps" checked /> 保存映射规则</span></label>
        <div class="row" style="margin-top:10px"><button class="btn" id="createBatchBtn" type="button">创建批次</button></div>
      `;
      $('#createBatchBtn', box).addEventListener('click', async () => {
        const fd = new FormData();
        fd.append('name', $('#batchName', root).value || '');
        fd.append('master_file', $('#masterFile', root).files[0]);
        fd.append('accessory_file', $('#accFile', root).files[0]);
        fd.append('master_mapping', JSON.stringify({
          order_no: $('#mOrder', box).value,
          mother_part_no: $('#mMother', box).value,
          save_rule: $('#saveMaps', box).checked,
          set_default: true,
          rule_name: '总包默认映射'
        }));
        fd.append('accessory_mapping', JSON.stringify({
          order_no: $('#aOrder', box).value,
          part_no: $('#aPart', box).value,
          qty: $('#aQty', box).value || null,
          match_fields: [$('#aPart', box).value].filter(Boolean),
          save_rule: $('#saveMaps', box).checked,
          set_default: true,
          rule_name: '配件默认映射'
        }));
        try {
          const res = await API.upload('/batches/create', fd);
          flash($('#orderFlash', root), `批次已创建：总包 ${res.master_count} 行，配件 ${res.accessory_count} 行`, 'success');
          await navigate('orders');
          // open detail
          setTimeout(() => openBatch(res.id), 100);
        } catch (err) {
          flash($('#orderFlash', root), err.message, 'error');
        }
      });
    }

    async function openBatch(id) {
      const detail = await API.get(`/batches/${id}`);
      const candidates = await Promise.all(
        [...new Set((detail.masters || []).map((m) => m.mother_part_no).filter(Boolean))]
          .map(async (m) => {
            const r = await API.get(`/boms?mother_part_no=${encodeURIComponent(m)}`);
            return { mother_part_no: m, boms: r.items || [] };
          })
      );

      // collect possible match fields from first accessory raw + bom if any
      let fieldOptions = [];
      if (detail.accessories?.[0]) fieldOptions = Object.keys(detail.accessories[0].raw || {});

      $('#batchDetail', root).innerHTML = `
        <div class="card" style="box-shadow:none;border-style:dashed">
          <h3>${escapeHtml(detail.name)} ${statusTag(detail.status)}</h3>
          <p class="muted">总包 ${detail.masters.length} 行 · 配件 ${detail.accessories.length} 行</p>
          <div id="assocFlash"></div>
          ${detail.status === 'draft' || !detail.selected_bom_id ? `
            <h4>选择 BOM 版本并关联</h4>
            ${candidates.map((c) => `
              <div style="margin-bottom:10px">
                <div>母件 <strong>${escapeHtml(c.mother_part_no)}</strong> 候选版本：</div>
                ${c.boms.length ? c.boms.map((b) => `
                  <label style="display:block;margin:6px 0">
                    <input type="radio" name="bomPick" value="${b.id}" />
                    ${escapeHtml(b.name)} / ${escapeHtml(b.version_label)} （${b.line_count} 子件，${escapeHtml(b.created_at)}）
                  </label>`).join('') : '<div class="flash warn">无候选 BOM，请先上传</div>'}
              </div>`).join('')}
            <label class="field"><span>自定义匹配字段（BOM 与配件订单两边值须完全一致）</span>
              <select id="assocFields" multiple size="6">
                ${fieldOptions.map((f) => `<option value="${escapeHtml(f)}" ${f.includes('料号') || f.toLowerCase().includes('part') ? 'selected' : ''}>${escapeHtml(f)}</option>`).join('')}
              </select>
            </label>
            <div class="row" style="margin-top:10px"><button class="btn" id="assocBtn" type="button">开始关联</button></div>
          ` : `
            <p>已选 BOM：${escapeHtml(detail.bom_name || '')} / ${escapeHtml(detail.bom_version || '')}</p>
            <div class="row"><button class="btn secondary" id="reassocBtn" type="button">重新关联</button>
            <button class="btn" data-go-print="${detail.id}" type="button">去生成标签</button></div>
          `}
          <div class="grid-2" style="margin-top:14px">
            <div>
              <h4>总包订单</h4>
              <div class="table-wrap"><table>
                <thead><tr><th>#</th><th>订单号</th><th>母件</th><th>状态</th><th>说明</th></tr></thead>
                <tbody>${detail.masters.map((m) => `
                  <tr><td>${m.line_no}</td><td>${escapeHtml(m.order_no)}</td><td>${escapeHtml(m.mother_part_no)}</td>
                  <td>${statusTag(m.match_status)}</td><td>${escapeHtml(m.match_message || '')}</td></tr>`).join('')}
                </tbody>
              </table></div>
            </div>
            <div>
              <h4>配件订单</h4>
              <div class="table-wrap"><table>
                <thead><tr><th>#</th><th>订单号</th><th>料号</th><th>数量</th><th>状态</th><th>说明</th></tr></thead>
                <tbody>${detail.accessories.map((a) => `
                  <tr><td>${a.line_no}</td><td>${escapeHtml(a.order_no)}</td><td>${escapeHtml(a.part_no)}</td><td>${a.qty}</td>
                  <td>${statusTag(a.match_status)}</td><td>${escapeHtml(a.match_message || '')}</td></tr>`).join('')}
                </tbody>
              </table></div>
            </div>
          </div>
        </div>
      `;

      const doAssoc = async () => {
        const bomId = $('input[name="bomPick"]:checked', root)?.value;
        if (!bomId) return flash($('#assocFlash', root), '请选择 BOM 版本', 'error');
        const fields = [...($('#assocFields', root)?.selectedOptions || [])].map((o) => o.value);
        try {
          const res = await API.post(`/batches/${id}/associate`, { bom_id: bomId, match_fields: fields });
          flash($('#orderFlash', root),
            `关联完成：总包成功 ${res.result.master_success} / 失败 ${res.result.master_failed}；配件成功 ${res.result.accessory_success} / 失败 ${res.result.accessory_failed}`,
            'success');
          openBatch(id);
        } catch (err) {
          flash($('#assocFlash', root), err.message, 'error');
        }
      };
      $('#assocBtn', root)?.addEventListener('click', doAssoc);
      $('#reassocBtn', root)?.addEventListener('click', async () => {
        const pickerHost = $('#batchDetail', root);
        const cands = await Promise.all(
          [...new Set((detail.masters || []).map((m) => m.mother_part_no).filter(Boolean))]
            .map(async (m) => {
              const r = await API.get(`/boms?mother_part_no=${encodeURIComponent(m)}`);
              return { mother_part_no: m, boms: r.items || [] };
            })
        );
        let fieldOptions = [];
        if (detail.accessories?.[0]) fieldOptions = Object.keys(detail.accessories[0].raw || {});
        const form = document.createElement('div');
        form.innerHTML = `
          <div class="flash info">重新选择 BOM 版本并关联</div>
          ${cands.map((c) => `
            <div style="margin-bottom:10px">
              <div>母件 <strong>${escapeHtml(c.mother_part_no)}</strong></div>
              ${c.boms.map((b) => `
                <label style="display:block;margin:6px 0">
                  <input type="radio" name="bomPick" value="${b.id}" />
                  ${escapeHtml(b.name)} / ${escapeHtml(b.version_label)}
                </label>`).join('') || '<div class="flash warn">无候选 BOM</div>'}
            </div>`).join('')}
          <label class="field"><span>匹配字段</span>
            <select id="assocFields" multiple size="6">
              ${fieldOptions.map((f) => `<option value="${escapeHtml(f)}" selected>${escapeHtml(f)}</option>`).join('')}
            </select>
          </label>
          <div class="row" style="margin-top:10px"><button class="btn" id="assocBtn" type="button">开始关联</button></div>
          <div id="assocFlash"></div>
        `;
        pickerHost.prepend(form);
        $('#assocBtn', form)?.addEventListener('click', doAssoc);
      });
      $$('[data-go-print]', root).forEach((b) => b.addEventListener('click', () => {
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
                <td>${t.code_mode === 'unique' ? '唯一编号' : '字段拼接'} / ${t.code_type}</td>
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
    const [batches, masterTpls, childTpls] = await Promise.all([
      API.get('/batches'),
      API.get('/templates?label_type=master'),
      API.get('/templates?label_type=child')
    ]);
    const labelled = (batches.items || []).filter((b) => b.status === 'associated' || b.status === 'labelled');
    root.innerHTML = `
      <div class="card">
        <h2>生成并打印标签</h2>
        <div id="printFlash"></div>
        <div class="row">
          <label class="field"><span>订单批次</span>
            <select id="printBatch">
              <option value="">请选择</option>
              ${labelled.map((b) => `<option value="${b.id}" ${state.printBatchId === b.id ? 'selected' : ''}>${escapeHtml(b.name)}（成功 ${b.master_ok || 0}）</option>`).join('')}
            </select>
          </label>
          <label class="field"><span>总包模板</span>
            <select id="printMasterTpl">${(masterTpls.items || []).map((t) => `<option value="${t.id}">${escapeHtml(t.name)}</option>`).join('')}</select>
          </label>
          <label class="field"><span>子件模板</span>
            <select id="printChildTpl">${(childTpls.items || []).map((t) => `<option value="${t.id}">${escapeHtml(t.name)}</option>`).join('')}</select>
          </label>
        </div>
        <div class="row" style="margin-top:12px">
          <button class="btn" id="genLabelsBtn" type="button">仅对匹配成功行生成标签</button>
          <button class="btn secondary" id="loadPrintBtn" type="button">加载打印预览</button>
          <button class="btn warn" id="doPrintBtn" type="button">打印</button>
        </div>
        <p class="muted" style="margin-top:8px">支持浏览器连接普通打印机或标签打印机；请在打印对话框中选择正确纸张/标签尺寸。</p>
      </div>
      <div class="card">
        <h3>预览</h3>
        <div id="printPreview" class="row" style="align-items:start"></div>
      </div>
    `;

    $('#genLabelsBtn', root).addEventListener('click', async () => {
      try {
        const res = await API.post('/labels/generate', {
          batch_id: $('#printBatch', root).value,
          master_template_id: $('#printMasterTpl', root).value,
          child_template_id: $('#printChildTpl', root).value,
          only_success: true
        });
        flash($('#printFlash', root), `已生成总包 ${res.master_created} 张、子件 ${res.child_created} 张`, 'success');
      } catch (err) {
        flash($('#printFlash', root), err.message, 'error');
      }
    });

    $('#loadPrintBtn', root).addEventListener('click', () => loadPreview());
    $('#doPrintBtn', root).addEventListener('click', () => {
      if (!$('#printSheet').innerHTML.trim()) {
        flash($('#printFlash', root), '请先加载打印预览', 'error');
        return;
      }
      window.print();
    });

    async function loadPreview() {
      const batchId = $('#printBatch', root).value;
      if (!batchId) return flash($('#printFlash', root), '请选择批次', 'error');
      try {
        const data = await API.get(`/labels/print-data?batch_id=${batchId}&master_template_id=${$('#printMasterTpl', root).value}&child_template_id=${$('#printChildTpl', root).value}`);
        renderLabels(data.labels || []);
        flash($('#printFlash', root), `已加载 ${data.count} 张标签`, 'success');
      } catch (err) {
        flash($('#printFlash', root), err.message, 'error');
      }
    }

    function renderLabels(labels) {
      const preview = $('#printPreview', root);
      const sheet = $('#printSheet');
      preview.innerHTML = `<p class="muted">共 ${labels.length} 张，已准备打印。</p>`;
      sheet.innerHTML = '';

      labels.forEach((label, idx) => {
        const printWrap = document.createElement('div');
        printWrap.className = 'print-label';
        printWrap.style.pageBreakAfter = 'always';
        LabelRender.renderLabelTo(printWrap, label);
        sheet.appendChild(printWrap);

        if (idx < 6) {
          const screenWrap = document.createElement('div');
          screenWrap.style.border = '1px solid #c9d8cf';
          screenWrap.style.borderRadius = '10px';
          screenWrap.style.margin = '8px';
          screenWrap.style.transform = 'scale(0.85)';
          screenWrap.style.transformOrigin = 'top left';
          LabelRender.renderLabelTo(screenWrap, label);
          preview.appendChild(screenWrap);
        }
      });
    }
  }

  // ---------------- Scan ----------------
  async function renderScan(root) {
    root.innerHTML = `
      <div class="card">
        <h2>扫码入库</h2>
        <p class="muted">先扫总包，再扫子件；子件无顺序；不可重复。切换到下一个总包时，未齐套将自动标记为「有缺漏」。</p>
        <div id="scanFlash"></div>
        <div class="scan-hero">
          <div>
            <label class="field"><span>扫描枪输入（回车提交）</span>
              <input class="scan-input" id="scanCode" placeholder="请扫描条码/二维码" autocomplete="off" />
            </label>
            <div class="row" style="margin-top:10px">
              <button class="btn" id="scanBtn" type="button">确认</button>
              <button class="btn secondary" id="clearPkgBtn" type="button">清空当前总包</button>
            </div>
          </div>
          <div id="pkgPanel"><div class="muted">等待扫描总包…</div></div>
        </div>
      </div>
    `;

    const input = $('#scanCode', root);
    input.focus();

    const doScan = async () => {
      const code = input.value.trim();
      if (!code) return;
      try {
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
          if (res.completed) state.currentPackageId = res.package.id;
        }
        renderPkg(res.package);
        input.value = '';
        input.focus();
      } catch (err) {
        flash($('#scanFlash', root), err.message, 'error');
        input.select();
      }
    };

    function renderPkg(pkg) {
      if (!pkg) {
        $('#pkgPanel', root).innerHTML = '<div class="muted">等待扫描总包…</div>';
        return;
      }
      $('#pkgPanel', root).innerHTML = `
        <div>
          <div>${statusTag(pkg.status)} <strong>${escapeHtml(pkg.order_no)}</strong></div>
          <div class="muted" style="margin:6px 0">总包码：${escapeHtml(pkg.package_code)}</div>
          <div>进度：${pkg.scanned_children}/${pkg.total_children}</div>
          <div class="child-list" style="margin-top:10px">
            ${pkg.children.map((c) => `
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

    if (state.currentPackageId) {
      try {
        const pkg = await API.get(`/scan/packages/${state.currentPackageId}`);
        renderPkg(pkg);
      } catch {
        state.currentPackageId = null;
      }
    }

    $('#scanBtn', root).addEventListener('click', doScan);
    input.addEventListener('keydown', (e) => {
      if (e.key === 'Enter') {
        e.preventDefault();
        doScan();
      }
    });
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
