(function (global) {
const FORMULA_CATALOG = [
  { value: '', label: '无（原值）', hint: '不做变换' },
  { value: 'FORMAT(,"yyyy-mm-dd")', label: '日期格式 FORMAT(,"yyyy-mm-dd")', hint: '不规范日期→标准日期，同 Excel TEXT' },
  { value: 'FORMAT(,"yyyy/mm/dd")', label: '日期 FORMAT(,"yyyy/mm/dd")', hint: '输出 2024/01/05' },
  { value: 'FORMAT(,"yyyy年mm月dd日")', label: '中文日期 FORMAT(,"yyyy年mm月dd日")', hint: '输出 2024年01月05日' },
  { value: 'FORMAT(,"yyyymmdd")', label: '紧凑日期 FORMAT(,"yyyymmdd")', hint: '输出 20240105' },
  { value: 'FORMAT(,"0000")', label: '数字补零 FORMAT(,"0000")', hint: '同 Excel 数字格式' },
  { value: 'FORMAT(,"0.00")', label: '小数 FORMAT(,"0.00")', hint: '保留两位小数' },
  { value: 'TEXT(,"yyyy-mm-dd")', label: 'TEXT(,"yyyy-mm-dd")', hint: 'FORMAT 同义，贴近 Excel' },
  { value: 'IF(LEFT(TRIM(),2)="SO","订单","其他")', label: '嵌套 IF(LEFT(TRIM(),2)="SO",…)', hint: '公式可互相嵌套' },
  { value: 'IF(VALUE()>10,"合格","不合格")', label: 'IF(VALUE()>10,"合格","不合格")', hint: '数值条件' },
  { value: 'IF(FORMAT(,"yyyy")="2024","今年","往年")', label: 'IF+FORMAT 嵌套', hint: '先格式化再判断' },
  { value: 'UPPER(LEFT(TRIM(),4))', label: 'UPPER(LEFT(TRIM(),4))', hint: '嵌套文本处理' },
  { value: 'TRIM()', label: 'TRIM()', hint: '去空格' },
  { value: 'UPPER()', label: 'UPPER()', hint: '转大写' },
  { value: 'LOWER()', label: 'LOWER()', hint: '转小写' },
  { value: 'LEFT(,4)', label: 'LEFT(,4)', hint: '左取 N 位；首参空=当前值' },
  { value: 'RIGHT(,3)', label: 'RIGHT(,3)', hint: '右取 N 位' },
  { value: 'MID(,2,3)', label: 'MID(,2,3)', hint: '从第 2 位起取 3 位' },
  { value: 'LEN()', label: 'LEN()', hint: '字符长度' },
  { value: 'REPLACE(,旧,新)', label: 'REPLACE(,旧,新)', hint: '替换全部' },
  { value: 'IFEMPTY(,"无")', label: 'IFEMPTY(,"无")', hint: '空则默认值' },
  { value: 'IF(FIELD("qty")>5,"多","少")', label: 'IF(FIELD("qty")>5,…)', hint: '用其他列判断' },
  { value: 'trim|upper|left:4', label: '旧式链式 trim|upper|left:4', hint: '仍兼容' },
  { value: 'format:yyyy-mm-dd', label: '旧式 format:yyyy-mm-dd', hint: '仍兼容' }
];

function getField(data, field) {
  if (!field || !data) return '';
  if (Object.prototype.hasOwnProperty.call(data, field)) {
    return data[field] == null ? '' : String(data[field]);
  }
  const key = Object.keys(data).find((k) => k.toLowerCase() === String(field).toLowerCase());
  return key ? String(data[key] ?? '') : '';
}

function toNumber(val) {
  if (val == null || val === '') return null;
  if (typeof val === 'number' && Number.isFinite(val)) return val;
  const n = Number(String(val).replace(/,/g, '').trim());
  return Number.isFinite(n) ? n : null;
}

function splitArgs(inner) {
  const args = [];
  let buf = '';
  let depth = 0;
  let quote = null;
  for (let i = 0; i < inner.length; i++) {
    const ch = inner[i];
    if (quote) {
      buf += ch;
      if (ch === quote && inner[i - 1] !== '\\') quote = null;
      continue;
    }
    if (ch === '"' || ch === "'") {
      quote = ch;
      buf += ch;
      continue;
    }
    if (ch === '(') depth += 1;
    if (ch === ')') depth = Math.max(0, depth - 1);
    if (ch === ',' && depth === 0) {
      args.push(buf.trim());
      buf = '';
      continue;
    }
    buf += ch;
  }
  if (buf.length || args.length) args.push(buf.trim());
  return args;
}

function splitFormulaChain(formula) {
  const s = String(formula || '');
  const parts = [];
  let buf = '';
  let depth = 0;
  let quote = null;
  for (let i = 0; i < s.length; i++) {
    const ch = s[i];
    if (quote) {
      buf += ch;
      if (ch === quote && s[i - 1] !== '\\') quote = null;
      continue;
    }
    if (ch === '"' || ch === "'") {
      quote = ch;
      buf += ch;
      continue;
    }
    if (ch === '(') depth += 1;
    if (ch === ')') depth = Math.max(0, depth - 1);
    if (ch === '|' && depth === 0) {
      if (buf.trim()) parts.push(buf.trim());
      buf = '';
      continue;
    }
    buf += ch;
  }
  if (buf.trim()) parts.push(buf.trim());
  return parts.length ? parts : [s.trim()];
}

function unquote(s) {
  const t = String(s ?? '').trim();
  if ((t.startsWith('"') && t.endsWith('"')) || (t.startsWith("'") && t.endsWith("'"))) {
    return t.slice(1, -1);
  }
  return t;
}

function matchFuncCall(s) {
  const t = String(s || '').trim();
  const m = t.match(/^([A-Za-z_][\w]*)\(/);
  if (!m) return null;
  let depth = 0;
  let quote = null;
  for (let i = m[0].length - 1; i < t.length; i++) {
    const ch = t[i];
    if (quote) {
      if (ch === quote && t[i - 1] !== '\\') quote = null;
      continue;
    }
    if (ch === '"' || ch === "'") {
      quote = ch;
      continue;
    }
    if (ch === '(') depth += 1;
    else if (ch === ')') {
      depth -= 1;
      if (depth === 0) {
        if (i === t.length - 1) {
          return { name: m[1], inner: t.slice(m[0].length, i) };
        }
        return null;
      }
    }
  }
  return null;
}

function findTopLevelOp(s) {
  const ops = ['<>', '!=', '>=', '<=', '=', '>', '<', '&'];
  let depth = 0;
  let quote = null;
  let found = null;
  for (let i = 0; i < s.length; i++) {
    const ch = s[i];
    if (quote) {
      if (ch === quote && s[i - 1] !== '\\') quote = null;
      continue;
    }
    if (ch === '"' || ch === "'") {
      quote = ch;
      continue;
    }
    if (ch === '(') {
      depth += 1;
      continue;
    }
    if (ch === ')') {
      depth = Math.max(0, depth - 1);
      continue;
    }
    if (depth !== 0) continue;
    for (const op of ops) {
      if (s.slice(i, i + op.length) === op) {
        // skip lone = inside >= etc already handled by order
        found = { op, index: i, len: op.length };
        // keep scanning to get leftmost for & concat chains? leftmost is fine for comparisons
        return found;
      }
    }
  }
  return found;
}

function looksLikeExcelExpr(formula) {
  const f = String(formula || '').trim();
  if (!f) return false;
  if (matchFuncCall(f)) return true;
  if (findTopLevelOp(f) && /[A-Za-z_(]/.test(f)) return true;
  if (/^(IF|TEXT|FORMAT|LEFT|RIGHT|MID|TRIM|UPPER|LOWER|LEN|FIELD|VALUE)\b/i.test(f)) return true;
  return false;
}

/** Parse loose dates: Excel serial, ISO, slash/dash, YYYYMMDD, 中文年月日 */
function parseDateLoose(val) {
  if (val instanceof Date && !Number.isNaN(val.getTime())) return val;
  if (val == null || val === '') return null;
  const s = String(val).trim();
  if (!s) return null;

  const n = toNumber(s);
  // Excel serial date (roughly 1900–2100)
  if (n != null && n > 20000 && n < 80000 && !/[\/\-年月日]/.test(s) && !/^\d{8}$/.test(s)) {
    const epoch = Date.UTC(1899, 11, 30);
    const d = new Date(epoch + Math.round(n) * 86400000);
    if (!Number.isNaN(d.getTime())) return d;
  }

  let m = s.match(/^(\d{4})[\/\-.](\d{1,2})[\/\-.](\d{1,2})(?:[ T](\d{1,2}):(\d{1,2})(?::(\d{1,2}))?)?/);
  if (m) {
    return new Date(+m[1], +m[2] - 1, +m[3], +(m[4] || 0), +(m[5] || 0), +(m[6] || 0));
  }
  m = s.match(/^(\d{1,2})[\/\-.](\d{1,2})[\/\-.](\d{4})(?:[ T](\d{1,2}):(\d{1,2})(?::(\d{1,2}))?)?/);
  if (m) {
    return new Date(+m[3], +m[1] - 1, +m[2], +(m[4] || 0), +(m[5] || 0), +(m[6] || 0));
  }
  m = s.match(/^(\d{4})年(\d{1,2})月(\d{1,2})日?(?:\s*(\d{1,2})[点时:](\d{1,2})分?(?::?(\d{1,2})秒?)?)?/);
  if (m) {
    return new Date(+m[1], +m[2] - 1, +m[3], +(m[4] || 0), +(m[5] || 0), +(m[6] || 0));
  }
  m = s.match(/^(\d{4})(\d{2})(\d{2})$/);
  if (m) return new Date(+m[1], +m[2] - 1, +m[3]);

  const parsed = Date.parse(s);
  if (!Number.isNaN(parsed)) return new Date(parsed);
  return null;
}

function pad2(n) {
  return String(n).padStart(2, '0');
}

function formatDateExcel(d, pattern) {
  const map = {
    yyyy: String(d.getFullYear()),
    YYYY: String(d.getFullYear()),
    yy: String(d.getFullYear()).slice(-2),
    YY: String(d.getFullYear()).slice(-2),
    mm: pad2(d.getMonth() + 1),
    MM: pad2(d.getMonth() + 1),
    m: String(d.getMonth() + 1),
    dd: pad2(d.getDate()),
    DD: pad2(d.getDate()),
    d: String(d.getDate()),
    hh: pad2(d.getHours()),
    HH: pad2(d.getHours()),
    h: String(d.getHours()),
    mi: pad2(d.getMinutes()),
    ss: pad2(d.getSeconds()),
    SS: pad2(d.getSeconds())
  };
  // Protect tokens then replace longest first
  let out = String(pattern);
  const keys = Object.keys(map).sort((a, b) => b.length - a.length);
  const slots = [];
  keys.forEach((k, idx) => {
    const token = `__D${idx}__`;
    if (out.includes(k)) {
      out = out.split(k).join(token);
      slots.push([token, map[k]]);
    }
  });
  slots.forEach(([token, val]) => {
    out = out.split(token).join(val);
  });
  return out;
}

function isDatePattern(pattern) {
  const p = String(pattern || '');
  if (!p) return false;
  if (/^[#0,\.Ee%]+$/.test(p)) return false;
  return /y|Y|年|月|日|m{1,2}|d{1,2}|h{1,2}|mi|ss|SS/.test(p);
}

function formatNumberExcel(n, pattern) {
  const p = String(pattern || '');
  if (/^0+$/.test(p)) {
    const abs = String(Math.abs(Math.trunc(n)));
    const body = abs.padStart(p.length, '0');
    return n < 0 ? `-${body}` : body;
  }
  if (/^0+\.0+$/.test(p) || /^0\.0+$/.test(p)) {
    const decimals = (p.split('.')[1] || '').length;
    return n.toFixed(decimals);
  }
  if (p === '0.00' || p === '#,##0.00' || p === '#.##') {
    const fixed = n.toFixed(2);
    if (p.includes(',')) {
      const [a, b] = fixed.split('.');
      return `${Number(a).toLocaleString('en-US')}.${b}`;
    }
    return fixed;
  }
  if (p.endsWith('%')) {
    const decimals = (p.replace('%', '').split('.')[1] || '').length;
    return `${(n * 100).toFixed(decimals)}%`;
  }
  // generic 0.00 style from count of decimals
  const dm = p.match(/\.([0#]+)/);
  if (dm) return n.toFixed(dm[1].length);
  if (/^0+$/.test(p.replace(/[#,]/g, ''))) {
    return String(Math.round(n)).padStart(p.replace(/[#,]/g, '').length, '0');
  }
  return String(n);
}

/** Excel-like FORMAT / TEXT */
function formatValue(val, pattern) {
  const p = unquote(pattern);
  if (!p) return val == null ? '' : String(val);

  if (isDatePattern(p)) {
    const d = parseDateLoose(val);
    if (d && !Number.isNaN(d.getTime())) return formatDateExcel(d, p);
    // fall through if not a date
  }

  const n = toNumber(val);
  if (n != null) return formatNumberExcel(n, p);
  return val == null ? '' : String(val);
}

function compareValues(left, op, right) {
  const o = String(op || '').toLowerCase();
  const ls = left == null ? '' : String(left);
  const rs = right == null ? '' : String(right);
  if (o === 'empty') return ls.trim() === '';
  if (o === 'notempty') return ls.trim() !== '';
  if (o === 'contains') return ls.includes(rs);
  if (o === 'startswith') return ls.startsWith(rs);
  if (o === 'endswith') return ls.endsWith(rs);
  const ln = toNumber(ls);
  const rn = toNumber(rs);
  const bothNum = ln != null && rn != null;
  switch (o) {
    case '=':
    case '==':
    case 'eq':
      return bothNum ? ln === rn : ls === rs;
    case '<>':
    case '!=':
    case 'ne':
      return bothNum ? ln !== rn : ls !== rs;
    case '>':
    case 'gt':
      return bothNum ? ln > rn : ls > rs;
    case '>=':
    case 'gte':
      return bothNum ? ln >= rn : ls >= rs;
    case '<':
    case 'lt':
      return bothNum ? ln < rn : ls < rs;
    case '<=':
    case 'lte':
      return bothNum ? ln <= rn : ls <= rs;
    default:
      return false;
  }
}

function callFunc(name, args, ctx) {
  const n = String(name || '').toUpperCase();
  const cur = () => (ctx.value == null ? '' : String(ctx.value));
  const a0 = () => (args.length && args[0] !== '' && args[0] != null ? String(args[0]) : cur());

  if (n === 'VALUE' || n === 'VAL') return cur();
  if (n === 'FIELD') return getField(ctx.data, unquote(args[0] || ''));
  if (n === 'TRIM') return a0().trim();
  if (n === 'UPPER' || n === 'UCASE') return a0().toUpperCase();
  if (n === 'LOWER' || n === 'LCASE') return a0().toLowerCase();
  if (n === 'LEN' || n === 'LENGTH') return String(a0().length);
  if (n === 'REVERSE') return [...a0()].reverse().join('');
  if (n === 'KEEPNUM') return a0().replace(/[^\d.-]/g, '');
  if (n === 'KEEPALPHA') return a0().replace(/[^a-zA-Z]/g, '');

  if (n === 'LEFT') {
    const src = a0();
    const len = toNumber(args[1]) ?? 0;
    return src.slice(0, Math.max(0, len));
  }
  if (n === 'RIGHT') {
    const src = a0();
    const len = toNumber(args[1]) ?? 0;
    return src.slice(-Math.max(0, len));
  }
  if (n === 'MID' || n === 'SUBSTR') {
    const src = a0();
    const start = Math.max(1, toNumber(args[1]) || 1);
    const len = toNumber(args[2]) ?? 0;
    return src.substr(start - 1, Math.max(0, len));
  }
  if (n === 'REPLACE' || n === 'SUBSTITUTE') {
    const src = a0();
    return src.split(String(args[1] ?? '')).join(String(args[2] ?? ''));
  }
  if (n === 'PREFIX') return `${args[1] ?? ''}${a0()}`;
  if (n === 'SUFFIX') return `${a0()}${args[1] ?? ''}`;
  if (n === 'IFEMPTY' || n === 'DEFAULT' || n === 'IFBLANK') {
    const src = a0();
    return src.trim() === '' ? String(args[1] ?? '') : src;
  }
  if (n === 'CONCAT' || n === 'CONCATENATE') {
    return args.map((x) => (x == null ? '' : String(x))).join('');
  }
  if (n === 'SPLIT') {
    const parts = a0().split(String(args[1] ?? ''));
    const idx = toNumber(args[2]) ?? 0;
    return parts[idx] != null ? parts[idx] : '';
  }
  if (n === 'ABS') {
    const num = toNumber(a0());
    return num == null ? a0() : String(Math.abs(num));
  }
  if (n === 'FLOOR') {
    const num = toNumber(a0());
    return num == null ? a0() : String(Math.floor(num));
  }
  if (n === 'CEIL' || n === 'CEILING') {
    const num = toNumber(a0());
    return num == null ? a0() : String(Math.ceil(num));
  }
  if (n === 'ROUND') {
    const num = toNumber(a0());
    const d = toNumber(args[1]) ?? 0;
    if (num == null) return a0();
    const p = 10 ** d;
    return String(Math.round(num * p) / p);
  }
  if (n === 'FIXED') {
    const num = toNumber(a0());
    const d = toNumber(args[1]) ?? 2;
    return num == null ? a0() : num.toFixed(d);
  }
  if (n === 'FORMAT' || n === 'TEXT') {
    // FORMAT(value, pattern) or FORMAT(, pattern) or FORMAT(pattern) legacy
    if (args.length >= 2) return formatValue(args[0] === '' || args[0] == null ? cur() : args[0], args[1]);
    if (args.length === 1) return formatValue(cur(), args[0]);
    return cur();
  }
  if (n === 'DATEVALUE' || n === 'TODATE') {
    const d = parseDateLoose(a0());
    return d ? formatDateExcel(d, 'yyyy-mm-dd') : a0();
  }
  if (n === 'YEAR') {
    const d = parseDateLoose(a0());
    return d ? String(d.getFullYear()) : '';
  }
  if (n === 'MONTH') {
    const d = parseDateLoose(a0());
    return d ? String(d.getMonth() + 1) : '';
  }
  if (n === 'DAY') {
    const d = parseDateLoose(a0());
    return d ? String(d.getDate()) : '';
  }

  if (n === 'IF') {
    // IF(cond, then, else) — cond may be comparison expression already evaluated to boolean-ish
    // When called via evalExpr, args are already evaluated... but cond like LEFT()="SO" is one arg before split
    // Actually IF's first arg is evaluated as expression which handles comparison
    const condVal = args[0];
    const truthy = !(condVal === false || condVal === 0 || condVal === '0' || condVal === '' || condVal == null || condVal === 'false' || condVal === 'FALSE');
    return truthy ? String(args[1] ?? '') : String(args[2] ?? '');
  }

  if (n === 'IFFIELD') {
    // IFFIELD(field, opRhs, then, else) e.g. evaluated args already
    // Prefer Excel: IF(FIELD("qty")>5,"多","少") instead
    const left = getField(ctx.data, unquote(args[0] || ''));
    const cond = String(args[1] || '');
    const cm = cond.match(/^(>=|<=|<>|!=|=|>|<|contains|empty|notempty)\s*(.*)$/i);
    const ok = cm ? compareValues(left, cm[1], cm[2]) : compareValues(left, '>', cond);
    return ok ? String(args[2] ?? '') : String(args[3] ?? '');
  }

  // Unknown function: return as-is / treat as legacy
  return applyLegacyOne(ctx.value, `${name}(${args.join(',')})`, ctx.data);
}

function evalExpr(input, ctx) {
  const s = String(input ?? '').trim();
  if (s === '') return ctx.value == null ? '' : String(ctx.value);

  // Quoted literal
  if ((s.startsWith('"') && s.endsWith('"')) || (s.startsWith("'") && s.endsWith("'"))) {
    return unquote(s);
  }

  // Current value aliases
  if (s === '.' || s === 'value' || s === '$') return ctx.value == null ? '' : String(ctx.value);

  // field:col
  const fm = s.match(/^field:(.+)$/i);
  if (fm) return getField(ctx.data, fm[1].trim());

  // Top-level comparison / concat (before wrapping whole as func)
  const opFound = findTopLevelOp(s);
  if (opFound) {
    const left = evalExpr(s.slice(0, opFound.index).trim(), ctx);
    const right = evalExpr(s.slice(opFound.index + opFound.len).trim(), ctx);
    if (opFound.op === '&') return `${left}${right}`;
    return compareValues(left, opFound.op, right);
  }

  // Function call (possibly nested inside already handled by recursion on args)
  const call = matchFuncCall(s);
  if (call) {
    // Special-case IF: first argument should be evaluated as expression (may be comparison)
    if (/^if$/i.test(call.name)) {
      const parts = splitArgs(call.inner);
      const cond = evalExpr(parts[0] || '', ctx);
      const thenV = evalExpr(parts[1] != null ? parts[1] : '', ctx);
      const elseV = evalExpr(parts[2] != null ? parts[2] : '', ctx);
      return callFunc('IF', [cond, thenV, elseV], ctx);
    }
    const argVals = splitArgs(call.inner).map((a) => {
      if (a === '') return ''; // explicit empty = current value placeholder for FORMAT(,pat)
      return evalExpr(a, ctx);
    });
    // For unary text funcs with empty first arg, callFunc uses current value
    return callFunc(call.name, argVals, ctx);
  }

  // Pure number
  if (/^-?\d+(\.\d+)?$/.test(s)) return s;

  // Boolean literals
  if (/^(true|false)$/i.test(s)) return /^true$/i.test(s);

  // Legacy colon / bare formula against current value
  return applyLegacyOne(ctx.value, s, ctx.data);
}

function applyLegacyOne(raw, formula, data) {
  let val = raw == null ? '' : String(raw);
  if (!formula) return val;
  const f = String(formula).trim();
  if (!f) return val;

  // Legacy if(>10,a,b) without nested left side
  let m = f.match(/^if\((.*)\)$/i);
  if (m && !matchFuncCall(f)?.name?.match(/^if$/i)) {
    /* handled below via colon if */
  }
  // Simple if(cond,then,else) where cond is >10 style
  m = f.match(/^if\((.*)\)$/i);
  if (m) {
    const args = splitArgs(m[1]);
    const condRaw = args[0] || '';
    const cm = condRaw.match(/^(>=|<=|<>|!=|=|>|<|contains|startswith|endswith|empty|notempty)\s*(.*)$/i);
    if (cm) {
      const ok = compareValues(val, cm[1], cm[2]);
      const thenTok = args[1] != null ? args[1] : '';
      const elseTok = args[2] != null ? args[2] : '';
      if (/^field:/i.test(thenTok) || thenTok === '.' || thenTok === 'value') {
        return ok ? resolveLegacyToken(thenTok, data, val) : resolveLegacyToken(elseTok, data, val);
      }
      // If then/else look like expressions, evaluate
      const ctx = { value: val, data: data || {} };
      return ok ? String(evalExpr(thenTok, ctx)) : String(evalExpr(elseTok, ctx));
    }
  }

  m = f.match(/^iffield\((.*)\)$/i);
  if (m) {
    const args = splitArgs(m[1]);
    const left = getField(data, unquote(args[0] || ''));
    const condRaw = args[1] || '';
    const cm = condRaw.match(/^(>=|<=|<>|!=|=|>|<|contains|startswith|endswith|empty|notempty)\s*(.*)$/i);
    const ok = cm ? compareValues(left, cm[1], cm[2]) : false;
    const ctx = { value: val, data: data || {} };
    return ok ? String(evalExpr(args[2] != null ? args[2] : '', ctx)) : String(evalExpr(args[3] != null ? args[3] : '', ctx));
  }

  // format:pattern or format(pattern) — date or number
  m = f.match(/^format\((.+)\)$/i) || f.match(/^format:(.+)$/i) || f.match(/^text:(.+)$/i);
  if (m) return formatValue(val, m[1]);

  if (f === 'trim') return val.trim();
  if (f === 'upper') return val.toUpperCase();
  if (f === 'lower') return val.toLowerCase();
  if (f === 'reverse') return [...val].reverse().join('');
  if (f === 'len' || f === 'length') return String(val.length);
  if (f === 'keepnum') return val.replace(/[^\d.-]/g, '');
  if (f === 'keepalpha') return val.replace(/[^a-zA-Z]/g, '');
  if (f === 'floor') {
    const num = toNumber(val);
    return num == null ? val : String(Math.floor(num));
  }
  if (f === 'ceil') {
    const num = toNumber(val);
    return num == null ? val : String(Math.ceil(num));
  }
  if (f === 'abs') {
    const num = toNumber(val);
    return num == null ? val : String(Math.abs(num));
  }

  m = f.match(/^left:(\d+)$/i);
  if (m) return val.slice(0, Number(m[1]));
  m = f.match(/^right:(\d+)$/i);
  if (m) return val.slice(-Number(m[1]));
  m = f.match(/^mid:(\d+):(\d+)$/i);
  if (m) return val.substr(Math.max(0, Number(m[1]) - 1), Number(m[2]));
  m = f.match(/^padleft:(\d+):(.*)$/i);
  if (m) return val.padStart(Number(m[1]), m[2] === '' ? '0' : m[2]);
  m = f.match(/^padright:(\d+):(.*)$/i);
  if (m) return val.padEnd(Number(m[1]), m[2] === '' ? '0' : m[2]);
  m = f.match(/^replace:(.*?):(.*)$/i);
  if (m) return val.split(m[1]).join(m[2]);
  m = f.match(/^remove:(.+)$/i);
  if (m) return val.split(m[1]).join('');
  m = f.match(/^prefix:(.*)$/i);
  if (m) return `${m[1]}${val}`;
  m = f.match(/^suffix:(.*)$/i);
  if (m) return `${val}${m[1]}`;
  m = f.match(/^(?:default|ifempty):(.*)$/i);
  if (m) return val.trim() === '' ? m[1] : val;
  m = f.match(/^split:(.*?):(\d+)$/i);
  if (m) {
    const parts = val.split(m[1]);
    const idx = Number(m[2]);
    return parts[idx] != null ? parts[idx] : '';
  }
  m = f.match(/^fixed:(\d+)$/i);
  if (m) {
    const num = toNumber(val);
    return num == null ? val : num.toFixed(Number(m[1]));
  }
  m = f.match(/^round:(\d+)$/i);
  if (m) {
    const num = toNumber(val);
    if (num == null) return val;
    const d = Number(m[1]);
    const p = 10 ** d;
    return String(Math.round(num * p) / p);
  }
  m = f.match(/^percent:(\d+)$/i);
  if (m) {
    const num = toNumber(val);
    return num == null ? val : `${(num * 100).toFixed(Number(m[1]))}%`;
  }
  m = f.match(/^num([+\-*/])(-?\d+(?:\.\d+)?)$/i);
  if (m) {
    const num = toNumber(val);
    const x = Number(m[2]);
    if (num == null || !Number.isFinite(x)) return val;
    if (m[1] === '+') return String(num + x);
    if (m[1] === '-') return String(num - x);
    if (m[1] === '*') return String(num * x);
    if (m[1] === '/') return String(x === 0 ? num : num / x);
  }

  m = f.match(/^if:(>=|<=|<>|!=|=|>|<|contains|startswith|endswith|empty|notempty)(?::(.*))?$/i);
  if (m) {
    const op = m[1];
    const rest = m[2] || '';
    const parts = rest.split(':');
    let ok = false;
    let thenTok = '';
    let elseTok = '';
    if (/^(empty|notempty)$/i.test(op)) {
      ok = compareValues(val, op, '');
      thenTok = parts[0] != null ? parts[0] : '';
      elseTok = parts.slice(1).join(':');
    } else {
      ok = compareValues(val, op, parts[0] != null ? parts[0] : '');
      thenTok = parts[1] != null ? parts[1] : '';
      elseTok = parts.slice(2).join(':');
    }
    return ok ? resolveLegacyToken(thenTok, data, val) : resolveLegacyToken(elseTok, data, val);
  }

  return val;
}

function resolveLegacyToken(token, data, currentVal) {
  if (token == null) return '';
  const t = String(token).trim();
  if (!t) return '';
  if (t === '.' || t === 'value' || t === '$') return currentVal == null ? '' : String(currentVal);
  const fm = t.match(/^field:(.+)$/i);
  if (fm) return getField(data, fm[1].trim());
  return t;
}

function applyFormula(raw, formula, data) {
  if (!formula) return raw == null ? '' : String(raw);
  const ctx = { value: raw == null ? '' : raw, data: data || {} };
  const f = String(formula).trim();
  if (!f) return String(ctx.value);

  // Prefer Excel-like nested expression when it looks like one
  if (looksLikeExcelExpr(f) && !f.includes('|')) {
    const out = evalExpr(f, ctx);
    if (typeof out === 'boolean') return out ? 'TRUE' : 'FALSE';
    return out == null ? '' : String(out);
  }

  // Pipe chain (each step may itself be nested expr)
  const parts = splitFormulaChain(f);
  let val = ctx.value;
  for (const part of parts) {
    const stepCtx = { value: val, data: ctx.data };
    if (looksLikeExcelExpr(part)) {
      const out = evalExpr(part, stepCtx);
      val = typeof out === 'boolean' ? (out ? 'TRUE' : 'FALSE') : out;
    } else {
      val = applyLegacyOne(val, part, ctx.data);
    }
  }
  return val == null ? '' : String(val);
}

function evalSegments(segments, data) {
  if (!Array.isArray(segments) || !segments.length) return '';
  return segments.map((seg) => {
    if (!seg) return '';
    if (seg.type === 'text') return seg.value == null ? '' : String(seg.value);
    if (seg.type === 'field') {
      const raw = getField(data, seg.field);
      return applyFormula(raw, seg.formula, data);
    }
    return '';
  }).join('');
}

function evalTemplateText(text, data) {
  if (text == null) return '';
  return String(text).replace(/\{([^}|]+)(?:\|([^}]*))?\}/g, (_, field, formula) => {
    return applyFormula(getField(data, field.trim()), formula ? formula.trim() : '', data);
  });
}

function resolveElementContent(el, data, fallbackCode) {
  if (el && Array.isArray(el.segments) && el.segments.length) {
    return evalSegments(el.segments, data);
  }
  if (el && el.type === 'code') {
    return fallbackCode || evalTemplateText(el.text || '', data);
  }
  if (el && el.bind && !(el.text || '').includes('{')) {
    return applyFormula(getField(data, el.bind), el.formula || '', data);
  }
  return evalTemplateText(el?.text || '', data);
}

function resolveCellContent(cell, data, fallbackCode) {
  if (!cell) return '';
  if (Array.isArray(cell.segments) && cell.segments.length) {
    return evalSegments(cell.segments, data);
  }
  if (cell.contentType === 'qr' || cell.contentType === 'barcode') {
    return fallbackCode || evalTemplateText(cell.text || '', data);
  }
  return evalTemplateText(cell.text || '', data);
}

function scanIdField(labelType) {
  return labelType === 'child' ? 'child_code' : 'package_code';
}

function segmentsIncludeScanId(segments, labelType) {
  const idField = scanIdField(labelType);
  return (segments || []).some((s) => s && s.type === 'field' && String(s.field || '').toLowerCase() === idField);
}

function ensureScanIdInSegments(segments, labelType) {
  const list = Array.isArray(segments) ? segments.slice() : [];
  if (segmentsIncludeScanId(list, labelType)) return list;
  list.unshift({ type: 'field', field: scanIdField(labelType), formula: '' });
  return list;
}

function buildPrintCode(tpl, data, uniqueId, labelType) {
  const uid = String(uniqueId || '').trim();
  const idField = scanIdField(labelType || tpl?.label_type);
  const merged = { ...(data || {}), [idField]: uid };
  const mode = tpl?.code_mode || 'unique';
  if (mode === 'unique') return uid;

  let segs = tpl?.code_segments;
  if (typeof segs === 'string') {
    try { segs = JSON.parse(segs); } catch { segs = []; }
  }
  if (!Array.isArray(segs) || !segs.length) {
    const fields = tpl?.code_fields || [];
    if (fields.length) {
      segs = fields.map((f) => ({ type: 'field', field: f, formula: '' }));
    }
  }
  segs = ensureScanIdInSegments(segs || [], labelType || tpl?.label_type);
  const printed = evalSegments(segs, merged).trim();
  if (!printed) return uid;
  if (printed.includes(uid)) return printed;
  return `${printed}|${uid}`;
}



  function segmentsPreview(segments) {
    if (!Array.isArray(segments) || !segments.length) return '';
    return segments.map((s) => {
      if (s.type === 'text') return s.value || '';
      if (s.type === 'field') return '{' + (s.field || '?') + (s.formula ? '|' + s.formula : '') + '}';
      return '';
    }).join('');
  }

  function buildOccupiedMap(rows, cols, cells) {
    const occupied = Array.from({ length: rows }, () => Array(cols).fill(null));
    (cells || []).forEach((cell) => {
      const rs = cell.rowspan || 1;
      const cs = cell.colspan || 1;
      for (let r = cell.r; r < cell.r + rs && r < rows; r++) {
        for (let c = cell.c; c < cell.c + cs && c < cols; c++) {
          occupied[r][c] = (r === cell.r && c === cell.c) ? cell : 'skip';
        }
      }
    });
    return occupied;
  }

  function ensureTableCells(table) {
    const rows = table.rows || 2;
    const cols = table.cols || 2;
    if (!Array.isArray(table.cells)) table.cells = [];
    const occupied = buildOccupiedMap(rows, cols, table.cells);
    for (let r = 0; r < rows; r++) {
      for (let c = 0; c < cols; c++) {
        if (!occupied[r][c]) {
          table.cells.push({
            r, c, rowspan: 1, colspan: 1,
            contentType: 'text',
            segments: [{ type: 'text', value: '' }],
            text: '',
            fontSize: 10,
            align: 'center',
            bold: false
          });
        }
      }
    }
    table.cells = table.cells.filter((cell) => cell.r < rows && cell.c < cols);
    return table;
  }

  function normalizePercents(arr, count) {
    const n = Math.max(1, Number(count) || 1);
    let next = Array.isArray(arr) ? arr.slice(0, n).map(Number) : [];
    while (next.length < n) next.push(0);
    next = next.map((v) => (Number.isFinite(v) && v > 0 ? v : 0));
    const sum = next.reduce((a, b) => a + b, 0);
    if (sum <= 0) return Array.from({ length: n }, () => 100 / n);
    return next.map((v) => (v / sum) * 100);
  }

  function resizePercents(arr, count) {
    const n = Math.max(1, Number(count) || 1);
    const cur = Array.isArray(arr)
      ? arr.map(Number).filter((v) => Number.isFinite(v) && v > 0)
      : [];
    if (!cur.length) return Array.from({ length: n }, () => 100 / n);
    if (cur.length === n) return normalizePercents(cur, n);
    if (cur.length > n) return normalizePercents(cur.slice(0, n), n);
    const avg = cur.reduce((a, b) => a + b, 0) / cur.length;
    return normalizePercents(cur.concat(Array.from({ length: n - cur.length }, () => avg)), n);
  }

  function setPercentAt(arr, index, value, count) {
    const n = Math.max(1, Number(count) || 1);
    const idx = Math.max(0, Math.min(n - 1, Number(index) || 0));
    const next = normalizePercents(arr, n);
    if (n === 1) return [100];
    const v = Math.max(5, Math.min(95, Number(value) || 5));
    const others = next.reduce((s, x, i) => (i === idx ? s : s + x), 0);
    const remain = 100 - v;
    if (others <= 0) {
      return next.map((_, i) => (i === idx ? v : remain / (n - 1)));
    }
    return next.map((x, i) => (i === idx ? v : (x / others) * remain));
  }

  function ensureTableLayout(table) {
    ensureTableCells(table);
    table.rows = Math.max(1, Number(table.rows) || 1);
    table.cols = Math.max(1, Number(table.cols) || 1);
    table.colWidths = resizePercents(table.colWidths, table.cols);
    table.rowHeights = resizePercents(table.rowHeights, table.rows);
    return table;
  }

  global.Expr = {
    FORMULA_CATALOG,
    getField,
    applyFormula,
    evalSegments,
    evalTemplateText,
    resolveElementContent,
    resolveCellContent,
    segmentsPreview,
    scanIdField,
    segmentsIncludeScanId,
    ensureScanIdInSegments,
    buildPrintCode,
    formatValue,
    parseDateLoose,
    evalExpr,
    buildOccupiedMap,
    ensureTableCells,
    normalizePercents,
    resizePercents,
    setPercentAt,
    ensureTableLayout
  };

})(window);
