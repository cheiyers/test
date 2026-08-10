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
 * rules: [
 *  { type:'div_mod', source_field, divisor, condition?, quotient_name, remainder_name },
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
      const src = getField(data, rule.source_field);
      const { quotient, remainder } = intDivMod(src, rule.divisor);
      if (rule.quotient_name) data[rule.quotient_name] = quotient;
      if (rule.remainder_name) data[rule.remainder_name] = remainder;
    } else if (rule.type === 'expr' && rule.name) {
      const formula = String(rule.formula || '').trim();
      if (!formula) {
        data[rule.name] = '';
      } else {
        try {
          // 无当前值时用空串，公式内用 FIELD("列名") 取订单列
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

module.exports = {
  matchCondition,
  intDivMod,
  applyDerivedRules,
  resolveFieldValue,
  resolveTargetQty,
  matchScanCode,
  allColumnNames
};
