(function (root) {
  const LINE_NO_RE = /^0\d{4}$/;
  const PO_GROUP_RE = /^(\d{10})\/(\S+)$/;
  const MONEY_RE = /^\d+\.\d{2}$/;
  const QTY_RE = /^\d+$/;
  const UNIT_PRICE_RE = /^(\S+)\s+(\d+\.\d{2}\/\d+)$/;
  const KV_RE = /^([^:：]{1,20})[:：]\s*(.*)$/;
  const KEYWORD_LABELS = [
    "图号/版本",
    "安装国家",
    "成组技术码",
    "运输类型",
    "D/E",
    "产品家族",
    "SCM大小/量纲",
  ];
  const KEYWORD_MAP = {
    "图号/版本": "drawingRev",
    安装国家: "installCountry",
    成组技术码: "groupTechCode",
    运输类型: "transportType",
    "D/E": "deFlag",
    产品家族: "productFamily",
    "SCM大小/量纲": "scmSize",
  };
  const SKIP = {
    行项目: 1,
    物料号: 1,
    物料组: 1,
    物料描述: 1,
    交货日期: 1,
    订单数量: 1,
    单位: 1,
    未税单价: 1,
    "未税金额CNY]": 1,
    "未税金额[CNY]": 1,
  };

  function groupRows(spans, yTol) {
    yTol = yTol || 3.5;
    const rows = [];
    spans.forEach(function (span) {
      let placed = false;
      for (let i = 0; i < rows.length; i++) {
        if (Math.abs(rows[i].y - span.y) <= yTol) {
          rows[i].spans.push(span);
          const n = rows[i].spans.length;
          rows[i].y = (rows[i].y * (n - 1) + span.y) / n;
          placed = true;
          break;
        }
      }
      if (!placed) rows.push({ y: span.y, spans: [span] });
    });
    rows.forEach(function (row) {
      row.spans.sort(function (a, b) {
        return a.x - b.x;
      });
      row.text = row.spans
        .map(function (s) {
          return s.text;
        })
        .join(" ");
      row.x = row.spans[0].x;
    });
    rows.sort(function (a, b) {
      return a.y - b.y;
    });
    return rows;
  }

  function spanLabel(text) {
    return String(text)
      .split(":")[0]
      .split("：")[0]
      .trim();
  }

  function valueAfterLabel(rows, label, xMin, xMax) {
    xMin = xMin == null ? 0 : xMin;
    xMax = xMax == null ? 9999 : xMax;
    for (let i = 0; i < rows.length; i++) {
      const row = rows[i];
      for (let j = 0; j < row.spans.length; j++) {
        const span = row.spans[j];
        if (span.x < xMin || span.x >= xMax) continue;
        if (spanLabel(span.text) !== label) continue;
        const m = String(span.text).match(KV_RE);
        if (m && m[2] && m[2].trim()) return m[2].trim();
        for (let k = j + 1; k < row.spans.length; k++) {
          const later = row.spans[k];
          if (later.x < span.x || later.x >= xMax) continue;
          if (spanLabel(later.text) !== later.text && later.text.indexOf(":") >= 0) continue;
          return later.text.trim();
        }
      }
    }
    return "";
  }

  function columnTexts(row, xMin, xMax) {
    return row.spans
      .filter(function (s) {
        return s.x >= xMin && s.x < xMax;
      })
      .map(function (s) {
        return s.text;
      });
  }

  function parseUnitPrice(text) {
    const m = String(text || "")
      .trim()
      .match(UNIT_PRICE_RE);
    return m ? { unit: m[1], price: m[2] } : { unit: "", price: "" };
  }

  function parseHeader(rows) {
    const poRaw = valueAfterLabel(rows, "采购订单号/采购组", 0, 280);
    let poNumber = "";
    let purchaseGroup = "";
    const compact = poRaw.replace(/\s+/g, "");
    const gm = compact.match(PO_GROUP_RE);
    if (gm) {
      poNumber = gm[1];
      purchaseGroup = gm[2];
    } else {
      const parts = poRaw.split("/");
      poNumber = (parts[0] || "").trim();
      purchaseGroup = (parts[1] || "").trim();
    }

    const supplierLines = [];
    rows.forEach(function (row) {
      if (row.y >= 160 && row.y <= 200) {
        const right = columnTexts(row, 300, 9999);
        if (right.length) supplierLines.push(right.join(" "));
      }
    });

    const billing = [];
    const delivery = [];
    let inBilling = false;
    let inDelivery = false;
    rows.forEach(function (row) {
      let leftT = columnTexts(row, 0, 280).join(" ").trim();
      let rightT = columnTexts(row, 280, 9999).join(" ").trim();
      if (leftT.indexOf("开票抬头") === 0) {
        inBilling = true;
        leftT = "";
      }
      if (rightT.indexOf("交货地址") === 0) {
        inDelivery = true;
        rightT = "";
      }
      if (leftT.indexOf("你们的参考号") === 0) inBilling = false;
      if (rightT.indexOf("工厂") === 0) inDelivery = false;
      if (inBilling && leftT) billing.push(leftT);
      if (inDelivery && rightT) delivery.push(rightT);
    });

    let deliveryDate = "";
    rows.forEach(function (row) {
      row.spans.forEach(function (s) {
        if (s.y < 430 && s.text.indexOf("交货日期:") === 0) {
          deliveryDate = s.text.split(":").slice(1).join(":").trim();
        }
      });
    });

    const header = {
      buyer: "迅达(中国）电梯有限公司",
      docType: "采购订单",
      poNumber: poNumber,
      purchaseGroup: purchaseGroup,
      documentDate: valueAfterLabel(rows, "凭证日期", 0, 280),
      buyerContact: valueAfterLabel(rows, "联系人", 0, 280),
      buyerPhone: valueAfterLabel(rows, "电话/传真", 0, 280).replace(/\s*\/\s*$/, ""),
      buyerEmail: valueAfterLabel(rows, "邮箱", 0, 280),
      supplierContact: valueAfterLabel(rows, "供应商联系人", 0, 280),
      supplierCode: valueAfterLabel(rows, "供应商", 0, 280),
      supplierPhone: valueAfterLabel(rows, "电话", 0, 280),
      supplierName: supplierLines[0] || "",
      supplierAddress: supplierLines.slice(1).join(" "),
      billingTitle: billing.join(" / "),
      deliveryAddress: delivery.join(" "),
      plant: "",
      companyCode: "",
      paymentTerms: "",
      incoterms: "",
      deliveryDate: deliveryDate,
      printDate: "",
      vatTotal: "",
      fileNo: "",
      page: "",
      electronicallySigned: false,
    };

    rows.forEach(function (row) {
      row.spans.forEach(function (s) {
        const t = s.text;
        if (t.indexOf("迅达") >= 0 && s.y < 50) header.buyer = t;
        if (t === "采购订单") header.docType = t;
        if (t.indexOf("工厂:") === 0) header.plant = t.split(":").slice(1).join(":").trim();
        else if (t.indexOf("公司代码:") === 0 && s.x >= 270) header.companyCode = t.split(":").slice(1).join(":").trim();
        else if (t.indexOf("打印日期:") === 0) header.printDate = t.split(":").slice(1).join(":").trim();
        else if (t.indexOf("文件编号:") === 0) header.fileNo = t.split(":").slice(1).join(":").trim();
        else if (t.indexOf("贸易条款:") === 0) header.incoterms = t.split(":").slice(1).join(":").trim();
      });
      const right = columnTexts(row, 280, 9999).join(" ").trim();
      if (/\d+\s*天之内/.test(right) || right.indexOf("到期净值") >= 0) {
        header.paymentTerms = right.replace("付款条件:", "").trim();
      }
      if (row.text.indexOf("不含增值税总价") >= 0) {
        const money = row.spans.filter(function (s) {
          return MONEY_RE.test(s.text);
        });
        if (money.length) header.vatTotal = money[money.length - 1].text;
      }
      if (row.text.indexOf("此文档已电子签名") >= 0) header.electronicallySigned = true;
    });

    if (header.supplierPhone && !/^\d{11}$/.test(header.supplierPhone)) {
      rows.forEach(function (row) {
        if (row.y >= 210 && row.y <= 230) {
          row.spans.forEach(function (s) {
            if (/^\d{11}$/.test(s.text)) header.supplierPhone = s.text;
          });
        }
      });
    }
    return header;
  }

  function parseLineItems(rows, header) {
    let startI = -1;
    let endI = rows.length;
    rows.forEach(function (row, i) {
      if (startI < 0 && row.spans.some(function (s) { return s.text === "行项目"; })) startI = i;
      if (startI >= 0 && row.spans.some(function (s) { return s.text.indexOf("不含增值税总价") >= 0; })) {
        endI = Math.min(endI, i);
      }
    });
    if (startI < 0) return [];
    const body = rows.slice(startI + 1, endI);
    const items = [];
    let current = null;

    function newItem(lineNo) {
      const extras = {};
      KEYWORD_LABELS.forEach(function (k) {
        extras[k] = "";
      });
      return {
        lineNo: lineNo,
        materialNo: "",
        materialGroup: "",
        description: "",
        deliveryDate: (header && header.deliveryDate) || "",
        qty: "",
        unit: "",
        unitPrice: "",
        amount: "",
        drawingRev: "",
        installCountry: "",
        groupTechCode: "",
        transportType: "",
        deFlag: "",
        productFamily: "",
        scmSize: "",
        extras: extras,
      };
    }

    body.forEach(function (row) {
      const spans = row.spans.filter(function (s) {
        return !SKIP[s.text];
      });
      if (!spans.length) return;
      const first = spans[0].text;
      if (LINE_NO_RE.test(first) && spans[0].x < 80) {
        if (current) items.push(current);
        current = newItem(first);
        spans.slice(1).forEach(function (s) {
          if (s.x >= 80 && s.x < 160) current.materialNo = s.text;
          else if (s.x >= 160 && s.x < 230) current.materialGroup = s.text;
          else if (s.x >= 230) current.description = (current.description + " " + s.text).trim();
        });
        return;
      }
      if (!current) return;

      const qtySpan = spans.filter(function (s) {
        return QTY_RE.test(s.text) && s.x >= 160 && s.x < 210;
      })[0];
      const priceSpan = spans.filter(function (s) {
        return UNIT_PRICE_RE.test(s.text) || (s.x >= 220 && s.x < 350 && s.text.indexOf("/") >= 0);
      })[0];
      const amountSpan = spans.filter(function (s) {
        return MONEY_RE.test(s.text) && s.x >= 350;
      })[0];
      if (qtySpan && amountSpan) {
        if (!current.qty) {
          current.qty = qtySpan.text;
          if (priceSpan) {
            const up = parseUnitPrice(priceSpan.text);
            current.unit = up.unit;
            current.unitPrice = up.price;
          }
          current.amount = amountSpan.text;
        }
        return;
      }

      spans.forEach(function (s) {
        const m = String(s.text).match(KV_RE);
        if (!m) return;
        const key = m[1].trim();
        const val = m[2].trim();
        current.extras[key] = val;
        if (KEYWORD_MAP[key]) current[KEYWORD_MAP[key]] = val;
      });
    });
    if (current) items.push(current);
    return items;
  }

  function parseDocument(fileName, pages) {
    let header = {};
    const items = [];
    pages.forEach(function (page, i) {
      const rows = groupRows(page.words || page.spans || []);
      const pageHeader = parseHeader(rows);
      if (i === 0) header = pageHeader;
      const pageItems = parseLineItems(rows, pageHeader);
      pageItems.forEach(function (it) {
        items.push(it);
      });
      if (pageHeader.vatTotal) header.vatTotal = pageHeader.vatTotal;
    });
    return {
      file: fileName,
      pageCount: pages.length,
      header: header,
      items: items,
      pages: pages.map(function (_, i) {
        return { page: i + 1 };
      }),
    };
  }

  const api = { groupRows: groupRows, parseDocument: parseDocument, parseHeader: parseHeader, parseLineItems: parseLineItems };
  if (typeof module !== "undefined" && module.exports) module.exports = api;
  root.SchindlerPoParser = api;
})(typeof window !== "undefined" ? window : globalThis);
