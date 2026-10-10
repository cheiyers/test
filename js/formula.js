(function (root, factory) {
  if (typeof module === "object" && module.exports) module.exports = factory();
  else root.Formula = factory();
})(typeof self !== "undefined" ? self : this, function () {
  var FUNCTIONS = {
    IF: true,
    AND: true,
    OR: true,
    NOT: true,
    ROUND: true,
    ROUNDUP: true,
    ROUNDDOWN: true,
    MAX: true,
    MIN: true,
    ABS: true,
    INT: true,
    MOD: true,
    SUM: true
  };

  function isIdentStart(ch) {
    return /[A-Za-z_\u4e00-\u9fff]/.test(ch);
  }

  function isIdentPart(ch) {
    return /[A-Za-z0-9_\u4e00-\u9fff]/.test(ch);
  }

  function tokenize(src) {
    var body = String(src == null ? "" : src).trim();
    if (body.charAt(0) === "=") body = body.slice(1);
    var tokens = [];
    var i = 0;
    while (i < body.length) {
      var c = body.charAt(i);
      if (c === " " || c === "\n" || c === "\t" || c === "\r") {
        i++;
        continue;
      }
      if (c === '"') {
        var j = i + 1;
        var text = "";
        while (j < body.length) {
          if (body.charAt(j) === '"') {
            if (body.charAt(j + 1) === '"') {
              text += '"';
              j += 2;
              continue;
            }
            break;
          }
          text += body.charAt(j);
          j++;
        }
        if (body.charAt(j) !== '"') throw new Error("字符串没有结束");
        tokens.push({ type: "string", value: text });
        i = j + 1;
        continue;
      }
      if (c === "[") {
        var end = body.indexOf("]", i + 1);
        if (end < 0) throw new Error("方括号没有结束");
        tokens.push({ type: "ref", value: body.slice(i + 1, end) });
        i = end + 1;
        continue;
      }
      var two = body.slice(i, i + 2);
      if (two === "<=" || two === ">=" || two === "<>") {
        tokens.push({ type: "op", value: two });
        i += 2;
        continue;
      }
      if ("+-*/(),=<>".indexOf(c) >= 0) {
        tokens.push({ type: "op", value: c });
        i++;
        continue;
      }
      if (c === "." || (c >= "0" && c <= "9")) {
        var k = i;
        while (k < body.length && /[0-9.]/.test(body.charAt(k))) k++;
        var raw = body.slice(i, k);
        if (!/^\d+(\.\d+)?$/.test(raw) && !/^\d+\.$/.test(raw) && !/^\.\d+$/.test(raw)) {
          throw new Error("数字无效：" + raw);
        }
        tokens.push({ type: "number", value: parseFloat(raw) });
        i = k;
        continue;
      }
      if (isIdentStart(c)) {
        var n = i + 1;
        while (n < body.length && isIdentPart(body.charAt(n))) n++;
        tokens.push({ type: "ident", value: body.slice(i, n) });
        i = n;
        continue;
      }
      throw new Error("无法识别的符号：" + c);
    }
    tokens.push({ type: "eof", value: "" });
    return tokens;
  }

  function parser(tokens) {
    var pos = 0;
    return {
      peek: function () {
        return tokens[pos];
      },
      next: function () {
        return tokens[pos++];
      },
      expect: function (value) {
        var token = tokens[pos++];
        if (!token || token.value !== value) throw new Error("缺少 " + value);
      }
    };
  }

  function parse(src) {
    var ts = parser(tokenize(src));
    var ast = parseComparison(ts);
    if (ts.peek().type !== "eof") throw new Error("公式末尾有多余内容");
    return ast;
  }

  function parseComparison(ts) {
    var left = parseAdd(ts);
    while (isComparison(ts.peek().value)) {
      var op = ts.next().value;
      var right = parseAdd(ts);
      left = { type: "binop", op: op, left: left, right: right };
    }
    return left;
  }

  function isComparison(value) {
    return value === "=" || value === "<>" || value === "<" || value === ">" || value === "<=" || value === ">=";
  }

  function parseAdd(ts) {
    var left = parseMul(ts);
    while (ts.peek().value === "+" || ts.peek().value === "-") {
      var op = ts.next().value;
      left = { type: "binop", op: op, left: left, right: parseMul(ts) };
    }
    return left;
  }

  function parseMul(ts) {
    var left = parseUnary(ts);
    while (ts.peek().value === "*" || ts.peek().value === "/") {
      var op = ts.next().value;
      left = { type: "binop", op: op, left: left, right: parseUnary(ts) };
    }
    return left;
  }

  function parseUnary(ts) {
    if (ts.peek().type === "op" && (ts.peek().value === "+" || ts.peek().value === "-")) {
      var op = ts.next().value;
      return { type: "unary", op: op, expr: parseUnary(ts) };
    }
    return parsePrimary(ts);
  }

  function parsePrimary(ts) {
    var token = ts.peek();
    if (token.value === "(" && token.type === "op") {
      ts.next();
      var inner = parseComparison(ts);
      ts.expect(")");
      return inner;
    }
    if (token.type === "number" || token.type === "string" || token.type === "ref") {
      ts.next();
      return { type: token.type, value: token.value };
    }
    if (token.type === "ident") {
      ts.next();
      if (ts.peek().value === "(" && ts.peek().type === "op") {
        ts.next();
        var args = [];
        if (!(ts.peek().value === ")" && ts.peek().type === "op")) {
          args.push(parseComparison(ts));
          while (ts.peek().value === "," && ts.peek().type === "op") {
            ts.next();
            args.push(parseComparison(ts));
          }
        }
        ts.expect(")");
        return { type: "call", name: String(token.value).toUpperCase(), args: args };
      }
      return { type: "var", name: token.value };
    }
    throw new Error("公式不完整");
  }

  function extractParams(src) {
    if (src == null || src === "") return [];
    var text = String(src).trim();
    if (!text || text.charAt(0) !== "=") return [];
    var ast = parse(text);
    var found = [];
    walk(ast, function (node) {
      if (node.type === "var" && found.indexOf(node.name) < 0) found.push(node.name);
    });
    return found;
  }

  function walk(node, visit) {
    if (!node) return;
    visit(node);
    if (node.left) walk(node.left, visit);
    if (node.right) walk(node.right, visit);
    if (node.expr) walk(node.expr, visit);
    if (node.args) node.args.forEach(function (arg) { walk(arg, visit); });
  }

  function lookup(scope, name) {
    if (scope && Object.prototype.hasOwnProperty.call(scope, name)) return scope[name];
    if (String(name).toUpperCase() === "TRUE") return true;
    if (String(name).toUpperCase() === "FALSE") return false;
    if (scope) {
      var keys = Object.keys(scope);
      for (var i = 0; i < keys.length; i++) {
        if (keys[i].toLowerCase() === String(name).toLowerCase()) return scope[keys[i]];
      }
    }
    throw new Error("未赋值的参数：" + name);
  }

  function isFiniteNumber(value) {
    return typeof value === "number" && isFinite(value);
  }

  function toNum(value) {
    if (isFiniteNumber(value)) return value;
    if (typeof value === "string" && /^-?\d+(\.\d+)?$/.test(value.trim())) return Number(value.trim());
    return null;
  }

  function asMath(value) {
    if (value === true) return 1;
    if (value === false) return 0;
    if (value == null || value === "") return 0;
    var n = toNum(value);
    if (n == null) throw new Error("无法参与运算：" + value);
    return n;
  }

  function compare(op, left, right) {
    var ln = toNum(left);
    var rn = toNum(right);
    var a;
    var b;
    var numeric = ln != null && rn != null;
    if (numeric) {
      a = ln;
      b = rn;
    } else {
      a = String(left == null ? "" : left).toLowerCase();
      b = String(right == null ? "" : right).toLowerCase();
    }
    if (op === "=") return a === b;
    if (op === "<>") return a !== b;
    if (op === "<") return a < b;
    if (op === ">") return a > b;
    if (op === "<=") return a <= b;
    if (op === ">=") return a >= b;
    throw new Error("不支持的比较：" + op);
  }

  function isFalsy(value) {
    return value === false || value === 0 || value === null || value === undefined;
  }

  function roundDigits(n, digits, mode) {
    var d = Number(digits || 0);
    if (!isFinite(d)) throw new Error("小数位数无效");
    var factor = Math.pow(10, d);
    var x = n * factor;
    var eps = 1e-8;
    var y;
    if (mode === "up") y = x >= 0 ? Math.ceil(x - eps) : -Math.ceil(-x - eps);
    else if (mode === "down") y = x >= 0 ? Math.floor(x + eps) : -Math.floor(-x + eps);
    else y = Math.round(x);
    return y / factor;
  }

  function callFunction(name, args) {
    if (!FUNCTIONS[name]) throw new Error("不支持的函数：" + name);
    if (name === "IF") {
      if (args.length < 2) throw new Error("IF 至少需要 2 个参数");
      return isFalsy(args[0]) ? (args.length > 2 ? args[2] : false) : args[1];
    }
    if (name === "AND") {
      for (var i = 0; i < args.length; i++) if (isFalsy(args[i])) return false;
      return true;
    }
    if (name === "OR") {
      for (var j = 0; j < args.length; j++) if (!isFalsy(args[j])) return true;
      return false;
    }
    if (name === "NOT") return isFalsy(args[0]);
    if (name === "ABS") return Math.abs(asMath(args[0]));
    if (name === "INT") return Math.floor(asMath(args[0]));
    if (name === "ROUND") return roundDigits(asMath(args[0]), args.length > 1 ? asMath(args[1]) : 0, "round");
    if (name === "ROUNDUP") return roundDigits(asMath(args[0]), args.length > 1 ? asMath(args[1]) : 0, "up");
    if (name === "ROUNDDOWN") return roundDigits(asMath(args[0]), args.length > 1 ? asMath(args[1]) : 0, "down");
    if (name === "MAX" || name === "MIN" || name === "SUM") {
      if (!args.length) throw new Error(name + " 缺少参数");
      var nums = args.map(asMath);
      if (name === "SUM") return nums.reduce(function (a, b) { return a + b; }, 0);
      return nums.reduce(function (a, b) { return name === "MAX" ? Math.max(a, b) : Math.min(a, b); });
    }
    if (name === "MOD") {
      var n = asMath(args[0]);
      var d = asMath(args[1]);
      if (d === 0) throw new Error("#DIV/0!");
      return n - d * Math.floor(n / d);
    }
    throw new Error("不支持的函数：" + name);
  }

  function evaluate(src, scope) {
    return evalNode(parse(src), scope || Object.create(null));
  }

  function evalNode(node, scope) {
    if (node.type === "number" || node.type === "string") return node.value;
    if (node.type === "var" || node.type === "ref") return lookup(scope, node.value || node.name);
    if (node.type === "unary") {
      var n = asMath(evalNode(node.expr, scope));
      return node.op === "-" ? -n : n;
    }
    if (node.type === "binop") {
      if (isComparison(node.op)) return compare(node.op, evalNode(node.left, scope), evalNode(node.right, scope));
      var left = asMath(evalNode(node.left, scope));
      var right = asMath(evalNode(node.right, scope));
      if (node.op === "+") return left + right;
      if (node.op === "-") return left - right;
      if (node.op === "*") return left * right;
      if (node.op === "/") {
        if (right === 0) throw new Error("#DIV/0!");
        return left / right;
      }
    }
    if (node.type === "call") {
      return callFunction(node.name, node.args.map(function (arg) { return evalNode(arg, scope); }));
    }
    throw new Error("无法计算");
  }

  function computeRemark(remark, scope) {
    if (remark == null || remark === "") return { ok: true, value: "" };
    if (typeof remark === "number") return { ok: true, value: remark };
    var text = String(remark).trim();
    if (!text) return { ok: true, value: "" };
    if (text.charAt(0) !== "=") {
      if (/^-?\d+(\.\d+)?$/.test(text)) return { ok: true, value: Number(text) };
      return { ok: false, error: "备注既不是数字也不是公式" };
    }
    try {
      return { ok: true, value: evaluate(text, scope) };
    } catch (error) {
      return { ok: false, error: error.message || "公式计算失败" };
    }
  }

  return {
    parse: parse,
    evaluate: evaluate,
    extractParams: extractParams,
    computeRemark: computeRemark
  };
});
