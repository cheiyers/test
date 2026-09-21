(function (root) {
  const FN = {
    IF: function (cond, a, b) {
      return cond ? a : b;
    },
    ROUND: function (n, d) {
      const digits = d == null ? 0 : Number(d);
      const x = Number(n);
      if (Number.isNaN(x)) return n;
      const f = Math.pow(10, digits);
      return Math.round(x * f) / f;
    },
    LEFT: function (s, n) {
      return String(s == null ? "" : s).slice(0, Number(n || 0));
    },
    RIGHT: function (s, n) {
      const t = String(s == null ? "" : s);
      return t.slice(Math.max(0, t.length - Number(n || 0)));
    },
    MID: function (s, start, n) {
      const t = String(s == null ? "" : s);
      const i = Math.max(0, Number(start || 1) - 1);
      return t.slice(i, i + Number(n || 0));
    },
    LEN: function (s) {
      return String(s == null ? "" : s).length;
    },
    TRIM: function (s) {
      return String(s == null ? "" : s).trim();
    },
    UPPER: function (s) {
      return String(s == null ? "" : s).toUpperCase();
    },
    LOWER: function (s) {
      return String(s == null ? "" : s).toLowerCase();
    },
    VALUE: function (s) {
      const n = parseNumber(s);
      return n == null ? 0 : n;
    },
    TEXT: function (v, fmt) {
      const d = parseDate(v);
      if (d) return formatDate(d, fmt || "yyyy-mm-dd");
      if (typeof v === "number" && fmt && /0/.test(fmt)) {
        const digits = (String(fmt).split(".")[1] || "").length;
        return v.toFixed(digits);
      }
      return String(v == null ? "" : v);
    },
    DATEVALUE: function (v) {
      const d = parseDate(v);
      if (!d) throw new Error("无法解析日期");
      return d;
    },
    TODAY: function () {
      const d = new Date();
      return new Date(d.getFullYear(), d.getMonth(), d.getDate());
    },
    CONCAT: function () {
      return Array.prototype.map.call(arguments, function (x) {
        return x == null ? "" : String(x);
      }).join("");
    },
  };

  function parseDate(v) {
    if (v instanceof Date && !Number.isNaN(v.getTime())) return v;
    const s = String(v == null ? "" : v).trim();
    if (!s) return null;
    let m = s.match(/^(\d{4})[/\-.](\d{1,2})[/\-.](\d{1,2})$/);
    if (m) {
      const d = new Date(Number(m[1]), Number(m[2]) - 1, Number(m[3]));
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
    return String(fmt)
      .replace(/yyyy/g, yyyy)
      .replace(/yy/g, yy)
      .replace(/mm/g, mm)
      .replace(/dd/g, dd)
      .replace(/m/g, m)
      .replace(/d/g, day);
  }

  function parseNumber(v) {
    if (v == null || v === "") return null;
    if (typeof v === "number" && !Number.isNaN(v)) return v;
    if (v instanceof Date) return v.getTime();
    const s = String(v).trim();
    const unitPrice = s.match(/^(-?\d+(?:\.\d+)?)\s*\/\s*\d+$/);
    if (unitPrice) return Number(unitPrice[1]);
    const cleaned = s.replace(/,/g, "").replace(/[^\d.-]/g, "");
    if (!cleaned || cleaned === "-" || cleaned === ".") return null;
    const n = Number(cleaned);
    return Number.isNaN(n) ? null : n;
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
        tokens.push({ t: "num", v: Number(s.slice(i, j)) });
        i = j;
        continue;
      }
      if (/[A-Za-z_\u4e00-\u9fff]/.test(c)) {
        let j = i + 1;
        while (j < s.length && /[A-Za-z0-9_\u4e00-\u9fff./]/.test(s[j])) j++;
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
      if ("+-*/&()<>,=".indexOf(c) >= 0) {
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
      const rn = parseNumber(right) || 0;
      left = op === "*" ? ln * rn : rn === 0 ? "" : ln / rn;
    }
    return left;
  };
  Parser.prototype.parseUnary = function () {
    if (this.peek() && this.peek().t === "op" && this.peek().v === "-") {
      this.take();
      const n = parseNumber(this.parseUnary());
      return n == null ? "" : -n;
    }
    return this.parsePrimary();
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
      if (this.peek() && this.peek().t === "op" && this.peek().v === "(") {
        return this.parseCall(tok.v);
      }
      return lookup(this.ctx, tok.v);
    }
    if (tok.t === "op" && tok.v === "(") {
      this.take();
      const v = this.parseCmp();
      this.take(")");
      return v;
    }
    throw new Error("无法解析: " + (tok.v || tok.t));
  };
  Parser.prototype.parseCall = function (name) {
    this.take("(");
    const args = [];
    if (!(this.peek() && this.peek().t === "op" && this.peek().v === ")")) {
      args.push(this.parseCmp());
      while (this.peek() && this.peek().t === "op" && this.peek().v === ",") {
        this.take();
        args.push(this.parseCmp());
      }
    }
    this.take(")");
    const fn = FN[name.toUpperCase()];
    if (!fn) throw new Error("未知函数 " + name);
    return fn.apply(null, args);
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
      return "#ERR " + (err.message || err);
    }
  }

  function stringify(v) {
    if (v == null) return "";
    if (v instanceof Date) return formatDate(v, "yyyy-mm-dd");
    if (typeof v === "number") {
      if (Number.isInteger(v)) return String(v);
      return String(Math.round(v * 10000) / 10000);
    }
    if (typeof v === "boolean") return v ? "TRUE" : "FALSE";
    return String(v);
  }

  const api = { evaluate: evaluate, stringify: stringify, parseNumber: parseNumber };
  if (typeof module !== "undefined" && module.exports) module.exports = api;
  root.PoFormula = api;
})(typeof window !== "undefined" ? window : globalThis);
