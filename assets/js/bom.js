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

  function compute(orderRows, template, varMaps, extraKeywords, lookup) {
    const out = [];
    const tpl = template || { headers: [], rows: [], formulaCols: [], qtyCol: -1 };
    const look = lookup && lookup.headers && lookup.headers.length ? lookup : null;
    (orderRows || []).forEach(function (row) {
      const ctx = bindContext(row, extraKeywords, varMaps);
      (tpl.rows || []).forEach(function (cells, ri) {
        const rec = {
          _kind: "bom",
          _rowId: (row.id || "") + "-bom-" + ri,
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
      if (look) {
        const keyName = look.key || look.headers[0] || "";
        const keyIdx = look.headers.indexOf(keyName);
        const orderKey = String(row.materialNo || "").trim();
        if (keyIdx >= 0 && orderKey) {
          look.rows.forEach(function (cells, li) {
            if (String(cells[keyIdx] || "").trim() !== orderKey) return;
            const rec = {
              _kind: "lookup",
              _rowId: (row.id || "") + "-lk-" + li,
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
      }
    });
    return out;
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

  const api = {
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
  };
  if (typeof module !== "undefined" && module.exports) module.exports = api;
  root.PoBom = api;
})(typeof window !== "undefined" ? window : globalThis);
