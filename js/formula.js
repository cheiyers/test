/**
 * Lightweight formula engine for label field binding.
 * Supports: {{col}}, &, +, IF(), CONCAT(), JOIN(), AND/OR/NOT, comparisons.
 */
(function (global) {
  'use strict';

  function getField(row, name) {
    if (!row || name == null) return '';
    if (Object.prototype.hasOwnProperty.call(row, name)) {
      const v = row[name];
      return v == null ? '' : String(v);
    }
    const key = Object.keys(row).find((k) => k.toLowerCase() === String(name).toLowerCase());
    if (!key) return '';
    const v = row[key];
    return v == null ? '' : String(v);
  }

  function tokenize(src) {
    const tokens = [];
    let i = 0;
    const s = String(src || '');
    while (i < s.length) {
      const ch = s[i];
      if (/\s/.test(ch)) { i++; continue; }
      if (s.slice(i, i + 2) === '{{') {
        const end = s.indexOf('}}', i + 2);
        if (end < 0) throw new Error('未闭合的 {{ 字段引用');
        tokens.push({ type: 'FIELD', value: s.slice(i + 2, end).trim() });
        i = end + 2;
        continue;
      }
      if (ch === '"' || ch === "'") {
        let j = i + 1;
        let out = '';
        while (j < s.length) {
          if (s[j] === '\\' && j + 1 < s.length) { out += s[j + 1]; j += 2; continue; }
          if (s[j] === ch) break;
          out += s[j++];
        }
        if (j >= s.length) throw new Error('未闭合的字符串');
        tokens.push({ type: 'STRING', value: out });
        i = j + 1;
        continue;
      }
      if (/[0-9.]/.test(ch)) {
        let j = i + 1;
        while (j < s.length && /[0-9.]/.test(s[j])) j++;
        tokens.push({ type: 'NUMBER', value: Number(s.slice(i, j)) });
        i = j;
        continue;
      }
      if (/[A-Za-z_\u4e00-\u9fff]/.test(ch)) {
        let j = i + 1;
        while (j < s.length && /[A-Za-z0-9_\u4e00-\u9fff]/.test(s[j])) j++;
        const word = s.slice(i, j);
        const upper = word.toUpperCase();
        if (['IF', 'CONCAT', 'JOIN', 'AND', 'OR', 'NOT', 'TRUE', 'FALSE'].includes(upper)) {
          tokens.push({ type: upper === 'TRUE' || upper === 'FALSE' ? 'BOOL' : 'IDENT', value: upper === 'TRUE' ? true : upper === 'FALSE' ? false : upper });
        } else {
          tokens.push({ type: 'IDENT', value: word });
        }
        i = j;
        continue;
      }
      const two = s.slice(i, i + 2);
      if (['>=', '<=', '!=', '==', '<>'].includes(two)) {
        const op = two === '==' ? '=' : two === '<>' ? '!=' : two;
        tokens.push({ type: 'OP', value: op });
        i += 2;
        continue;
      }
      if ('() ,&+-*/%<>='.includes(ch)) {
        tokens.push({ type: 'OP', value: ch });
        i++;
        continue;
      }
      throw new Error('无法识别的字符: ' + ch);
    }
    return tokens;
  }

  function Parser(tokens) {
    this.tokens = tokens;
    this.i = 0;
  }
  Parser.prototype.peek = function () { return this.tokens[this.i]; };
  Parser.prototype.next = function () { return this.tokens[this.i++]; };
  Parser.prototype.expect = function (val) {
    const t = this.next();
    if (!t || t.value !== val) throw new Error('期望 ' + val);
    return t;
  };
  Parser.prototype.parse = function () { return this.parseOr(); };
  Parser.prototype.parseOr = function () {
    let left = this.parseAnd();
    while (this.peek() && this.peek().type === 'IDENT' && this.peek().value === 'OR') {
      this.next();
      const right = this.parseAnd();
      left = { type: 'OR', left, right };
    }
    return left;
  };
  Parser.prototype.parseAnd = function () {
    let left = this.parseCompare();
    while (this.peek() && this.peek().type === 'IDENT' && this.peek().value === 'AND') {
      this.next();
      const right = this.parseCompare();
      left = { type: 'AND', left, right };
    }
    return left;
  };
  Parser.prototype.parseCompare = function () {
    let left = this.parseConcat();
    const t = this.peek();
    if (t && t.type === 'OP' && ['=', '!=', '>', '>=', '<', '<='].includes(t.value)) {
      const op = this.next().value;
      const right = this.parseConcat();
      return { type: 'CMP', op, left, right };
    }
    return left;
  };
  Parser.prototype.parseConcat = function () {
    let left = this.parseAdd();
    while (this.peek() && this.peek().type === 'OP' && (this.peek().value === '&' || this.peek().value === '+')) {
      const op = this.next().value;
      const right = this.parseAdd();
      left = { type: 'CONCAT_OP', op, left, right };
    }
    return left;
  };
  Parser.prototype.parseAdd = function () {
    let left = this.parseMul();
    while (this.peek() && this.peek().type === 'OP' && (this.peek().value === '-' || this.peek().value === '+')) {
      // + already handled as concat in many cases; allow numeric minus/add after concat level via re-parse? keep simple
      const op = this.next().value;
      const right = this.parseMul();
      left = { type: 'ARITH', op, left, right };
    }
    return left;
  };
  Parser.prototype.parseMul = function () {
    let left = this.parseUnary();
    while (this.peek() && this.peek().type === 'OP' && (this.peek().value === '*' || this.peek().value === '/' || this.peek().value === '%')) {
      const op = this.next().value;
      const right = this.parseUnary();
      left = { type: 'ARITH', op, left, right };
    }
    return left;
  };
  Parser.prototype.parseUnary = function () {
    if (this.peek() && this.peek().type === 'IDENT' && this.peek().value === 'NOT') {
      this.next();
      return { type: 'NOT', expr: this.parseUnary() };
    }
    if (this.peek() && this.peek().type === 'OP' && this.peek().value === '-') {
      this.next();
      return { type: 'NEG', expr: this.parseUnary() };
    }
    return this.parsePrimary();
  };
  Parser.prototype.parsePrimary = function () {
    const t = this.peek();
    if (!t) throw new Error('表达式不完整');
    if (t.type === 'NUMBER' || t.type === 'STRING' || t.type === 'BOOL') {
      this.next();
      return { type: 'LIT', value: t.value };
    }
    if (t.type === 'FIELD') {
      this.next();
      return { type: 'FIELD', name: t.value };
    }
    if (t.type === 'IDENT') {
      const name = this.next().value;
      if (this.peek() && this.peek().type === 'OP' && this.peek().value === '(') {
        this.next();
        const args = [];
        if (!(this.peek() && this.peek().type === 'OP' && this.peek().value === ')')) {
          args.push(this.parse());
          while (this.peek() && this.peek().type === 'OP' && this.peek().value === ',') {
            this.next();
            args.push(this.parse());
          }
        }
        this.expect(')');
        return { type: 'CALL', name, args };
      }
      return { type: 'FIELD', name };
    }
    if (t.type === 'OP' && t.value === '(') {
      this.next();
      const expr = this.parse();
      this.expect(')');
      return expr;
    }
    throw new Error('意外的标记: ' + JSON.stringify(t));
  };

  function toNumber(v) {
    if (typeof v === 'number') return v;
    if (typeof v === 'boolean') return v ? 1 : 0;
    const n = Number(String(v).trim());
    return Number.isFinite(n) ? n : NaN;
  }

  function truthy(v) {
    if (typeof v === 'boolean') return v;
    if (v == null || v === '') return false;
    if (typeof v === 'number') return v !== 0;
    const s = String(v).toLowerCase();
    if (s === 'false' || s === '0' || s === 'no' || s === '否') return false;
    return true;
  }

  function evalNode(node, row) {
    switch (node.type) {
      case 'LIT': return node.value;
      case 'FIELD': return getField(row, node.name);
      case 'NOT': return !truthy(evalNode(node.expr, row));
      case 'NEG': return -toNumber(evalNode(node.expr, row));
      case 'OR': return truthy(evalNode(node.left, row)) || truthy(evalNode(node.right, row));
      case 'AND': return truthy(evalNode(node.left, row)) && truthy(evalNode(node.right, row));
      case 'CMP': {
        const a = evalNode(node.left, row);
        const b = evalNode(node.right, row);
        const na = toNumber(a);
        const nb = toNumber(b);
        const useNum = Number.isFinite(na) && Number.isFinite(nb) && String(a).trim() !== '' && String(b).trim() !== '';
        const av = useNum ? na : String(a);
        const bv = useNum ? nb : String(b);
        switch (node.op) {
          case '=': return av == bv; // eslint-disable-line eqeqeq
          case '!=': return av != bv; // eslint-disable-line eqeqeq
          case '>': return av > bv;
          case '>=': return av >= bv;
          case '<': return av < bv;
          case '<=': return av <= bv;
          default: return false;
        }
      }
      case 'CONCAT_OP':
        return String(evalNode(node.left, row) ?? '') + String(evalNode(node.right, row) ?? '');
      case 'ARITH': {
        const leftVal = evalNode(node.left, row);
        const rightVal = evalNode(node.right, row);
        const a = toNumber(leftVal);
        const b = toNumber(rightVal);
        if (node.op === '+') {
          if (!Number.isFinite(a) || !Number.isFinite(b)) {
            return String(leftVal ?? '') + String(rightVal ?? '');
          }
          return a + b;
        }
        if (node.op === '-') {
          if (!Number.isFinite(a) || !Number.isFinite(b)) {
            return String(leftVal ?? '') + '-' + String(rightVal ?? '');
          }
          return a - b;
        }
        if (node.op === '*') return a * b;
        if (node.op === '/') {
          if (Number.isFinite(a) && Number.isFinite(b) && String(leftVal).trim() !== '' && String(rightVal).trim() !== '') {
            return b === 0 ? '' : a / b;
          }
          return String(leftVal ?? '') + '/' + String(rightVal ?? '');
        }
        if (node.op === '%') return a % b;
        return '';
      }
      case 'CALL': {
        const args = node.args.map((a) => evalNode(a, row));
        if (node.name === 'IF') {
          return truthy(args[0]) ? (args[1] ?? '') : (args[2] ?? '');
        }
        if (node.name === 'CONCAT') {
          return args.map((x) => (x == null ? '' : String(x))).join('');
        }
        if (node.name === 'JOIN') {
          const sep = args[0] == null ? '' : String(args[0]);
          return args.slice(1).map((x) => (x == null ? '' : String(x))).filter((x) => x !== '').join(sep);
        }
        throw new Error('未知函数: ' + node.name);
      }
      default:
        return '';
    }
  }

  /** Expand simple {{col}} templates without full formula. */
  function interpolate(template, row) {
    return String(template ?? '').replace(/\{\{\s*([^}]+?)\s*\}\}/g, (_, name) => getField(row, name));
  }

  /** True only when expression clearly uses formula syntax (not plain labels like "Customer P/N"). */
  function isFormulaExpression(src) {
    const s = String(src || '');
    if (/\b(IF|CONCAT|JOIN)\s*\(/i.test(s)) return true;

    const hasFields = /\{\{/.test(s);
    // Replace fields/strings with tokens so P/N style labels are not treated as division
    const code = s
      .replace(/\{\{[^}]*\}\}/g, ' ¶ ')
      .replace(/"(?:\\.|[^"\\])*"|'(?:\\.|[^'\\])*'/g, ' § ');

    if (/\b(AND|OR|NOT)\b/i.test(code)) return true;
    // Concat operators with fields or strings
    if (/[&+]/.test(code) && (hasFields || /§/.test(code))) return true;
    // Comparisons
    if (/<=|>=|!=|<>|==|[<>]/.test(code)) return true;
    // Arithmetic with field placeholders
    if (hasFields && /[+\-*/%]/.test(code)) return true;
    // Pure numeric expression: 10/2, 3+4
    if (/^\s*\d+(\.\d+)?\s*[+\-*/%]\s*\d+(\.\d+)?\s*$/.test(s)) return true;
    // Spaced operators (a + b)
    if (/\s[+\-*/%]\s/.test(code)) return true;
    return false;
  }

  function evaluate(expression, row) {
    const src = String(expression ?? '').trim();
    if (!src) return '';

    // Plain labels / text (e.g. "Customer P/N", "Order No.") — never parse as formula
    if (!/\{\{/.test(src) && !isFormulaExpression(src)) {
      return src;
    }

    // Only field placeholders + literal text, no operators
    if (/\{\{/.test(src) && !isFormulaExpression(src)) {
      return interpolate(src, row);
    }

    try {
      const tokens = tokenize(src);
      if (!tokens.length) return '';
      const ast = new Parser(tokens).parse();
      const result = evalNode(ast, row || {});
      if (typeof result === 'boolean') return result ? 'TRUE' : 'FALSE';
      if (result == null) return '';
      return String(result);
    } catch (err) {
      return '#ERR: ' + (err.message || err);
    }
  }

  function resolveBinding(binding, row, fallbackStatic) {
    const b = binding || { mode: 'static', staticValue: fallbackStatic || '' };
    const mode = b.mode || 'static';
    if (mode === 'static') return b.staticValue != null ? String(b.staticValue) : '';
    if (mode === 'column') {
      const val = getField(row, b.column);
      return `${b.prefix || ''}${val}${b.suffix || ''}`;
    }
    if (mode === 'join') {
      const cols = Array.isArray(b.joinColumns) ? b.joinColumns : [];
      const sep = b.joinSep != null ? String(b.joinSep) : '';
      let parts = cols.map((c) => getField(row, c));
      if (b.joinSkipEmpty !== false) parts = parts.filter((p) => p !== '');
      return parts.join(sep);
    }
    if (mode === 'formula') return evaluate(b.formula || '', row);
    return '';
  }

  global.LabelFormula = {
    evaluate,
    interpolate,
    resolveBinding,
    getField,
    isFormulaExpression,
  };
})(typeof window !== 'undefined' ? window : globalThis);
