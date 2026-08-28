/* KONE Purchase Order parser (coordinate-aware, browser-side). */
(function (global) {
  const LINE_RE =
    /^(\d+)\s+(KM[A-Z0-9]+)\s+(\d{2}\.\d{2}\.\d{4})(?:\s+(\d{2}\.\d{2}\.\d{4}))?\s+(\d+)\s*PC\s+([\d,.]+)\s+([\d,.]+)$/;
  const BOM_RE = /^\.1\s+(\d{4})\s+(KM[A-Z0-9]+)\s+([\d,.]+)\s+PC$/;
  const DATE_RE = /\d{2}\.\d{2}\.\d{4}/g;
  const CONTACT_RE = /([A-Za-z]+,[A-Za-z]+)/;
  const ACCOUNT_MARK = "\u8d26\u53f7:";

  function wordsToLines(words, yTol) {
    yTol = yTol || 3.2;
    const rows = [];
    for (const w of words) {
      const text = (w.text || "").trim();
      if (!text) continue;
      let placed = false;
      for (const row of rows) {
        if (Math.abs(row.y - w.y) <= yTol) {
          row.words.push(w);
          const n = row.words.length;
          row.y = (row.y * (n - 1) + w.y) / n;
          placed = true;
          break;
        }
      }
      if (!placed) rows.push({ y: w.y, words: [w] });
    }
    rows.sort((a, b) => a.y - b.y);
    return rows.map((row) => {
      const ws = row.words.slice().sort((a, b) => a.x - b.x);
      return {
        y: row.y,
        x0: ws[0].x,
        x1: ws[ws.length - 1].x + (ws[ws.length - 1].w || 0),
        text: ws.map((w) => w.text).join(" "),
        words: ws,
      };
    });
  }

  function columnText(ln, xMin, xMax) {
    return ln.words
      .filter((w) => w.x >= xMin && w.x < xMax)
      .map((w) => w.text)
      .join(" ")
      .trim();
  }

  function contentBand(lines) {
    let headerY = null;
    let footerY = 690;
    for (const ln of lines) {
      if (ln.text.startsWith("Pos.") && ln.text.includes("Material")) headerY = ln.y;
        if (
        ln.text.includes("TOTAL AMOUNT") ||
        ln.text.includes(ACCOUNT_MARK) ||
        ln.text.includes("\u8d26\u53f7")
      ) {
        footerY = Math.min(footerY, ln.y - 2);
      }
      if (ln.text.startsWith("1.") && ln.text.includes("Please acknowledge")) {
        footerY = Math.min(footerY, ln.y - 2);
      }
    }
    return lines.filter((ln) => {
      if (headerY != null && ln.y <= headerY + 2) return false;
      if (ln.y >= footerY) return false;
      return true;
    });
  }

  function parseHeader(lines) {
    const header = {
      company: "KONE Elevators Co. Ltd.",
      companyZh: "\u901a\u529b\u7535\u68af\u6709\u9650\u516c\u53f8",
      docType: "Purchase order",
      poNumber: "",
      vendorName: "",
      vendorNameEn: "",
      vendorAddress: "",
      buyerName: "\u901a\u529b\u7535\u68af\u6709\u9650\u516c\u53f8",
      vatNo: "",
      deliveryAddress: "",
      buyerContact: "",
      supplierNumber: "",
      date: "",
      datePrinted: "",
      termsOfPayment: "",
      currency: "RMB",
      totalAmount: "",
      tel: "",
    };
    const full = lines.map((l) => l.text).join("\n");
    const po = full.match(/No\.\s+(\d{7,})/);
    if (po) header.poNumber = po[1];
    const vat = full.match(/VAT No:\s*(\S+)/);
    if (vat) header.vatNo = vat[1];
    const tel = full.match(/Tel:\s*(\d+)/);
    if (tel) header.tel = tel[1];

    const vendor = [];
    const buyer = [];
    const delivery = [];
    let mode = null;
    for (const ln of lines) {
      let left = columnText(ln, 0, 280);
      const right = columnText(ln, 280, 9999);
      if (left.includes("Seller/Vendor")) {
        mode = "vendor";
        continue;
      }
      if (left === "Buyer" || left.startsWith("Buyer")) {
        mode = "buyer";
        continue;
      }
      if (left.startsWith("Delivery address")) {
        mode = "delivery";
        continue;
      }
      if (left.startsWith("Pos.") && ln.text.includes("Material")) break;
      if (left.includes("Shipping Instruction")) {
        left = left.replace("Shipping Instruction", "").trim();
        if (!left) continue;
      }
      if (mode === "vendor" && left) vendor.push(left);
      else if (mode === "buyer" && left && !left.startsWith("VAT")) buyer.push(left);
      else if (mode === "delivery" && left) delivery.push(left);
      if (right.includes("\u5230\u671f\u51c0\u503c") || right.includes("\u5929\u4e4b\u5185")) {
        header.termsOfPayment = right;
      }
    }
    if (vendor.length) {
      header.vendorName = vendor[0];
      const en = vendor
        .slice(1)
        .filter((t) => /[A-Za-z]/.test(t) && t !== "CHINA" && !t.startsWith("Tel:"));
      header.vendorNameEn = en.join(" ");
      header.vendorAddress = vendor
        .slice(1)
        .filter((t) => !en.includes(t) && !t.startsWith("Tel:"))
        .join(" ");
    }
    if (buyer.length) header.buyerName = buyer[0];
    header.deliveryAddress = delivery.join(" / ");

    const dates = [];
    for (const ln of lines) {
      if (ln.y < 110) {
        const found = columnText(ln, 280, 9999).match(DATE_RE);
        if (found) dates.push(...found);
      }
    }
    const uniq = [...new Set(dates)];
    if (uniq.length) {
      header.date = uniq[0];
      header.datePrinted = uniq[uniq.length - 1];
    }

    for (const ln of lines) {
      if (ln.y > 100 && ln.y < 130) {
        const right = columnText(ln, 280, 9999);
        const c = right.match(CONTACT_RE);
        if (c) header.buyerContact = c[1];
        const sn = right.match(/\d{8}/);
        if (sn) header.supplierNumber = sn[0];
      }
    }

    for (let i = lines.length - 1; i >= 0; i--) {
      if (lines[i].y > 680) {
        const m = lines[i].text.match(/([\d,]+\.\d{2})/);
        if (m) {
          header.totalAmount = m[1];
          break;
        }
      }
    }
    return header;
  }

  function splitSpec(ln) {
    const key = [];
    const code = [];
    const value = [];
    for (const w of ln.words) {
      if (w.x < 250) key.push(w.text);
      else if (w.x < 348) code.push(w.text);
      else value.push(w.text);
    }
    const spec = {
      key: key.join(" ").trim().replace(/^"|"$/g, ""),
      value: value.join(" ").trim() || code.join(" ").trim(),
    };
    const codeText = code.join(" ").trim();
    const valueText = value.join(" ").trim();
    if (codeText && valueText) {
      spec.code = codeText;
      spec.value = valueText;
    }
    return spec.key ? spec : null;
  }

  const REMARK_RE = /Remarks line\s+(\d+)\s+([A-Za-z])\s*=\s*(.*)$/;

  function applyRemark(bom, line) {
    if (!bom.remarks) bom.remarks = [];
    if (!bom.remarkFields) bom.remarkFields = {};
    bom.remarks.push(line);
    const m = String(line).trim().match(REMARK_RE);
    if (m) bom.remarkFields[m[2].toUpperCase()] = m[3].trim();
  }

  function normalizeBom(bom) {
    const b = Object.assign({ remarks: [], remarkFields: {} }, bom);
    if (!b.remarkFields || !Object.keys(b.remarkFields).length) {
      b.remarkFields = {};
      (b.remarks || []).forEach((line) => {
        const m = String(line).trim().match(REMARK_RE);
        if (m) b.remarkFields[m[2].toUpperCase()] = m[3].trim();
      });
    }
    return b;
  }

  function familyOf(item) {
    const d = item.description || "";
    if (/LED\s*STRIP/i.test(d)) return { id: "led-strip", name: "LED STRIP \u8f7f\u53a2\u706f\u5e26" };
    if (/\u4e3b\u5f00\u5173/.test(d) || /MAIN SWITCH/i.test(d))
      return { id: "main-switch", name: "MR \u4e3b\u5f00\u5173" };
    if (/\u7ebf\u7f06|\u4e95\u9053\u7167\u660e/.test(d))
      return { id: "shaft-cable", name: "\u4e95\u9053\u7167\u660e\u7535\u7f06" };
    return { id: "other", name: "\u5176\u4ed6\u7269\u6599" };
  }

  function categoryId(item) {
    return (item.material || "") + "||" + (item.description || "");
  }

  function collectCategories(docs) {
    const map = new Map();
    (docs || []).forEach((doc) => {
      (doc.items || []).forEach((item) => {
        const id = categoryId(item);
        const fam = familyOf(item);
        const bomCount = (item.bom || []).length;
        if (!map.has(id)) {
          map.set(id, {
            id,
            familyId: fam.id,
            familyName: fam.name,
            material: item.material,
            description: item.description || "",
            count: 0,
            bomCount: 0,
            amount: 0,
          });
        }
        const row = map.get(id);
        row.count += 1;
        row.bomCount += bomCount;
        row.amount += Number(String(item.amount || "0").replace(/,/g, "")) || 0;
      });
    });
    const list = [...map.values()].sort((a, b) => {
      if (a.familyName !== b.familyName) return a.familyName.localeCompare(b.familyName, "zh");
      return b.count - a.count;
    });
    const families = [];
    const byFam = new Map();
    list.forEach((c) => {
      if (!byFam.has(c.familyId)) {
        const fam = { id: c.familyId, name: c.familyName, count: 0, bomCount: 0, categories: [] };
        byFam.set(c.familyId, fam);
        families.push(fam);
      }
      const fam = byFam.get(c.familyId);
      fam.categories.push(c);
      fam.count += c.count;
      fam.bomCount += c.bomCount;
    });
    return { list, families };
  }

  function normalizeDocs(docs) {
    (docs || []).forEach((doc) => {
      (doc.items || []).forEach((item) => {
        item.bom = (item.bom || []).map(normalizeBom);
        item.categoryId = categoryId(item);
        item.family = familyOf(item);
      });
    });
    return docs;
  }

  function parseItems(pageLineGroups) {
    const all = [];
    pageLineGroups.forEach((lines, i) => {
      contentBand(lines).forEach((ln) => {
        all.push(Object.assign({ page: i + 1 }, ln));
      });
    });

    const items = [];
    let current = null;
    let pendingBomDesc = false;

    function flush() {
      if (current) items.push(current);
      current = null;
      pendingBomDesc = false;
    }

    for (const ln of all) {
      const tNorm = ln.text.replace(/\s+/g, " ").trim();
      const m = tNorm.match(LINE_RE);
      if (m) {
        flush();
        current = {
          pos: m[1],
          material: m[2],
          arrDate: m[3],
          reqShippingDate: m[4] || "",
          qty: Number(m[5]),
          unit: "PC",
          price: m[6],
          amount: m[7],
          description: "",
          salesOrderRef: "",
          projectRef: "",
          shippingInstruction: "",
          rev: "",
          specs: [],
          bom: [],
          page: ln.page,
        };
        continue;
      }
      if (!current) continue;
      if (tNorm.startsWith("Sales order ref.")) {
        current.salesOrderRef = tNorm.replace("Sales order ref.", "").trim();
        continue;
      }
      if (tNorm.startsWith("Project ref.")) {
        current.projectRef = tNorm.replace("Project ref.", "").trim();
        continue;
      }
      if (tNorm.startsWith("Shipping instruction:")) {
        current.shippingInstruction = tNorm.split(":").slice(1).join(":").trim();
        continue;
      }
      if (tNorm.startsWith("REV#:")) {
        current.rev = tNorm.replace("REV#:", "").trim();
        continue;
      }
      if (tNorm === ".") continue;
      const bm = tNorm.match(BOM_RE);
      if (bm) {
        current.bom.push({
          pos: bm[1],
          material: bm[2],
          qty: bm[3],
          unit: "PC",
          description: "",
          remarks: [],
          remarkFields: {},
        });
        pendingBomDesc = true;
        continue;
      }
      if (/^\.1\s+0000$/.test(tNorm) || tNorm.startsWith("item:")) continue;
      if (current.bom.length && tNorm.startsWith("Remarks line")) {
        applyRemark(current.bom[current.bom.length - 1], tNorm);
        pendingBomDesc = true;
        continue;
      }
      if (pendingBomDesc && current.bom.length) {
        const last = current.bom[current.bom.length - 1];
        last.description = (last.description + " " + tNorm).trim();
        pendingBomDesc = false;
        continue;
      }
      if (tNorm.includes("/") && tNorm.endsWith("PC") && !current.description) {
        current.description = tNorm.split("/").slice(0, -1).join("/").trim();
        continue;
      }
      const spec = splitSpec(ln);
      if (spec) {
        if (spec.key.startsWith("Remarks line")) {
          if (current.bom.length) applyRemark(current.bom[current.bom.length - 1], tNorm);
          continue;
        }
        current.specs.push(spec);
      } else if (!current.description && tNorm && !tNorm.startsWith(".")) {
        current.description = tNorm;
      }
    }
    flush();
    return items;
  }

  function parseDocument(fileName, pages) {
    const pageLines = pages.map((p) => wordsToLines(p.words));
    const header = pageLines.length ? parseHeader(pageLines[0]) : {};
    const items = parseItems(pageLines);
    items.forEach((item) => {
      item.bom = (item.bom || []).map(normalizeBom);
      item.categoryId = categoryId(item);
      item.family = familyOf(item);
    });
    const sumAmount = Math.round(
      items.reduce((s, it) => s + Number(String(it.amount).replace(/,/g, "")), 0) * 100
    ) / 100;
    return {
      file: fileName,
      pages: pages.length,
      header,
      itemCount: items.length,
      sumAmount,
      items,
    };
  }

  function collectBomDescriptions(docs) {
    const map = new Map();
    (docs || []).forEach((doc) => {
      (doc.items || []).forEach((item) => {
        const seenOnItem = new Set();
        (item.bom || []).forEach((b) => {
          const desc = String(b.description || "").trim();
          if (!desc) return;
          if (!map.has(desc)) {
            map.set(desc, {
              description: desc,
              count: 0,
              itemCount: 0,
              materials: new Set(),
            });
          }
          const row = map.get(desc);
          row.count += 1;
          if (b.material) row.materials.add(b.material);
          if (!seenOnItem.has(desc)) {
            row.itemCount += 1;
            seenOnItem.add(desc);
          }
        });
      });
    });
    return [...map.values()]
      .map((r) => ({
        description: r.description,
        count: r.count,
        itemCount: r.itemCount,
        materials: [...r.materials],
      }))
      .sort((a, b) => b.itemCount - a.itemCount || a.description.localeCompare(b.description));
  }

  function formatBomPivot(bom) {
    const qty = (((bom && bom.qty) || "") + " " + ((bom && bom.unit) || "")).trim();
    const parts = [];
    if (bom && bom.material) parts.push(bom.material);
    if (qty) parts.push(qty);
    const rf = (bom && bom.remarkFields) || {};
    ["A", "B", "C", "D"].forEach((k) => {
      const v = rf[k];
      if (v == null || String(v).trim() === "" || String(v).trim() === "-") return;
      parts.push(k + "=" + String(v).trim());
    });
    return parts.join(" \u00b7 ");
  }

  function bomDescValue(item, description) {
    const want = String(description || "")
      .trim()
      .toLowerCase();
    if (!want) return "";
    const counts = new Map();
    ((item && item.bom) || []).forEach((b) => {
      if (
        String(b.description || "")
          .trim()
          .toLowerCase() !== want
      )
        return;
      const s = formatBomPivot(b);
      if (!s) return;
      counts.set(s, (counts.get(s) || 0) + 1);
    });
    return [...counts.entries()]
      .map(([s, n]) => (n > 1 ? s + " \u00d7" + n : s))
      .join(" | ");
  }

  function collectSpecKeys(docs) {
    const set = new Map();
    docs.forEach((doc) => {
      (doc.items || []).forEach((it) => {
        (it.specs || []).forEach((s) => {
          if (!s.key) return;
          set.set(s.key, (set.get(s.key) || 0) + 1);
        });
      });
    });
    return [...set.entries()]
      .sort((a, b) => b[1] - a[1])
      .map(([key, count]) => ({ key, count }));
  }

  function matchKeyword(text, keyword) {
    if (!keyword) return false;
    return String(text || "").toLowerCase().includes(String(keyword).toLowerCase());
  }

  function specValueForKeyword(item, keyword) {
    const hits = (item.specs || []).filter((s) => matchKeyword(s.key, keyword));
    if (!hits.length) return "";
    return hits
      .map((s) => {
        if (s.code && s.value) return s.code + " / " + s.value;
        return s.value || s.code || "";
      })
      .join(" | ");
  }

  function itemSearchBlob(item, header) {
    const bits = [
      header && header.poNumber,
      item.pos,
      item.material,
      item.description,
      item.salesOrderRef,
      item.projectRef,
      item.shippingInstruction,
      ...(item.specs || []).flatMap((s) => [s.key, s.code, s.value]),
      ...(item.bom || []).flatMap((b) => [b.material, b.description]),
    ];
    return bits.filter(Boolean).join(" ").toLowerCase();
  }

  const api = {
    parseDocument,
    collectSpecKeys,
    collectBomDescriptions,
    collectCategories,
    categoryId,
    familyOf,
    specValueForKeyword,
    bomDescValue,
    formatBomPivot,
    itemSearchBlob,
    matchKeyword,
    normalizeDocs,
    normalizeBom,
  };
  if (typeof module !== "undefined" && module.exports) module.exports = api;
  global.KonePoParser = api;
})(typeof window !== "undefined" ? window : globalThis);
