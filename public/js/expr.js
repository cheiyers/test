(function (global) {
  const FORMULA_CATALOG = [
    { value: '', label: '无（原值）', hint: '不做变换' },
    { value: 'trim', label: '去空格 trim', hint: '去掉首尾空格' },
    { value: 'upper', label: '转大写 upper', hint: 'ABC' },
    { value: 'lower', label: '转小写 lower', hint: 'abc' },
    { value: 'left:4', label: '左取N位 left:4', hint: '取左侧 N 个字符' },
    { value: 'right:3', label: '右取N位 right:3', hint: '取右侧 N 个字符' },
    { value: 'mid:2:3', label: '截取 mid:起始:长度', hint: '起始从 1 开始' },
    { value: 'padleft:6:0', label: '左补齐 padleft:6:0', hint: '左侧补字符到指定长度' },
    { value: 'padright:6:0', label: '右补齐 padright:6:0', hint: '右侧补字符到指定长度' },
    { value: 'replace:旧:新', label: '替换 replace:旧:新', hint: '替换全部匹配' },
    { value: 'remove:mm', label: '删除字符 remove:xx', hint: '删除指定子串' },
    { value: 'prefix:NO.', label: '加前缀 prefix:xx', hint: '在前面加固定文字' },
    { value: 'suffix:PCS', label: '加后缀 suffix:xx', hint: '在后面加固定文字' },
    { value: 'default:无', label: '空值默认 default:xx', hint: '为空时用默认值' },
    { value: 'ifempty:无', label: '空则替换 ifempty:xx', hint: '同 default' },
    { value: 'keepnum', label: '仅保留数字 keepnum', hint: '去掉非数字' },
    { value: 'keepalpha', label: '仅保留字母 keepalpha', hint: '去掉非字母' },
    { value: 'reverse', label: '反转 reverse', hint: '字符倒序' },
    { value: 'len', label: '长度 len', hint: '返回字符数' },
    { value: 'split:-:0', label: '分割取值 split:分隔:序号', hint: '序号从 0 开始' },
    { value: 'num+1', label: '数字运算 num+1', hint: '支持 + - * /' },
    { value: 'fixed:2', label: '小数位 fixed:2', hint: '数字保留小数位' },
    { value: 'round:0', label: '四舍五入 round:0', hint: '按位数四舍五入' },
    { value: 'floor', label: '向下取整 floor', hint: '数字向下取整' },
    { value: 'ceil', label: '向上取整 ceil', hint: '数字向上取整' },
    { value: 'abs', label: '绝对值 abs', hint: '数字绝对值' },
    { value: 'format:0000', label: '格式化 format:0000', hint: '数字左侧补 0 到指定位数' },
    { value: 'percent:1', label: '百分比 percent:1', hint: '×100 并加 %' },
    { value: 'if(>10,合格,不合格)', label: '条件 if(>10,是,否)', hint: '当前值比较后返回' },
    { value: 'if(=OK,是,否)', label: '相等判断 if(=OK,是,否)', hint: '支持 = <> !=' },
    { value: 'if(contains废,NG,OK)', label: '包含判断 if(contains关键字,是,否)', hint: '文本包含' },
    { value: 'if(empty,无,有)', label: '空判断 if(empty,空时,非空时)', hint: '是否为空' },
    { value: 'if(>0,field:part_no,-)', label: '条件取列 if(>0,field:列名,其他)', hint: 'then/else 可用 field:列名' },
    { value: 'iffield(qty,>5,多,少)', label: '他列条件 iffield(列,>5,是,否)', hint: '用其他列做判断' },
    { value: 'trim|upper', label: '链式 trim|upper', hint: '多个公式用 | 连接' }
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
    const n = Number(String(val ?? '').replace(/,/g, '').trim());
    return Number.isFinite(n) ? n : null;
  }

  function splitFormulaChain(formula) {
    const s = String(formula || '');
    const parts = [];
    let buf = '';
    let depth = 0;
    for (let i = 0; i < s.length; i++) {
      const ch = s[i];
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

  function splitArgs(inner) {
    const args = [];
    let buf = '';
    let depth = 0;
    for (let i = 0; i < inner.length; i++) {
      const ch = inner[i];
      if (ch === '(') depth += 1;
      if (ch === ')') depth = Math.max(0, depth - 1);
      if (ch === ',' && depth === 0) {
        args.push(buf.trim());
        buf = '';
        continue;
      }
      buf += ch;
    }
    args.push(buf.trim());
    return args;
  }

  function resolveToken(token, data, currentVal) {
    if (token == null) return '';
    const t = String(token).trim();
    if (!t) return '';
    if (t === '.' || t === 'value' || t === '$') return currentVal == null ? '' : String(currentVal);
    const fm = t.match(/^field:(.+)$/i);
    if (fm) return getField(data, fm[1].trim());
    return t;
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

  function applyOneFormula(raw, formula, data) {
    let val = raw == null ? '' : String(raw);
    if (!formula) return val;
    const f = String(formula).trim();
    if (!f) return val;

    let m = f.match(/^if\((.*)\)$/i);
    if (m) {
      const args = splitArgs(m[1]);
      const condRaw = args[0] || '';
      const thenTok = args[1] != null ? args[1] : '';
      const elseTok = args[2] != null ? args[2] : '';
      let ok = false;
      const cm = condRaw.match(/^(>=|<=|<>|!=|=|>|<|contains|startswith|endswith|empty|notempty)\s*(.*)$/i);
      if (cm) ok = compareValues(val, cm[1], cm[2]);
      return resolveToken(ok ? thenTok : elseTok, data, val);
    }

    m = f.match(/^iffield\((.*)\)$/i);
    if (m) {
      const args = splitArgs(m[1]);
      const fieldName = args[0] || '';
      const condRaw = args[1] || '';
      const thenTok = args[2] != null ? args[2] : '';
      const elseTok = args[3] != null ? args[3] : '';
      const left = getField(data, fieldName);
      let ok = false;
      const cm = condRaw.match(/^(>=|<=|<>|!=|=|>|<|contains|startswith|endswith|empty|notempty)\s*(.*)$/i);
      if (cm) ok = compareValues(left, cm[1], cm[2]);
      return resolveToken(ok ? thenTok : elseTok, data, val);
    }

    m = f.match(/^format\((.+)\)$/i) || f.match(/^format:(.+)$/i);
    if (m) {
      const pattern = String(m[1] || '').trim();
      const n = toNumber(val);
      if (n == null) return val;
      if (/^0+$/.test(pattern)) {
        const abs = String(Math.abs(Math.trunc(n)));
        const body = abs.padStart(pattern.length, '0');
        return n < 0 ? `-${body}` : body;
      }
      if (/^0+\.0+$/.test(pattern)) {
        const [a, b] = pattern.split('.');
        const fixed = Math.abs(n).toFixed(b.length);
        const [ip, fp] = fixed.split('.');
        const body = `${ip.padStart(a.length, '0')}.${fp}`;
        return n < 0 ? `-${body}` : body;
      }
      return val;
    }

    if (f === 'trim') return val.trim();
    if (f === 'upper') return val.toUpperCase();
    if (f === 'lower') return val.toLowerCase();
    if (f === 'reverse') return [...val].reverse().join('');
    if (f === 'len' || f === 'length') return String(val.length);
    if (f === 'keepnum') return val.replace(/[^\d.-]/g, '');
    if (f === 'keepalpha') return val.replace(/[^a-zA-Z]/g, '');
    if (f === 'floor') {
      const n = toNumber(val);
      return n == null ? val : String(Math.floor(n));
    }
    if (f === 'ceil') {
      const n = toNumber(val);
      return n == null ? val : String(Math.ceil(n));
    }
    if (f === 'abs') {
      const n = toNumber(val);
      return n == null ? val : String(Math.abs(n));
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
      const n = toNumber(val);
      return n == null ? val : n.toFixed(Number(m[1]));
    }
    m = f.match(/^round:(\d+)$/i);
    if (m) {
      const n = toNumber(val);
      if (n == null) return val;
      const d = Number(m[1]);
      const p = 10 ** d;
      return String(Math.round(n * p) / p);
    }
    m = f.match(/^percent:(\d+)$/i);
    if (m) {
      const n = toNumber(val);
      return n == null ? val : `${(n * 100).toFixed(Number(m[1]))}%`;
    }
    m = f.match(/^num([+\-*/])(-?\d+(?:\.\d+)?)$/i);
    if (m) {
      const n = toNumber(val);
      const x = Number(m[2]);
      if (n == null || !Number.isFinite(x)) return val;
      if (m[1] === '+') return String(n + x);
      if (m[1] === '-') return String(n - x);
      if (m[1] === '*') return String(n * x);
      if (m[1] === '/') return String(x === 0 ? n : n / x);
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
        const rhs = parts[0] != null ? parts[0] : '';
        thenTok = parts[1] != null ? parts[1] : '';
        elseTok = parts.slice(2).join(':');
        ok = compareValues(val, op, rhs);
      }
      return resolveToken(ok ? thenTok : elseTok, data, val);
    }

    return val;
  }

  function applyFormula(raw, formula, data) {
    if (!formula) return raw == null ? '' : String(raw);
    const parts = splitFormulaChain(formula);
    let val = raw;
    for (const part of parts) val = applyOneFormula(val, part, data || {});
    return val == null ? '' : String(val);
  }

  function evalSegments(segments, data) {
    if (!Array.isArray(segments) || !segments.length) return '';
    return segments.map((seg) => {
      if (!seg) return '';
      if (seg.type === 'text') return seg.value == null ? '' : String(seg.value);
      if (seg.type === 'field') return applyFormula(getField(data, seg.field), seg.formula, data);
      return '';
    }).join('');
  }

  function evalTemplateText(text, data) {
    if (text == null) return '';
    return String(text).replace(/\{([^}|]+)(?:\|([^}]*))?\}/g, (_, field, formula) =>
      applyFormula(getField(data, field.trim()), formula ? formula.trim() : '', data)
    );
  }

  function resolveElementContent(el, data, fallbackCode) {
    if (el && Array.isArray(el.segments) && el.segments.length) return evalSegments(el.segments, data);
    if (el && el.type === 'code') return fallbackCode || evalTemplateText(el.text || '', data);
    if (el && el.bind && !(el.text || '').includes('{')) {
      return applyFormula(getField(data, el.bind), el.formula || '', data);
    }
    return evalTemplateText(el?.text || '', data);
  }

  function resolveCellContent(cell, data, fallbackCode) {
    if (!cell) return '';
    if (Array.isArray(cell.segments) && cell.segments.length) return evalSegments(cell.segments, data);
    if (cell.contentType === 'qr' || cell.contentType === 'barcode') {
      return fallbackCode || evalTemplateText(cell.text || '', data);
    }
    return evalTemplateText(cell.text || '', data);
  }

  function segmentsPreview(segments) {
    if (!Array.isArray(segments) || !segments.length) return '';
    return segments.map((s) => {
      if (s.type === 'text') return s.value || '';
      if (s.type === 'field') return `{${s.field || '?'}${s.formula ? '|' + s.formula : ''}}`;
      return '';
    }).join('');
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
    buildOccupiedMap,
    ensureTableCells,
    normalizePercents,
    resizePercents,
    setPercentAt,
    ensureTableLayout
  };
})(window);
