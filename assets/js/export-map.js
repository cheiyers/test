(function (root) {
  function uid() {
    return "m" + Date.now().toString(36) + Math.random().toString(36).slice(2, 7);
  }

  function clone(v) {
    return JSON.parse(JSON.stringify(v == null ? null : v));
  }

  function emptyColumn(name, source, fill) {
    return {
      id: uid(),
      name: String(name || "").trim(),
      source: String(source || ""),
      fill: fill == null ? "" : String(fill),
    };
  }

  function normalizeColumn(col) {
    col = col || {};
    return {
      id: col.id || uid(),
      name: String(col.name || "").trim(),
      source: String(col.source || ""),
      fill: col.fill == null ? "" : String(col.fill),
    };
  }

  function normalize(raw) {
    raw = raw || {};
    const headerRow = Number(raw.headerRow);
    return {
      enabled: !!raw.enabled,
      fileName: String(raw.fileName || "kone-po-selected").trim() || "kone-po-selected",
      templateName: String(raw.templateName || ""),
      headerRow: headerRow > 0 ? Math.floor(headerRow) : 1,
      prefixRows: Array.isArray(raw.prefixRows) ? clone(raw.prefixRows).slice(0, 30) : [],
      columns: Array.isArray(raw.columns) ? raw.columns.map(normalizeColumn) : [],
    };
  }

  function compact(s) {
    return String(s || "")
      .replace(/\s+/g, "")
      .toLowerCase();
  }

  const ALIASES = [
    { re: /采购订单号|purchaseorderno/, key: "p:purchaseOrderNo" },
    { re: /^(po|p\.?o\.?号|采购单号|订单号|订单编号|订单编码)$/, key: "p:po" },
    { re: /供应商|卖方|vendor/, key: "p:vendor" },
    { re: /订单日期|^日期$|orderdate/, key: "p:date" },
    { re: /^(pos|行号|项目|项目行号)$/, key: "p:pos" },
    { re: /物料编码|物料号|料号|物料|material/, key: "p:material" },
    { re: /物料描述|描述|品名|名称|description/, key: "p:description" },
    { re: /到货/, key: "p:arrDate" },
    { re: /数量|qty/, key: "p:qty" },
    { re: /单价|价格|price/, key: "p:price" },
    { re: /金额|amount|合计/, key: "p:amount" },
    { re: /销售订单|salesorder/, key: "p:salesOrderRef" },
    { re: /项目号|项目编号|projectref|project/, key: "p:projectRef" },
    { re: /发货说明|shipping/, key: "p:shippingInstruction" },
    { re: /类别|分类|family/, key: "p:category" },
    { re: /页码|页数|^页$/, key: "p:page" },
    { re: /^rev$/, key: "p:rev" },
    { re: /子件pos|bompos/, key: "b:bomPos" },
    { re: /子件物料|bom物料/, key: "b:bomMaterial" },
    { re: /子件数量|bom数量/, key: "b:bomQty" },
    { re: /子件描述|bom描述/, key: "b:bomDescription" },
    { re: /备注a/, key: "b:remarkA" },
    { re: /备注b/, key: "b:remarkB" },
    { re: /备注c/, key: "b:remarkC" },
    { re: /备注d/, key: "b:remarkD" },
  ];

  function guessSource(name, sources) {
    const label = String(name || "").trim();
    if (!label) return "";
    const list = sources || [];
    const exact = list.find((s) => s.label === label || s.key === label);
    if (exact) return exact.key;
    const folded = compact(label);
    const foldedHit = list.find((s) => compact(s.label) === folded || compact(s.key) === folded);
    if (foldedHit) return foldedHit.key;
    const alias = ALIASES.find((a) => a.re.test(folded));
    if (alias && (!list.length || list.some((s) => s.key === alias.key))) return alias.key;
    const contains = list.find((s) => {
      const sl = compact(s.label);
      return sl && (folded.includes(sl) || sl.includes(folded));
    });
    return contains ? contains.key : "";
  }

  function columnsFromHeaders(headers, sources) {
    return (headers || []).map((name, i) => {
      const label = String(name == null ? "" : name).trim() || "列" + (i + 1);
      return emptyColumn(label, guessSource(label, sources));
    });
  }

  function columnsFromSources(sources) {
    return (sources || []).map((s) => emptyColumn(s.label || s.key, s.key));
  }

  function cellCount(row) {
    if (!Array.isArray(row)) return 0;
    return row.filter((c) => String(c == null ? "" : c).trim() !== "").length;
  }

  function detectHeaderRow(aoa) {
    const rows = Array.isArray(aoa) ? aoa : [];
    let best = 0;
    let bestCount = 0;
    for (let i = 0; i < rows.length && i < 20; i++) {
      const n = cellCount(rows[i]);
      if (n >= 2 && n > bestCount) {
        best = i;
        bestCount = n;
      }
      if (n >= 3) return i;
    }
    return best;
  }

  function parseTemplateAoa(aoa) {
    const rows = Array.isArray(aoa) ? aoa.map((r) => (Array.isArray(r) ? r.slice() : [])) : [];
    if (!rows.length) return { headerRow: 1, headers: [], prefixRows: [] };
    const idx = detectHeaderRow(rows);
    const header = rows[idx] || [];
    const width = header.length;
    const headers = [];
    for (let i = 0; i < width; i++) headers.push(header[i] == null ? "" : header[i]);
    const prefixRows = rows.slice(0, idx + 1).map((r) => {
      const copy = r.slice(0, Math.max(width, r.length));
      while (copy.length < width) copy.push("");
      return copy;
    });
    return { headerRow: idx + 1, headers, prefixRows };
  }

  function colLetter(index) {
    let n = Number(index) + 1;
    if (!(n > 0)) return "";
    let s = "";
    while (n > 0) {
      const r = (n - 1) % 26;
      s = String.fromCharCode(65 + r) + s;
      n = Math.floor((n - 1) / 26);
    }
    return s;
  }

  function moveColumn(list, id, dir) {
    const copy = (list || []).slice();
    const i = copy.findIndex((c) => c.id === id);
    const j = i + dir;
    if (i < 0 || j < 0 || j >= copy.length) return copy;
    const [item] = copy.splice(i, 1);
    copy.splice(j, 0, item);
    return copy;
  }

  function removeColumn(list, id) {
    return (list || []).filter((c) => c.id !== id);
  }

  function cellValue(col, getValue) {
    if (col.source && col.source !== "const") {
      const v = getValue(col.source);
      return v == null ? "" : v;
    }
    return col.fill == null ? "" : col.fill;
  }

  function mappedMatrix(rows, columns, getValue) {
    const cols = columns || [];
    const header = cols.map((c, i) => c.name || "列" + (i + 1));
    const body = (rows || []).map((row) => cols.map((col) => cellValue(col, (src) => getValue(row, src))));
    return { header, body };
  }

  function mappedObjects(rows, columns, getValue) {
    const { header, body } = mappedMatrix(rows, columns, getValue);
    return body.map((arr) => {
      const o = {};
      header.forEach((h, i) => {
        let key = h || "列" + (i + 1);
        if (Object.prototype.hasOwnProperty.call(o, key)) key = key + "_" + (i + 1);
        o[key] = arr[i];
      });
      return o;
    });
  }

  function exportAoa(columns, rows, getValue, prefixRows) {
    const { header, body } = mappedMatrix(rows, columns, getValue);
    if (prefixRows && prefixRows.length) {
      const prefix = prefixRows.map((r) => (Array.isArray(r) ? r.slice() : []));
      prefix[prefix.length - 1] = header.slice();
      prefix.forEach((r) => {
        while (r.length < header.length) r.push("");
      });
      return prefix.concat(body);
    }
    return [header].concat(body);
  }

  function sanitizeFileName(name, fallback) {
    const raw = String(name || "").trim() || fallback || "kone-po-selected";
    return raw
      .replace(/[\\/:*?"<>|]+/g, "_")
      .replace(/\s+/g, " ")
      .replace(/^\.+/, "")
      .slice(0, 180)
      .trim() || fallback || "kone-po-selected";
  }

  function baseName(name) {
    const just = String(name || "")
      .split(/[/\\]/)
      .pop();
    return just.replace(/\.(xlsx|xls|csv|json)$/i, "");
  }

  function ensureExt(name, ext) {
    const e = String(ext || "xlsx").replace(/^\./, "");
    return sanitizeFileName(baseName(name) || name, "kone-po-selected") + "." + e;
  }

  function looksMojibake(s) {
    return /[\uFFFD]|Ã.|Â.|å.|æ.|ç.|ä¸|è´|ï¿½/.test(String(s || ""));
  }

  function decodeCsvBytes(bytes) {
    const u8 = bytes instanceof Uint8Array ? bytes : new Uint8Array(bytes || []);
    if (!u8.length) return "";
    let start = 0;
    if (u8[0] === 0xef && u8[1] === 0xbb && u8[2] === 0xbf) start = 3;
    const utf8 = new TextDecoder("utf-8").decode(start ? u8.slice(start) : u8);
    if (start || !looksMojibake(utf8)) return utf8;
    const encodings = ["gb18030", "gbk"];
    for (let i = 0; i < encodings.length; i++) {
      try {
        const text = new TextDecoder(encodings[i]).decode(u8);
        if (text && !looksMojibake(text)) return text;
      } catch (e) {}
    }
    return utf8;
  }

  function hasMapping(map) {
    return !!(map && map.enabled && map.columns && map.columns.length);
  }

  const api = {
    uid,
    emptyColumn,
    normalize,
    normalizeColumn,
    guessSource,
    columnsFromHeaders,
    columnsFromSources,
    detectHeaderRow,
    parseTemplateAoa,
    colLetter,
    moveColumn,
    removeColumn,
    mappedMatrix,
    mappedObjects,
    exportAoa,
    sanitizeFileName,
    baseName,
    ensureExt,
    hasMapping,
    decodeCsvBytes,
    looksMojibake,
  };
  if (typeof module !== "undefined" && module.exports) module.exports = api;
  root.ExportMap = api;
})(typeof window !== "undefined" ? window : globalThis);
