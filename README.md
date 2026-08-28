# 通力采购订单批量识别

浏览器端 HTML 工具，用于批量解析 KONE Elevators 采购订单 PDF，把每一行 Pos 识别成可筛选、可导出的表格。

## 文档约定

样张都是 `KONE Elevators Co. Ltd. Purchase order`：

- **抬头**：PO 号、供应商、买方、送货地址、日期、账期、币种、总金额
- **订单行（主结果）**：Pos、物料号、到货日、数量、单价、金额、描述、Sales order ref、Project ref、发货说明
- **行内规格**：如轿内净高、Wire Length，可用自定义关键字抽成独立列
- **BOM 子件**：电气物料下的 `.1 0010 KM…` 零件层
- **页脚条款**：每页重复，不作为订单行

## 使用

用本地静态服务打开（直接双击 `index.html` 时，示例 JSON / 样张 PDF 可能因浏览器安全策略无法加载，上传 PDF 仍可用）：

```bash
python3 -m http.server 8080
```

浏览器打开 http://localhost:8080

- 页面会先展示三份样张的预识别结果，便于核对字段是否正确
- 可拖入更多 PDF，在浏览器内用 pdf.js 本地解析
- 添加提取关键字（例如 `轿内净高`、`Wire Length`）后，规格值会出现在新列
- 过滤框按物料 / 项目号 / 描述等全文筛选
- 导出 Excel（含 BOM 子表）、CSV、JSON

## 命令行提取

```bash
python3 -m pip install pymupdf
python3 tools/extract_po.py samples/*.pdf -o data/demo.json
```

## 样张核对（当前识别结果）

| PO | 页数 | 订单行 | 识别金额合计 | 抬头 TOTAL |
| --- | --- | --- | --- | --- |
| 4801006558 | 3 | 4 | 401.08 | 401.08 |
| 4801007230 | 3 | 4 | 401.08 | 401.08 |
| 4801169630 | 117 | 254 | 51928.13 | 51,928.13 |
