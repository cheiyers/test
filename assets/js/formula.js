(function (root) {
  function makeErr(code, message) {
    return { __err: true, code: code || "#VALUE!", message: message || code };
  }
  function isErr(v) {
    return !!(v && typeof v === "object" && v.__err);
  }

  function parseDate(v) {
    if (v instanceof Date && !Number.isNaN(v.getTime())) return v;
    const s = String(v == null ? "" : v).trim();
    if (!s) return null;
    let m = s.match(/^(\d{4})[/\-.](\d{1,2})[/\-.](\d{1,2})(?:\s+(\d{1,2}):(\d{2})(?::(\d{2}))?)?$/);
    if (m) {
      const d = new Date(
        Number(m[1]),
        Number(m[2]) - 1,
        Number(m[3]),
        Number(m[4] || 0),
        Number(m[5] || 0),
        Number(m[6] || 0)
      );
      if (d.getFullYear() === Number(m[1]) && d.getMonth() === Number(m[2]) - 1 && d.getDate() === Number(m[3])) {
        return d;
      }
      return null;
    }
    m = s.match(/^(\d{4})(\d{2})(\d{2})$/);
    if (m) {
      const d = new Date(Number(m[1]), Number(m[2]) - 1, Number(m[3]));
      if (d.getFullYear() === Number(m[1]) && d.getMonth() === Number(m[2]) - 1 && d.getDate() === Number(m[3])) {
        return d;
      }
    }
    return null;
  }

  function formatDate(d, fmt) {
    const yyyy = String(d.getFullYear());
    const yy = yyyy.slice(-2);
    const m = String(d.getMonth() + 1);
    const mm = m.padStart(2, "0");
    const day = String(d.getDate());
    const dd = day.padStart(2, "0");
    const H = String(d.getHours());
    const HH = H.padStart(2, "0");
    const min = String(d.getMinutes()).padStart(2, "0");
    const sec = String(d.getSeconds()).padStart(2, "0");
    return String(fmt)
      .replace(/yyyy/g, yyyy)
      .replace(/yy/g, yy)
      .replace(/mm/g, mm)
      .replace(/dd/g, dd)
      .replace(/HH/g, HH)
      .replace(/MM/g, min)
      .replace(/ss/g, sec)
      .replace(/m/g, m)
      .replace(/d/g, day)
      .replace(/H/g, H);
  }

  function parseNumber(v) {
    if (v == null || v === "") return null;
    if (typeof v === "number" && !Number.isNaN(v)) return v;
    if (typeof v === "boolean") return v ? 1 : 0;
    if (v instanceof Date) return dateToSerial(v);
    if (isErr(v)) return null;
    const s = String(v).trim();
    const unitPrice = s.match(/^(-?\d+(?:\.\d+)?)\s*\/\s*\d+$/);
    if (unitPrice) return Number(unitPrice[1]);
    if (/^-?\d+(\.\d+)?%$/.test(s)) return Number(s.slice(0, -1)) / 100;
    const cleaned = s.replace(/,/g, "").replace(/[^\d.eE+-]/g, "");
    if (!cleaned || cleaned === "-" || cleaned === "." || cleaned === "+" || cleaned === "e" || cleaned === "E") return null;
    const n = Number(cleaned);
    return Number.isNaN(n) ? null : n;
  }

  function dateToSerial(d) {
    const utc = Date.UTC(d.getFullYear(), d.getMonth(), d.getDate(), d.getHours(), d.getMinutes(), d.getSeconds());
    const epoch = Date.UTC(1899, 11, 30);
    return (utc - epoch) / 86400000;
  }

  function serialToDate(n) {
    const epoch = Date.UTC(1899, 11, 30);
    const ms = epoch + Number(n) * 86400000;
    const d = new Date(ms);
    return new Date(d.getUTCFullYear(), d.getUTCMonth(), d.getUTCDate(), d.getUTCHours(), d.getUTCMinutes(), d.getUTCSeconds());
  }

  function toDate(v) {
    if (isErr(v)) return null;
    const d = parseDate(v);
    if (d) return d;
    const n = parseNumber(v);
    if (n != null && n > 2000 && n < 60000) return serialToDate(n);
    return null;
  }

  function toStr(v) {
    if (v == null) return "";
    if (isErr(v)) return v.message || v.code || "";
    if (v instanceof Date) return formatDate(v, "yyyy-mm-dd");
    if (typeof v === "boolean") return v ? "TRUE" : "FALSE";
    return String(v);
  }

  function toNum(v) {
    if (isErr(v)) return NaN;
    const n = parseNumber(v);
    return n == null ? NaN : n;
  }

  function toBool(v) {
    if (isErr(v)) return false;
    if (typeof v === "boolean") return v;
    if (v == null || v === "") return false;
    if (v instanceof Date) return true;
    if (typeof v === "number") return v !== 0 && !Number.isNaN(v);
    const s = String(v).trim().toUpperCase();
    if (s === "TRUE" || s === "真") return true;
    if (s === "FALSE" || s === "假") return false;
    const n = parseNumber(v);
    return n != null && n !== 0;
  }

  function flatten(args) {
    return Array.prototype.slice.call(args);
  }

  function numList(args) {
    const out = [];
    flatten(args).forEach(function (a) {
      if (a == null || a === "" || isErr(a)) return;
      const n = toNum(a);
      if (!Number.isNaN(n)) out.push(n);
    });
    return out;
  }

  function roundHalf(n, digits) {
    const d = digits == null ? 0 : Number(digits);
    const f = Math.pow(10, d);
    const x = Number(n) * f;
    return Math.round(x + (x >= 0 ? 1e-10 : -1e-10)) / f;
  }

  function roundToward(n, digits, away) {
    const d = digits == null ? 0 : Number(digits);
    const f = Math.pow(10, d);
    const x = Number(n) * f;
    const r = away ? (x >= 0 ? Math.ceil(x - 1e-12) : Math.floor(x + 1e-12)) : (x >= 0 ? Math.floor(x + 1e-12) : Math.ceil(x - 1e-12));
    return r / f;
  }

  function gcd2(a, b) {
    a = Math.abs(Math.trunc(a));
    b = Math.abs(Math.trunc(b));
    while (b) {
      const t = b;
      b = a % b;
      a = t;
    }
    return a;
  }

  function wildcardRe(pat) {
    const s = String(pat == null ? "" : pat);
    let out = "^";
    for (let i = 0; i < s.length; i++) {
      const c = s[i];
      if (c === "~" && i + 1 < s.length) {
        out += s[i + 1].replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
        i++;
      } else if (c === "*") out += ".*";
      else if (c === "?") out += ".";
      else out += c.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
    }
    return new RegExp(out + "$", "i");
  }

  function matchCriteria(value, criteria) {
    if (criteria == null || criteria === "") return value == null || value === "";
    if (typeof criteria === "boolean") return toBool(value) === criteria;
    if (typeof criteria === "number") {
      const n = toNum(value);
      return !Number.isNaN(n) && n === criteria;
    }
    const s = String(criteria);
    const m = s.match(/^(<=|>=|<>|<|>|=)(.*)$/);
    if (m) {
      const op = m[1];
      const rhs = m[2];
      const lv = toNum(value);
      const rv = parseNumber(rhs);
      if (rv != null && !Number.isNaN(lv)) {
        if (op === "<=") return lv <= rv;
        if (op === ">=") return lv >= rv;
        if (op === "<>") return lv !== rv;
        if (op === "<") return lv < rv;
        if (op === ">") return lv > rv;
        if (op === "=") return lv === rv;
      }
      const ls = toStr(value);
      if (op === "=") return wildcardRe(rhs).test(ls);
      if (op === "<>") return !wildcardRe(rhs).test(ls);
      return false;
    }
    const nCrit = parseNumber(s);
    if (nCrit != null && String(nCrit) === s.trim()) {
      const n = toNum(value);
      return !Number.isNaN(n) && n === nCrit;
    }
    return wildcardRe(s).test(toStr(value));
  }

  function mean(arr) {
    if (!arr.length) throw new Error("除数为 0");
    let s = 0;
    arr.forEach(function (n) { s += n; });
    return s / arr.length;
  }

  function variance(arr, p) {
    if (arr.length < (p ? 1 : 2)) throw new Error("除数为 0");
    const m = mean(arr);
    let s = 0;
    arr.forEach(function (n) { s += (n - m) * (n - m); });
    return s / (arr.length - (p ? 0 : 1));
  }

  function percentileInc(arr, k) {
    if (!arr.length) throw new Error("#NUM!");
    const a = arr.slice().sort(function (x, y) { return x - y; });
    if (k <= 0) return a[0];
    if (k >= 1) return a[a.length - 1];
    const idx = (a.length - 1) * k;
    const lo = Math.floor(idx);
    const hi = Math.ceil(idx);
    if (lo === hi) return a[lo];
    return a[lo] + (a[hi] - a[lo]) * (idx - lo);
  }

  function workdayAdd(start, days, holidays) {
    const hol = {};
    (holidays || []).forEach(function (h) {
      const d = toDate(h);
      if (d) hol[formatDate(d, "yyyy-mm-dd")] = true;
    });
    let d = new Date(start.getTime());
    const step = days >= 0 ? 1 : -1;
    let left = Math.abs(Math.trunc(days));
    while (left > 0) {
      d.setDate(d.getDate() + step);
      const wd = d.getDay();
      if (wd === 0 || wd === 6) continue;
      if (hol[formatDate(d, "yyyy-mm-dd")]) continue;
      left--;
    }
    return d;
  }

  function networkDays(start, end, holidays) {
    const hol = {};
    (holidays || []).forEach(function (h) {
      const d = toDate(h);
      if (d) hol[formatDate(d, "yyyy-mm-dd")] = true;
    });
    let a = new Date(start.getTime());
    let b = new Date(end.getTime());
    let sign = 1;
    if (a > b) {
      const t = a;
      a = b;
      b = t;
      sign = -1;
    }
    let n = 0;
    const cur = new Date(a.getTime());
    while (cur <= b) {
      const wd = cur.getDay();
      if (wd !== 0 && wd !== 6 && !hol[formatDate(cur, "yyyy-mm-dd")]) n++;
      cur.setDate(cur.getDate() + 1);
    }
    return n * sign;
  }

  function fact(n) {
    n = Math.trunc(toNum(n));
    if (n < 0 || n > 170) throw new Error("#NUM!");
    let r = 1;
    for (let i = 2; i <= n; i++) r *= i;
    return r;
  }

  function npv(rate, cash) {
    let s = 0;
    cash.forEach(function (c, i) {
      s += c / Math.pow(1 + rate, i + 1);
    });
    return s;
  }

  function irr(cash, guess) {
    let r = guess == null ? 0.1 : Number(guess);
    for (let i = 0; i < 80; i++) {
      let f = 0;
      let df = 0;
      cash.forEach(function (c, k) {
        const n = k;
        f += c / Math.pow(1 + r, n);
        df += (-n) * c / Math.pow(1 + r, n + 1);
      });
      if (Math.abs(df) < 1e-12) break;
      const nr = r - f / df;
      if (Math.abs(nr - r) < 1e-10) return nr;
      r = nr;
    }
    return r;
  }

  const CONVERT_TO_M = {
    m: 1, "m.": 1, meter: 1, metres: 1,
    km: 1000, mm: 0.001, cm: 0.01, um: 1e-6, nm: 1e-9,
    in: 0.0254, inch: 0.0254, ft: 0.3048, yd: 0.9144, mi: 1609.344,
  };
  const CONVERT_TO_G = { g: 1, kg: 1000, t: 1e6, lbm: 453.59237, ozm: 28.349523125, mg: 0.001 };
  const CONVERT_TO_SEC = { sec: 1, s: 1, mn: 60, min: 60, hr: 3600, day: 86400, yr: 31557600 };

  function convertUnit(n, from, to) {
    const f = String(from || "").toLowerCase();
    const t = String(to || "").toLowerCase();
    function conv(map) {
      if (map[f] == null || map[t] == null) return null;
      return n * map[f] / map[t];
    }
    return conv(CONVERT_TO_M) != null ? conv(CONVERT_TO_M)
      : conv(CONVERT_TO_G) != null ? conv(CONVERT_TO_G)
        : conv(CONVERT_TO_SEC) != null ? conv(CONVERT_TO_SEC)
          : null;
  }

  function textFormat(v, fmt) {
    const d = toDate(v);
    if (d && fmt && /[ymdHs]/i.test(String(fmt)) && !/^0/.test(String(fmt))) {
      return formatDate(d, fmt || "yyyy-mm-dd");
    }
    const n = toNum(v);
    if (!Number.isNaN(n) && fmt) {
      const f = String(fmt);
      if (f.indexOf("%") >= 0) {
        const digits = (f.split(".")[1] || "").replace(/[^0]/g, "").length;
        return (n * 100).toFixed(digits) + "%";
      }
      if (/0/.test(f)) {
        const parts = f.split(".");
        const digits = (parts[1] || "").replace(/[^0#]/g, "").length;
        const comma = f.indexOf(",") >= 0;
        let s = n.toFixed(digits);
        if (comma) {
          const sp = s.split(".");
          sp[0] = sp[0].replace(/\B(?=(\d{3})+(?!\d))/g, ",");
          s = sp.join(".");
        }
        return s;
      }
    }
    if (d) return formatDate(d, fmt || "yyyy-mm-dd");
    return toStr(v);
  }

  const FN = {
    IF: function (cond, a, b) {
      if (isErr(cond)) return cond;
      if (toBool(cond)) return a === undefined ? 0 : a;
      return arguments.length < 3 ? false : b;
    },
    IFS: function () {
      const args = flatten(arguments);
      for (let i = 0; i + 1 < args.length; i += 2) {
        if (isErr(args[i])) return args[i];
        if (toBool(args[i])) return args[i + 1];
      }
      return makeErr("#N/A", "IFS 无匹配");
    },
    IFERROR: function (v, fallback) {
      return isErr(v) ? (fallback === undefined ? "" : fallback) : v;
    },
    IFNA: function (v, fallback) {
      return isErr(v) && v.code === "#N/A" ? fallback : v;
    },
    IFEMPTY: function (v, fallback) {
      return v == null || v === "" ? fallback : v;
    },
    SWITCH: function (expr) {
      const args = flatten(arguments).slice(1);
      for (let i = 0; i + 1 < args.length; i += 2) {
        if (args[i] === expr || toStr(args[i]) === toStr(expr)) return args[i + 1];
        const a = toNum(args[i]);
        const b = toNum(expr);
        if (!Number.isNaN(a) && a === b) return args[i + 1];
      }
      if (args.length % 2 === 1) return args[args.length - 1];
      return makeErr("#N/A", "SWITCH 无匹配");
    },
    AND: function () {
      const args = flatten(arguments);
      for (let i = 0; i < args.length; i++) {
        if (isErr(args[i])) return args[i];
        if (!toBool(args[i])) return false;
      }
      return args.length ? true : false;
    },
    OR: function () {
      const args = flatten(arguments);
      for (let i = 0; i < args.length; i++) {
        if (isErr(args[i])) return args[i];
        if (toBool(args[i])) return true;
      }
      return false;
    },
    XOR: function () {
      let n = 0;
      flatten(arguments).forEach(function (a) { if (toBool(a)) n++; });
      return n % 2 === 1;
    },
    NOT: function (v) {
      return !toBool(v);
    },
    TRUE: function () { return true; },
    FALSE: function () { return false; },

    ROUND: function (n, d) { return roundHalf(toNum(n), d); },
    ROUNDUP: function (n, d) { return roundToward(toNum(n), d, true); },
    ROUNDDOWN: function (n, d) { return roundToward(toNum(n), d, false); },
    MROUND: function (n, mult) {
      const x = toNum(n);
      const m = toNum(mult);
      if (!m) throw new Error("#NUM!");
      return roundHalf(x / m, 0) * m;
    },
    INT: function (n) { return Math.floor(toNum(n)); },
    TRUNC: function (n, d) {
      const x = toNum(n);
      const f = Math.pow(10, d == null ? 0 : Number(d));
      return (x < 0 ? Math.ceil(x * f) : Math.floor(x * f)) / f;
    },
    ABS: function (n) { return Math.abs(toNum(n)); },
    SIGN: function (n) { const x = toNum(n); return x > 0 ? 1 : x < 0 ? -1 : 0; },
    SQRT: function (n) { const x = toNum(n); if (x < 0) throw new Error("#NUM!"); return Math.sqrt(x); },
    SQRTPI: function (n) { return Math.sqrt(toNum(n) * Math.PI); },
    POWER: function (n, p) { return Math.pow(toNum(n), toNum(p)); },
    EXP: function (n) { return Math.exp(toNum(n)); },
    LN: function (n) { const x = toNum(n); if (x <= 0) throw new Error("#NUM!"); return Math.log(x); },
    LOG: function (n, base) {
      const x = toNum(n);
      const b = base == null ? 10 : toNum(base);
      if (x <= 0 || b <= 0 || b === 1) throw new Error("#NUM!");
      return Math.log(x) / Math.log(b);
    },
    LOG10: function (n) { return FN.LOG(n, 10); },
    LOG2: function (n) { return FN.LOG(n, 2); },
    MOD: function (n, d) {
      const x = toNum(n);
      const y = toNum(d);
      if (!y) throw new Error("除数为 0");
      return x - y * Math.floor(x / y);
    },
    QUOTIENT: function (n, d) {
      const y = toNum(d);
      if (!y) throw new Error("除数为 0");
      return Math.trunc(toNum(n) / y);
    },
    PI: function () { return Math.PI; },
    RAND: function () { return Math.random(); },
    RANDBETWEEN: function (a, b) {
      const lo = Math.ceil(Math.min(toNum(a), toNum(b)));
      const hi = Math.floor(Math.max(toNum(a), toNum(b)));
      return lo + Math.floor(Math.random() * (hi - lo + 1));
    },
    CEILING: function (n, sig) {
      const x = toNum(n);
      const s = sig == null ? 1 : toNum(sig);
      if (!s) throw new Error("#DIV/0!");
      return Math.ceil(x / s - 1e-12) * s;
    },
    FLOOR: function (n, sig) {
      const x = toNum(n);
      const s = sig == null ? 1 : toNum(sig);
      if (!s) throw new Error("#DIV/0!");
      return Math.floor(x / s + 1e-12) * s;
    },
    EVEN: function (n) { return FN.CEILING(n, toNum(n) < 0 ? -2 : 2); },
    ODD: function (n) {
      const x = toNum(n);
      if (x === 0) return 1;
      const e = FN.CEILING(x, x < 0 ? -2 : 2);
      return Math.abs(e) % 2 === 1 ? e : e + (x < 0 ? -1 : 1);
    },
    FACT: fact,
    FACTDOUBLE: function (n) {
      n = Math.trunc(toNum(n));
      if (n < 0) throw new Error("#NUM!");
      let r = 1;
      for (let i = n; i > 1; i -= 2) r *= i;
      return r;
    },
    GCD: function () {
      const a = numList(arguments);
      if (!a.length) return 0;
      return a.reduce(gcd2);
    },
    LCM: function () {
      const a = numList(arguments).map(function (n) { return Math.abs(Math.trunc(n)); });
      if (!a.length) return 0;
      return a.reduce(function (x, y) { return !x || !y ? 0 : Math.abs(x / gcd2(x, y) * y); });
    },
    COMBIN: function (n, k) {
      n = Math.trunc(toNum(n));
      k = Math.trunc(toNum(k));
      if (k < 0 || k > n) throw new Error("#NUM!");
      k = Math.min(k, n - k);
      let r = 1;
      for (let i = 1; i <= k; i++) r = r * (n - k + i) / i;
      return Math.round(r);
    },
    COMBINA: function (n, k) { return FN.COMBIN(toNum(n) + toNum(k) - 1, k); },
    PERMUT: function (n, k) {
      n = Math.trunc(toNum(n));
      k = Math.trunc(toNum(k));
      if (k < 0 || k > n) throw new Error("#NUM!");
      let r = 1;
      for (let i = 0; i < k; i++) r *= n - i;
      return r;
    },
    PRODUCT: function () {
      const a = numList(arguments);
      return a.length ? a.reduce(function (s, n) { return s * n; }, 1) : 0;
    },
    SUM: function () {
      return numList(arguments).reduce(function (s, n) { return s + n; }, 0);
    },
    SUMSQ: function () {
      return numList(arguments).reduce(function (s, n) { return s + n * n; }, 0);
    },
    SUMPRODUCT: function () {
      const a = flatten(arguments).map(toNum);
      return a.reduce(function (s, n) { return s + (Number.isNaN(n) ? 0 : n); }, 0);
    },
    SUMIF: function () {
      const args = flatten(arguments);
      if (args.length < 2) return 0;
      const crit = args[args.length - 1];
      const vals = args.slice(0, -1);
      let s = 0;
      vals.forEach(function (v) {
        if (matchCriteria(v, crit)) {
          const n = toNum(v);
          if (!Number.isNaN(n)) s += n;
        }
      });
      return s;
    },
    AVERAGE: function () { return mean(numList(arguments)); },
    AVERAGEA: function () {
      const a = flatten(arguments).map(function (v) {
        if (typeof v === "boolean") return v ? 1 : 0;
        return toNum(v);
      }).filter(function (n) { return !Number.isNaN(n); });
      return mean(a);
    },
    AVERAGEIF: function () {
      const args = flatten(arguments);
      const crit = args[args.length - 1];
      const vals = args.slice(0, -1).filter(function (v) { return matchCriteria(v, crit); });
      return FN.AVERAGE.apply(null, vals);
    },
    MEDIAN: function () {
      const a = numList(arguments).sort(function (x, y) { return x - y; });
      if (!a.length) throw new Error("#NUM!");
      const m = Math.floor(a.length / 2);
      return a.length % 2 ? a[m] : (a[m - 1] + a[m]) / 2;
    },
    MODE: function () {
      const a = numList(arguments);
      const c = {};
      let best = a[0];
      let n = 0;
      a.forEach(function (x) {
        c[x] = (c[x] || 0) + 1;
        if (c[x] > n) {
          n = c[x];
          best = x;
        }
      });
      if (n < 2) return makeErr("#N/A", "无众数");
      return best;
    },
    MIN: function () { const a = numList(arguments); return a.length ? Math.min.apply(null, a) : 0; },
    MAX: function () { const a = numList(arguments); return a.length ? Math.max.apply(null, a) : 0; },
    MINA: function () { return FN.MIN.apply(null, arguments); },
    MAXA: function () { return FN.MAX.apply(null, arguments); },
    COUNT: function () {
      return flatten(arguments).filter(function (v) { return v !== "" && v != null && !Number.isNaN(toNum(v)); }).length;
    },
    COUNTA: function () {
      return flatten(arguments).filter(function (v) { return v != null && v !== ""; }).length;
    },
    COUNTBLANK: function () {
      return flatten(arguments).filter(function (v) { return v == null || v === ""; }).length;
    },
    COUNTIF: function () {
      const args = flatten(arguments);
      if (args.length < 2) return 0;
      const crit = args[args.length - 1];
      return args.slice(0, -1).filter(function (v) { return matchCriteria(v, crit); }).length;
    },
    LARGE: function () {
      const args = flatten(arguments);
      const k = Math.trunc(toNum(args[args.length - 1]));
      const a = numList(args.slice(0, -1)).sort(function (x, y) { return y - x; });
      if (k < 1 || k > a.length) throw new Error("#NUM!");
      return a[k - 1];
    },
    SMALL: function () {
      const args = flatten(arguments);
      const k = Math.trunc(toNum(args[args.length - 1]));
      const a = numList(args.slice(0, -1)).sort(function (x, y) { return x - y; });
      if (k < 1 || k > a.length) throw new Error("#NUM!");
      return a[k - 1];
    },
    RANK: function (n) {
      const args = flatten(arguments);
      const x = toNum(n);
      const order = args.length > 2 ? toNum(args[args.length - 1]) : 0;
      const a = numList(args.slice(1, args.length > 2 ? -1 : undefined)).sort(function (p, q) { return order ? p - q : q - p; });
      const i = a.indexOf(x);
      if (i < 0) return makeErr("#N/A", "RANK");
      return i + 1;
    },
    PERCENTILE: function () {
      const args = flatten(arguments);
      const k = toNum(args[args.length - 1]);
      return percentileInc(numList(args.slice(0, -1)), k);
    },
    QUARTILE: function () {
      const args = flatten(arguments);
      const q = Math.trunc(toNum(args[args.length - 1]));
      if (q < 0 || q > 4) throw new Error("#NUM!");
      return percentileInc(numList(args.slice(0, -1)), q / 4);
    },
    STDEV: function () { return Math.sqrt(variance(numList(arguments), false)); },
    STDEVP: function () { return Math.sqrt(variance(numList(arguments), true)); },
    VAR: function () { return variance(numList(arguments), false); },
    VARP: function () { return variance(numList(arguments), true); },
    GEOMEAN: function () {
      const a = numList(arguments);
      if (a.some(function (n) { return n <= 0; })) throw new Error("#NUM!");
      return Math.exp(mean(a.map(Math.log)));
    },
    HARMEAN: function () {
      const a = numList(arguments);
      if (a.some(function (n) { return n <= 0; })) throw new Error("#NUM!");
      return a.length / a.reduce(function (s, n) { return s + 1 / n; }, 0);
    },
    AVEDEV: function () {
      const a = numList(arguments);
      const m = mean(a);
      return mean(a.map(function (n) { return Math.abs(n - m); }));
    },
    DEVSQ: function () {
      const a = numList(arguments);
      const m = mean(a);
      return a.reduce(function (s, n) { return s + (n - m) * (n - m); }, 0);
    },

    SIN: function (n) { return Math.sin(toNum(n)); },
    COS: function (n) { return Math.cos(toNum(n)); },
    TAN: function (n) { return Math.tan(toNum(n)); },
    ASIN: function (n) { return Math.asin(toNum(n)); },
    ACOS: function (n) { return Math.acos(toNum(n)); },
    ATAN: function (n) { return Math.atan(toNum(n)); },
    ATAN2: function (x, y) { return Math.atan2(toNum(y), toNum(x)); },
    SINH: function (n) { return Math.sinh(toNum(n)); },
    COSH: function (n) { return Math.cosh(toNum(n)); },
    TANH: function (n) { return Math.tanh(toNum(n)); },
    ASINH: function (n) { return Math.asinh(toNum(n)); },
    ACOSH: function (n) { return Math.acosh(toNum(n)); },
    ATANH: function (n) { return Math.atanh(toNum(n)); },
    SEC: function (n) { return 1 / Math.cos(toNum(n)); },
    CSC: function (n) { return 1 / Math.sin(toNum(n)); },
    COT: function (n) { return 1 / Math.tan(toNum(n)); },
    DEGREES: function (n) { return toNum(n) * 180 / Math.PI; },
    RADIANS: function (n) { return toNum(n) * Math.PI / 180; },

    LEFT: function (s, n) { return toStr(s).slice(0, Number(n == null ? 1 : n)); },
    RIGHT: function (s, n) {
      const t = toStr(s);
      const k = Number(n == null ? 1 : n);
      return t.slice(Math.max(0, t.length - k));
    },
    MID: function (s, start, n) {
      const t = toStr(s);
      const i = Math.max(0, Number(start || 1) - 1);
      return t.slice(i, i + Number(n || 0));
    },
    LEN: function (s) { return toStr(s).length; },
    LENB: function (s) { return toStr(s).length; },
    TRIM: function (s) { return toStr(s).trim().replace(/\s+/g, " "); },
    UPPER: function (s) { return toStr(s).toUpperCase(); },
    LOWER: function (s) { return toStr(s).toLowerCase(); },
    PROPER: function (s) {
      return toStr(s).toLowerCase().replace(/(^|[^A-Za-z0-9\u4e00-\u9fff])([A-Za-z\u4e00-\u9fff])/g, function (_, a, b) {
        return a + b.toUpperCase();
      });
    },
    VALUE: function (s) {
      const n = parseNumber(s);
      return n == null ? 0 : n;
    },
    NUMBERVALUE: function (s, dec, group) {
      let t = toStr(s);
      if (group) t = t.split(String(group)).join("");
      if (dec && dec !== ".") t = t.replace(String(dec), ".");
      const n = parseNumber(t);
      if (n == null) throw new Error("#VALUE!");
      return n;
    },
    TEXT: function (v, fmt) { return textFormat(v, fmt); },
    FIXED: function (n, d, noComma) {
      const s = toNum(n).toFixed(d == null ? 2 : Number(d));
      if (toBool(noComma)) return s;
      const sp = s.split(".");
      sp[0] = sp[0].replace(/\B(?=(\d{3})+(?!\d))/g, ",");
      return sp.join(".");
    },
    DOLLAR: function (n, d) { return "$" + FN.FIXED(n, d == null ? 2 : d, false); },
    CONCAT: function () {
      return flatten(arguments).map(toStr).join("");
    },
    CONCATENATE: function () { return FN.CONCAT.apply(null, arguments); },
    TEXTJOIN: function (delim, ignoreEmpty) {
      const parts = flatten(arguments).slice(2).map(toStr);
      const keep = toBool(ignoreEmpty) ? parts.filter(Boolean) : parts;
      return keep.join(toStr(delim));
    },
    SUBSTITUTE: function (text, old, neu, inst) {
      const t = toStr(text);
      const a = toStr(old);
      const b = toStr(neu);
      if (!a) return t;
      if (inst == null || inst === "") return t.split(a).join(b);
      const n = Math.trunc(toNum(inst));
      let c = 0;
      let out = "";
      let i = 0;
      while (i < t.length) {
        if (t.slice(i, i + a.length) === a) {
          c++;
          if (c === n) {
            out += b;
            i += a.length;
            out += t.slice(i);
            return out;
          }
        }
        out += t[i];
        i++;
      }
      return t;
    },
    REPLACE: function (oldText, start, num, neu) {
      const t = toStr(oldText);
      const i = Math.max(0, Number(start || 1) - 1);
      return t.slice(0, i) + toStr(neu) + t.slice(i + Number(num || 0));
    },
    FIND: function (find, within, start) {
      const w = toStr(within);
      const f = toStr(find);
      const i = w.indexOf(f, Math.max(0, Number(start || 1) - 1));
      if (i < 0) throw new Error("#VALUE!");
      return i + 1;
    },
    SEARCH: function (find, within, start) {
      const w = toStr(within).toLowerCase();
      const f = toStr(find).toLowerCase();
      const i = w.indexOf(f, Math.max(0, Number(start || 1) - 1));
      if (i < 0) throw new Error("#VALUE!");
      return i + 1;
    },
    EXACT: function (a, b) { return toStr(a) === toStr(b); },
    REPT: function (s, n) { return toStr(s).repeat(Math.max(0, Math.trunc(toNum(n)))); },
    CHAR: function (n) { return String.fromCharCode(Math.trunc(toNum(n))); },
    CODE: function (s) { return toStr(s).charCodeAt(0) || 0; },
    UNICHAR: function (n) { return String.fromCodePoint(Math.trunc(toNum(n))); },
    UNICODE: function (s) { return toStr(s).codePointAt(0) || 0; },
    CLEAN: function (s) { return toStr(s).replace(/[\x00-\x1F]/g, ""); },
    T: function (v) { return typeof v === "string" || (v != null && !(v instanceof Date) && Number.isNaN(toNum(v))) ? toStr(v) : ""; },
    N: function (v) {
      if (typeof v === "boolean") return v ? 1 : 0;
      if (v instanceof Date) return dateToSerial(v);
      const n = toNum(v);
      return Number.isNaN(n) ? 0 : n;
    },
    TEXTBEFORE: function (text, delim, inst) {
      const t = toStr(text);
      const d = toStr(delim);
      const n = Math.trunc(inst == null ? 1 : toNum(inst));
      const parts = t.split(d);
      if (n > parts.length - 1 || n === 0) throw new Error("#N/A");
      return parts.slice(0, n).join(d);
    },
    TEXTAFTER: function (text, delim, inst) {
      const t = toStr(text);
      const d = toStr(delim);
      const n = Math.trunc(inst == null ? 1 : toNum(inst));
      const parts = t.split(d);
      if (n > parts.length - 1 || n === 0) throw new Error("#N/A");
      return parts.slice(n).join(d);
    },
    REGEXTEST: function (text, pat, flags) {
      return new RegExp(toStr(pat), toStr(flags) || "").test(toStr(text));
    },
    REGEXEXTRACT: function (text, pat, flags) {
      const m = toStr(text).match(new RegExp(toStr(pat), toStr(flags) || ""));
      return m ? m[0] : makeErr("#N/A", "无匹配");
    },
    REGEXREPLACE: function (text, pat, repl, flags) {
      return toStr(text).replace(new RegExp(toStr(pat), (toStr(flags) || "") + (String(flags || "").indexOf("g") >= 0 ? "" : "g")), toStr(repl));
    },

    TODAY: function () {
      const d = new Date();
      return new Date(d.getFullYear(), d.getMonth(), d.getDate());
    },
    NOW: function () { return new Date(); },
    DATE: function (y, m, d) { return new Date(Math.trunc(toNum(y)), Math.trunc(toNum(m)) - 1, Math.trunc(toNum(d))); },
    DATEVALUE: function (v) {
      const d = parseDate(v);
      if (!d) throw new Error("无法解析日期");
      return d;
    },
    TIME: function (h, m, s) {
      return (toNum(h) + toNum(m) / 60 + toNum(s == null ? 0 : s) / 3600) / 24;
    },
    TIMEVALUE: function (v) {
      const d = toDate(v);
      if (!d) {
        const m = String(v).match(/(\d{1,2}):(\d{2})(?::(\d{2}))?/);
        if (!m) throw new Error("#VALUE!");
        return (Number(m[1]) + Number(m[2]) / 60 + Number(m[3] || 0) / 3600) / 24;
      }
      return (d.getHours() + d.getMinutes() / 60 + d.getSeconds() / 3600) / 24;
    },
    YEAR: function (v) { const d = toDate(v); if (!d) throw new Error("#VALUE!"); return d.getFullYear(); },
    MONTH: function (v) { const d = toDate(v); if (!d) throw new Error("#VALUE!"); return d.getMonth() + 1; },
    DAY: function (v) { const d = toDate(v); if (!d) throw new Error("#VALUE!"); return d.getDate(); },
    HOUR: function (v) {
      const d = toDate(v);
      if (d) return d.getHours();
      return Math.floor(toNum(v) * 24) % 24;
    },
    MINUTE: function (v) {
      const d = toDate(v);
      if (d) return d.getMinutes();
      return Math.floor(toNum(v) * 24 * 60) % 60;
    },
    SECOND: function (v) {
      const d = toDate(v);
      if (d) return d.getSeconds();
      return Math.floor(toNum(v) * 24 * 3600) % 60;
    },
    WEEKDAY: function (v, type) {
      const d = toDate(v);
      if (!d) throw new Error("#VALUE!");
      const js = d.getDay();
      const t = type == null ? 1 : Math.trunc(toNum(type));
      if (t === 1) return js + 1;
      if (t === 2) return js === 0 ? 7 : js;
      if (t === 3) return js === 0 ? 6 : js - 1;
      return js + 1;
    },
    WEEKNUM: function (v) {
      const d = toDate(v);
      if (!d) throw new Error("#VALUE!");
      const start = new Date(d.getFullYear(), 0, 1);
      return Math.floor((d - start) / 86400000 / 7) + 1;
    },
    ISOWEEKNUM: function (v) {
      const d = toDate(v);
      if (!d) throw new Error("#VALUE!");
      const t = new Date(Date.UTC(d.getFullYear(), d.getMonth(), d.getDate()));
      const day = t.getUTCDay() || 7;
      t.setUTCDate(t.getUTCDate() + 4 - day);
      const y = new Date(Date.UTC(t.getUTCFullYear(), 0, 1));
      return Math.ceil(((t - y) / 86400000 + 1) / 7);
    },
    EOMONTH: function (v, months) {
      const d = toDate(v);
      if (!d) throw new Error("#VALUE!");
      const m = Number(months || 0);
      return new Date(d.getFullYear(), d.getMonth() + m + 1, 0);
    },
    EDATE: function (v, months) {
      const d = toDate(v);
      if (!d) throw new Error("#VALUE!");
      const out = new Date(d.getTime());
      out.setMonth(out.getMonth() + Number(months || 0));
      return out;
    },
    DAYS: function (end, start) {
      const a = toDate(end);
      const b = toDate(start);
      if (!a || !b) throw new Error("#VALUE!");
      return Math.round((a - b) / 86400000);
    },
    DATEDIF: function (start, end, unit) {
      const a = toDate(start);
      const b = toDate(end);
      if (!a || !b) throw new Error("#VALUE!");
      const u = String(unit || "d").toLowerCase();
      if (u === "d" || u === "yd") return Math.round((b - a) / 86400000);
      let y = b.getFullYear() - a.getFullYear();
      let m = b.getMonth() - a.getMonth();
      let day = b.getDate() - a.getDate();
      if (u === "y") {
        if (m < 0 || (m === 0 && day < 0)) y--;
        return y;
      }
      if (u === "m" || u === "ym") {
        let months = y * 12 + m;
        if (day < 0) months--;
        return u === "ym" ? months % 12 : months;
      }
      if (u === "md") {
        if (day < 0) {
          const prev = new Date(b.getFullYear(), b.getMonth(), 0).getDate();
          day += prev;
        }
        return day;
      }
      return Math.round((b - a) / 86400000);
    },
    YEARFRAC: function (start, end) {
      return FN.DAYS(end, start) / 365;
    },
    DAYS360: function (start, end, method) {
      const a = toDate(start);
      const b = toDate(end);
      if (!a || !b) throw new Error("#VALUE!");
      let d1 = a.getDate();
      let d2 = b.getDate();
      if (d1 === 31) d1 = 30;
      if (!toBool(method) && d2 === 31 && d1 === 30) d2 = 30;
      if (toBool(method) && d2 === 31) d2 = 30;
      return (b.getFullYear() - a.getFullYear()) * 360 + (b.getMonth() - a.getMonth()) * 30 + (d2 - d1);
    },
    NETWORKDAYS: function (start, end) {
      const a = toDate(start);
      const b = toDate(end);
      if (!a || !b) throw new Error("#VALUE!");
      return networkDays(a, b, flatten(arguments).slice(2));
    },
    WORKDAY: function (start, days) {
      const a = toDate(start);
      if (!a) throw new Error("#VALUE!");
      return workdayAdd(a, toNum(days), flatten(arguments).slice(2));
    },

    CHOOSE: function (index) {
      const i = Math.trunc(toNum(index));
      const args = flatten(arguments).slice(1);
      if (i < 1 || i > args.length) throw new Error("#VALUE!");
      return args[i - 1];
    },
    MATCH: function (lookup) {
      const args = flatten(arguments).slice(1);
      for (let i = 0; i < args.length; i++) {
        if (args[i] === lookup || toStr(args[i]) === toStr(lookup)) return i + 1;
        const a = toNum(args[i]);
        const b = toNum(lookup);
        if (!Number.isNaN(a) && a === b) return i + 1;
      }
      return makeErr("#N/A", "MATCH");
    },
    INDEX: function () {
      const args = flatten(arguments);
      const i = Math.trunc(toNum(args[args.length - 1]));
      const vals = args.slice(0, -1);
      if (i < 1 || i > vals.length) throw new Error("#REF!");
      return vals[i - 1];
    },
    VLOOKUP: function (needle) {
      const args = flatten(arguments).slice(1);
      const approx = args.length % 2 === 1 ? toBool(args.pop()) : false;
      for (let i = 0; i + 1 < args.length; i += 2) {
        if (toStr(args[i]) === toStr(needle) || (!Number.isNaN(toNum(args[i])) && toNum(args[i]) === toNum(needle))) {
          return args[i + 1];
        }
        if (approx && toNum(args[i]) <= toNum(needle)) {
          if (i + 2 >= args.length || toNum(args[i + 2]) > toNum(needle)) return args[i + 1];
        }
      }
      return makeErr("#N/A", "VLOOKUP");
    },
    HLOOKUP: function () { return FN.VLOOKUP.apply(null, arguments); },
    LOOKUP: function (needle) {
      const args = flatten(arguments).slice(1);
      return FN.VLOOKUP.apply(null, [needle].concat(args));
    },
    XLOOKUP: function (needle) {
      return FN.VLOOKUP.apply(null, arguments);
    },

    ISBLANK: function (v) { return v == null || v === ""; },
    ISNUMBER: function (v) { return !isErr(v) && !Number.isNaN(toNum(v)) && v !== "" && typeof v !== "boolean"; },
    ISTEXT: function (v) { return typeof v === "string" || (v != null && !(v instanceof Date) && Number.isNaN(toNum(v)) && typeof v !== "boolean"); },
    ISLOGICAL: function (v) { return typeof v === "boolean"; },
    ISERROR: function (v) { return isErr(v); },
    ISERR: function (v) { return isErr(v) && v.code !== "#N/A"; },
    ISNA: function (v) { return isErr(v) && v.code === "#N/A"; },
    ISODD: function (v) { return Math.abs(Math.trunc(toNum(v))) % 2 === 1; },
    ISEVEN: function (v) { return Math.abs(Math.trunc(toNum(v))) % 2 === 0; },
    ISNONTEXT: function (v) { return !FN.ISTEXT(v); },
    TYPE: function (v) {
      if (isErr(v)) return 16;
      if (typeof v === "number" || v instanceof Date) return 1;
      if (typeof v === "string") return 2;
      if (typeof v === "boolean") return 4;
      return 1;
    },
    NA: function () { return makeErr("#N/A", "#N/A"); },
    ERROR: function (msg) { return makeErr("#VALUE!", toStr(msg)); },

    HEX2DEC: function (s) { return parseInt(toStr(s), 16); },
    DEC2HEX: function (n, places) {
      let s = Math.trunc(toNum(n)).toString(16).toUpperCase();
      if (places != null) s = s.padStart(Math.trunc(toNum(places)), "0");
      return s;
    },
    BIN2DEC: function (s) { return parseInt(toStr(s), 2); },
    DEC2BIN: function (n, places) {
      let s = Math.trunc(toNum(n)).toString(2);
      if (places != null) s = s.padStart(Math.trunc(toNum(places)), "0");
      return s;
    },
    OCT2DEC: function (s) { return parseInt(toStr(s), 8); },
    DEC2OCT: function (n, places) {
      let s = Math.trunc(toNum(n)).toString(8);
      if (places != null) s = s.padStart(Math.trunc(toNum(places)), "0");
      return s;
    },
    HEX2BIN: function (s, places) { return FN.DEC2BIN(FN.HEX2DEC(s), places); },
    BIN2HEX: function (s, places) { return FN.DEC2HEX(FN.BIN2DEC(s), places); },
    CONVERT: function (n, from, to) {
      const r = convertUnit(toNum(n), from, to);
      if (r == null) throw new Error("#N/A");
      return r;
    },
    BITAND: function (a, b) { return Math.trunc(toNum(a)) & Math.trunc(toNum(b)); },
    BITOR: function (a, b) { return Math.trunc(toNum(a)) | Math.trunc(toNum(b)); },
    BITXOR: function (a, b) { return Math.trunc(toNum(a)) ^ Math.trunc(toNum(b)); },
    BITLSHIFT: function (a, n) { return Math.trunc(toNum(a)) << Math.trunc(toNum(n)); },
    BITRSHIFT: function (a, n) { return Math.trunc(toNum(a)) >> Math.trunc(toNum(n)); },
    DELTA: function (a, b) { return toNum(a) === toNum(b == null ? 0 : b) ? 1 : 0; },
    GESTEP: function (a, step) { return toNum(a) >= toNum(step == null ? 0 : step) ? 1 : 0; },
    ROMAN: function (n) {
      let x = Math.trunc(toNum(n));
      if (x <= 0 || x >= 4000) throw new Error("#VALUE!");
      const map = [[1000, "M"], [900, "CM"], [500, "D"], [400, "CD"], [100, "C"], [90, "XC"], [50, "L"], [40, "XL"], [10, "X"], [9, "IX"], [5, "V"], [4, "IV"], [1, "I"]];
      let s = "";
      map.forEach(function (p) {
        while (x >= p[0]) {
          s += p[1];
          x -= p[0];
        }
      });
      return s;
    },
    ARABIC: function (s) {
      const map = { M: 1000, D: 500, C: 100, L: 50, X: 10, V: 5, I: 1 };
      const t = toStr(s).toUpperCase();
      let n = 0;
      for (let i = 0; i < t.length; i++) {
        const a = map[t[i]] || 0;
        const b = map[t[i + 1]] || 0;
        n += a < b ? -a : a;
      }
      return n;
    },

    PMT: function (rate, nper, pv, fv, type) {
      const r = toNum(rate);
      const n = toNum(nper);
      const p = toNum(pv);
      const f = fv == null ? 0 : toNum(fv);
      const t = type == null ? 0 : toNum(type);
      if (!r) return -(p + f) / n;
      const k = Math.pow(1 + r, n);
      return -(p * k + f) * r / ((1 + r * t) * (k - 1));
    },
    FV: function (rate, nper, pmt, pv, type) {
      const r = toNum(rate);
      const n = toNum(nper);
      const p = toNum(pmt);
      const v = pv == null ? 0 : toNum(pv);
      const t = type == null ? 0 : toNum(type);
      if (!r) return -v - p * n;
      const k = Math.pow(1 + r, n);
      return -v * k - p * (1 + r * t) * (k - 1) / r;
    },
    PV: function (rate, nper, pmt, fv, type) {
      const r = toNum(rate);
      const n = toNum(nper);
      const p = toNum(pmt);
      const f = fv == null ? 0 : toNum(fv);
      const t = type == null ? 0 : toNum(type);
      if (!r) return -f - p * n;
      const k = Math.pow(1 + r, n);
      return -(f + p * (1 + r * t) * (k - 1) / r) / k;
    },
    NPER: function (rate, pmt, pv, fv, type) {
      const r = toNum(rate);
      const p = toNum(pmt);
      const v = toNum(pv);
      const f = fv == null ? 0 : toNum(fv);
      const t = type == null ? 0 : toNum(type);
      if (!r) return -(v + f) / p;
      return Math.log((p * (1 + r * t) - f * r) / (p * (1 + r * t) + v * r)) / Math.log(1 + r);
    },
    NPV: function (rate) { return npv(toNum(rate), numList(flatten(arguments).slice(1))); },
    IRR: function () {
      const args = flatten(arguments);
      const guess = args.length && typeof args[args.length - 1] === "number" && Math.abs(args[args.length - 1]) < 1 ? args.pop() : 0.1;
      return irr(numList(args), guess);
    },
    EFFECT: function (nom, npery) {
      const r = toNum(nom);
      const n = toNum(npery);
      return Math.pow(1 + r / n, n) - 1;
    },
    NOMINAL: function (eff, npery) {
      const r = toNum(eff);
      const n = toNum(npery);
      return n * (Math.pow(1 + r, 1 / n) - 1);
    },
    SLN: function (cost, salvage, life) { return (toNum(cost) - toNum(salvage)) / toNum(life); },
    DB: function (cost, salvage, life, period, month) {
      const c = toNum(cost);
      const s = toNum(salvage);
      const n = toNum(life);
      const p = toNum(period);
      const m = month == null ? 12 : toNum(month);
      const rate = roundHalf(1 - Math.pow(s / c, 1 / n), 3);
      if (p === 1) return c * rate * m / 12;
      let book = c;
      let dep = c * rate * m / 12;
      book -= dep;
      for (let i = 2; i <= p; i++) {
        dep = book * rate;
        if (i === n + 1) dep = (book * rate * (12 - m)) / 12;
        book -= dep;
      }
      return dep;
    },
    DDB: function (cost, salvage, life, period, factor) {
      const c = toNum(cost);
      const s = toNum(salvage);
      const n = toNum(life);
      const p = toNum(period);
      const f = factor == null ? 2 : toNum(factor);
      let book = c;
      let dep = 0;
      for (let i = 1; i <= p; i++) {
        dep = Math.min(book * f / n, book - s);
        book -= dep;
      }
      return dep;
    },
    SYD: function (cost, salvage, life, per) {
      const n = toNum(life);
      const p = toNum(per);
      return (toNum(cost) - toNum(salvage)) * (n - p + 1) * 2 / (n * (n + 1));
    },
    IPMT: function (rate, per, nper, pv, fv, type) {
      const pmt = FN.PMT(rate, nper, pv, fv, type);
      let bal = toNum(pv);
      const r = toNum(rate);
      const t = type == null ? 0 : toNum(type);
      for (let i = 1; i <= toNum(per); i++) {
        const ip = t && i === 1 ? 0 : bal * r;
        if (i === toNum(per)) return -ip;
        bal = bal + ip + pmt;
      }
      return 0;
    },
    PPMT: function (rate, per, nper, pv, fv, type) {
      return FN.PMT(rate, nper, pv, fv, type) - FN.IPMT(rate, per, nper, pv, fv, type);
    },

    BASE: function (n, radix, minLen) {
      let s = Math.trunc(toNum(n)).toString(Math.trunc(toNum(radix))).toUpperCase();
      if (minLen != null) s = s.padStart(Math.trunc(toNum(minLen)), "0");
      return s;
    },
    DECIMAL: function (s, radix) { return parseInt(toStr(s), Math.trunc(toNum(radix))); },
    HYPERLINK: function (url, text) { return text == null ? toStr(url) : toStr(text); },
    UNIQUE: function () {
      const seen = {};
      const out = [];
      flatten(arguments).forEach(function (v) {
        const k = toStr(v);
        if (seen[k]) return;
        seen[k] = true;
        out.push(v);
      });
      return out[0] == null ? "" : out[0];
    },
  };

  FN["CEILING.MATH"] = FN.CEILING;
  FN["FLOOR.MATH"] = FN.FLOOR;
  FN["MODE.SNGL"] = FN.MODE;
  FN["RANK.EQ"] = FN.RANK;
  FN["RANK.AVG"] = FN.RANK;
  FN["PERCENTILE.INC"] = FN.PERCENTILE;
  FN["QUARTILE.INC"] = FN.QUARTILE;
  FN["STDEV.S"] = FN.STDEV;
  FN["STDEV.P"] = FN.STDEVP;
  FN["VAR.S"] = FN.VAR;
  FN["VAR.P"] = FN.VARP;
  FN["NETWORKDAYS.INTL"] = FN.NETWORKDAYS;
  FN["WORKDAY.INTL"] = FN.WORKDAY;
  FN.LEFTB = FN.LEFT;
  FN.RIGHTB = FN.RIGHT;
  FN.MIDB = FN.MID;

  const ALIAS = {
    如果: "IF",
    与: "AND",
    或: "OR",
    非: "NOT",
    求和: "SUM",
    平均值: "AVERAGE",
    计数: "COUNT",
    最小值: "MIN",
    最大值: "MAX",
    四舍五入: "ROUND",
    取整: "INT",
    绝对值: "ABS",
    余数: "MOD",
    乘幂: "POWER",
    平方根: "SQRT",
    圆周率: "PI",
    随机数: "RAND",
    连接: "CONCATENATE",
    左: "LEFT",
    右: "RIGHT",
    中: "MID",
    字符数: "LEN",
    修剪: "TRIM",
    大写: "UPPER",
    小写: "LOWER",
    替换: "SUBSTITUTE",
    查找: "FIND",
    搜索: "SEARCH",
    文本: "TEXT",
    数值: "VALUE",
    日期: "DATE",
    日期值: "DATEVALUE",
    年: "YEAR",
    月: "MONTH",
    日: "DAY",
    今天: "TODAY",
    现在: "NOW",
    选择: "CHOOSE",
    匹配: "MATCH",
    如果出错: "IFERROR",
    并且: "AND",
    或者: "OR",
  };

  function resolveFn(name) {
    const raw = String(name || "");
    const u = raw.toUpperCase();
    if (FN[u]) return FN[u];
    if (FN[raw]) return FN[raw];
    const a = ALIAS[raw] || ALIAS[u];
    return a ? FN[a] : null;
  }

  function tokenize(src) {
    const s = String(src || "").replace(/^\s*=\s*/, "");
    const tokens = [];
    let i = 0;
    while (i < s.length) {
      const c = s[i];
      if (c === " " || c === "\t" || c === "\n") {
        i++;
        continue;
      }
      if (c === "{") {
        const end = s.indexOf("}", i);
        if (end < 0) throw new Error("缺少 }");
        tokens.push({ t: "ref", v: s.slice(i + 1, end).trim() });
        i = end + 1;
        continue;
      }
      if (c === '"' || c === "'") {
        let j = i + 1;
        let out = "";
        while (j < s.length) {
          if (s[j] === "\\") {
            out += s[j + 1] || "";
            j += 2;
            continue;
          }
          if (s[j] === c) break;
          out += s[j];
          j++;
        }
        tokens.push({ t: "str", v: out });
        i = j + 1;
        continue;
      }
      if (/[0-9.]/.test(c) && !(c === "." && s[i + 1] && /[A-Za-z_]/.test(s[i + 1]))) {
        let j = i;
        while (j < s.length && /[0-9.]/.test(s[j])) j++;
        if (s[j] && /[eE]/.test(s[j]) && s[j + 1] && /[+\-\d]/.test(s[j + 1])) {
          j++;
          if (s[j] === "+" || s[j] === "-") j++;
          while (j < s.length && /[0-9]/.test(s[j])) j++;
        }
        tokens.push({ t: "num", v: Number(s.slice(i, j)) });
        i = j;
        continue;
      }
      if (/[A-Za-z_\u4e00-\u9fff]/.test(c)) {
        let j = i + 1;
        while (j < s.length && /[A-Za-z0-9_\u4e00-\u9fff.]/.test(s[j])) j++;
        const name = s.slice(i, j);
        tokens.push({ t: "id", v: name });
        i = j;
        continue;
      }
      if (s.slice(i, i + 2) === "<>" || s.slice(i, i + 2) === "<=" || s.slice(i, i + 2) === ">=") {
        tokens.push({ t: "op", v: s.slice(i, i + 2) });
        i += 2;
        continue;
      }
      if ("+-*/&()<>,=^%".indexOf(c) >= 0) {
        tokens.push({ t: "op", v: c });
        i++;
        continue;
      }
      throw new Error("无法解析: " + c);
    }
    return tokens;
  }

  function Parser(tokens, ctx) {
    this.tokens = tokens;
    this.i = 0;
    this.ctx = ctx || {};
  }
  Parser.prototype.peek = function () {
    return this.tokens[this.i] || null;
  };
  Parser.prototype.take = function (expect) {
    const tok = this.tokens[this.i++];
    if (expect && (!tok || tok.v !== expect)) throw new Error("期望 " + expect);
    return tok;
  };
  Parser.prototype.parse = function () {
    if (!this.peek()) return "";
    const v = this.parseCmp();
    if (this.peek()) throw new Error("公式未结束");
    return v;
  };
  Parser.prototype.parseCmp = function () {
    let left = this.parseConcat();
    const tok = this.peek();
    if (tok && tok.t === "op" && ["=", "<>", "<", ">", "<=", ">="].indexOf(tok.v) >= 0) {
      this.take();
      const right = this.parseConcat();
      const ln = parseNumber(left);
      const rn = parseNumber(right);
      const a = ln != null && rn != null ? ln : left;
      const b = ln != null && rn != null ? rn : right;
      if (tok.v === "=") return a === b;
      if (tok.v === "<>") return a !== b;
      if (tok.v === "<") return a < b;
      if (tok.v === ">") return a > b;
      if (tok.v === "<=") return a <= b;
      if (tok.v === ">=") return a >= b;
    }
    return left;
  };
  Parser.prototype.parseConcat = function () {
    let left = this.parseAdd();
    while (this.peek() && this.peek().t === "op" && this.peek().v === "&") {
      this.take();
      const right = this.parseAdd();
      left = String(left == null ? "" : left) + String(right == null ? "" : right);
    }
    return left;
  };
  Parser.prototype.parseAdd = function () {
    let left = this.parseMul();
    while (this.peek() && this.peek().t === "op" && (this.peek().v === "+" || this.peek().v === "-")) {
      const op = this.take().v;
      const right = this.parseMul();
      if (left instanceof Date && parseNumber(right) != null) {
        const d = new Date(left.getTime());
        d.setDate(d.getDate() + (op === "+" ? parseNumber(right) : -parseNumber(right)));
        left = d;
        continue;
      }
      const ln = parseNumber(left);
      const rn = parseNumber(right);
      if (ln == null || rn == null) {
        left = String(left == null ? "" : left) + String(right == null ? "" : right);
      } else {
        left = op === "+" ? ln + rn : ln - rn;
      }
    }
    return left;
  };
  Parser.prototype.parseMul = function () {
    let left = this.parseUnary();
    while (this.peek() && this.peek().t === "op" && (this.peek().v === "*" || this.peek().v === "/")) {
      const op = this.take().v;
      const right = this.parseUnary();
      const ln = parseNumber(left) || 0;
      const rn = parseNumber(right);
      if (op === "*") left = ln * (rn || 0);
      else if (!rn) left = makeErr("#DIV/0!", "除数为 0");
      else left = ln / rn;
    }
    return left;
  };
  Parser.prototype.parseUnary = function () {
    if (this.peek() && this.peek().t === "op" && this.peek().v === "+") {
      this.take();
      return this.parseUnary();
    }
    if (this.peek() && this.peek().t === "op" && this.peek().v === "-") {
      this.take();
      const n = parseNumber(this.parseUnary());
      return n == null ? "" : -n;
    }
    return this.parsePow();
  };
  Parser.prototype.parsePow = function () {
    let left = this.parsePct();
    if (this.peek() && this.peek().t === "op" && this.peek().v === "^") {
      this.take();
      const right = this.parseUnary();
      left = Math.pow(parseNumber(left) || 0, parseNumber(right) || 0);
    }
    return left;
  };
  Parser.prototype.parsePct = function () {
    let v = this.parsePrimary();
    while (this.peek() && this.peek().t === "op" && this.peek().v === "%") {
      this.take();
      v = (parseNumber(v) || 0) / 100;
    }
    return v;
  };
  Parser.prototype.parsePrimary = function () {
    const tok = this.peek();
    if (!tok) throw new Error("公式不完整");
    if (tok.t === "num") {
      this.take();
      return tok.v;
    }
    if (tok.t === "str") {
      this.take();
      return tok.v;
    }
    if (tok.t === "ref") {
      this.take();
      return lookup(this.ctx, tok.v);
    }
    if (tok.t === "id") {
      this.take();
      const name = tok.v;
      if (this.peek() && this.peek().t === "op" && this.peek().v === "(") {
        return this.parseCall(name);
      }
      const u = name.toUpperCase();
      if (u === "TRUE" || name === "真") return true;
      if (u === "FALSE" || name === "假") return false;
      return lookup(this.ctx, name);
    }
    if (tok.t === "op" && tok.v === "(") {
      this.take();
      const v = this.parseCmp();
      this.take(")");
      return v;
    }
    throw new Error("无法解析: " + (tok.v || tok.t));
  };
  Parser.prototype.parseArg = function () {
    if (this.peek() && this.peek().t === "op" && (this.peek().v === "," || this.peek().v === ")")) return "";
    return this.parseCmp();
  };
  Parser.prototype.parseCall = function (name) {
    this.take("(");
    const args = [];
    if (!(this.peek() && this.peek().t === "op" && this.peek().v === ")")) {
      args.push(this.parseArg());
      while (this.peek() && this.peek().t === "op" && this.peek().v === ",") {
        this.take();
        args.push(this.parseArg());
      }
    }
    this.take(")");
    const fn = resolveFn(name);
    if (!fn) return makeErr("#NAME?", "未知函数 " + name);
    try {
      return fn.apply(null, args);
    } catch (err) {
      return makeErr("#VALUE!", err.message || err);
    }
  };

  function lookup(ctx, name) {
    if (!name) return "";
    if (Object.prototype.hasOwnProperty.call(ctx, name)) return ctx[name];
    const lower = name.toLowerCase();
    for (const key of Object.keys(ctx)) {
      if (key.toLowerCase() === lower) return ctx[key];
    }
    return "";
  }

  const RESERVED_IDS = {
    TRUE: 1,
    FALSE: 1,
    AND: 1,
    OR: 1,
    NOT: 1,
    IFEMPTY: 1,
    THIS: 1,
    COL: 1,
    真: 1,
    假: 1,
  };
  Object.keys(FN).forEach(function (k) {
    RESERVED_IDS[k] = 1;
    RESERVED_IDS[k.toUpperCase()] = 1;
  });
  Object.keys(ALIAS).forEach(function (k) {
    RESERVED_IDS[k] = 1;
    RESERVED_IDS[k.toUpperCase()] = 1;
  });

  function extractNames(expr) {
    const raw = String(expr == null ? "" : expr).trim();
    if (!raw) return [];
    const src = raw[0] === "=" ? raw : "=" + raw;
    let tokens;
    try {
      tokens = tokenize(src);
    } catch (err) {
      return [];
    }
    const names = [];
    const seen = {};
    function add(name) {
      const n = String(name || "").trim();
      if (!n || seen[n]) return;
      if (RESERVED_IDS[n] || RESERVED_IDS[n.toUpperCase()]) return;
      if (resolveFn(n)) return;
      if (/^[A-Za-z]{1,3}\d+$/.test(n)) return;
      seen[n] = true;
      names.push(n);
    }
    tokens.forEach(function (tok, i) {
      const next = tokens[i + 1];
      if (tok.t === "ref") add(tok.v);
      if (tok.t === "id") {
        if (next && next.t === "op" && next.v === "(") return;
        add(tok.v);
      }
    });
    return names;
  }

  function evaluate(expr, ctx) {
    const src = expr == null ? "" : String(expr);
    if (!src.trim()) return "";
    if (src[0] !== "=" && src.indexOf("{") < 0) {
      return src;
    }
    try {
      const tokens = tokenize(src);
      return new Parser(tokens, ctx).parse();
    } catch (err) {
      return makeErr("#VALUE!", err.message || err);
    }
  }

  function stringify(v) {
    if (v == null) return "";
    if (isErr(v)) return "#ERR " + (v.message || v.code || "");
    if (v instanceof Date) return formatDate(v, "yyyy-mm-dd");
    if (typeof v === "number") {
      if (Number.isNaN(v)) return "#ERR #NUM!";
      if (!Number.isFinite(v)) return "#ERR #NUM!";
      if (Number.isInteger(v)) return String(v);
      return String(Math.round(v * 10000) / 10000);
    }
    if (typeof v === "boolean") return v ? "TRUE" : "FALSE";
    return String(v);
  }

  function functionNames() {
    const names = Object.keys(FN).concat(Object.keys(ALIAS));
    names.sort();
    return names;
  }

  const api = {
    evaluate: evaluate,
    stringify: stringify,
    parseNumber: parseNumber,
    extractNames: extractNames,
    functionNames: functionNames,
    isErr: isErr,
  };
  if (typeof module !== "undefined" && module.exports) module.exports = api;
  root.PoFormula = api;
})(typeof window !== "undefined" ? window : globalThis);
