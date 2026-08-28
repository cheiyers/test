(function (root) {
  function applyStep(value, step) {
    let s = value == null ? "" : String(value);
    if (!step || !step.type) return s;
    switch (step.type) {
      case "trim":
        return s.trim();
      case "replace": {
        const find = step.find == null ? "" : String(step.find);
        const to = step.to == null ? "" : String(step.to);
        if (!find) return s;
        if (step.regex) {
          try {
            const flags = (step.all === false ? "" : "g") + (step.i ? "i" : "");
            return s.replace(new RegExp(find, flags), to);
          } catch (e) {
            return s;
          }
        }
        if (step.all === false) return s.replace(find, to);
        return s.split(find).join(to);
      }
      case "extract": {
        try {
          const re = new RegExp(step.pattern || "");
          const m = s.match(re);
          if (!m) return "";
          const g = step.group == null || step.group === "" ? 0 : Number(step.group);
          return m[g] != null ? m[g] : "";
        } catch (e) {
          return s;
        }
      }
      case "split": {
        const sep = step.sep == null ? "/" : String(step.sep);
        const parts = s.split(sep);
        const idx = Math.max(1, Number(step.index || 1)) - 1;
        return parts[idx] != null ? String(parts[idx]).trim() : "";
      }
      case "prefix":
        return (step.text || "") + s;
      case "suffix":
        return s + (step.text || "");
      case "slice": {
        const from = Math.max(0, Number(step.from || 1) - 1);
        const to = step.to == null || step.to === "" ? undefined : Number(step.to);
        return s.slice(from, to);
      }
      case "upper":
        return s.toUpperCase();
      case "lower":
        return s.toLowerCase();
      case "number": {
        const n = Number(String(s).replace(/,/g, "").replace(/[^\d.-]/g, ""));
        if (Number.isNaN(n)) return s;
        if (step.decimals == null || step.decimals === "") return String(n);
        return n.toFixed(Number(step.decimals));
      }
      case "date": {
        const m = s.match(/(\d{1,2})\.(\d{1,2})\.(\d{4})/);
        if (!m) return s;
        const dd = m[1].padStart(2, "0");
        const mm = m[2].padStart(2, "0");
        const yyyy = m[3];
        const fmt = step.format || "yyyy-mm-dd";
        return fmt.replace(/yyyy/g, yyyy).replace(/mm/g, mm).replace(/dd/g, dd);
      }
      case "map": {
        const lines = String(step.table || "").split(/\n/);
        for (let i = 0; i < lines.length; i++) {
          const t = lines[i].trim();
          if (!t) continue;
          const sp = t.indexOf("->") >= 0 ? "->" : "=";
          const at = t.indexOf(sp);
          if (at < 0) continue;
          const k = t.slice(0, at).trim();
          const v = t.slice(at + sp.length).trim();
          if (s === k) return v;
        }
        return s;
      }
      case "default":
        return s.trim() === "" ? String(step.text || "") : s;
      default:
        return s;
    }
  }

  function applyPipeline(value, steps) {
    const start = value == null ? "" : String(value);
    return (steps || []).reduce((v, step) => applyStep(v, step), start);
  }

  const STEP_TYPES = [
    { id: "trim", label: "去首尾空格" },
    { id: "replace", label: "查找替换" },
    { id: "extract", label: "正则提取" },
    { id: "split", label: "按分隔符取段" },
    { id: "prefix", label: "加前缀" },
    { id: "suffix", label: "加后缀" },
    { id: "slice", label: "截取字符" },
    { id: "upper", label: "转大写" },
    { id: "lower", label: "转小写" },
    { id: "number", label: "转数值" },
    { id: "date", label: "日期格式" },
    { id: "map", label: "值映射" },
    { id: "default", label: "空值填充" },
  ];

  const api = { applyStep, applyPipeline, STEP_TYPES };
  if (typeof module !== "undefined" && module.exports) module.exports = api;
  root.ColumnTransform = api;
})(typeof window !== "undefined" ? window : globalThis);
