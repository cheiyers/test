(function (root) {
  const FORMULA_HEADER_RE = /备注|公式|用量|计算数量|数量公式/;

  function Formula() {
    return root.PoFormula;
  }

  function Fields() {
    return root.PoFields;
  }

  function cellText(v) {
    if (v == null) return "";
    return String(v).trim();
  }

  function isFormulaCell(text) {
    const s = cellText(text);
    return s.charAt(0) === "=" || /\{[^}]+\}/.test(s);
  }

  function nonemptyRow(row) {
    return (row || []).some(function (c) {
      return cellText(c);
    });
  }

  function unbalanced(s) {
    let p = 0;
    let b = 0;
    const t = String(s || "");
    for (let i = 0; i < t.length; i++) {
      if (t[i] === "(") p++;
      else if (t[i] === ")") p--;
      else if (t[i] === "{") b++;
      else if (t[i] === "}") b--;
    }
    return p > 0 || b > 0;
  }

  function joinSplitFormulas(row) {
    const out = [];
    for (let i = 0; i < (row || []).length; i++) {
      let cell = row[i] == null ? "" : String(row[i]);
      if (cell.charAt(0) === "=" && unbalanced(cell)) {
        while (i + 1 < row.length && unbalanced(cell)) {
          i++;
          cell += "," + (row[i] == null ? "" : String(row[i]));
        }
      }
      out.push(cell);
    }
    return out;
  }

  function parseCsv(text) {
    const s = String(text || "").replace(/^\ufeff/, "");
    const rows = [];
    let row = [];
    let cur = "";
    let inQuotes = false;
    for (let i = 0; i < s.length; i++) {
      const c = s[i];
      if (inQuotes) {
        if (c === '"') {
          if (s[i + 1] === '"') {
            cur += '"';
            i++;
          } else {
            inQuotes = false;
          }
        } else {
          cur += c;
        }
        continue;
      }
      if (c === '"') {
        inQuotes = true;
        continue;
      }
      if (c === ",") {
        row.push(cur);
        cur = "";
        continue;
      }
      if (c === "\n") {
        row.push(cur);
        rows.push(joinSplitFormulas(row));
        row = [];
        cur = "";
        continue;
      }
      if (c === "\r") continue;
      cur += c;
    }
    if (cur !== "" || row.length) {
      row.push(cur);
      rows.push(joinSplitFormulas(row));
    }
    return rows.filter(nonemptyRow);
  }

  function parseTemplate(aoa, name) {
    const lines = (aoa || []).filter(nonemptyRow);
    if (!lines.length) {
      return { name: name || "", headers: [], rows: [], formulaCols: [], variables: [], qtyCol: -1 };
    }
    const headers = lines[0].map(function (h) {
      return cellText(h);
    });
    while (headers.length && !headers[headers.length - 1]) headers.pop();
    const formulaCols = [];
    headers.forEach(function (h, i) {
      if (FORMULA_HEADER_RE.test(h)) formulaCols.push(i);
    });
    const rows = [];
    lines.slice(1).forEach(function (raw) {
      const cells = headers.map(function (_, i) {
        return cellText(raw[i]);
      });
      if (!cells.some(Boolean)) return;
      cells.forEach(function (c, i) {
        if (isFormulaCell(c) && formulaCols.indexOf(i) < 0) formulaCols.push(i);
      });
      rows.push(cells);
    });
    let qtyCol = headers.findIndex(function (h) {
      return /备注|公式|用量|计算数量|数量公式/.test(h);
    });
    if (qtyCol < 0) qtyCol = formulaCols.length ? formulaCols[0] : -1;
    const variables = collectVariables(rows, formulaCols);
    return {
      name: name || "",
      headers: headers,
      rows: rows,
      formulaCols: formulaCols,
      variables: variables,
      qtyCol: qtyCol,
    };
  }

  function parseLookup(aoa, name) {
    const lines = (aoa || []).filter(nonemptyRow);
    if (!lines.length) {
      return { name: name || "", headers: [], rows: [], key: "" };
    }
    const headers = lines[0].map(function (h) {
      return cellText(h);
    });
    while (headers.length && !headers[headers.length - 1]) headers.pop();
    const rows = lines.slice(1).map(function (raw) {
      return headers.map(function (_, i) {
        return cellText(raw[i]);
      });
    }).filter(function (cells) {
      return cells.some(Boolean);
    });
    const keyHit = headers.find(function (h) {
      return /物料号|料号|物料编码|material/i.test(h);
    });
    return { name: name || "", headers: headers, rows: rows, key: keyHit || headers[0] || "" };
  }

  function collectVariables(rows, formulaCols) {
    const Fml = Formula();
    const seen = {};
    const names = [];
    (rows || []).forEach(function (cells) {
      (formulaCols || []).forEach(function (i) {
        const list = Fml && Fml.extractNames ? Fml.extractNames(cells[i]) : [];
        list.forEach(function (n) {
          if (seen[n]) return;
          seen[n] = true;
          names.push(n);
        });
      });
    });
    return names;
  }

  function guessVarMap(name, extraKeywords) {
    const F = Fields();
    const field = F ? F.resolveKeyword(name) : null;
    if (field && field.id) {
      return { name: name, mode: "column", value: field.id };
    }
    const extras = extraKeywords || [];
    const hit = extras.find(function (k) {
      return k.label === name || k.id === name;
    });
    if (hit) return { name: name, mode: "column", value: hit.id };
    return { name: name, mode: "column", value: "" };
  }

  function mergeVarMaps(variables, existing, extraKeywords) {
    const prev = {};
    (existing || []).forEach(function (m) {
      if (m && m.name) prev[m.name] = m;
    });
    return (variables || []).map(function (name) {
      if (prev[name] && prev[name].mode) {
        return { name: name, mode: prev[name].mode, value: prev[name].value || "" };
      }
      return guessVarMap(name, extraKeywords);
    });
  }

  function bindContext(row, extraKeywords, varMaps) {
    const F = Fields();
    const Fml = Formula();
    const ctx = F ? F.rowContext(row, extraKeywords) : {};
    (varMaps || []).forEach(function (m) {
      if (!m || !m.name) return;
      if (m.mode === "const") {
        ctx[m.name] = m.value == null ? "" : String(m.value);
        return;
      }
      if (m.mode === "column") {
        const field = F ? F.fieldById(m.value, extraKeywords) || F.resolveKeyword(m.value) : null;
        ctx[m.name] = field && F ? F.fieldValue(row, field) : ctx[m.value] || "";
      }
    });
    (varMaps || []).forEach(function (m) {
      if (!m || m.mode !== "formula") return;
      const expr = String(m.value || "");
      ctx[m.name] = Fml ? Fml.stringify(Fml.evaluate(expr, ctx)) : expr;
    });
    return ctx;
  }

  function evalCell(text, ctx) {
    const Fml = Formula();
    const s = cellText(text);
    if (!s) return "";
    if (!Fml) return s;
    if (s.charAt(0) === "=" || /\{[^}]+\}/.test(s)) return Fml.stringify(Fml.evaluate(s, ctx));
    return s;
  }

  function orderSnapshot(row) {
    if (!row) return {};
    const snap = {
      id: row.id || "",
      poNumber: row.poNumber || "",
      lineNo: row.lineNo || "",
      materialNo: row.materialNo || "",
      materialGroup: row.materialGroup || "",
      description: row.description || "",
      qty: row.qty || "",
      unit: row.unit || "",
      unitPrice: row.unitPrice || "",
      amount: row.amount || "",
      documentDate: row.documentDate || "",
      deliveryDate: row.deliveryDate || "",
      supplierName: row.supplierName || "",
      extras: Object.assign({}, row.extras || {}),
    };
    Object.keys(row).forEach(function (k) {
      if (snap[k] != null && snap[k] !== "") return;
      if (k.charAt(0) === "_") return;
      const v = row[k];
      if (v == null || typeof v === "object") return;
      snap[k] = v;
    });
    return snap;
  }

  function compute(orderRows, template, varMaps, extraKeywords, lookup, templateId) {
    const out = [];
    const tpl = template || { headers: [], rows: [], formulaCols: [], qtyCol: -1 };
    const look = lookup && lookup.headers && lookup.headers.length ? lookup : null;
    (orderRows || []).forEach(function (row) {
      const ctx = bindContext(row, extraKeywords, varMaps);
      (tpl.rows || []).forEach(function (cells, ri) {
        const rec = {
          _kind: "bom",
          _rowId: (row.id || "") + "-" + (templateId || tpl.name || "bom") + "-" + ri,
          _orderId: row.id || "",
          _orderKey: String(row.poNumber || "") + "\t" + String(row.lineNo || ""),
          _orderSnapshot: orderSnapshot(row),
          来源: "BOM模板",
          采购订单号: row.poNumber || "",
          行项目: row.lineNo || "",
          订单物料号: row.materialNo || "",
        };
        const local = Object.assign({}, ctx);
        (tpl.headers || []).forEach(function (h, i) {
          if (!h) return;
          local[h] = cells[i] || "";
        });
        (tpl.headers || []).forEach(function (h, i) {
          if (!h) return;
          const raw = cells[i] || "";
          rec[h] = (tpl.formulaCols || []).indexOf(i) >= 0 ? evalCell(raw, local) : raw;
        });
        if (tpl.qtyCol >= 0) {
          rec.计算数量 = rec[tpl.headers[tpl.qtyCol]] || evalCell(cells[tpl.qtyCol], local);
        } else {
          rec.计算数量 = "";
        }
        out.push(rec);
      });
      appendLookupRows(out, row, look);
    });
    return out;
  }

  function appendLookupRows(out, row, lookup) {
    const look = lookup && lookup.headers && lookup.headers.length ? lookup : null;
    if (!look || !row) return;
    const keyName = look.key || look.headers[0] || "";
    const keyIdx = look.headers.indexOf(keyName);
    const orderKey = String(row.materialNo || "").trim();
    if (keyIdx < 0 || !orderKey) return;
    look.rows.forEach(function (cells, li) {
      if (String(cells[keyIdx] || "").trim() !== orderKey) return;
      const rec = {
        _kind: "lookup",
        _rowId: (row.id || "") + "-lk-" + li,
        _orderId: row.id || "",
        _orderKey: String(row.poNumber || "") + "\t" + String(row.lineNo || ""),
        _orderSnapshot: orderSnapshot(row),
        来源: "料号对照",
        采购订单号: row.poNumber || "",
        行项目: row.lineNo || "",
        订单物料号: row.materialNo || "",
        计算数量: "",
      };
      look.headers.forEach(function (h, i) {
        if (h) rec[h] = cells[i] || "";
      });
      out.push(rec);
    });
  }

  function makeLibraryItem(template, name, id) {
    return {
      id: id || ("bom-" + Date.now().toString(36) + "-" + Math.random().toString(36).slice(2, 8)),
      name: name || (template && template.name) || "BOM",
      enabled: true,
      template: template,
    };
  }

  function normalizeLibrary(library, fallbackTemplate) {
    const seen = {};
    const out = [];
    function push(item) {
      if (!item || !item.template || !item.template.rows || !item.template.rows.length) return;
      let id = String(item.id || "");
      if (id && seen[id]) return;
      if (!id) {
        id = "bom-" + out.length + "-" + String(item.name || item.template.name || "t");
        let n = 2;
        while (seen[id]) {
          id = "bom-" + out.length + "-" + n;
          n++;
        }
      }
      seen[id] = true;
      out.push({
        id: id,
        name: item.name || item.template.name || "BOM",
        enabled: item.enabled !== false,
        template: item.template,
      });
    }
    (library || []).forEach(push);
    if (!out.length && fallbackTemplate) {
      push({ id: "bom-legacy", name: fallbackTemplate.name || "BOM", enabled: true, template: fallbackTemplate });
    }
    return out;
  }

  function libraryVariables(library) {
    const seen = {};
    const names = [];
    normalizeLibrary(library).forEach(function (item) {
      (item.template.variables || []).forEach(function (n) {
        if (!n || seen[n]) return;
        seen[n] = true;
        names.push(n);
      });
    });
    return names;
  }

  function enabledLibrary(library) {
    return normalizeLibrary(library).filter(function (item) {
      return item.enabled !== false;
    });
  }

  function libraryResultHeaders(library, lookup) {
    const items = enabledLibrary(library);
    if (items.length <= 1) {
      return resultHeaders(items[0] && items[0].template, lookup);
    }
    const seen = { 来源: 1, BOM模板: 1, 采购订单号: 1, 行项目: 1, 订单物料号: 1, 计算数量: 1 };
    const heads = ["来源", "BOM模板", "采购订单号", "行项目", "订单物料号"];
    function add(h) {
      if (!h || seen[h]) return;
      seen[h] = 1;
      heads.push(h);
    }
    items.forEach(function (item) {
      (item.template.headers || []).forEach(add);
    });
    ((lookup && lookup.headers) || []).forEach(add);
    heads.push("计算数量");
    return heads;
  }

  function computeLibrary(orderRows, library, varMaps, extraKeywords, lookup) {
    const items = enabledLibrary(library);
    if (!items.length) return [];
    const out = [];
    const multi = items.length > 1;
    (orderRows || []).forEach(function (row) {
      items.forEach(function (item) {
        const part = compute([row], item.template, varMaps, extraKeywords, null, item.id);
        part.forEach(function (r) {
          r._templateId = item.id;
          r._templateName = item.name;
          if (multi) r.BOM模板 = item.name;
          out.push(r);
        });
      });
      appendLookupRows(out, row, lookup);
    });
    return uniqueRows(out);
  }

  function resultHeaders(template, lookup) {
    const heads = ["来源", "采购订单号", "行项目", "订单物料号"];
    const seen = { 来源: 1, 采购订单号: 1, 行项目: 1, 订单物料号: 1, 计算数量: 1 };
    function add(h) {
      if (!h || seen[h]) return;
      seen[h] = 1;
      heads.push(h);
    }
    ((template && template.headers) || []).forEach(add);
    ((lookup && lookup.headers) || []).forEach(add);
    heads.push("计算数量");
    return heads;
  }

  function toMatrix(rows, headers) {
    const cols = headers || resultHeaders();
    const body = (rows || []).map(function (row) {
      return cols.map(function (h) {
        return row[h] == null ? "" : String(row[h]);
      });
    });
    return [cols].concat(body);
  }

  const EXPORT_ALIASES = {
    物料编码: "子件料号",
    子件编码: "子件料号",
    料号: "子件料号",
    编码: "子件料号",
    物料名称: "子件描述",
    子件名称: "子件描述",
    名称: "子件描述",
    描述: "子件描述",
    数量: "计算数量",
    用量: "计算数量",
    需求数量: "计算数量",
    计算用量: "计算数量",
    订单号: "采购订单号",
    PO: "采购订单号",
    采购订单: "采购订单号",
    行号: "行项目",
    行项目号: "行项目",
    母件料号: "订单物料号",
    订单物料: "订单物料号",
    订单料号: "订单物料号",
  };

  function parseExportTemplate(aoa, name) {
    const lines = (aoa || []).filter(nonemptyRow);
    if (!lines.length) return { name: name || "", headers: [] };
    const headers = [];
    const seen = {};
    (lines[0] || []).forEach(function (h) {
      const t = cellText(h);
      if (!t) return;
      let label = t;
      let n = 2;
      while (seen[label]) {
        label = t + "_" + n;
        n++;
      }
      seen[label] = true;
      headers.push(label);
    });
    return { name: name || "", headers: headers };
  }

  function guessExportMap(header, bomHeaders, extraKeywords) {
    const h = cellText(header);
    const heads = bomHeaders || [];
    if (heads.indexOf(h) >= 0) return { header: h, mode: "bom", value: h };
    const alias = EXPORT_ALIASES[h];
    if (alias && heads.indexOf(alias) >= 0) return { header: h, mode: "bom", value: alias };
    const F = Fields();
    const field = F ? F.resolveKeyword(h) : null;
    if (field && F && F.isBuiltinId(field.id)) {
      if (heads.indexOf(field.label) >= 0) return { header: h, mode: "bom", value: field.label };
      return { header: h, mode: "order", value: field.id };
    }
    const extra = (extraKeywords || []).find(function (k) {
      return k && (k.label === h || k.id === h);
    });
    if (extra) return { header: h, mode: "order", value: extra.id || extra.label };
    return { header: h, mode: "bom", value: "" };
  }

  function mergeExportMaps(headers, existing, bomHeaders, extraKeywords) {
    const prev = {};
    (existing || []).forEach(function (m) {
      if (m && m.header && !prev[m.header]) prev[m.header] = m;
    });
    const seen = {};
    const out = [];
    (headers || []).forEach(function (h) {
      if (!h || seen[h]) return;
      seen[h] = true;
      if (prev[h] && prev[h].mode) {
        out.push({ header: h, mode: prev[h].mode, value: prev[h].value || "" });
      } else {
        out.push(guessExportMap(h, bomHeaders, extraKeywords));
      }
    });
    return out;
  }

  function isEmptyCell(v) {
    if (v == null) return true;
    const s = String(v).trim();
    return !s || s === "—" || s === "-";
  }

  function isZeroCell(v) {
    if (isEmptyCell(v)) return false;
    const Fml = Formula();
    const n = Fml && Fml.parseNumber ? Fml.parseNumber(v) : Number(String(v).replace(/,/g, ""));
    return n === 0;
  }

  function shouldSkipRow(value, skipRule) {
    const rule = skipRule || {};
    if (!rule.enabled) return false;
    const empty = rule.empty !== false;
    const zero = rule.zero !== false;
    if (empty && isEmptyCell(value)) return true;
    if (zero && isZeroCell(value)) return true;
    return false;
  }

  function filterExportRows(rows, skipRule) {
    const rule = skipRule || {};
    if (!rule.enabled) return rows || [];
    const col = rule.column || "计算数量";
    return (rows || []).filter(function (row) {
      return !shouldSkipRow(row[col], rule);
    });
  }

  function uniqueRows(rows) {
    const seen = {};
    return (rows || []).filter(function (row) {
      if (!row) return false;
      const id = row._rowId || [
        row._kind || "",
        row._templateId || "",
        row.采购订单号 || "",
        row.行项目 || "",
        row.子件料号 || "",
        row.对照料号 || "",
        row.计算数量 || "",
      ].join("\t");
      if (seen[id]) return false;
      seen[id] = true;
      return true;
    });
  }

  function uniqueExportMaps(maps) {
    return mergeExportMaps(
      (maps || []).map(function (m) {
        return m && m.header;
      }).filter(Boolean),
      maps,
      [],
      []
    );
  }

  function resolveOrder(bom, orderById, orderList) {
    if (!bom) return {};
    if (bom._orderId && orderById && orderById[bom._orderId]) return orderById[bom._orderId];
    const list = orderList || (orderById ? Object.keys(orderById).map(function (k) { return orderById[k]; }) : []);
    const key = bom._orderKey || (String(bom.采购订单号 || "") + "\t" + String(bom.行项目 || ""));
    if (key && key !== "\t") {
      for (let i = 0; i < list.length; i++) {
        const k = String(list[i].poNumber || "") + "\t" + String(list[i].lineNo || "");
        if (k === key) return list[i];
      }
    }
    const po = String(bom.采购订单号 || "");
    const line = String(bom.行项目 || "");
    if (po && line) {
      for (let i = 0; i < list.length; i++) {
        if (String(list[i].poNumber || "") === po && String(list[i].lineNo || "") === line) return list[i];
      }
    }
    return bom._orderSnapshot || {};
  }

  function applyExport(bomRows, orderById, extraKeywords, maps, orderList) {
    const F = Fields();
    const Fml = Formula();
    const rows = uniqueRows(bomRows);
    return rows.map(function (bom) {
      const order = resolveOrder(bom, orderById, orderList);
      const orderCtx = F ? F.rowContext(order, extraKeywords) : {};
      const ctx = Object.assign({}, orderCtx, bom);
      const out = {
        _rowId: bom._rowId,
        _kind: bom._kind,
        _orderId: order.id || bom._orderId || "",
      };
      (maps || []).forEach(function (m) {
        if (!m || !m.header) return;
        if (m.mode === "const") {
          out[m.header] = m.value == null ? "" : String(m.value);
          return;
        }
        if (m.mode === "formula") {
          out[m.header] = Fml ? Fml.stringify(Fml.evaluate(m.value || "", ctx)) : String(m.value || "");
          return;
        }
        if (m.mode === "order") {
          const field = F ? F.fieldById(m.value, extraKeywords) || F.resolveKeyword(m.value) : null;
          let val = field && F ? F.fieldValue(order, field) : (orderCtx[m.value] || "");
          if ((val == null || val === "") && bom._orderSnapshot && field && F) {
            val = F.fieldValue(bom._orderSnapshot, field);
          }
          out[m.header] = val;
          return;
        }
        const key = m.value || m.header;
        if (bom[key] != null && bom[key] !== "") {
          out[m.header] = String(bom[key]);
          return;
        }
        out[m.header] = ctx[key] != null ? String(ctx[key]) : "";
      });
      return out;
    });
  }

  function exportMatrix(rows, maps) {
    const headers = (maps || []).map(function (m) { return m.header; });
    const body = (rows || []).map(function (row) {
      return headers.map(function (h) {
        return row[h] == null ? "" : String(row[h]);
      });
    });
    return [headers].concat(body);
  }

  const api = {
    parseCsv: parseCsv,
    parseTemplate: parseTemplate,
    parseLookup: parseLookup,
    collectVariables: collectVariables,
    guessVarMap: guessVarMap,
    mergeVarMaps: mergeVarMaps,
    bindContext: bindContext,
    compute: compute,
    resultHeaders: resultHeaders,
    toMatrix: toMatrix,
    isFormulaCell: isFormulaCell,
    parseExportTemplate: parseExportTemplate,
    guessExportMap: guessExportMap,
    mergeExportMaps: mergeExportMaps,
    isEmptyCell: isEmptyCell,
    isZeroCell: isZeroCell,
    shouldSkipRow: shouldSkipRow,
    filterExportRows: filterExportRows,
    applyExport: applyExport,
    exportMatrix: exportMatrix,
    uniqueRows: uniqueRows,
    uniqueExportMaps: uniqueExportMaps,
    resolveOrder: resolveOrder,
    orderSnapshot: orderSnapshot,
    makeLibraryItem: makeLibraryItem,
    normalizeLibrary: normalizeLibrary,
    libraryVariables: libraryVariables,
    enabledLibrary: enabledLibrary,
    libraryResultHeaders: libraryResultHeaders,
    computeLibrary: computeLibrary,
  };
  if (typeof module !== "undefined" && module.exports) module.exports = api;
  root.PoBom = api;
})(typeof window !== "undefined" ? window : globalThis);
