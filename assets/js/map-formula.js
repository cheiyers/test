(function (root) {
  var FN_ALIAS = {
    如果: "IF",
    且: "AND",
    或: "OR",
    非: "NOT",
    拼接: "CONCAT",
    列: "COL",
    本列: "THIS",
    如果空: "IFEMPTY",
    如果错误: "IFERROR",
  };

  var HELP = [
    { id: "IF", snippet: 'IF(A="",B,A)', hint: "条件：真则第二参，否则第三参" },
    { id: "IFS", snippet: 'IFS(A="灯","L",A="开关","S",TRUE,"其他")', hint: "多条件依次判断" },
    { id: "SWITCH", snippet: 'SWITCH(A,"灯","L","开关","S","其他")', hint: "按值分支" },
    { id: "IFEMPTY", snippet: "IFEMPTY(A,B)", hint: "A 空则用 B" },
    { id: "IFERROR", snippet: "IFERROR(A/B,0)", hint: "出错时返回备用值" },
    { id: "AND", snippet: 'AND(A<>"",NUM(C)>0)', hint: "全部为真" },
    { id: "OR", snippet: 'OR(A="",B="")', hint: "任一为真" },
    { id: "NOT", snippet: "NOT(ISBLANK(A))", hint: "取反" },
    { id: "CONCAT", snippet: 'CONCAT(A,"×",C)', hint: "拼接文本" },
    { id: "TEXTJOIN", snippet: 'TEXTJOIN(" / ",TRUE,A,B,C)', hint: "分隔符拼接" },
    { id: "LEFT", snippet: "LEFT(A,2)", hint: "左侧字符" },
    { id: "RIGHT", snippet: "RIGHT(A,4)", hint: "右侧字符" },
    { id: "MID", snippet: "MID(A,3,4)", hint: "从第 n 位取一段" },
    { id: "LEN", snippet: "LEN(A)", hint: "长度" },
    { id: "TRIM", snippet: "TRIM(A)", hint: "去首尾空格" },
    { id: "UPPER", snippet: "UPPER(A)", hint: "大写" },
    { id: "LOWER", snippet: "LOWER(A)", hint: "小写" },
    { id: "SUBSTITUTE", snippet: 'SUBSTITUTE(A,"KM","")', hint: "替换文本" },
    { id: "REPLACE", snippet: 'REPLACE(A,1,2,"")', hint: "按位置替换" },
    { id: "FIND", snippet: 'FIND("-",A)', hint: "查找位置（从 1 起）" },
    { id: "CONTAINS", snippet: 'CONTAINS(A,"LED")', hint: "是否包含" },
    { id: "STARTSWITH", snippet: 'STARTSWITH(A,"KM")', hint: "是否以此开头" },
    { id: "ENDSWITH", snippet: 'ENDSWITH(A,"PC")', hint: "是否以此结尾" },
    { id: "VALUE", snippet: "VALUE(C)", hint: "抽出数值" },
    { id: "NUM", snippet: "NUM(C)", hint: "抽出数值（同 VALUE）" },
    { id: "ROUND", snippet: "ROUND(NUM(C)*NUM(D),2)", hint: "四舍五入" },
    { id: "INT", snippet: "INT(NUM(C))", hint: "取整" },
    { id: "ABS", snippet: "ABS(NUM(C))", hint: "绝对值" },
    { id: "MOD", snippet: "MOD(NUM(C),10)", hint: "取余" },
    { id: "POWER", snippet: "POWER(NUM(C),2)", hint: "乘方" },
    { id: "SQRT", snippet: "SQRT(NUM(C))", hint: "平方根" },
    { id: "SUM", snippet: "SUM(C,D,E)", hint: "求和" },
    { id: "AVERAGE", snippet: "AVERAGE(C,D)", hint: "平均" },
    { id: "MIN", snippet: "MIN(C,D)", hint: "最小" },
    { id: "MAX", snippet: "MAX(C,D)", hint: "最大" },
    { id: "CHOOSE", snippet: "CHOOSE(2,A,B,C)", hint: "按序号取参" },
    { id: "ISBLANK", snippet: "ISBLANK(A)", hint: "是否为空" },
    { id: "ISNUMBER", snippet: "ISNUMBER(C)", hint: "是否为数" },
    { id: "REGEXEXTRACT", snippet: 'REGEXEXTRACT(A,"KM[A-Z0-9]+")', hint: "正则提取" },
    { id: "REGEXREPLACE", snippet: 'REGEXREPLACE(A,"\\\\s+","")', hint: "正则替换" },
    { id: "THIS", snippet: "THIS()", hint: "本列映射/固定值（不含公式）" },
    { id: "COL", snippet: 'COL("品名")', hint: "按列名引用" },
  ];

  function letterToIndex(s) {
    s = String(s || "").toUpperCase();
    if (!/^[A-Z]+$/.test(s) || s.length > 3) return -1;
    var n = 0;
    for (var i = 0; i < s.length; i++) n = n * 26 + (s.charCodeAt(i) - 64);
    return n - 1;
  }

  function isError(v) {
    return typeof v === "string" && v.charAt(0) === "#" && v.length > 1;
  }

  function displayValue(v) {
    if (v == null) return "";
    if (typeof v === "boolean") return v ? "TRUE" : "FALSE";
    if (typeof v === "number") {
      if (!isFinite(v)) return "#NUM!";
      return String(v);
    }
    return String(v);
  }

  function toText(v) {
    if (isError(v)) return v;
    if (v == null) return "";
    if (typeof v === "boolean") return v ? "TRUE" : "FALSE";
    return String(v);
  }

  function toNumber(v) {
    if (isError(v)) return v;
    if (typeof v === "number") return v;
    if (typeof v === "boolean") return v ? 1 : 0;
    var s = String(v == null ? "" : v).trim();
    if (!s) return 0;
    var m = s.replace(/,/g, "").match(/-?\d+(?:\.\d+)?/);
    if (!m) return NaN;
    return Number(m[0]);
  }

  function isTruthy(v) {
    if (isError(v)) return v;
    if (v === true) return true;
    if (v === false || v == null) return false;
    if (typeof v === "number") return v !== 0 && isFinite(v);
    var s = String(v).trim();
    if (!s || s === "0" || /^false$/i.test(s) || s === "否") return false;
    if (/^true$/i.test(s) || s === "是") return true;
    return true;
  }

  function looksNumber(v) {
    if (typeof v === "number") return isFinite(v);
    if (typeof v === "boolean") return true;
    var s = String(v == null ? "" : v).trim();
    return /^-?\d+(?:\.\d+)?$/.test(s.replace(/,/g, ""));
  }

  function compare(op, a, b) {
    if (isError(a)) return a;
    if (isError(b)) return b;
    if (op === "=" || op === "==") {
      if (looksNumber(a) && looksNumber(b)) return toNumber(a) === toNumber(b);
      return toText(a) === toText(b);
    }
    if (op === "<>" || op === "!=") {
      if (looksNumber(a) && looksNumber(b)) return toNumber(a) !== toNumber(b);
      return toText(a) !== toText(b);
    }
    var na = toNumber(a);
    var nb = toNumber(b);
    if (isError(na)) return na;
    if (isError(nb)) return nb;
    if (!isNaN(na) && !isNaN(nb) && (looksNumber(a) || looksNumber(b))) {
      if (op === ">") return na > nb;
      if (op === "<") return na < nb;
      if (op === ">=") return na >= nb;
      if (op === "<=") return na <= nb;
    }
    var sa = toText(a);
    var sb = toText(b);
    if (op === ">") return sa > sb;
    if (op === "<") return sa < sb;
    if (op === ">=") return sa >= sb;
    if (op === "<=") return sa <= sb;
    return false;
  }

  function tokenize(input) {
    var s = String(input || "");
    var tokens = [];
    var i = 0;
    function push(type, value) {
      tokens.push({ type: type, value: value });
    }
    while (i < s.length) {
      var c = s.charAt(i);
      if (c === " " || c === "\t" || c === "\n" || c === "\r") {
        i++;
        continue;
      }
      if (c === '"' || c === "'") {
        var q = c;
        i++;
        var str = "";
        while (i < s.length) {
          var ch = s.charAt(i);
          if (ch === q) {
            if (s.charAt(i + 1) === q) {
              str += q;
              i += 2;
              continue;
            }
            i++;
            break;
          }
          str += ch;
          i++;
        }
        push("str", str);
        continue;
      }
      if (c === "[" || c === "【") {
        var end = c === "[" ? "]" : "】";
        i++;
        var name = "";
        while (i < s.length && s.charAt(i) !== end) {
          name += s.charAt(i);
          i++;
        }
        if (s.charAt(i) === end) i++;
        push("name", name.trim());
        continue;
      }
      if (c >= "0" && c <= "9") {
        var num = c;
        i++;
        while (i < s.length && ((s.charAt(i) >= "0" && s.charAt(i) <= "9") || s.charAt(i) === ".")) {
          num += s.charAt(i);
          i++;
        }
        push("num", Number(num));
        continue;
      }
      if (c === "." && s.charAt(i + 1) >= "0" && s.charAt(i + 1) <= "9") {
        var frac = "0.";
        i++;
        while (i < s.length && s.charAt(i) >= "0" && s.charAt(i) <= "9") {
          frac += s.charAt(i);
          i++;
        }
        push("num", Number(frac));
        continue;
      }
      var two = s.slice(i, i + 2);
      if (two === "<>" || two === "<=" || two === ">=" || two === "!=" || two === "==") {
        push("op", two === "==" ? "=" : two);
        i += 2;
        continue;
      }
      if ("+-*/&<>=(),".indexOf(c) >= 0) {
        push(c === "," ? "comma" : c === "(" ? "lp" : c === ")" ? "rp" : "op", c === "," ? "," : c);
        i++;
        continue;
      }
      if (/[A-Za-z_\u4e00-\u9fff]/.test(c)) {
        var id = c;
        i++;
        while (i < s.length && /[A-Za-z0-9_\u4e00-\u9fff]/.test(s.charAt(i))) {
          id += s.charAt(i);
          i++;
        }
        push("id", id);
        continue;
      }
      push("err", c);
      i++;
    }
    push("eof", "");
    return tokens;
  }

  function parse(input) {
    var tokens = tokenize(input);
    var p = 0;
    function peek() {
      return tokens[p];
    }
    function eat(type, value) {
      var t = peek();
      if (t.type !== type) return null;
      if (value != null && t.value !== value) return null;
      p++;
      return t;
    }
    function error(msg) {
      return { type: "err", message: msg || "#ERROR!" };
    }
    function parseArgs() {
      var args = [];
      if (eat("rp")) return args;
      args.push(parseOr());
      while (eat("comma")) args.push(parseOr());
      if (!eat("rp")) args.push(error("#ERROR!"));
      return args;
    }
    function parseAtom() {
      var t = peek();
      if (t.type === "err") {
        p++;
        return error("#ERROR!");
      }
      if (eat("op", "+")) return parseAtom();
      if (eat("op", "-")) {
        return { type: "un", op: "-", arg: parseAtom() };
      }
      if (eat("lp")) {
        var inner = parseOr();
        eat("rp");
        return inner;
      }
      if (t.type === "num") {
        p++;
        return { type: "num", value: t.value };
      }
      if (t.type === "str") {
        p++;
        return { type: "str", value: t.value };
      }
      if (t.type === "name") {
        p++;
        return { type: "byName", name: t.value };
      }
      if (t.type === "id") {
        p++;
        var name = t.value;
        if (eat("lp")) {
          var fn = FN_ALIAS[name] || name.toUpperCase();
          return { type: "call", name: fn, args: parseArgs() };
        }
        if (/^true$/i.test(name) || name === "真" || name === "是") return { type: "bool", value: true };
        if (/^false$/i.test(name) || name === "假" || name === "否") return { type: "bool", value: false };
        if (letterToIndex(name) >= 0) return { type: "col", letter: name.toUpperCase() };
        return error("#NAME?");
      }
      p++;
      return error("#ERROR!");
    }
    function parseMul() {
      var left = parseAtom();
      while (peek().type === "op" && (peek().value === "*" || peek().value === "/")) {
        var op = eat("op").value;
        left = { type: "bin", op: op, left: left, right: parseAtom() };
      }
      return left;
    }
    function parseAdd() {
      var left = parseMul();
      while (peek().type === "op" && (peek().value === "+" || peek().value === "-")) {
        var op = eat("op").value;
        left = { type: "bin", op: op, left: left, right: parseMul() };
      }
      return left;
    }
    function parseConcat() {
      var left = parseAdd();
      while (peek().type === "op" && peek().value === "&") {
        eat("op");
        left = { type: "bin", op: "&", left: left, right: parseAdd() };
      }
      return left;
    }
    function parseCmp() {
      var left = parseConcat();
      var t = peek();
      if (t.type === "op" && "=:<>!".indexOf(t.value.charAt(0)) >= 0 && t.value !== "&") {
        var op = eat("op").value;
        return { type: "bin", op: op, left: left, right: parseConcat() };
      }
      return left;
    }
    function parseAnd() {
      var left = parseCmp();
      while (peek().type === "id" && /^(AND|且)$/i.test(peek().value) && tokens[p + 1] && tokens[p + 1].type !== "lp") {
        p++;
        left = { type: "call", name: "AND", args: [left, parseCmp()] };
      }
      return left;
    }
    function parseOr() {
      var left = parseAnd();
      while (peek().type === "id" && /^(OR|或)$/i.test(peek().value) && tokens[p + 1] && tokens[p + 1].type !== "lp") {
        p++;
        left = { type: "call", name: "OR", args: [left, parseAnd()] };
      }
      return left;
    }
    if (!String(input || "").trim()) return { type: "str", value: "" };
    var ast = parseOr();
    return ast;
  }

  function nums(args) {
    var out = [];
    for (var i = 0; i < args.length; i++) {
      if (isError(args[i])) return args[i];
      var n = toNumber(args[i]);
      if (isError(n)) return n;
      if (isNaN(n)) return "#VALUE!";
      out.push(n);
    }
    return out;
  }

  function callFn(name, args, ctx) {
    var a0 = args[0];
    var a1 = args[1];
    var a2 = args[2];
    var a3 = args[3];
    switch (name) {
      case "IF": {
        var c = isTruthy(a0);
        if (isError(c)) return c;
        return c ? (a1 == null ? true : a1) : a2 == null ? false : a2;
      }
      case "IFS": {
        var i;
        for (i = 0; i + 1 < args.length; i += 2) {
          var t = isTruthy(args[i]);
          if (isError(t)) return t;
          if (t) return args[i + 1];
        }
        if (args.length % 2 === 1) return args[args.length - 1];
        return "";
      }
      case "SWITCH": {
        var key = toText(a0);
        if (isError(key)) return key;
        for (var s = 1; s + 1 < args.length; s += 2) {
          if (toText(args[s]) === key) return args[s + 1];
        }
        if ((args.length - 1) % 2 === 1) return args[args.length - 1];
        return "";
      }
      case "IFERROR":
        return isError(a0) ? (a1 == null ? "" : a1) : a0;
      case "IFEMPTY":
      case "IFBLANK":
        return String(a0 == null ? "" : a0).trim() === "" || a0 === false ? (a1 == null ? "" : a1) : a0;
      case "AND": {
        for (var ai = 0; ai < args.length; ai++) {
          var tv = isTruthy(args[ai]);
          if (isError(tv)) return tv;
          if (!tv) return false;
        }
        return args.length > 0;
      }
      case "OR": {
        for (var oi = 0; oi < args.length; oi++) {
          var ov = isTruthy(args[oi]);
          if (isError(ov)) return ov;
          if (ov) return true;
        }
        return false;
      }
      case "NOT": {
        var nv = isTruthy(a0);
        return isError(nv) ? nv : !nv;
      }
      case "XOR": {
        var x = false;
        for (var xi = 0; xi < args.length; xi++) {
          var xv = isTruthy(args[xi]);
          if (isError(xv)) return xv;
          x = x !== xv;
        }
        return x;
      }
      case "CONCAT":
      case "CONCATENATE": {
        var cat = "";
        for (var ci = 0; ci < args.length; ci++) {
          if (isError(args[ci])) return args[ci];
          cat += toText(args[ci]);
        }
        return cat;
      }
      case "TEXTJOIN": {
        var sep = toText(a0);
        var ignore = isTruthy(a1);
        if (isError(sep)) return sep;
        if (isError(ignore)) return ignore;
        var parts = [];
        for (var ti = 2; ti < args.length; ti++) {
          if (isError(args[ti])) return args[ti];
          var piece = toText(args[ti]);
          if (ignore && !String(piece).trim()) continue;
          parts.push(piece);
        }
        return parts.join(sep);
      }
      case "LEFT":
        return toText(a0).slice(0, Math.max(0, toNumber(a1) || 0));
      case "RIGHT": {
        var t = toText(a0);
        var n = Math.max(0, toNumber(a1) || 0);
        return t.slice(Math.max(0, t.length - n));
      }
      case "MID": {
        var start = Math.max(1, toNumber(a1) || 1) - 1;
        var len = Math.max(0, a2 == null ? 1 : toNumber(a2) || 0);
        return toText(a0).substr(start, len);
      }
      case "LEN":
      case "LENGTH":
        return toText(a0).length;
      case "TRIM":
        return toText(a0).trim();
      case "UPPER":
        return toText(a0).toUpperCase();
      case "LOWER":
        return toText(a0).toLowerCase();
      case "PROPER":
        return toText(a0).replace(/[A-Za-z\u4e00-\u9fff]+/g, function (w) {
          return w.charAt(0).toUpperCase() + w.slice(1).toLowerCase();
        });
      case "REPEAT":
        return toText(a0).repeat(Math.max(0, Math.min(100, toNumber(a1) || 0)));
      case "SUBSTITUTE": {
        var src = toText(a0);
        var old = toText(a1);
        var neu = toText(a2);
        if (!old) return src;
        if (a3 == null || a3 === "") return src.split(old).join(neu);
        var nth = Math.max(1, toNumber(a3) || 1);
        var seen = 0;
        return src.split(old).reduce(function (acc, part, idx, arr) {
          if (idx === arr.length - 1) return acc + part;
          seen++;
          return acc + part + (seen === nth ? neu : old);
        }, "");
      }
      case "REPLACE": {
        var rt = toText(a0);
        var rs = Math.max(1, toNumber(a1) || 1) - 1;
        var rl = Math.max(0, toNumber(a2) || 0);
        return rt.slice(0, rs) + toText(a3) + rt.slice(rs + rl);
      }
      case "FIND": {
        var ft = toText(a1);
        var startF = a2 == null ? 0 : Math.max(0, (toNumber(a2) || 1) - 1);
        var at = ft.indexOf(toText(a0), startF);
        return at < 0 ? "#VALUE!" : at + 1;
      }
      case "SEARCH": {
        var st = toText(a1).toLowerCase();
        var startS = a2 == null ? 0 : Math.max(0, (toNumber(a2) || 1) - 1);
        var as = st.indexOf(toText(a0).toLowerCase(), startS);
        return as < 0 ? "#VALUE!" : as + 1;
      }
      case "CONTAINS":
        return toText(a0).indexOf(toText(a1)) >= 0;
      case "STARTSWITH":
        return toText(a0).indexOf(toText(a1)) === 0;
      case "ENDSWITH": {
        var es = toText(a0);
        var end = toText(a1);
        return es.slice(-end.length) === end;
      }
      case "VALUE":
      case "NUM":
      case "N":
      case "NUMBERVALUE": {
        var vn = toNumber(a0);
        return isError(vn) ? vn : isNaN(vn) ? "#VALUE!" : vn;
      }
      case "ROUND": {
        var rn = nums([a0]);
        if (isError(rn) || !Array.isArray(rn)) return rn;
        var d = a1 == null ? 0 : toNumber(a1);
        if (isError(d)) return d;
        var f = Math.pow(10, d || 0);
        return Math.round(rn[0] * f) / f;
      }
      case "ROUNDDOWN": {
        var rd = nums([a0]);
        if (!Array.isArray(rd)) return rd;
        var dd = a1 == null ? 0 : toNumber(a1);
        var fd = Math.pow(10, dd || 0);
        return (rd[0] < 0 ? Math.ceil(rd[0] * fd) : Math.floor(rd[0] * fd)) / fd;
      }
      case "ROUNDUP": {
        var ru = nums([a0]);
        if (!Array.isArray(ru)) return ru;
        var du = a1 == null ? 0 : toNumber(a1);
        var fu = Math.pow(10, du || 0);
        return (ru[0] < 0 ? Math.floor(ru[0] * fu) : Math.ceil(ru[0] * fu)) / fu;
      }
      case "INT":
      case "FLOOR": {
        var fi = toNumber(a0);
        return isError(fi) || isNaN(fi) ? "#VALUE!" : Math.floor(fi);
      }
      case "CEILING": {
        var ce = toNumber(a0);
        return isError(ce) || isNaN(ce) ? "#VALUE!" : Math.ceil(ce);
      }
      case "ABS": {
        var ab = toNumber(a0);
        return isError(ab) || isNaN(ab) ? "#VALUE!" : Math.abs(ab);
      }
      case "MOD": {
        var md = nums(args.slice(0, 2));
        if (!Array.isArray(md)) return md;
        if (!md[1]) return "#DIV/0!";
        return md[0] % md[1];
      }
      case "POWER":
      case "POW": {
        var pw = nums(args.slice(0, 2));
        return Array.isArray(pw) ? Math.pow(pw[0], pw[1]) : pw;
      }
      case "SQRT": {
        var sq = toNumber(a0);
        if (isError(sq) || isNaN(sq) || sq < 0) return "#NUM!";
        return Math.sqrt(sq);
      }
      case "SUM": {
        var sm = nums(args);
        if (!Array.isArray(sm)) return sm;
        return sm.reduce(function (x, y) {
          return x + y;
        }, 0);
      }
      case "AVERAGE":
      case "AVG": {
        var av = nums(args);
        if (!Array.isArray(av)) return av;
        return av.length ? av.reduce(function (x, y) { return x + y; }, 0) / av.length : 0;
      }
      case "MIN": {
        var mn = nums(args);
        return Array.isArray(mn) ? Math.min.apply(null, mn) : mn;
      }
      case "MAX": {
        var mx = nums(args);
        return Array.isArray(mx) ? Math.max.apply(null, mx) : mx;
      }
      case "CHOOSE": {
        var idx = Math.floor(toNumber(a0));
        if (isNaN(idx) || idx < 1 || idx >= args.length) return "#VALUE!";
        return args[idx];
      }
      case "ISBLANK":
      case "ISEMPTY":
        return String(a0 == null ? "" : a0).trim() === "";
      case "ISNUMBER":
        return looksNumber(a0);
      case "ISTEXT":
        return typeof a0 === "string" && !looksNumber(a0);
      case "ISERROR":
        return isError(a0);
      case "REGEXEXTRACT": {
        try {
          var rm = toText(a0).match(new RegExp(toText(a1)));
          if (!rm) return "";
          var g = a2 == null || a2 === "" ? 0 : toNumber(a2);
          return rm[g] != null ? rm[g] : "";
        } catch (e) {
          return "#ERROR!";
        }
      }
      case "REGEXREPLACE": {
        try {
          return toText(a0).replace(new RegExp(toText(a1), "g"), toText(a2));
        } catch (e2) {
          return "#ERROR!";
        }
      }
      case "REGEXMATCH": {
        try {
          return new RegExp(toText(a1)).test(toText(a0));
        } catch (e3) {
          return "#ERROR!";
        }
      }
      case "THIS":
        return ctx.thisValue == null ? "" : ctx.thisValue;
      case "COL":
      case "COLUMN": {
        if (looksNumber(a0) && String(a0).trim() !== "") {
          var n1 = Math.floor(toNumber(a0)) - 1;
          return ctx.valueAt(n1);
        }
        return ctx.valueByName(toText(a0));
      }
      default:
        return "#NAME?";
    }
  }

  function evalAst(node, ctx) {
    if (!node) return "";
    if (node.type === "err") return node.message || "#ERROR!";
    if (node.type === "num") return node.value;
    if (node.type === "str") return node.value;
    if (node.type === "bool") return node.value;
    if (node.type === "col") return ctx.valueAt(letterToIndex(node.letter));
    if (node.type === "byName") return ctx.valueByName(node.name);
    if (node.type === "un") {
      var u = evalAst(node.arg, ctx);
      if (isError(u)) return u;
      var un = toNumber(u);
      return isNaN(un) ? "#VALUE!" : -un;
    }
    if (node.type === "bin") {
      if (node.op === "&") {
        var la = evalAst(node.left, ctx);
        var ra = evalAst(node.right, ctx);
        if (isError(la)) return la;
        if (isError(ra)) return ra;
        return toText(la) + toText(ra);
      }
      if ("=<>!".indexOf(node.op.charAt(0)) >= 0) {
        return compare(node.op, evalAst(node.left, ctx), evalAst(node.right, ctx));
      }
      var lb = evalAst(node.left, ctx);
      var rb = evalAst(node.right, ctx);
      var ln = toNumber(lb);
      var rn = toNumber(rb);
      if (isError(ln)) return ln;
      if (isError(rn)) return rn;
      if (isNaN(ln) || isNaN(rn)) return "#VALUE!";
      if (node.op === "+") return ln + rn;
      if (node.op === "-") return ln - rn;
      if (node.op === "*") return ln * rn;
      if (node.op === "/") return rn === 0 ? "#DIV/0!" : ln / rn;
      return "#ERROR!";
    }
    if (node.type === "call") {
      if (node.name === "IF") {
        var cond = evalAst(node.args[0], ctx);
        var ok = isTruthy(cond);
        if (isError(ok)) return ok;
        if (ok) return node.args[1] ? evalAst(node.args[1], ctx) : true;
        return node.args[2] ? evalAst(node.args[2], ctx) : false;
      }
      if (node.name === "IFS") {
        for (var i = 0; i + 1 < node.args.length; i += 2) {
          var hit = isTruthy(evalAst(node.args[i], ctx));
          if (isError(hit)) return hit;
          if (hit) return evalAst(node.args[i + 1], ctx);
        }
        if (node.args.length % 2 === 1) return evalAst(node.args[node.args.length - 1], ctx);
        return "";
      }
      if (node.name === "IFERROR") {
        var trial = evalAst(node.args[0], ctx);
        if (isError(trial)) return node.args[1] ? evalAst(node.args[1], ctx) : "";
        return trial;
      }
      var evaluated = [];
      for (var k = 0; k < node.args.length; k++) evaluated.push(evalAst(node.args[k], ctx));
      return callFn(node.name, evaluated, ctx);
    }
    return "";
  }

  function evaluate(formula, ctx) {
    try {
      return evalAst(parse(formula), ctx || {});
    } catch (e) {
      return "#ERROR!";
    }
  }

  function evalRow(columns, rawOf) {
    var cols = columns || [];
    var cache = [];
    var ready = [];
    var visiting = {};
    function valueAt(index) {
      if (index < 0 || index >= cols.length) return "#REF!";
      if (ready[index]) return cache[index];
      if (visiting[index]) return "#CYCLE!";
      visiting[index] = true;
      var col = cols[index] || {};
      var raw = rawOf ? rawOf(index) : "";
      var out = raw;
      var formula = col.formula && String(col.formula).trim();
      if (formula) {
        if (formula.charAt(0) === "=") formula = formula.slice(1);
        out = evaluate(formula, {
          thisValue: raw,
          valueAt: valueAt,
          valueByName: valueByName,
        });
      }
      visiting[index] = false;
      ready[index] = true;
      cache[index] = displayValue(out);
      return cache[index];
    }
    function valueByName(name) {
      var want = String(name || "").trim();
      for (var i = 0; i < cols.length; i++) {
        if ((cols[i].name || "") === want) return valueAt(i);
      }
      return "#REF!";
    }
    var row = [];
    for (var i = 0; i < cols.length; i++) row.push(valueAt(i));
    return row;
  }

  var api = {
    HELP: HELP,
    letterToIndex: letterToIndex,
    tokenize: tokenize,
    parse: parse,
    evaluate: evaluate,
    evalRow: evalRow,
    displayValue: displayValue,
    isError: isError,
  };
  if (typeof module !== "undefined" && module.exports) module.exports = api;
  root.MapFormula = api;
})(typeof window !== "undefined" ? window : globalThis);
