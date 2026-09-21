(function (root) {
  const CORE_FIELDS = [
    { id: "poNumber", label: "采购订单号", group: "core" },
    { id: "documentDate", label: "凭证日期", group: "core" },
    { id: "lineNo", label: "行项目", group: "core" },
    { id: "materialNo", label: "物料号", group: "core" },
    { id: "materialGroup", label: "物料组", group: "core" },
    { id: "description", label: "物料描述", group: "core" },
    { id: "deliveryDate", label: "交货日期", group: "core" },
    { id: "qty", label: "数量", group: "core" },
    { id: "unit", label: "单位", group: "core" },
    { id: "unitPrice", label: "未税单价", group: "core" },
    { id: "amount", label: "未税金额", group: "core" },
  ];

  const OPTIONAL_FIELDS = [
    { id: "supplierName", label: "供应商", group: "optional" },
    { id: "deliveryAddress", label: "交货地址", group: "optional" },
    { id: "paymentTerms", label: "付款条件", group: "optional" },
    { id: "companyCode", label: "公司代码", group: "optional" },
    { id: "plant", label: "工厂", group: "optional" },
  ];

  const HEADER_ALIASES = {
    公司代码: "companyCode",
    工厂: "plant",
    采购组: "purchaseGroup",
    供应商编号: "supplierCode",
    开票抬头: "billingTitle",
    打印日期: "printDate",
    文件编号: "fileNo",
    买方: "buyer",
    联系人: "buyerContact",
    邮箱: "buyerEmail",
    供应商联系人: "supplierContact",
    供应商电话: "supplierPhone",
    不含税总价: "vatTotal",
    采购订单号: "poNumber",
    凭证日期: "documentDate",
    交货日期: "deliveryDate",
    付款条件: "paymentTerms",
    供应商: "supplierName",
    交货地址: "deliveryAddress",
  };

  const KEYWORD_FIELDS = [
    { id: "drawingRev", label: "图号/版本", group: "keyword" },
    { id: "installCountry", label: "安装国家", group: "keyword" },
    { id: "groupTechCode", label: "成组技术码", group: "keyword" },
    { id: "transportType", label: "运输类型", group: "keyword" },
    { id: "deFlag", label: "D/E", group: "keyword" },
    { id: "productFamily", label: "产品家族", group: "keyword" },
    { id: "scmSize", label: "SCM大小/量纲", group: "keyword" },
  ];

  const ALL_BUILTIN = CORE_FIELDS.concat(OPTIONAL_FIELDS, KEYWORD_FIELDS);

  function flattenDocs(docs) {
    const rows = [];
    (docs || []).forEach(function (doc, di) {
      const header = doc.header || {};
      (doc.items || []).forEach(function (item, ii) {
        const extras = Object.assign({}, item.extras || {});
        KEYWORD_FIELDS.forEach(function (f) {
          if (extras[f.label] == null) extras[f.label] = item[f.id] || "";
        });
        const row = {
          id: (header.poNumber || doc.file || "po") + "-" + (item.lineNo || ii) + "-" + di + "-" + ii,
          file: doc.file || "",
          extras: extras,
          poNumber: header.poNumber || "",
          purchaseGroup: header.purchaseGroup || "",
          documentDate: header.documentDate || "",
          supplierName: header.supplierName || "",
          supplierCode: header.supplierCode || "",
          supplierContact: header.supplierContact || "",
          supplierPhone: header.supplierPhone || "",
          buyerEmail: header.buyerEmail || "",
          printDate: header.printDate || "",
          fileNo: header.fileNo || "",
          deliveryAddress: header.deliveryAddress || "",
          paymentTerms: header.paymentTerms || "",
          billingTitle: header.billingTitle || "",
          plant: header.plant || "",
          companyCode: header.companyCode || "",
          vatTotal: header.vatTotal || "",
          buyer: header.buyer || "",
          buyerContact: header.buyerContact || "",
          lineNo: item.lineNo || "",
          materialNo: item.materialNo || "",
          materialGroup: item.materialGroup || "",
          description: item.description || "",
          deliveryDate: item.deliveryDate || header.deliveryDate || "",
          qty: item.qty || "",
          unit: item.unit || "",
          unitPrice: item.unitPrice || "",
          amount: item.amount || "",
          drawingRev: item.drawingRev || extras["图号/版本"] || "",
          installCountry: item.installCountry || extras["安装国家"] || "",
          groupTechCode: item.groupTechCode || extras["成组技术码"] || "",
          transportType: item.transportType || extras["运输类型"] || "",
          deFlag: item.deFlag || extras["D/E"] || "",
          productFamily: item.productFamily || extras["产品家族"] || "",
          scmSize: item.scmSize || extras["SCM大小/量纲"] || "",
          reviewFlags: item.reviewFlags || [],
        };
        Object.keys(HEADER_ALIASES).forEach(function (label) {
          const id = HEADER_ALIASES[label];
          if (!extras[label]) extras[label] = row[id] || "";
        });
        rows.push(row);
      });
    });
    return rows;
  }

  function resolveKeyword(label) {
    const name = String(label || "").trim();
    if (!name) return null;
    const builtin = ALL_BUILTIN.find(function (f) {
      return f.label === name || f.id === name;
    });
    if (builtin) return builtin;
    const aliasId = HEADER_ALIASES[name];
    if (aliasId) {
      const mapped = ALL_BUILTIN.find(function (f) {
        return f.id === aliasId;
      });
      return mapped || { id: aliasId, label: name, group: "keyword" };
    }
    return { id: "kw-" + name, label: name, group: "keyword" };
  }

  function fieldById(id, extraKeywords) {
    const hit = ALL_BUILTIN.find(function (f) {
      return f.id === id;
    });
    if (hit) return hit;
    const byAlias = Object.keys(HEADER_ALIASES).find(function (label) {
      return HEADER_ALIASES[label] === id;
    });
    if (byAlias) return { id: id, label: byAlias, group: "keyword" };
    const custom = (extraKeywords || []).find(function (k) {
      return k.id === id || k.label === id;
    });
    if (custom) return { id: custom.id || custom.label, label: custom.label, group: "keyword" };
    return null;
  }

  function fieldValue(row, field) {
    if (!row || !field) return "";
    if (row[field.id] != null && String(row[field.id]) !== "") return String(row[field.id]);
    if (row.extras && row.extras[field.label]) return String(row.extras[field.label]);
    const aliasId = HEADER_ALIASES[field.label];
    if (aliasId && row[aliasId]) return String(row[aliasId]);
    return "";
  }

  function rowContext(row, extraKeywords) {
    const ctx = {};
    ALL_BUILTIN.forEach(function (f) {
      const v = fieldValue(row, f);
      ctx[f.id] = v;
      ctx[f.label] = v;
    });
    Object.keys(HEADER_ALIASES).forEach(function (label) {
      const id = HEADER_ALIASES[label];
      const v = (row && row[id]) || (row.extras && row.extras[label]) || "";
      ctx[label] = v;
      ctx[id] = v;
    });
    Object.keys(row.extras || {}).forEach(function (label) {
      if (ctx[label] == null || ctx[label] === "") ctx[label] = row.extras[label];
    });
    (extraKeywords || []).forEach(function (k) {
      const field = resolveKeyword(k.label || k.id);
      const v = fieldValue(row, field);
      ctx[k.label || k.id] = v;
      if (k.id) ctx[k.id] = v;
      if (field && field.id) ctx[field.id] = v;
      if (field && field.label) ctx[field.label] = v;
    });
    ctx.file = row.file || "";
    return ctx;
  }

  function discoverExtraKeywords(rows) {
    const builtin = {};
    ALL_BUILTIN.forEach(function (f) {
      builtin[f.label] = true;
    });
    Object.keys(HEADER_ALIASES).forEach(function (label) {
      builtin[label] = true;
    });
    const found = [];
    const seen = {};
    (rows || []).forEach(function (row) {
      Object.keys(row.extras || {}).forEach(function (label) {
        if (!label || builtin[label] || seen[label]) return;
        if (!row.extras[label]) return;
        seen[label] = true;
        found.push({ id: "kw-" + label, label: label, discovered: true });
      });
    });
    return found;
  }

  function isBuiltinId(id) {
    return ALL_BUILTIN.some(function (f) {
      return f.id === id;
    });
  }

  function defaultSelectedIds() {
    return CORE_FIELDS.concat(KEYWORD_FIELDS).map(function (f) {
      return f.id;
    });
  }

  function normalizeKeywordsAndSelection(extraKeywords, selectedIds) {
    const selected = {};
    (selectedIds || []).forEach(function (id) {
      if (id) selected[id] = true;
    });
    const nextKw = [];
    const seenLabel = {};
    (extraKeywords || []).forEach(function (k) {
      const field = resolveKeyword(k.label || k.id);
      if (!field) return;
      const wasSelected = selected[k.id] || selected[k.label] || selected[field.id];
      delete selected[k.id];
      if (isBuiltinId(field.id)) {
        if (wasSelected) selected[field.id] = true;
        return;
      }
      if (seenLabel[field.label]) {
        if (wasSelected) selected[field.id] = true;
        return;
      }
      seenLabel[field.label] = true;
      nextKw.push({
        id: field.id,
        label: field.label,
        discovered: !!k.discovered,
      });
      if (wasSelected) selected[field.id] = true;
    });
    return {
      extraKeywords: nextKw,
      selectedFields: Object.keys(selected).filter(function (id) {
        return selected[id];
      }),
    };
  }

  function captureScheme(name, selectedIds, extraKeywords, columns) {
    const norm = normalizeKeywordsAndSelection(extraKeywords, selectedIds);
    return {
      name: String(name || "").trim(),
      selectedFields: norm.selectedFields,
      extraKeywords: norm.extraKeywords,
      columns: (columns || []).map(function (c) {
        return {
          id: c.id,
          sourceId: c.sourceId || "",
          header: c.header || "",
          formula: c.formula || "",
        };
      }),
    };
  }

  function cloneScheme(scheme) {
    if (!scheme) return null;
    return captureScheme(scheme.name, scheme.selectedFields, scheme.extraKeywords, scheme.columns);
  }

  function reorderColumns(columns, draggedId, beforeId) {
    const cols = (columns || []).slice();
    if (!draggedId || draggedId === beforeId) return cols;
    const from = cols.findIndex(function (c) {
      return c.id === draggedId;
    });
    if (from < 0) return cols;
    const item = cols.splice(from, 1)[0];
    if (!beforeId) {
      cols.push(item);
      return cols;
    }
    const to = cols.findIndex(function (c) {
      return c.id === beforeId;
    });
    if (to < 0) cols.push(item);
    else cols.splice(to, 0, item);
    return cols;
  }

  function moveColumnBy(columns, colId, delta) {
    const cols = (columns || []).slice();
    const from = cols.findIndex(function (c) {
      return c.id === colId;
    });
    if (from < 0 || !delta) return cols;
    const to = from + Number(delta);
    if (to < 0 || to >= cols.length) return cols;
    const item = cols.splice(from, 1)[0];
    cols.splice(to, 0, item);
    return cols;
  }

  function columnFromField(field) {
    return {
      id: "col-" + field.id,
      sourceId: field.id,
      header: field.label,
      formula: "{" + field.label + "}",
    };
  }

  function syncOutputColumns(existing, selectedIds, extraKeywords) {
    const wanted = [];
    selectedIds.forEach(function (id) {
      const field = fieldById(id, extraKeywords);
      if (field) wanted.push(field);
    });
    const next = [];
    const seen = new Set();
    existing.forEach(function (col) {
      if (!col.sourceId) {
        next.push(col);
        return;
      }
      if (selectedIds.indexOf(col.sourceId) >= 0) {
        next.push(col);
        seen.add(col.sourceId);
      }
    });
    wanted.forEach(function (field) {
      if (!seen.has(field.id)) next.push(columnFromField(field));
    });
    return next;
  }

  function computeOutput(rows, columns, extraKeywords) {
    const Formula = root.PoFormula;
    return rows.map(function (row) {
      const ctx = rowContext(row, extraKeywords);
      const out = { _rowId: row.id };
      columns.forEach(function (col) {
        const raw = Formula.evaluate(col.formula, ctx);
        out[col.id] = Formula.stringify(raw);
      });
      return out;
    });
  }

  const api = {
    CORE_FIELDS: CORE_FIELDS,
    OPTIONAL_FIELDS: OPTIONAL_FIELDS,
    KEYWORD_FIELDS: KEYWORD_FIELDS,
    ALL_BUILTIN: ALL_BUILTIN,
    HEADER_ALIASES: HEADER_ALIASES,
    flattenDocs: flattenDocs,
    resolveKeyword: resolveKeyword,
    fieldValue: fieldValue,
    discoverExtraKeywords: discoverExtraKeywords,
    fieldById: fieldById,
    rowContext: rowContext,
    defaultSelectedIds: defaultSelectedIds,
    isBuiltinId: isBuiltinId,
    normalizeKeywordsAndSelection: normalizeKeywordsAndSelection,
    captureScheme: captureScheme,
    cloneScheme: cloneScheme,
    reorderColumns: reorderColumns,
    moveColumnBy: moveColumnBy,
    columnFromField: columnFromField,
    syncOutputColumns: syncOutputColumns,
    computeOutput: computeOutput,
  };
  if (typeof module !== "undefined" && module.exports) module.exports = api;
  root.PoFields = api;
})(typeof window !== "undefined" ? window : globalThis);
