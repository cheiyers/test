# BOM 扫码质量监管系统

基于 BOM + 总包订单 + 配件订单生成总包/子件标签，出货扫码做齐套校验的局域网系统。

## 功能概览

- 上传 BOM 后自选母件列与母件值（同母件可多版本共存）
- 导入总包订单、配件订单（Excel），可保存列映射规则
- 订单先按自定义列关联总包与配件，再按料号匹配 BOM（不校验用量）
- 齐套数量在扫码时按已关联配件订单行判定
- 匹配成功可生成标签，失败标红待处理
- 可视化拖拽标签模板：支持表格、合并单元格；单元格可选文本/二维码/一维码
- 内容可用订单列点选、任意字符拼接、简单公式（left/right/upper/num+1、FORMAT 日期等）
- 码内容必须包含系统唯一编号（可再拼接其他内容）
- 扫码：先总包后子件，无顺序，不可重复；齐套后扫下一总包不会误报缺漏；支持扫码查单
- 角色：导入打印 / 扫码入库 / 管理员
- 记录查询与 Excel 导出

## 环境要求

- **Node.js 18+**（建议官网 LTS，Windows 选 x64 安装包）
- 一台长期开机的电脑作为服务器，同一局域网内其他电脑用浏览器访问

## 安装与启动（重要）

新装 Node.js 后，**不能只执行 `npm start`**，必须先安装依赖。

### Windows（推荐）

1. 安装 [Node.js LTS](https://nodejs.org)（安装时勾选 *Add to PATH*）
2. 把本项目放到某目录（例如 `D:\bom-scan-qc`）
3. **双击 `install.bat`** 安装依赖（首次需要几分钟）
4. **双击 `start.bat`** 启动服务

或在项目文件夹地址栏输入 `cmd` 回车后执行：

```bat
npm install
npm start
```

### Linux / macOS

```bash
cd bom-scan-qc   # 或本仓库根目录
npm install
npm start
```

### 启动成功后

默认端口：`3789`

- 本机：http://127.0.0.1:3789
- 局域网：http://服务器IP:3789

可用环境变量改端口：

```bash
# Windows CMD
set PORT=8080 && npm start

# Linux / macOS
PORT=8080 npm start
```

## 常见启动报错

| 现象 | 原因 | 处理 |
|------|------|------|
| `Cannot find module 'xxx'` / 提示缺少 node_modules | 只装了 Node，没装项目依赖 | 在项目根目录执行 `npm install`，或双击 `install.bat` |
| `better-sqlite3` / `.node` 相关错误 | 原生模块未装好，或从别的电脑拷了 `node_modules` | 删除本机 `node_modules` 后重新 `npm install` |
| Windows 上 `npm install` 编译失败 | 缺少 C++ 编译环境且无匹配预编译包 | 安装 [Visual Studio Build Tools](https://visualstudio.microsoft.com/visual-cpp-build-tools/)，勾选「使用 C++ 的桌面开发」后再装依赖；或改用官方 Node LTS x64 |
| `EADDRINUSE` / 端口被占用 | 3789 已被占用 | 关掉旧进程，或 `set PORT=3790 && npm start` |
| `npm` 不是内部或外部命令 | Node 未加入 PATH，或未重开终端 | 重装 Node 并勾选 PATH，关闭所有 CMD 窗口后重开 |

网络慢或 `npm install` 失败时，可先换国内镜像再装：

```bat
npm config set registry https://registry.npmmirror.com
npm install
```

**注意：** 不要把 A 电脑上的 `node_modules` 文件夹直接拷到 B 电脑使用，必须在目标电脑上重新 `npm install`。

## 默认账号

| 用户名 | 密码 | 角色 |
|--------|------|------|
| admin | admin123 | 管理员 |
| import | import123 | 导入打印 |
| scan | scan123 | 扫码入库 |

登录后请尽快修改密码（当前版本可在数据库 `data/qc.db` 的 users 表中调整，后续可加界面改密）。

## 示例 / 导入模板

系统内可直接下载（登录后）：

- BOM 管理页 → **下载 BOM 导入模板**
- 订单关联页 → **下载总包订单模板 / 配件订单模板**

BOM 模板为 ERP 风格列：BOM单号、顺序号、物料代码、物料名称、规格型号、物料类型、辅助属性、基本单位、基本用量、单位、用量、费用、损耗率、使用状态、发料仓库、备注、审核状态。  
其中 **物料类型=母件** 的行填写母件完整信息，**物料类型=子件** 的行填写子件。

文件也在仓库中：`public/templates/` 与 `samples/`。

## 推荐使用流程

1. **导入打印员** 上传 BOM，映射母件料号/子件料号等  
2. 导入总包订单 + 配件订单，映射订单号、母件料号、子件料号等  
3. 按母件选择 BOM 版本，勾选匹配字段，执行关联  
4. 在「标签模板」中调整总包/子件模板  
5. 「生成打印」仅对匹配成功行出标签，用浏览器打印（普通机或标签机）  
6. **扫码员** 在「扫码入库」先扫总包再扫子件；需要只看订单时用「扫码查单」  
7. 在「记录报表」按订单号/日期查询并导出 Excel  

## 数据存储

- SQLite 数据库：`data/qc.db`
- 请定期备份 `data` 目录

## 技术栈

- 后端：Node.js + Express + better-sqlite3 + xlsx
- 前端：原生 HTML/CSS/JS（二维码/条码使用 CDN 库）
