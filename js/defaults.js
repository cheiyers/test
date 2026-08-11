(function (global) {
  'use strict';

  function uid(prefix) {
    return (prefix || 'el_') + Math.random().toString(36).slice(2, 10);
  }

  function cell(text, patch) {
    return global.LabelTable.defaultCell(text, patch);
  }

  /** Shared 80×40 cable label: QR left + 7-row field table right. */
  function cableLabelDesign(options) {
    const opts = options || {};
    const qrBind = opts.qrBind || { bindMode: 'column', column: 'Order No.', staticValue: '11231445' };
    const seqText = opts.seqText || '{{Seq.No.}}';
    const propsText = opts.propsText || 'JOIN("/", {{标准}}, {{认证}}, {{机房类型}})';

    const rows = [
      { label: 'Order No.', value: '{{Order No.}}', bold: true },
      { label: 'Company P/N', value: '{{Company P/N}}', bold: true },
      { label: 'Customer P/N', value: '{{Customer P/N}}', bold: true },
      { label: 'Length', value: '{{Length}}', bold: false },
      { label: 'Properties', value: propsText, bold: false },
      { label: 'Seq.No.', value: seqText, bold: false },
      { label: 'Name', value: '{{Name}}', bold: false },
    ];

    const cells = rows.map((row) => ([
      cell(row.label, { align: 'right', fontWeight: '400', fontSize: 7 }),
      cell(row.value, { align: 'left', fontWeight: row.bold ? '700' : '400', fontSize: 7 }),
    ]));

    const tableEl = {
      id: uid('tbl_'),
      type: 'table',
      name: '字段表',
      x: 37,
      y: 1.8,
      w: 41.5,
      h: 36.4,
      rows: 7,
      cols: 2,
      borderColor: '#000000',
      tableFontSize: 7,
      colWidths: [38, 62],
      rowHeights: global.LabelTable.normalizeWeights(Array(7).fill(1)),
      merges: [],
      cells,
      bindMode: 'static',
      staticValue: '',
    };
    global.LabelTable.ensureGrid(tableEl);

    return {
      width: 80,
      height: 40,
      elements: [
        {
          id: uid('rect_'),
          type: 'rect',
          name: '外框',
          x: 0.4,
          y: 0.4,
          w: 79.2,
          h: 39.2,
          rectStroke: '#000000',
          rectStrokeWidth: 0.25,
          rectFill: '#ffffff',
          rectTransparent: true,
          bindMode: 'static',
          staticValue: '',
        },
        {
          id: uid('qr_'),
          type: 'qrcode',
          name: '二维码',
          x: 2.2,
          y: 3.2,
          w: 33.5,
          h: 33.5,
          qrLevel: 'M',
          bindMode: qrBind.bindMode || 'column',
          column: qrBind.column || 'Order No.',
          staticValue: qrBind.staticValue || '11231445',
          formula: qrBind.formula || '',
          joinColumns: qrBind.joinColumns || [],
          joinSep: qrBind.joinSep || '',
          joinSkipEmpty: true,
          prefix: '',
          suffix: '',
        },
        tableEl,
      ],
    };
  }

  const DEFAULT_TEMPLATES = [
    {
      id: 'builtin_cable_label_a',
      name: '线缆产品标签 A',
      builtin: true,
      description: '80×40mm · 左侧二维码绑定订单号 · Properties 多列拼接',
      design: cableLabelDesign({
        qrBind: { bindMode: 'column', column: 'Order No.', staticValue: '11231445' },
        propsText: 'JOIN("/", {{标准}}, {{认证}}, {{机房类型}})',
        seqText: '{{Seq.No.}}',
      }),
    },
    {
      id: 'builtin_cable_label_b',
      name: '线缆产品标签 B',
      builtin: true,
      description: '80×40mm · 二维码绑定订单号+序号 · Properties 单列',
      design: cableLabelDesign({
        qrBind: {
          bindMode: 'formula',
          formula: '{{Order No.}}&"-"&{{Seq.No.}}',
          staticValue: '11231445-1',
        },
        propsText: '{{Properties}}',
        seqText: '{{Seq.No.}}',
      }),
    },
  ];

  const SAMPLE_COLUMNS = [
    'Order No.',
    'Company P/N',
    'Customer P/N',
    'Length',
    '标准',
    '认证',
    '机房类型',
    'Properties',
    'Seq.No.',
    'Name',
  ];

  const SAMPLE_ORDERS = [
    {
      'Order No.': '11231445',
      'Company P/N': 'HL00123',
      'Customer P/N': 'KM09012084',
      Length: '148.5',
      标准: '新国标',
      认证: 'KCE',
      机房类型: '有机房',
      Properties: '新国标/KCE/有机房',
      'Seq.No.': '11-1',
      Name: '井道照明电缆',
    },
    {
      'Order No.': '11231445',
      'Company P/N': 'HL00123',
      'Customer P/N': 'KM09012084',
      Length: '148.5',
      标准: '新国标',
      认证: 'KCE',
      机房类型: '有机房',
      Properties: '新国标/KCE/有机房',
      'Seq.No.': '1',
      Name: '井道照明电缆',
    },
    {
      'Order No.': '11231802',
      'Company P/N': 'HL00456',
      'Customer P/N': 'KM09018821',
      Length: '96.0',
      标准: '新国标',
      认证: 'CCC',
      机房类型: '无机房',
      Properties: '新国标/CCC/无机房',
      'Seq.No.': '3-2',
      Name: '随行电缆',
    },
  ];

  global.LabelDefaults = {
    templates: DEFAULT_TEMPLATES,
    sampleColumns: SAMPLE_COLUMNS,
    sampleOrders: SAMPLE_ORDERS,
    cableLabelDesign,
  };
})(typeof window !== 'undefined' ? window : globalThis);
