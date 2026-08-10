'use strict';

const { getField, applyFormula, evalExpr } = require('./expr');

function toNumber(val) {
  if (val == null || val === '') return null;
  if (typeof val === 'number' && Number.isFinite(val)) return val;
  const n = Number(String(val).replace(/,/g, '').trim());
  return Number.isFinite(n) ? n : null;
}

function matchCondition(data, condition) {
  if (!condition || !condition.field) return true;
  const left = String(getField(data, condition.field) ?? '').trim();
  const right = String(condition.value ?? '').trim();
  const op = condition.op || 'eq';
  if (op === 'eq') return left === right;
  if (op === 'neq') return left !== right;
  if (op === 'contains') return left.includes(right);
  if (op === 'empty') return left === '';
  if (op === 'not_empty') return left !== '';
  const ln = toNumber(left);
  const rn = toNumber(right);
  if (ln == null || rn == null) return false;
  if (op === 'gt') return ln > rn;
  if (op === 'gte') return ln >= rn;
  if (op === 'lt') return ln < rn;
  if (op === 'lte') return ln <= rn;
  return left === right;
}

function intDivMod(value, divisor) {
  const n = toNumber(value);
  const d = toNumber(divisor);
  if (n == null || d == null || d === 0) return { quotient: '', remainder: '' };
  const absD = Math.abs(d);
  // 与常见仓库拆箱一致：按绝对值除数取整商与余数
  const quotient = Math.trunc(n / absD);
  const remainder = n - quotient * absD;
  return { quotient, remainder };
}

/**
 * 对当前值套用调整公式。
 * 支持：
 * - 快捷：+10  -5  *2  /3
 * - 旧式：num+10
 * - 完整：VALUE()+10、VALUE()*FIELD("箱规")、IF(VALUE()>0,VALUE()-1,0)
 */
function applyAdjustFormula(value, formula, data) {
  const f = String(formula || '').trim();
  if (!f) return value;

  const quick = f.match(/^([+\-*/])\s*(-?\d+(?:\.\d+)?)$/);
  if (quick) {
    return applyFormula(value, `num${quick[1]}${quick[2]}`, data);
  }

  try {
    return applyFormula(value, f, data);
  } catch {
    try {
      return evalExpr(f, { value, data: data || {} });
    } catch {
      return value;
    }
  }
}

function toOutputNumber(val) {
  const n = toNumber(val);
  if (n == null) return val == null ? '' : val;
  // 整除场景结果尽量保留整数观感
  if (Number.isInteger(n)) return n;
  if (Math.abs(n - Math.round(n)) < 1e-9) return Math.round(n);
  return Math.round(n * 1000) / 1000;
}

/**
 * rules: [
 *  {
 *    type:'div_mod', source_field, divisor, condition?,
 *    before_formula?, quotient_name, remainder_name,
 *    quotient_formula?, remainder_formula?
 *  },
 *  { type:'expr', name, formula, condition? }
 * ]
 */
function applyDerivedRules(raw, rules) {
  const data = { ...(raw || {}) };
  for (const rule of rules || []) {
    if (!rule || !rule.type) continue;
    if (rule.condition && !matchCondition(data, rule.condition)) {
      if (rule.type === 'div_mod') {
        if (rule.quotient_name) data[rule.quotient_name] = '';
        if (rule.remainder_name) data[rule.remainder_name] = '';
      } else if (rule.type === 'expr' && rule.name) {
        data[rule.name] = '';
      }
      continue;
    }

    if (rule.type === 'div_mod') {
      let src = getField(data, rule.source_field);
      src = applyAdjustFormula(src, rule.before_formula, data);
      let { quotient, remainder } = intDivMod(src, rule.divisor);
      if (quotient !== '' && rule.quotient_formula) {
        quotient = toOutputNumber(applyAdjustFormula(quotient, rule.quotient_formula, data));
      }
      if (remainder !== '' && rule.remainder_formula) {
        remainder = toOutputNumber(applyAdjustFormula(remainder, rule.remainder_formula, data));
      }
      if (rule.quotient_name) data[rule.quotient_name] = quotient;
      if (rule.remainder_name) data[rule.remainder_name] = remainder;
    } else if (rule.type === 'expr' && rule.name) {
      const formula = String(rule.formula || '').trim();
      if (!formula) {
        data[rule.name] = '';
      } else {
        try {
          data[rule.name] = applyFormula('', formula, data);
        } catch {
          try {
            data[rule.name] = evalExpr(formula, { value: '', data });
          } catch {
            data[rule.name] = '';
          }
        }
      }
    }
  }
  return data;
}

function resolveFieldValue(computed, field) {
  if (!field) return '';
  return getField(computed, field);
}

function resolveTargetQty(computed, qtyField) {
  const raw = resolveFieldValue(computed, qtyField);
  const n = toNumber(raw);
  if (n == null) return 0;
  return Math.max(0, Math.floor(Math.abs(n)));
}

function matchScanCode(scanned, expected) {
  const code = String(scanned || '').trim();
  const want = String(expected || '').trim();
  if (!code || !want) return false;
  if (code === want) return true;
  if (want.length >= 4 && code.includes(want)) return true;
  if (code.length >= 4 && want.includes(code)) return true;
  return false;
}

function allColumnNames(headers, rules) {
  const names = [...(headers || [])];
  for (const rule of rules || []) {
    if (rule.type === 'div_mod') {
      if (rule.quotient_name && !names.includes(rule.quotient_name)) names.push(rule.quotient_name);
      if (rule.remainder_name && !names.includes(rule.remainder_name)) names.push(rule.remainder_name);
    } else if (rule.type === 'expr' && rule.name && !names.includes(rule.name)) {
      names.push(rule.name);
    }
  }
  return names;
}

const DIV_MOD_FORMULA_HINTS = [
  { sample: '+10', hint: '当前值加 10' },
  { sample: '-5', hint: '当前值减 5' },
  { sample: '*2', hint: '当前值乘 2' },
  { sample: '/3', hint: '当前值除以 3' },
  { sample: 'VALUE()+10', hint: '等价于 +10，可继续嵌套' },
  { sample: 'VALUE()*2+1', hint: '先乘后加' },
  { sample: 'VALUE()+FIELD("调整数")', hint: '再加上另一列' },
  { sample: 'IF(VALUE()>0,VALUE()-1,0)', hint: '按条件再减 1' },
  { sample: 'num+10', hint: '旧式写法，仍可用' }
];

module.exports = {
  matchCondition,
  intDivMod,
  applyAdjustFormula,
  applyDerivedRules,
  resolveFieldValue,
  resolveTargetQty,
  matchScanCode,
  allColumnNames,
  DIV_MOD_FORMULA_HINTS
};
