# 标签设计器 · Label Studio

基于 HTML 的可视化标签设计器：拖拽设计标签模板，绑定订单列数据，支持多列拼接与公式判断，可插入文本、表格、条码、二维码等，并支持保存方案、浏览器打印（普通打印机 / 标签机）以及导出 Excel。

## 快速开始

用本地静态服务器打开项目根目录（因部分 CDN / 模块限制，建议不要直接用 `file://`）：

```bash
# Python
python3 -m http.server 8080

# 或 Node
npx --yes serve -l 8080
```

浏览器访问：`http://localhost:8080`

示例订单：`samples/orders.csv`

## 功能概览

| 能力 | 说明 |
|------|------|
| 可视化设计 | 拖拽添加文本、条码、二维码、表格、线条、矩形、图片 |
| 订单导入 | CSV / Excel (.xlsx) / JSON |
| 字段绑定 | 固定内容、单列绑定、多列拼接、公式表达式 |
| 二维码 / 条码 | 内容可固定或绑定订单数据 |
| 方案保存 | 模板保存在浏览器 localStorage |
| 打印 | 标签机按标签尺寸分页，或 A4 排版后用普通打印机 |
| 无订单打印 | 仅按模板空白打印 |
| 导出 Excel | 将解析后的标签内容与订单字段导出为 xlsx |

## 公式示例

- `{{订单号}}` — 引用列
- `"单号: "&{{订单号}}` — 拼接
- `IF({{数量}}>10, "大单", "普通")` — 条件
- `JOIN("-", {{省}}, {{市}}, {{区}})` — 多段连接并跳过空值
- `CONCAT({{收件人}}, "/", {{电话}})` — 连接

## 默认模板

内置两套 **80×40 mm** 线缆产品标签（方案库可直接加载）：

1. **线缆产品标签 A** — 左侧二维码绑定 `Order No.`，Properties 用 `JOIN("/", 标准, 认证, 机房类型)` 拼接  
2. **线缆产品标签 B** — 二维码绑定 `订单号-序号` 公式，Properties 绑定单列  

示例订单字段与模板一致，见 `samples/orders.csv`。

## 目录结构

```
index.html
css/styles.css
js/formula.js      # 公式引擎
js/defaults.js     # 内置默认模板与示例订单
js/storage.js      # 模板本地存储
js/data.js         # 订单导入 / Excel 导出
js/designer.js     # 画布设计器
js/print.js        # 打印排版
js/app.js          # 主界面逻辑
js/vendor/         # 离线第三方库
samples/orders.csv
```

数据与模板默认保存在本机浏览器，不会上传服务器。

第三方库已内置在 `js/vendor/`（SheetJS / JsBarcode / qrcodejs），可离线打开使用。
