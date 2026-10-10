(function () {
  var STORAGE_KEY = "bom-calc-db-v1";

  function uid() {
    return Date.now().toString(36) + Math.random().toString(36).slice(2, 8);
  }

  function defaultDb() {
    return {
      version: 1,
      boms: [],
      materials: {},
      orders: [],
      profiles: [],
      resolutions: {},
      templates: [],
      prefs: {
        hideEmpty: false,
        mergeMode: "order",
        calcAmount: true,
        parentFields: ["parentCode", "parentName"],
        orderId: "",
        profileId: "",
        templateId: ""
      }
    };
  }

  function loadDb() {
    try {
      var raw = localStorage.getItem(STORAGE_KEY);
      if (!raw) return defaultDb();
      var parsed = JSON.parse(raw);
      var base = defaultDb();
      Object.keys(base).forEach(function (key) {
        if (parsed[key] == null) parsed[key] = base[key];
      });
      Object.keys(base.prefs).forEach(function (key) {
        if (parsed.prefs[key] == null) parsed.prefs[key] = base.prefs[key];
      });
      return parsed;
    } catch (error) {
      return defaultDb();
    }
  }

  var db = loadDb();
  var ui = { page: "bom", bomId: "", filter: "", formulaError: {}, showDetail: false, notice: "" };

  function save() {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(db));
  }

  function h(tag, props) {
    var node = document.createElement(tag);
    var kids = Array.prototype.slice.call(arguments, 2).reduce(function (all, kid) {
      return all.concat(kid);
    }, []);
    Object.keys(props || {}).forEach(function (key) {
      var value = props[key];
      if (value == null || value === false) return;
      if (key === "class") node.className = value;
      else if (key.indexOf("on") === 0 && typeof value === "function") node.addEventListener(key.slice(2).toLowerCase(), value);
      else node.setAttribute(key, value === true ? "" : value);
    });
    kids.forEach(function (kid) {
      if (kid == null || kid === false) return;
      node.appendChild(kid.nodeType ? kid : document.createTextNode(String(kid)));
    });
    return node;
  }

  function resolutionId(saved) {
    if (!saved) return "";
    return typeof saved === "string" ? saved : (saved.id || "");
  }

  function formatTime(iso) {
    if (!iso) return "";
    var date = new Date(iso);
    if (isNaN(date.getTime())) return iso;
    return date.toLocaleString("zh-CN", { hour12: false });
  }

  function syncMaterials() {
    db.boms.forEach(function (bom) {
      (bom.children || []).forEach(function (child) {
        if (!child.code) return;
        var current = db.materials[child.code];
        if (!current) {
          db.materials[child.code] = {
            name: child.name || "",
            spec: child.spec || "",
            attr: child.attr || "",
            warehouse: child.warehouse || "",
            unit: child.unit || "",
            price: "",
            userEdited: false
          };
          return;
        }
        if (current.userEdited) return;
        if (child.name) current.name = child.name;
        if (child.spec) current.spec = child.spec;
        if (child.attr) current.attr = child.attr;
        if (child.warehouse) current.warehouse = child.warehouse;
        if (child.unit) current.unit = child.unit;
      });
    });
  }

  function materialCodes() {
    var codes = {};
    db.boms.forEach(function (bom) {
      (bom.children || []).forEach(function (child) {
        if (child.code) codes[child.code] = true;
      });
    });
    return Object.keys(codes).sort();
  }

  function allParams() {
    var found = [];
    db.boms.forEach(function (bom) {
      Calc.bomParams(bom).forEach(function (name) {
        if (found.indexOf(name) < 0) found.push(name);
      });
    });
    return found;
  }

  function paramUsage(name) {
    return db.boms.filter(function (bom) {
      return Calc.bomParams(bom).indexOf(name) >= 0;
    }).map(function (bom) { return bom.parent.code || "未填料号"; });
  }

  function sheetRows(sheet) {
    var ref = sheet["!ref"];
    if (!ref) return [];
    var range = XLSX.utils.decode_range(ref);
    var rows = [];
    for (var r = range.s.r; r <= range.e.r; r++) {
      var row = [];
      for (var c = range.s.c; c <= range.e.c; c++) {
        var cell = sheet[XLSX.utils.encode_cell({ r: r, c: c })];
        if (!cell) row.push("");
        else if (cell.f) row.push(cell.f.charAt(0) === "=" ? cell.f : "=" + cell.f);
        else row.push(cell.v == null ? "" : cell.v);
      }
      rows.push(row);
    }
    return rows;
  }

  function readWorkbook(file) {
    return file.arrayBuffer().then(function (buf) {
      return XLSX.read(buf, { type: "array", cellFormula: true });
    });
  }

  function importBoms(workbook, fileName) {
    var now = new Date().toISOString();
    var count = 0;
    workbook.SheetNames.forEach(function (name) {
      Calc.parseGrid(sheetRows(workbook.Sheets[name]), name).forEach(function (parsed) {
        db.boms.push({
          id: uid(),
          sourceFile: fileName,
          sheetName: name,
          uploadedAt: now,
          parent: parsed.parent,
          children: parsed.children
        });
        count++;
      });
    });
    syncMaterials();
    save();
    return count;
  }

  function headersFromRow(row) {
    var used = {};
    return row.map(function (cell, index) {
      var name = Calc.text(cell) || ("列" + (index + 1));
      if (used[name]) name = name + " (" + (index + 1) + ")";
      used[name] = true;
      return name;
    });
  }

  function importOrders(workbook, fileName) {
    var count = 0;
    workbook.SheetNames.forEach(function (name) {
      var rows = sheetRows(workbook.Sheets[name]);
      if (!rows.length) return;
      var headers = headersFromRow(rows[0] || []);
      var records = [];
      rows.slice(1).forEach(function (row, index) {
        if (!row.some(function (cell) { return Calc.text(cell) !== ""; })) return;
        var record = { __row: index + 2 };
        headers.forEach(function (header, column) { record[header] = row[column] == null ? "" : row[column]; });
        records.push(record);
      });
      if (!records.length) return;
      db.orders.push({
        id: uid(),
        name: fileName + (workbook.SheetNames.length > 1 ? " / " + name : ""),
        uploadedAt: new Date().toISOString(),
        headers: headers,
        rows: records
      });
      count++;
    });
    if (count && !db.prefs.orderId) db.prefs.orderId = db.orders[db.orders.length - 1].id;
    save();
    return count;
  }

  function orderById(id) {
    return db.orders.filter(function (order) { return order.id === id; })[0];
  }

  function profileById(id) {
    return db.profiles.filter(function (profile) { return profile.id === id; })[0];
  }

  function templateById(id) {
    return db.templates.filter(function (template) { return template.id === id; })[0];
  }

  function currentColumns() {
    var template = templateById(db.prefs.templateId);
    if (template && template.columns.length) return template.columns;
    return Calc.defaultColumns(db.prefs.parentFields);
  }

  function viewRows() {
    if (!ui.result || ui.result.conflicts.length || ui.result.missingParams.length) return [];
    var rows = Calc.aggregate(ui.result.lines, db.prefs.mergeMode);
    rows = Calc.applyMaterials(rows, db.materials, db.prefs.calcAmount);
    rows = Calc.filterRows(rows, db.prefs.hideEmpty);
    rows.sort(function (a, b) {
      return String(a.orderNo).localeCompare(String(b.orderNo), "zh") || String(a.materialCode).localeCompare(String(b.materialCode), "zh");
    });
    return rows;
  }

  function runCalc() {
    var order = orderById(db.prefs.orderId);
    var profile = profileById(db.prefs.profileId);
    ui.notice = "";
    if (!order || !profile) {
      ui.notice = "请先选择一份订单和一套匹配方案。";
      ui.result = null;
      return;
    }
    if (!profile.parentColumn) {
      ui.notice = "匹配方案里还没有指定母件料号列。";
      ui.result = null;
      return;
    }
    if (db.prefs.mergeMode === "order" && !profile.orderColumn) {
      ui.notice = "按订单分开时，需要在匹配方案里指定订单号列。";
      ui.result = null;
      return;
    }
    ui.result = Calc.calculate({
      boms: db.boms,
      rows: order.rows,
      profile: profile,
      resolution: db.resolutions
    });
  }

  function render() {
    var active = document.activeElement;
    var focusId = active && active.id;
    var selection = active && typeof active.selectionStart === "number" ? active.selectionStart : null;
    var root = document.getElementById("app");
    root.innerHTML = "";
    root.appendChild(h("div", { class: "app" }, sidebar(), h("main", { class: "main" }, page())));
    if (focusId) {
      var next = document.getElementById(focusId);
      if (next) {
        next.focus();
        if (selection != null && next.setSelectionRange) {
          try { next.setSelectionRange(selection, selection); } catch (error) { /* number inputs */ }
        }
      }
    }
  }

  function sidebar() {
    var items = [
      ["bom", "BOM 库"],
      ["price", "物料单价"],
      ["order", "订单"],
      ["profile", "匹配方案"],
      ["calc", "计算导出"]
    ];
    return h("aside", { class: "sidebar" },
      h("div", { class: "brand" }, h("div", { class: "mark" }, "算"), h("div", {}, h("strong", {}, "算料"), h("small", {}, "按母件展开订单"))),
      h("nav", { class: "nav" }, items.map(function (item) {
        return h("button", { type: "button", class: ui.page === item[0] ? "active" : "", onclick: function () { ui.page = item[0]; ui.notice = ""; render(); } }, item[1]);
      })),
      h("div", { class: "side-foot" },
        h("button", { type: "button", onclick: downloadBackup }, "导出备份"),
        h("label", { class: "file" }, h("input", { type: "file", accept: "application/json", onchange: importBackup }), h("button", { type: "button", onclick: function (event) { event.target.parentNode.querySelector("input").click(); } }, "导入备份"))
      )
    );
  }

  function page() {
    if (ui.page === "price") return pricePage();
    if (ui.page === "order") return orderPage();
    if (ui.page === "profile") return profilePage();
    if (ui.page === "calc") return calcPage();
    if (ui.bomId) return bomDetail(db.boms.filter(function (bom) { return bom.id === ui.bomId; })[0]);
    return bomList();
  }

  function pageHead(title, text, actions) {
    return h("div", { class: "page-head" }, h("div", {}, h("h1", {}, title), h("p", {}, text)), h("div", { class: "row" }, actions || []));
  }

  function notice() {
    if (!ui.notice) return null;
    return h("div", { class: "notice" }, ui.notice);
  }

  function fileButton(label, accept, primary, onload, id) {
    var input = h("input", {
      type: "file",
      id: id || null,
      accept: accept,
      onchange: function (event) {
        var file = event.target.files && event.target.files[0];
        event.target.value = "";
        if (!file) return;
        onload(file);
      }
    });
    return h("label", { class: "file" }, input, h("button", {
      type: "button",
      class: primary ? "btn-primary" : "btn",
      onclick: function (event) {
        event.preventDefault();
        event.stopPropagation();
        event.currentTarget.parentNode.querySelector("input").click();
      }
    }, label));
  }

  function bomList() {
    var filter = ui.filter.trim().toLowerCase();
    var boms = db.boms.filter(function (bom) {
      if (!filter) return true;
      return (bom.parent.code + " " + bom.parent.name + " " + (bom.sourceFile || "")).toLowerCase().indexOf(filter) >= 0;
    });
    return [
      pageHead("BOM 库", "上传 Excel 后，每个「母件」到下一个母件之前算一份 BOM。没有母件的工作表会忽略。", [
        fileButton("上传 BOM", ".xlsx,.xls", true, function (file) {
          readWorkbook(file).then(function (workbook) {
            var count = importBoms(workbook, file.name);
            ui.notice = count ? "识别出 " + count + " 份 BOM。" : "这个文件里没有找到母件。";
            render();
          }).catch(function (error) { ui.notice = "无法读取文件：" + error.message; render(); });
        }, "bom-file"),
        h("button", { type: "button", class: "btn", onclick: createBom }, "新建 BOM"),
        h("button", { type: "button", class: "btn", onclick: loadSampleBoms }, "导入示例")
      ]),
      notice(),
      h("div", { class: "filters" }, h("input", {
        id: "bom-filter",
        placeholder: "搜索母件料号、名称或文件名",
        value: ui.filter,
        oninput: function (event) { ui.filter = event.target.value; render(); }
      })),
      boms.length ? h("div", { class: "table-wrap" }, h("table", {},
        h("thead", {}, h("tr", {}, ["母件料号", "母件名称", "子件", "参数", "来源", "上传时间", ""].map(function (name) { return h("th", {}, name); }))),
        h("tbody", {}, boms.map(function (bom) {
          return h("tr", { class: "click", onclick: function () { ui.bomId = bom.id; render(); } },
            h("td", {}, bom.parent.code || "未填"),
            h("td", {}, bom.parent.name || ""),
            h("td", {}, String((bom.children || []).length)),
            h("td", {}, Calc.bomParams(bom).join("、") || "常数"),
            h("td", {}, (bom.sourceFile || "手工新建") + (bom.sheetName ? " / " + bom.sheetName : "")),
            h("td", {}, formatTime(bom.uploadedAt)),
            h("td", {}, h("button", { type: "button", class: "btn-danger", onclick: function (event) { event.stopPropagation(); deleteBom(bom.id); } }, "删除"))
          );
        }))
      )) : h("div", { class: "card empty" }, "还没有 BOM。上传 Excel，或先导入示例。")
    ];
  }

  function createBom() {
    var bom = {
      id: uid(),
      sourceFile: "手工新建",
      sheetName: "",
      uploadedAt: new Date().toISOString(),
      parent: Calc.emptyRow({ level: "母件", qty: 1 }),
      children: [Calc.emptyRow({ level: "1级子件", qty: 1 })]
    };
    db.boms.push(bom);
    save();
    ui.bomId = bom.id;
    render();
  }

  function deleteBom(id) {
    var bom = db.boms.filter(function (item) { return item.id === id; })[0];
    if (!bom || !confirm("删除 BOM「" + Calc.parentLabel(bom) + "」？")) return;
    db.boms = db.boms.filter(function (item) { return item.id !== id; });
    if (ui.bomId === id) ui.bomId = "";
    syncMaterials();
    save();
    render();
  }

  function loadSampleBoms() {
    var added = 0;
    (window.SAMPLE_BOMS || []).forEach(function (sample) {
      var exists = db.boms.some(function (bom) {
        return bom.sourceFile === "示例 BOM.xlsx" && bom.parent.code === sample.parent.code && bom.sheetName === sample.sheetName;
      });
      if (exists) return;
      db.boms.push({
        id: uid(),
        sourceFile: "示例 BOM.xlsx",
        sheetName: sample.sheetName,
        uploadedAt: new Date().toISOString(),
        parent: JSON.parse(JSON.stringify(sample.parent)),
        children: JSON.parse(JSON.stringify(sample.children))
      });
      added++;
    });
    syncMaterials();
    save();
    ui.notice = added ? "已导入 " + added + " 份示例 BOM。" : "示例 BOM 已经在库里。";
    render();
  }

  function bomDetail(bom) {
    if (!bom) { ui.bomId = ""; return bomList(); }
    var params = Calc.bomParams(bom);
    var errors = Calc.bomParamErrors(bom);
    return [
      pageHead(bom.parent.code || "新建 BOM", "最终数量 = 数量 × 备注结果。数量留空时按 1 计算。损耗率只保存，不参与计算。", [
        h("button", { type: "button", class: "btn", onclick: function () { ui.bomId = ""; render(); } }, "返回列表"),
        h("button", { type: "button", class: "btn-danger", onclick: function () { deleteBom(bom.id); } }, "删除这份 BOM")
      ]),
      notice(),
      h("section", { class: "card" },
        h("h2", {}, "母件"),
        h("div", { class: "grid" }, ["code", "name", "spec", "attr", "warehouse", "unit"].map(function (key) {
          var labels = { code: "母件料号", name: "母件名称", spec: "规格", attr: "辅助属性", warehouse: "仓库", unit: "单位" };
          return h("label", { class: "field" }, h("span", {}, labels[key]), h("input", {
            id: "parent-" + key,
            value: bom.parent[key] || "",
            oninput: function (event) { bom.parent[key] = event.target.value; save(); }
          }));
        })),
        h("p", { class: "muted" }, "来源：" + (bom.sourceFile || "手工新建") + (bom.sheetName ? " / " + bom.sheetName : "") + " · " + formatTime(bom.uploadedAt)),
        h("div", { class: "tags" }, params.length ? params.map(function (name) { return h("span", { class: "tag" }, name); }) : [h("span", { class: "tag" }, "备注里没有参数")])
      ),
      errors.length ? h("div", { class: "warn" }, "有备注公式无法识别：" + errors.map(function (item) { return item.code + " " + item.error; }).join("；")) : null,
      h("section", { class: "card" },
        h("div", { class: "page-head" }, h("h2", {}, "子件"), h("button", { type: "button", class: "btn", onclick: function () {
          bom.children.push(Calc.emptyRow({ level: "1级子件", qty: 1 }));
          syncMaterials();
          save();
          render();
        } }, "增加子件")),
        h("div", { class: "table-wrap" }, childTable(bom))
      )
    ];
  }

  function childTable(bom) {
    var columns = [
      ["level", "级次"],
      ["code", "物料代码"],
      ["name", "物料名称"],
      ["spec", "规格"],
      ["attr", "辅助属性"],
      ["warehouse", "仓库"],
      ["unit", "单位"],
      ["qty", "数量"],
      ["loss", "损耗率%"],
      ["remark", "备注"]
    ];
    return h("table", { class: "table" },
      h("thead", {}, h("tr", {}, columns.map(function (column) { return h("th", {}, column[1]); }).concat(h("th", {}, "")))),
      h("tbody", {}, bom.children.map(function (child, index) {
        return h("tr", {}, columns.map(function (column) {
          var key = column[0];
          var props = {
            id: "child-" + index + "-" + key,
            oninput: function (event) {
              child[key] = key === "qty" ? (event.target.value === "" ? "" : event.target.value) : event.target.value;
              if (key === "qty" && child.qty !== "" && /^-?\d+(\.\d+)?$/.test(String(child.qty))) child.qty = Number(child.qty);
              save();
              if (key === "code") syncMaterials();
            }
          };
          if (key === "remark") return h("td", {}, h("textarea", Object.assign({ class: "remark" }, props), child.remark == null ? "" : String(child.remark)));
          props.value = child[key] == null ? "" : String(child[key]);
          return h("td", {}, h("input", props));
        }).concat(h("td", {}, h("button", { type: "button", class: "btn-danger", onclick: function () {
          bom.children.splice(index, 1);
          syncMaterials();
          save();
          render();
        } }, "删除"))));
      }))
    );
  }

  function pricePage() {
    var filter = ui.filter.trim().toLowerCase();
    var codes = materialCodes().filter(function (code) {
      var material = db.materials[code] || {};
      return !filter || (code + " " + (material.name || "")).toLowerCase().indexOf(filter) >= 0;
    });
    return [
      pageHead("物料单价", "同一个物料代码只有一个单价，在这里填写。导出时可以选择算不算金额。", []),
      notice(),
      h("div", { class: "filters" }, h("input", {
        id: "price-filter",
        placeholder: "搜索物料代码或名称",
        value: ui.filter,
        oninput: function (event) { ui.filter = event.target.value; render(); }
      })),
      codes.length ? h("div", { class: "table-wrap" }, h("table", { class: "table" },
        h("thead", {}, h("tr", {}, ["物料代码", "物料名称", "规格", "单位", "仓库", "单价"].map(function (name) { return h("th", {}, name); }))),
        h("tbody", {}, codes.map(function (code) {
          var material = db.materials[code];
          function bind(key) {
            return {
              value: material[key] == null ? "" : String(material[key]),
              oninput: function (event) {
                material[key] = event.target.value;
                if (key !== "price") material.userEdited = true;
                save();
              }
            };
          }
          return h("tr", {},
            h("td", {}, code),
            h("td", {}, h("input", bind("name"))),
            h("td", {}, h("input", bind("spec"))),
            h("td", {}, h("input", bind("unit"))),
            h("td", {}, h("input", bind("warehouse"))),
            h("td", {}, h("input", Object.assign({ id: "price-" + code }, bind("price"), { placeholder: "留空则金额为空" })))
          );
        }))
      )) : h("div", { class: "card empty" }, "BOM 里还没有子件。先上传或新建 BOM。")
    ];
  }

  function orderPage() {
    var selected = orderById(ui.orderView || db.prefs.orderId) || db.orders[0];
    return [
      pageHead("订单", "每一行是一条需求。你在匹配方案里指定哪一列是母件料号，哪一列是订单号。", [
        fileButton("上传订单", ".xlsx,.xls,.csv", true, function (file) {
          readWorkbook(file).then(function (workbook) {
            var count = importOrders(workbook, file.name);
            ui.notice = count ? "已导入 " + count + " 份订单。" : "没有读到数据行。";
            ui.orderView = db.prefs.orderId;
            render();
          }).catch(function (error) { ui.notice = "无法读取文件：" + error.message; render(); });
        }),
        h("button", { type: "button", class: "btn", onclick: loadSampleOrders }, "导入示例订单")
      ]),
      notice(),
      db.orders.length ? h("div", { class: "split" },
        h("div", {}, db.orders.map(function (order) {
          return h("button", {
            type: "button",
            class: "list-btn" + (selected && selected.id === order.id ? " active" : ""),
            onclick: function () { ui.orderView = order.id; db.prefs.orderId = order.id; save(); render(); }
          }, h("strong", {}, order.name), h("div", { class: "muted" }, order.rows.length + " 行 · " + formatTime(order.uploadedAt)),
            h("div", { class: "row" }, h("span", {
              class: "btn-danger",
              onclick: function (event) {
                event.stopPropagation();
                if (!confirm("删除这份订单？")) return;
                db.orders = db.orders.filter(function (item) { return item.id !== order.id; });
                if (db.prefs.orderId === order.id) db.prefs.orderId = db.orders.length ? db.orders[0].id : "";
                save();
                render();
              }
            }, "删除")));
        })),
        selected ? h("div", { class: "table-wrap" }, h("table", {},
          h("thead", {}, h("tr", {}, selected.headers.map(function (header) { return h("th", {}, header); }))),
          h("tbody", {}, selected.rows.slice(0, 300).map(function (row) {
            return h("tr", {}, selected.headers.map(function (header) { return h("td", {}, row[header] == null ? "" : String(row[header])); }));
          }))
        )) : null
      ) : h("div", { class: "card empty" }, "还没有订单。上传 Excel，第一行作为表头。")
    ];
  }

  function loadSampleOrders() {
    var headers = ["订单号", "母件料号", "系列", "长度", "LF18数量", "LF71S数量", "BB", "BK", "TK", "套数"];
    var matrix = [
      ["SO001", "HL0230002C", "LF18", 1500, 2, 0, 0, "", "", ""],
      ["SO001", "HL0230002C", "LF18", 900, 1, 0, 0, "", "", ""],
      ["SO002", "HL0230030X", "", "", "", "", "", 1000, 1200, ""],
      ["SO003", "NO-SUCH", "", "", "", "", "", "", "", ""]
    ];
    var existing = db.orders.filter(function (order) { return order.name === "示例订单"; })[0];
    var records = matrix.map(function (row, index) {
      var record = { __row: index + 2 };
      headers.forEach(function (header, column) { record[header] = row[column]; });
      return record;
    });
    if (existing) {
      existing.headers = headers;
      existing.rows = records;
      existing.uploadedAt = new Date().toISOString();
    } else {
      existing = { id: uid(), name: "示例订单", uploadedAt: new Date().toISOString(), headers: headers, rows: records };
      db.orders.push(existing);
    }
    db.prefs.orderId = existing.id;
    var profile = db.profiles.filter(function (item) { return item.name === "示例匹配"; })[0];
    if (!profile) {
      profile = {
        id: uid(),
        name: "示例匹配",
        parentColumn: "母件料号",
        orderColumn: "订单号",
        params: {
          LHLB: { mode: "column", column: "系列", formula: "" },
          LENGTH: { mode: "formula", column: "", formula: "[长度]" },
          N1LF18: { mode: "column", column: "LF18数量", formula: "" },
          N1LF71S: { mode: "column", column: "LF71S数量", formula: "" },
          BB: { mode: "column", column: "BB", formula: "" },
          BK: { mode: "column", column: "BK", formula: "" },
          TK: { mode: "column", column: "TK", formula: "" }
        }
      };
      db.profiles.push(profile);
    }
    db.prefs.profileId = profile.id;
    save();
    ui.notice = "已导入示例订单，并准备好「示例匹配」。长度使用公式 [长度]。";
    ui.orderView = existing.id;
    render();
  }

  function profilePage() {
    var selected = profileById(ui.profileId || db.prefs.profileId) || db.profiles[0];
    var headerSource = orderById(db.prefs.orderId) || db.orders[0];
    var headers = headerSource ? headerSource.headers : [];
    return [
      pageHead("匹配方案", "先把母件料号、订单号对应到订单列。每个参数可以取某一列，或写公式。公式用 [列名] 引用同一行的其他列。", [
        h("button", { type: "button", class: "btn-primary", onclick: function () {
          var profile = { id: uid(), name: "匹配方案 " + (db.profiles.length + 1), parentColumn: "", orderColumn: "", params: {} };
          db.profiles.push(profile);
          db.prefs.profileId = profile.id;
          ui.profileId = profile.id;
          save();
          render();
        } }, "新建方案")
      ]),
      notice(),
      db.profiles.length ? h("div", { class: "split" },
        h("div", {}, db.profiles.map(function (profile) {
          return h("button", {
            type: "button",
            class: "list-btn" + (selected && selected.id === profile.id ? " active" : ""),
            onclick: function () { ui.profileId = profile.id; db.prefs.profileId = profile.id; save(); render(); }
          }, profile.name);
        })),
        selected ? profileEditor(selected, headers) : null
      ) : h("div", { class: "card empty" }, "还没有匹配方案。新建一套后可以反复使用。")
    ];
  }

  function profileEditor(profile, headers) {
    function paramSpec(name) {
      if (!profile.params[name]) profile.params[name] = { mode: "column", column: "", formula: "" };
      return profile.params[name];
    }
    return h("section", { class: "card" },
      h("label", { class: "field" }, h("span", {}, "方案名称"), h("input", {
        id: "profile-name",
        value: profile.name,
        oninput: function (event) { profile.name = event.target.value; save(); }
      })),
      h("div", { class: "grid" },
        h("label", { class: "field" }, h("span", {}, "母件料号列"), h("select", {
          id: "profile-parent",
          onchange: function (event) { profile.parentColumn = event.target.value; save(); render(); }
        }, selectOptions(headers, profile.parentColumn, "选择列"))),
        h("label", { class: "field" }, h("span", {}, "订单号列"), h("select", {
          id: "profile-order",
          onchange: function (event) { profile.orderColumn = event.target.value; save(); render(); }
        }, selectOptions(headers, profile.orderColumn, "选择列")))
      ),
      h("p", { class: "muted" }, headers.length ? "列名来自当前订单。" : "还没有订单，列名暂时为空。可以先写公式。"),
      h("div", { class: "table-wrap" }, h("table", { class: "table" },
        h("thead", {}, h("tr", {}, ["参数", "用在", "取值", "订单列或公式"].map(function (name) { return h("th", {}, name); }))),
        h("tbody", {}, allParams().map(function (name) {
          var spec = paramSpec(name);
          return h("tr", {},
            h("td", {}, name),
            h("td", { class: "muted" }, paramUsage(name).join("、")),
            h("td", {}, h("select", {
              onchange: function (event) {
                spec.mode = event.target.value;
                if (spec.mode === "formula" && !spec.formula && spec.column) spec.formula = "[" + spec.column + "]";
                save();
                render();
              }
            }, selectOptions([{ value: "column", label: "取订单列" }, { value: "formula", label: "用公式" }], spec.mode))),
            h("td", {}, spec.mode === "formula"
              ? h("div", {}, h("input", {
                id: "formula-" + name,
                value: spec.formula || "",
                placeholder: "例如 IF([系列]=\"LF18\",[下单数量],0)",
                oninput: function (event) { spec.formula = event.target.value; save(); },
                onblur: function () {
                  try { if (spec.formula) Formula.parse(spec.formula); ui.formulaError[name] = ""; }
                  catch (error) { ui.formulaError[name] = error.message; }
                  render();
                }
              }), ui.formulaError[name] ? h("div", { class: "error" }, ui.formulaError[name]) : null)
              : h("select", {
                onchange: function (event) { spec.column = event.target.value; save(); }
              }, selectOptions(headers, spec.column, "选择列")))
          );
        }))
      )),
      h("button", { type: "button", class: "btn-danger", onclick: function () {
        if (!confirm("删除匹配方案「" + profile.name + "」？")) return;
        db.profiles = db.profiles.filter(function (item) { return item.id !== profile.id; });
        if (db.prefs.profileId === profile.id) db.prefs.profileId = db.profiles.length ? db.profiles[0].id : "";
        ui.profileId = db.prefs.profileId;
        save();
        render();
      } }, "删除方案")
    );
  }

  function selectOptions(list, selected, placeholder) {
    var nodes = [];
    if (placeholder) nodes.push(h("option", { value: "", selected: selected ? null : true }, placeholder));
    list.forEach(function (item) {
      var value = typeof item === "string" ? item : item.value;
      var label = typeof item === "string" ? item : item.label;
      nodes.push(h("option", { value: value, selected: value === selected ? true : null }, label));
    });
    return nodes;
  }

  function calcPage() {
    var rows = viewRows();
    var columns = currentColumns();
    return [
      pageHead("计算导出", "匹配母件后计算子件数量，再按你的规则合并、计价并导出。", [
        h("button", { type: "button", class: "btn-primary", id: "calc-run", onclick: function () { runCalc(); render(); } }, "开始计算")
      ]),
      notice(),
      h("section", { class: "card" },
        h("div", { class: "grid" },
          h("label", { class: "field" }, h("span", {}, "订单"), h("select", {
            id: "calc-order",
            onchange: function (event) { db.prefs.orderId = event.target.value; save(); render(); }
          }, selectOptions(db.orders.map(function (order) { return { value: order.id, label: order.name }; }), db.prefs.orderId, "选择订单"))),
          h("label", { class: "field" }, h("span", {}, "匹配方案"), h("select", {
            id: "calc-profile",
            onchange: function (event) { db.prefs.profileId = event.target.value; save(); render(); }
          }, selectOptions(db.profiles.map(function (profile) { return { value: profile.id, label: profile.name }; }), db.prefs.profileId, "选择方案")))
        ),
        h("div", { class: "inline" },
          h("label", { class: "check" }, h("input", { type: "radio", name: "merge", checked: db.prefs.mergeMode === "order" ? true : null, onchange: function () { db.prefs.mergeMode = "order"; save(); render(); } }), h("span", {}, "按订单分开，同一订单里相同物料数量相加")),
          h("label", { class: "check" }, h("input", { type: "radio", name: "merge", checked: db.prefs.mergeMode === "all" ? true : null, onchange: function () { db.prefs.mergeMode = "all"; save(); render(); } }), h("span", {}, "全部订单合并相同物料"))
        ),
        h("div", { class: "inline" },
          h("label", { class: "check" }, h("input", { type: "checkbox", id: "hide-empty", checked: db.prefs.hideEmpty ? true : null, onchange: function (event) { db.prefs.hideEmpty = event.target.checked; save(); render(); } }), h("span", {}, "不显示数量为 0 或空白的行")),
          h("label", { class: "check" }, h("input", { type: "checkbox", id: "calc-amount", checked: db.prefs.calcAmount ? true : null, onchange: function (event) { db.prefs.calcAmount = event.target.checked; save(); render(); } }), h("span", {}, "计算金额（数量 × 单价）"))
        ),
        h("div", {}, h("div", { class: "muted" }, "要保留的母件字段。一行来自多个母件时，这些列留空。"),
          h("div", { class: "inline" }, Calc.EXPORT_FIELDS.filter(function (field) { return Calc.PARENT_FIELDS.indexOf(field.id) >= 0; }).map(function (field) {
            var checked = db.prefs.parentFields.indexOf(field.id) >= 0;
            return h("label", { class: "check" }, h("input", {
              type: "checkbox",
              checked: checked ? true : null,
              onchange: function (event) {
                var list = db.prefs.parentFields.filter(function (id) { return id !== field.id; });
                if (event.target.checked) list.push(field.id);
                db.prefs.parentFields = list;
                save();
                render();
              }
            }), h("span", {}, field.label));
          })))
      ),
      conflictPanel(),
      missingPanel(),
      resultPanel(rows, columns),
      templatePanel()
    ];
  }

  function conflictPanel() {
    if (!ui.result || !ui.result.conflicts.length) return null;
    return h("section", { class: "card" },
      h("h2", {}, "母件料号冲突"),
      h("p", { class: "muted" }, "下面这些料号对应了多份 BOM。请指定本次用哪一份，系统不会自动拿最后上传的。"),
      ui.result.unmatched && ui.result.unmatched.length ? h("div", { class: "warn", id: "unmatched" }, "未匹配 " + ui.result.unmatched.length + " 行，计算前先处理冲突。") : null,
      ui.result.conflicts.map(function (conflict) {
        return h("div", {},
          h("strong", {}, conflict.parentCode),
          h("div", { class: "choices" }, conflict.boms.map(function (bom) {
            return h("label", { class: "choice" },
              h("input", {
                type: "radio",
                name: "conflict-" + conflict.parentCode,
                checked: resolutionId(db.resolutions[conflict.parentCode]) === bom.id ? true : null,
                onchange: function () {
                  db.resolutions[conflict.parentCode] = {
                    id: bom.id,
                    signature: conflict.boms.map(function (item) { return item.id; }).sort().join("|")
                  };
                  save();
                }
              }),
              h("span", {}, bom.label + " · 子件 " + bom.childCount + " · " + (bom.sourceFile || "") + " " + formatTime(bom.uploadedAt))
            );
          }))
        );
      }),
      h("button", { type: "button", class: "btn-primary", id: "conflict-continue", onclick: function () {
        var pending = ui.result.conflicts.some(function (conflict) { return !resolutionId(db.resolutions[conflict.parentCode]); });
        if (pending) { ui.notice = "还有母件没有指定用哪一份 BOM。"; render(); return; }
        runCalc();
        render();
      } }, "按所选 BOM 继续计算")
    );
  }

  function missingPanel() {
    if (!ui.result || !ui.result.missingParams.length) return null;
    return h("section", { class: "warn" }, "这些母件的参数还没配置，对应订单行已跳过：" + ui.result.missingParams.map(function (item) {
      return item.parentCode + "（" + item.params.join("、") + "）";
    }).join("；"));
  }

  function resultPanel(rows, columns) {
    if (!ui.result) return h("div", { class: "card empty" }, "选择订单和匹配方案后开始计算。");
    if (ui.result.conflicts.length) return null;
    var unmatched = ui.result.unmatched || [];
    var grouped = {};
    unmatched.forEach(function (item) {
      var key = item.parentCode || "（空料号）";
      if (!grouped[key]) grouped[key] = [];
      grouped[key].push(item.sourceRow);
    });
    return h("section", { class: "card" },
      h("div", { class: "stats" },
        stat("导出", rows.length),
        stat("合并前", ui.result.lines.length),
        stat("未匹配", unmatched.length),
        stat("公式错误", ui.result.errors.length)
      ),
      unmatched.length ? h("div", { class: "warn", id: "unmatched" }, "未匹配的母件料号：" + Object.keys(grouped).map(function (code) {
        return code + "（第 " + grouped[code].join("、") + " 行）";
      }).join("；")) : h("div", { class: "ok" }, "订单行都已匹配到 BOM。"),
      ui.result.errors.length ? h("div", { class: "warn" }, ui.result.errors.slice(0, 8).map(function (error) {
        return "第 " + error.sourceRow + " 行 " + (error.materialCode || "") + " " + error.message;
      }).join("；")) : null,
      h("div", { class: "table-wrap" }, h("table", { id: "result-table" },
        h("thead", {}, h("tr", {}, columns.map(function (column) { return h("th", {}, column.header); }))),
        h("tbody", {}, rows.length ? Calc.projectRows(rows, columns, db.prefs.parentFields).map(function (line, index) {
          return h("tr", { "data-code": rows[index].materialCode }, line.map(function (value, cell) {
            var field = columns[cell].field;
            var klass = field === "qty" || field === "price" || field === "amount" ? "num" : "";
            if (field === "qty" && (value === 0 || value === "" || value == null)) klass += " zero";
            return h("td", { class: klass }, value == null ? "" : String(value));
          }));
        }) : [h("tr", {}, h("td", { colspan: String(columns.length) }, "没有可导出的行。"))])
      )),
      h("label", { class: "check" }, h("input", {
        type: "checkbox",
        checked: ui.showDetail ? true : null,
        onchange: function (event) { ui.showDetail = event.target.checked; render(); }
      }), h("span", {}, "显示合并前明细")),
      ui.showDetail ? h("div", { class: "table-wrap" }, h("table", {},
        h("thead", {}, h("tr", {}, ["行", "订单号", "母件料号", "物料代码", "数量"].map(function (name) { return h("th", {}, name); }))),
        h("tbody", {}, ui.result.lines.map(function (line) {
          return h("tr", {},
            h("td", {}, String(line.sourceRow)),
            h("td", {}, line.orderNo || ""),
            h("td", {}, line.parentCode || ""),
            h("td", {}, line.materialCode || ""),
            h("td", { class: "num" }, line.qty == null ? "" : String(line.qty))
          );
        }))
      )) : null,
      h("div", { class: "row" }, h("button", {
        type: "button",
        class: "btn-primary",
        id: "export-xlsx",
        disabled: rows.length ? null : true,
        onclick: function () { exportResult(rows, columns); }
      }, "导出 Excel"))
    );
  }

  function stat(label, value) {
    return h("div", { class: "stat" }, h("span", { class: "muted" }, label), h("b", {}, String(value)));
  }

  function templatePanel() {
    var selected = templateById(db.prefs.templateId);
    return h("section", { class: "card" },
      h("h2", {}, "导出格式"),
      h("p", { class: "muted" }, "不选模板时，按上面勾选的母件字段和默认列导出。上传模板则用第一行表头，再把每一列对应到系统字段。"),
      h("div", { class: "row" },
        h("select", {
          id: "template-select",
          onchange: function (event) { db.prefs.templateId = event.target.value; save(); render(); }
        }, selectOptions([{ value: "", label: "使用默认列" }].concat(db.templates.map(function (template) {
          return { value: template.id, label: template.name };
        })), db.prefs.templateId)),
        fileButton("上传模板", ".xlsx,.xls", false, function (file) {
          readWorkbook(file).then(function (workbook) {
            var rows = sheetRows(workbook.Sheets[workbook.SheetNames[0]]);
            var headers = headersFromRow(rows[0] || []).filter(function (header) { return header && header.indexOf("列") !== 0; });
            if (!headers.length) { ui.notice = "模板第一行没有表头。"; render(); return; }
            var template = {
              id: uid(),
              name: file.name.replace(/\.(xlsx|xls)$/i, ""),
              columns: headers.map(function (header) {
                var known = Calc.EXPORT_FIELDS.filter(function (field) { return field.label === header; })[0];
                return { header: header, field: known ? known.id : "" };
              })
            };
            db.templates.push(template);
            db.prefs.templateId = template.id;
            save();
            ui.notice = "已按第一行建立导出模板。请检查列和系统字段的对应。";
            render();
          });
        }),
        h("button", { type: "button", class: "btn", onclick: function () {
          var template = { id: uid(), name: "自定义模板", columns: [{ header: "物料代码", field: "materialCode" }, { header: "数量", field: "qty" }] };
          db.templates.push(template);
          db.prefs.templateId = template.id;
          save();
          render();
        } }, "自定义列")
      ),
      selected ? h("div", {},
        h("label", { class: "field" }, h("span", {}, "模板名称"), h("input", {
          value: selected.name,
          oninput: function (event) { selected.name = event.target.value; save(); }
        })),
        selected.columns.map(function (column, index) {
          return h("div", { class: "template-row" },
            h("input", { value: column.header, oninput: function (event) { column.header = event.target.value; save(); } }),
            h("select", { onchange: function (event) { column.field = event.target.value; save(); } }, selectOptions(
              [{ value: "", label: "（留空）" }].concat(Calc.EXPORT_FIELDS.map(function (field) { return { value: field.id, label: field.label }; })),
              column.field
            )),
            h("span", { class: "row" },
              h("button", { type: "button", class: "btn", onclick: function () { moveColumn(selected, index, -1); } }, "上移"),
              h("button", { type: "button", class: "btn", onclick: function () { moveColumn(selected, index, 1); } }, "下移"),
              h("button", { type: "button", class: "btn-danger", onclick: function () { selected.columns.splice(index, 1); save(); render(); } }, "删除")
            )
          );
        }),
        h("div", { class: "row" },
          h("button", { type: "button", class: "btn", onclick: function () { selected.columns.push({ header: "新列", field: "" }); save(); render(); } }, "增加列"),
          h("button", { type: "button", class: "btn-danger", onclick: function () {
            db.templates = db.templates.filter(function (template) { return template.id !== selected.id; });
            db.prefs.templateId = "";
            save();
            render();
          } }, "删除模板")
        )
      ) : null
    );
  }

  function moveColumn(template, index, delta) {
    var next = index + delta;
    if (next < 0 || next >= template.columns.length) return;
    var item = template.columns.splice(index, 1)[0];
    template.columns.splice(next, 0, item);
    save();
    render();
  }

  function exportResult(rows, columns) {
    var header = columns.map(function (column) { return column.header; });
    var body = Calc.projectRows(rows, columns, db.prefs.parentFields);
    var sheet = XLSX.utils.aoa_to_sheet([header].concat(body));
    sheet["!cols"] = header.map(function (name, index) {
      var width = String(name).length;
      body.forEach(function (line) { width = Math.max(width, String(line[index] == null ? "" : line[index]).length); });
      return { wch: Math.min(40, Math.max(10, width + 2)) };
    });
    var book = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(book, sheet, "算料结果");
    XLSX.writeFile(book, "算料结果.xlsx");
  }

  function downloadBackup() {
    var blob = new Blob([JSON.stringify(db, null, 2)], { type: "application/json" });
    var link = document.createElement("a");
    link.href = URL.createObjectURL(blob);
    link.download = "算料备份.json";
    link.click();
    setTimeout(function () { URL.revokeObjectURL(link.href); }, 1000);
  }

  function importBackup(event) {
    var file = event.target.files && event.target.files[0];
    event.target.value = "";
    if (!file) return;
    file.text().then(function (text) {
      var parsed = JSON.parse(text);
      if (!parsed || !parsed.boms || !parsed.prefs) throw new Error("不是算料备份");
      db = parsed;
      ui.result = null;
      save();
      ui.notice = "已导入备份。";
      render();
    }).catch(function (error) {
      ui.notice = "备份无法导入：" + error.message;
      render();
    });
  }

  render();
})();
