(function (root, factory) {
  if (typeof module === "object" && module.exports) {
    module.exports = factory(require("./formula"));
  } else {
    root.Calc = factory(root.Formula);
  }
})(typeof self !== "undefined" ? self : this, function (Formula) {
  var HEADERS = ["级次", "物料代码", "物料名称", "规格", "辅助属性", "仓库", "单位", "数量", "损耗率%", "备注"];
  var PARENT_FIELDS = ["parentCode", "parentName", "parentSpec", "parentAttr", "parentWarehouse", "parentUnit"];

  var EXPORT_FIELDS = [
    { id: "orderNo", label: "订单号" },
    { id: "parentCode", label: "母件料号" },
    { id: "parentName", label: "母件名称" },
    { id: "parentSpec", label: "母件规格" },
    { id: "parentAttr", label: "母件辅助属性" },
    { id: "parentWarehouse", label: "母件仓库" },
    { id: "parentUnit", label: "母件单位" },
    { id: "level", label: "级次" },
    { id: "materialCode", label: "物料代码" },
    { id: "materialName", label: "物料名称" },
    { id: "spec", label: "规格" },
    { id: "attr", label: "辅助属性" },
    { id: "warehouse", label: "仓库" },
    { id: "unit", label: "单位" },
    { id: "qty", label: "数量" },
    { id: "price", label: "单价" },
    { id: "amount", label: "金额" }
  ];

  function text(value) {
    if (value == null) return "";
    return String(value).replace(/\r\n/g, "\n").trim();
  }

  function cleanNumber(value) {
    if (!isFinite(value)) return value;
    return Math.round(value * 1e8) / 1e8;
  }

  function parseQty(value) {
    if (value == null || value === "") return "";
    if (typeof value === "number" && isFinite(value)) return value;
    var raw = text(value);
    if (!raw) return "";
    if (/^-?\d+(\.\d+)?$/.test(raw)) return Number(raw);
    return "";
  }

  function cellValue(value) {
    if (value == null) return "";
    if (typeof value === "number" && isFinite(value)) return value;
    var raw = text(value);
    if (!raw) return "";
    if (/^-?\d+(\.\d+)?$/.test(raw)) return Number(raw);
    return raw;
  }

  function asQty(value) {
    if (value == null || value === "") return null;
    if (typeof value === "number" && isFinite(value)) return cleanNumber(value);
    if (typeof value === "boolean") return value ? 1 : 0;
    if (typeof value === "string" && /^-?\d+(\.\d+)?$/.test(value.trim())) return cleanNumber(Number(value.trim()));
    throw new Error("备注结果不能当作数量：" + value);
  }

  function emptyRow(seed) {
    var row = {
      level: "",
      code: "",
      name: "",
      spec: "",
      attr: "",
      warehouse: "",
      unit: "",
      qty: "",
      loss: "",
      remark: ""
    };
    if (seed) Object.keys(seed).forEach(function (key) { row[key] = seed[key]; });
    return row;
  }

  function parseGrid(rows, sheetName) {
    var headerIndex = -1;
    var col = {};
    for (var r = 0; r < Math.min(rows.length, 8); r++) {
      var headers = (rows[r] || []).map(text);
      if (headers.indexOf("级次") >= 0 && headers.indexOf("物料代码") >= 0) {
        headerIndex = r;
        HEADERS.forEach(function (name) { col[name] = headers.indexOf(name); });
        break;
      }
    }
    if (headerIndex < 0) return [];

    var boms = [];
    var current = null;
    for (var i = headerIndex + 1; i < rows.length; i++) {
      var line = rows[i] || [];
      var hasContent = line.some(function (cell) { return text(cell) !== ""; });
      if (!hasContent) continue;
      function pick(name) {
        var index = col[name];
        if (index == null || index < 0) return "";
        return line[index] == null ? "" : line[index];
      }
      var level = text(pick("级次"));
      var record = {
        level: level,
        code: text(pick("物料代码")),
        name: text(pick("物料名称")),
        spec: text(pick("规格")),
        attr: text(pick("辅助属性")),
        warehouse: text(pick("仓库")),
        unit: text(pick("单位")),
        qty: parseQty(pick("数量")),
        loss: text(pick("损耗率%")),
        remark: typeof pick("备注") === "number" ? pick("备注") : text(pick("备注"))
      };
      if (level === "母件") {
        current = { sheetName: sheetName || "", parent: record, children: [] };
        boms.push(current);
      } else if (current) {
        current.children.push(record);
      }
    }
    return boms;
  }

  function bomParams(bom) {
    var found = [];
    (bom.children || []).forEach(function (child) {
      try {
        Formula.extractParams(child.remark).forEach(function (name) {
          if (found.indexOf(name) < 0) found.push(name);
        });
      } catch (error) {
        found.push({ error: error.message, remark: child.remark });
      }
    });
    return found.filter(function (item) { return typeof item === "string"; });
  }

  function bomParamErrors(bom) {
    var errors = [];
    (bom.children || []).forEach(function (child, index) {
      if (child.remark == null || child.remark === "" || typeof child.remark === "number") return;
      if (String(child.remark).charAt(0) !== "=") return;
      try {
        Formula.extractParams(child.remark);
      } catch (error) {
        errors.push({ index: index, code: child.code, error: error.message });
      }
    });
    return errors;
  }

  function parentLabel(bom) {
    if (!bom || !bom.parent) return "未命名 BOM";
    var code = bom.parent.code || "未填料号";
    var name = bom.parent.name || "";
    return name ? code + " " + name : code;
  }

  function buildParamScope(row, bom, profile) {
    var scope = Object.create(null);
    var missing = [];
    var errors = [];
    bomParams(bom).forEach(function (name) {
      var spec = profile && profile.params ? profile.params[name] : null;
      if (!spec || (spec.mode === "formula" && !text(spec.formula)) || (spec.mode !== "formula" && !text(spec.column))) {
        missing.push(name);
        return;
      }
      try {
        if (spec.mode === "formula") {
          var columnScope = Object.create(null);
          Object.keys(row).forEach(function (key) {
            if (key.charAt(0) === "_") return;
            columnScope[key] = cellValue(row[key]);
          });
          scope[name] = Formula.evaluate(spec.formula, columnScope);
        } else {
          scope[name] = cellValue(row[spec.column]);
        }
      } catch (error) {
        errors.push(name + "：" + error.message);
      }
    });
    return { scope: scope, missing: missing, errors: errors };
  }

  function findBoms(boms, parentCode) {
    return (boms || []).filter(function (bom) {
      return bom.parent && text(bom.parent.code) === text(parentCode);
    });
  }

  function calculate(options) {
    var boms = options.boms || [];
    var rows = options.rows || [];
    var profile = options.profile || {};
    var resolution = options.resolution || {};
    var parentColumn = profile.parentColumn;
    var orderColumn = profile.orderColumn;
    var unmatched = [];
    var conflicts = [];
    var conflictCodes = {};
    var chosen = {};

    rows.forEach(function (row, index) {
      var parentCode = text(parentColumn ? row[parentColumn] : "");
      var sourceRow = row.__row || index + 2;
      if (!parentCode) {
        unmatched.push({ sourceRow: sourceRow, parentCode: "" });
        return;
      }
      var matches = findBoms(boms, parentCode);
      if (!matches.length) {
        unmatched.push({ sourceRow: sourceRow, parentCode: parentCode });
        return;
      }
      if (matches.length === 1) {
        chosen[parentCode] = matches[0];
        return;
      }
      var saved = resolution[parentCode];
      var savedId = typeof saved === "string" ? saved : saved && saved.id;
      var savedSignature = saved && typeof saved === "object" ? saved.signature : null;
      var signature = matches.map(function (bom) { return bom.id; }).sort().join("|");
      var picked = matches.filter(function (bom) { return bom.id === savedId; })[0];
      if (picked && (savedSignature == null || savedSignature === signature)) {
        chosen[parentCode] = picked;
        return;
      }
      if (!conflictCodes[parentCode]) {
        conflictCodes[parentCode] = true;
        conflicts.push({
          parentCode: parentCode,
          boms: matches.map(function (bom) {
            return {
              id: bom.id,
              label: parentLabel(bom),
              sheetName: bom.sheetName || "",
              sourceFile: bom.sourceFile || "",
              uploadedAt: bom.uploadedAt || "",
              childCount: (bom.children || []).length
            };
          })
        });
      }
    });

    if (conflicts.length) {
      return { conflicts: conflicts, unmatched: uniqueUnmatched(unmatched), missingParams: [], lines: [], errors: [] };
    }

    var missingMap = {};
    var lines = [];
    var errors = [];
    rows.forEach(function (row, index) {
      var parentCode = text(parentColumn ? row[parentColumn] : "");
      var sourceRow = row.__row || index + 2;
      if (!parentCode || !chosen[parentCode]) return;
      var bom = chosen[parentCode];
      var built = buildParamScope(row, bom, profile);
      if (built.missing.length) {
        missingMap[parentCode] = { parentCode: parentCode, bomId: bom.id, params: built.missing };
        return;
      }
      var orderNo = text(orderColumn ? row[orderColumn] : "");
      if (built.errors.length) {
        errors.push({ sourceRow: sourceRow, parentCode: parentCode, orderNo: orderNo, materialCode: "", message: built.errors.join("；") });
        return;
      }
      (bom.children || []).forEach(function (child) {
        if (!text(child.code)) return;
        var remark = Formula.computeRemark(child.remark, built.scope);
        if (!remark.ok) {
          errors.push({
            sourceRow: sourceRow,
            parentCode: parentCode,
            orderNo: orderNo,
            materialCode: child.code,
            message: remark.error
          });
          return;
        }
        var qty;
        try {
          var multiplier = asQty(remark.value);
          // A blank BOM quantity means 1. Sheet 2 stores the real usage in the remark and leaves 数量 empty.
          var base = child.qty === "" || child.qty == null ? 1 : Number(child.qty);
          qty = multiplier == null ? null : cleanNumber(base * multiplier);
        } catch (error) {
          errors.push({
            sourceRow: sourceRow,
            parentCode: parentCode,
            orderNo: orderNo,
            materialCode: child.code,
            message: error.message
          });
          return;
        }
        lines.push({
          sourceRow: sourceRow,
          orderNo: orderNo,
          parentCode: bom.parent.code || "",
          parentName: bom.parent.name || "",
          parentSpec: bom.parent.spec || "",
          parentAttr: bom.parent.attr || "",
          parentWarehouse: bom.parent.warehouse || "",
          parentUnit: bom.parent.unit || "",
          bomId: bom.id,
          level: child.level || "",
          materialCode: child.code,
          materialName: child.name || "",
          spec: child.spec || "",
          attr: child.attr || "",
          warehouse: child.warehouse || "",
          unit: child.unit || "",
          qty: qty
        });
      });
    });

    return {
      conflicts: [],
      unmatched: uniqueUnmatched(unmatched),
      missingParams: Object.keys(missingMap).map(function (key) { return missingMap[key]; }),
      lines: lines,
      errors: errors
    };
  }

  function uniqueUnmatched(list) {
    var seen = {};
    var out = [];
    list.forEach(function (item) {
      var key = item.sourceRow + "|" + item.parentCode;
      if (seen[key]) return;
      seen[key] = true;
      out.push(item);
    });
    return out;
  }

  function addQty(left, right) {
    if (left == null && right == null) return null;
    return cleanNumber((left || 0) + (right || 0));
  }

  function aggregate(lines, mode) {
    var groups = {};
    var order = [];
    (lines || []).forEach(function (line) {
      var key = mode === "all" ? line.materialCode : (line.orderNo || "") + "\0" + line.materialCode;
      if (!groups[key]) {
        groups[key] = {
          orderNos: {},
          parents: {},
          parentLines: {},
          qty: null,
          level: line.level,
          materialCode: line.materialCode,
          materialName: line.materialName,
          spec: line.spec,
          attr: line.attr,
          warehouse: line.warehouse,
          unit: line.unit
        };
        order.push(key);
      }
      var group = groups[key];
      group.orderNos[line.orderNo || ""] = true;
      group.parents[line.parentCode || ""] = true;
      if (!group.parentLines[line.parentCode || ""]) group.parentLines[line.parentCode || ""] = line;
      group.qty = addQty(group.qty, line.qty);
    });
    return order.map(function (key) {
      var group = groups[key];
      var orderKeys = Object.keys(group.orderNos);
      var parentKeys = Object.keys(group.parents);
      var row = {
        orderNo: orderKeys.length === 1 ? orderKeys[0] : "",
        parentCode: "",
        parentName: "",
        parentSpec: "",
        parentAttr: "",
        parentWarehouse: "",
        parentUnit: "",
        level: group.level,
        materialCode: group.materialCode,
        materialName: group.materialName,
        spec: group.spec,
        attr: group.attr,
        warehouse: group.warehouse,
        unit: group.unit,
        qty: group.qty,
        price: "",
        amount: null
      };
      if (parentKeys.length === 1) {
        var parent = group.parentLines[parentKeys[0]];
        row.parentCode = parent.parentCode || "";
        row.parentName = parent.parentName || "";
        row.parentSpec = parent.parentSpec || "";
        row.parentAttr = parent.parentAttr || "";
        row.parentWarehouse = parent.parentWarehouse || "";
        row.parentUnit = parent.parentUnit || "";
      }
      return row;
    });
  }

  function applyMaterials(rows, materials, calcAmount) {
    return (rows || []).map(function (row) {
      var material = materials && materials[row.materialCode];
      var next = Object.assign({}, row);
      if (material) {
        if (material.name) next.materialName = material.name;
        if (material.spec) next.spec = material.spec;
        if (material.attr) next.attr = material.attr;
        if (material.warehouse) next.warehouse = material.warehouse;
        if (material.unit) next.unit = material.unit;
        next.price = material.price === 0 ? 0 : (material.price || "");
      }
      var price = parseQty(next.price);
      if (calcAmount && next.qty != null && price !== "") next.amount = cleanNumber(next.qty * Number(price));
      else next.amount = null;
      return next;
    });
  }

  function filterRows(rows, hideEmpty) {
    if (!hideEmpty) return rows || [];
    return (rows || []).filter(function (row) { return row.qty != null && row.qty !== 0; });
  }

  function isParentField(field) {
    return PARENT_FIELDS.indexOf(field) >= 0;
  }

  function projectRows(rows, columns, parentFields) {
    var allowed = parentFields || PARENT_FIELDS;
    return (rows || []).map(function (row) {
      return (columns || []).map(function (column) {
        if (isParentField(column.field) && allowed.indexOf(column.field) < 0) return "";
        var value = row[column.field];
        return value == null ? "" : value;
      });
    });
  }

  function defaultColumns(parentFields) {
    var allowed = parentFields || ["parentCode", "parentName"];
    var preferred = ["orderNo", "parentCode", "parentName", "materialCode", "materialName", "spec", "unit", "qty", "price", "amount"];
    return preferred.filter(function (id) {
      return !isParentField(id) || allowed.indexOf(id) >= 0;
    }).map(function (id) {
      var field = EXPORT_FIELDS.filter(function (item) { return item.id === id; })[0];
      return { header: field.label, field: field.id };
    });
  }

  return {
    HEADERS: HEADERS,
    EXPORT_FIELDS: EXPORT_FIELDS,
    PARENT_FIELDS: PARENT_FIELDS,
    text: text,
    cellValue: cellValue,
    emptyRow: emptyRow,
    parseGrid: parseGrid,
    bomParams: bomParams,
    bomParamErrors: bomParamErrors,
    parentLabel: parentLabel,
    calculate: calculate,
    aggregate: aggregate,
    applyMaterials: applyMaterials,
    filterRows: filterRows,
    projectRows: projectRows,
    defaultColumns: defaultColumns,
    cleanNumber: cleanNumber
  };
});
