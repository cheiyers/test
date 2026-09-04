(function (root) {
  const LINE_NO_RE = /^\d{5}$/;
  const PO_GROUP_RE = /^(\d{10})\/(\S+)$/;
  const MONEY_RE = /^\d{1,3}(?:,\d{3})*\.\d{2}$/;
  const QTY_RE = /^\d+$/;
  const UNIT_PRICE_RE = /^(\S+)\s+(\d+\.\d{2}\/\d+)$/;
  const PRICE_ONLY_RE = /^\d+\.\d{2}(?:\/\d+)?$/;
  const UNIT_LIKE_RE = /^(件|个|套|台|只|米|KG|kg|PC|PCE|EA|SET)$/i;
  const SERVICE_UNIT_RE = /^(项|次|式|AU|LE|ACT|LOT|H|HR|MAN)$/i;
  const SERVICE_TEXT_RE = /服务|劳务|service/i;
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

  function isMoney(text) {
    return MONEY_RE.test(String(text || "").trim());
  }

  function normalizeMoney(text) {
    return String(text || "").replace(/,/g, "").trim();
  }

  function findAmountSpan(spans) {
    const right = (spans || []).filter(function (s) {
      return s.x >= 340;
    });
    for (let i = 0; i < right.length; i++) {
      if (isMoney(right[i].text)) return { text: normalizeMoney(right[i].text), x: right[i].x };
    }
    if (right.length) {
      const joined = right
        .map(function (s) {
          return s.text;
        })
        .join("")
        .replace(/\s/g, "");
      if (isMoney(joined)) return { text: normalizeMoney(joined), x: right[0].x };
    }
    return null;
  }

  function parseUnitPrice(text) {
    const raw = String(text || "").trim();
    const m = raw.match(UNIT_PRICE_RE);
    if (m) return { unit: m[1], price: m[2] };
    if (PRICE_ONLY_RE.test(raw)) return { unit: "", price: raw };
    return { unit: "", price: "" };
  }

  function fillQtyUnitPrice(item, spans) {
    const qtySpan = spans.filter(function (s) {
      return QTY_RE.test(s.text) && s.x >= 160 && s.x < 220;
    })[0];
    const amountSpan = findAmountSpan(spans);
    if (!qtySpan || !amountSpan) return false;
    if (item.qty) return true;
    item.qty = qtySpan.text;
    item.amount = amountSpan.text;
    const combined = spans.filter(function (s) {
      return UNIT_PRICE_RE.test(s.text);
    })[0];
    if (combined) {
      const up = parseUnitPrice(combined.text);
      item.unit = up.unit;
      item.unitPrice = up.price;
      return true;
    }
    const unitSpan = spans.filter(function (s) {
      return s.x >= 200 && s.x < 280 && (UNIT_LIKE_RE.test(s.text) || (!PRICE_ONLY_RE.test(s.text) && !QTY_RE.test(s.text)));
    })[0];
    const priceSpan = spans.filter(function (s) {
      return PRICE_ONLY_RE.test(s.text) && s.x >= 250 && s.x < 360;
    })[0];
    if (unitSpan) item.unit = unitSpan.text;
    if (priceSpan) item.unitPrice = priceSpan.text;
    return true;
  }

  function fillKvFields(item, spans) {
    let found = false;
    spans.forEach(function (s, i) {
      const m = String(s.text).match(KV_RE);
      let key = "";
      let val = "";
      if (m && m[2] && m[2].trim()) {
        key = m[1].trim();
        val = m[2].trim();
      } else if (/[:：]\s*$/.test(s.text)) {
        key = s.text.replace(/[:：]\s*$/, "").trim();
        const nxt = spans.slice(i + 1).filter(function (t) {
          return t.x >= s.x && !/[:：]\s*$/.test(t.text);
        })[0];
        if (key && nxt) val = nxt.text.trim();
      }
      if (!key || !val) return;
      found = true;
      item.extras[key] = val;
      if (KEYWORD_MAP[key]) item[KEYWORD_MAP[key]] = val;
    });
    return found;
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
      if (leftT.indexOf("你们的参考号") === 0 || leftT === "行项目" || row.y >= 430) inBilling = false;
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
          return isMoney(s.text);
        });
        if (money.length) header.vatTotal = normalizeMoney(money[money.length - 1].text);
        else if (!header.vatTotal) {
          const joined = columnTexts(row, 340, 9999).join("").replace(/\s/g, "");
          if (isMoney(joined)) header.vatTotal = normalizeMoney(joined);
        }
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

  function serviceReason(item) {
    const desc = String((item && item.description) || "");
    if (SERVICE_TEXT_RE.test(desc)) return "描述含服务/劳务";
    if (item && item.unit && SERVICE_UNIT_RE.test(item.unit)) return "单位为 " + item.unit;
    return "";
  }

  function collectWarnings(doc) {
    const header = (doc && doc.header) || {};
    const items = (doc && doc.items) || [];
    attachReviewFlags(items);
    const pages = (doc && doc.pages) || [];
    const file = (doc && doc.file) || "";
    const po = header.poNumber || file || "PO";
    const pageCount = doc && doc.pageCount ? doc.pageCount : pages.length || 1;
    const warnings = [];

    if (pageCount > 1) {
      warnings.push({
        type: "cross-page",
        poNumber: po,
        file: file,
        message: po + " 共 " + pageCount + " 页，已识别 " + items.length + " 条行项目。跨页订单请核对是否与原件一致。",
      });
      const later = pages.slice(1);
      const laterHasRows = later.some(function (p) {
        return p && (p.itemCount > 0 || p.orphanContinuation || p.hasTable);
      });
      if (laterHasRows && pages[0] && pages[0].lastIncomplete) {
        warnings.push({
          type: "cross-page",
          poNumber: po,
          file: file,
          message: po + " 第 1 页末行数量或金额未齐，后续页可能是续行，请对照原件。",
        });
      }
    }

    items.forEach(function (item) {
      const line = item.lineNo || "（未知行）";
      const noMat = !item.materialNo && (item.description || item.qty || item.amount);
      if (noMat) {
        warnings.push({
          type: "no-material",
          poNumber: po,
          file: file,
          lineNo: item.lineNo || "",
          message: po + " 行项目 " + line + " 没有物料号，可能是文本行或服务类行，请确认后再导出。",
        });
      }
      const why = serviceReason(item);
      if (why) {
        warnings.push({
          type: "service",
          poNumber: po,
          file: file,
          lineNo: item.lineNo || "",
          message: po + " 行项目 " + line + " 疑似服务类行（" + why + "），请核对数量与金额。",
        });
      }
    });
    return warnings;
  }

  function isIgnorableItemRow(row, spans) {
    const joined = (row && row.text
      ? row.text
      : (spans || [])
          .map(function (s) {
            return s.text;
          })
          .join(" ")
    )
      .replace(/\s+/g, " ")
      .trim();
    if (!joined) return true;
    if (joined === "页" || joined === "此文档已电子签名") return true;
    if (/^页?\s*\d+\s*\/\s*\d+$/.test(joined)) return true;
    if (/^\d+\s*\/\s*\d+$/.test(joined) && spans && spans[0] && spans[0].x >= 400) return true;
    return false;
  }

  function analyzeLineItems(rows, header) {
    let startI = -1;
    let endI = rows.length;
    rows.forEach(function (row, i) {
      if (startI < 0 && row.spans.some(function (s) { return s.text === "行项目"; })) startI = i;
      if (startI >= 0 && row.spans.some(function (s) { return s.text.indexOf("不含增值税总价") >= 0; })) {
        endI = Math.min(endI, i);
      }
    });
    if (startI < 0) {
      return { items: [], hasTable: false, orphanContinuation: false, lastIncomplete: false };
    }
    const body = rows.slice(startI + 1, endI);
    const items = [];
    let current = null;
    let orphanContinuation = false;

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
      let spans = row.spans.filter(function (s) {
        return !SKIP[s.text];
      });
      if (!spans.length) return;
      if (isIgnorableItemRow(row, spans)) return;
      let first = spans[0].text;
      const merged = first.match(/^(\d{5})(\d{6,})$/);
      if (merged && spans[0].x < 80) {
        first = merged[1];
        spans = [{ text: first, x: spans[0].x }].concat(
          [{ text: merged[2], x: Math.max(spans[0].x + 40, 85) }],
          spans.slice(1)
        );
      }
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
      if (!current) {
        const qtyLike = spans.some(function (s) {
          return QTY_RE.test(s.text) && s.x >= 160 && s.x < 220;
        });
        if (qtyLike || findAmountSpan(spans) || (spans[0].x >= 200 && spans[0].text)) {
          orphanContinuation = true;
        }
        return;
      }

      if (fillQtyUnitPrice(current, spans)) return;
      if (fillKvFields(current, spans)) return;
      if (spans[0].x >= 200) {
        const extra = spans
          .map(function (s) {
            return s.text;
          })
          .join(" ")
          .trim();
        if (extra) current.description = (current.description + " " + extra).trim();
      }
    });
    if (current) items.push(current);
    const last = items[items.length - 1];
    return {
      items: items,
      hasTable: true,
      orphanContinuation: orphanContinuation,
      lastIncomplete: Boolean(last && (!last.qty || !last.amount)),
    };
  }

  function attachReviewFlags(items) {
    (items || []).forEach(function (item) {
      const flags = [];
      if (!item.materialNo && (item.description || item.qty || item.amount)) {
        flags.push("no-material");
      }
      if (serviceReason(item)) flags.push("service");
      item.reviewFlags = flags;
    });
  }

  function parseLineItems(rows, header) {
    const items = analyzeLineItems(rows, header).items;
    attachReviewFlags(items);
    return items;
  }

  function parseDocument(fileName, pages) {
    let header = {};
    const items = [];
    const pageMeta = [];
    pages.forEach(function (page, i) {
      const rows = groupRows(page.words || page.spans || []);
      const pageHeader = parseHeader(rows);
      if (i === 0) header = pageHeader;
      else if (!pageHeader.deliveryDate && header.deliveryDate) {
        pageHeader.deliveryDate = header.deliveryDate;
      }
      const analyzed = analyzeLineItems(rows, pageHeader);
      analyzed.items.forEach(function (it) {
        items.push(it);
      });
      if (pageHeader.vatTotal) header.vatTotal = pageHeader.vatTotal;
      if (pageHeader.electronicallySigned) header.electronicallySigned = true;
      pageMeta.push({
        page: i + 1,
        itemCount: analyzed.items.length,
        hasTable: analyzed.hasTable,
        orphanContinuation: analyzed.orphanContinuation,
        lastIncomplete: analyzed.lastIncomplete,
      });
    });
    attachReviewFlags(items);
    const doc = {
      file: fileName,
      pageCount: pages.length,
      header: header,
      items: items,
      pages: pageMeta,
    };
    doc.warnings = collectWarnings(doc);
    return doc;
  }

  const api = {
    groupRows: groupRows,
    parseDocument: parseDocument,
    parseHeader: parseHeader,
    parseLineItems: parseLineItems,
    collectWarnings: collectWarnings,
    attachReviewFlags: attachReviewFlags,
  };
  if (typeof module !== "undefined" && module.exports) module.exports = api;
  root.SchindlerPoParser = api;
})(typeof window !== "undefined" ? window : globalThis);
