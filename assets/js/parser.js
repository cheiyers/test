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
        });
        pendingBomDesc = true;
        continue;
      }
      if (/^\.1\s+0000$/.test(tNorm) || tNorm.startsWith("item:")) continue;
      if (pendingBomDesc && current.bom.length) {
        if (tNorm.startsWith("Remarks line")) {
          current.bom[current.bom.length - 1].remarks.push(tNorm);
          continue;
        }
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
          if (current.bom.length) current.bom[current.bom.length - 1].remarks.push(tNorm);
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

  global.KonePoParser = {
    parseDocument,
    collectSpecKeys,
    specValueForKeyword,
    itemSearchBlob,
    matchKeyword,
  };
})(window);
