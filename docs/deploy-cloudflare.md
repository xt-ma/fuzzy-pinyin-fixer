# Cloudflare 部署教程（多端自动云同步）

> 日期：2026-08-16
> 目标：把模糊音克星部署到 Cloudflare（应用免费托管 + 同步服务），实现多设备全自动云同步。
> 费用：全部 **$0 永久免费**（Pages 静态无限 + Workers 10 万请求/天 + KV 1GB）。
> 前置：注册 Cloudflare 账号（免费）；推荐注册 GitHub 账号（免费，便于版本管理与自动部署）。

---

## 一、总览

```
你的浏览器（应用）                     Cloudflare（免费）
┌──────────────────┐   同步请求    ┌──────────────────────────┐
│ Pages 托管的应用  │ ───────────→ │ Workers 同步 API          │
│ （打开就是练习页） │ ←─────────── │ 校验密钥 → 读写 KV        │
└──────────────────┘              └──────────────────────────┘
```

- **应用文件** → Cloudflare **Pages**（静态托管，免费无限）
- **同步服务** → Cloudflare **Workers**（`cloudflare/index.js`，免费 10 万请求/天）
- **云端数据** → Cloudflare **KV** 命名空间（按密钥分区，1GB 免费）

---

## 二、是否先推 GitHub？—— 推荐，但不是必须

| 方式 | 优点 | 缺点 |
|---|---|---|
| **GitHub 集成（推荐）** | 代码有版本管理；`git push` 后 Pages/Workers **自动重新部署**；以后更新只 push 一次 | 需注册 GitHub |
| **直接上传（免 GitHub）** | 零前置，立即开始 | 更新要手动重新上传/粘贴 |

本文按 **GitHub 方式** 为主流程（第 3-4 步），不想用 GitHub 的看「附录 A：免 GitHub 部署」。

---

## 三、推送到 GitHub

```bash
cd C:\UserProgram\fuzzy-pinyin-fixer
git init
git add .
git commit -m "模糊音克星：FSRS + 多端同步 + 词库 v2"
# 在 github.com 新建一个仓库（如 fuzzy-pinyin-fixer），然后：
git remote add origin https://github.com/你的用户名/fuzzy-pinyin-fixer.git
git push -u origin main
```

> `.gitignore` 已排除：`node_modules`、wrangler 本地状态、两个词频表大文件（构建词库时才需要，放回本地即可）。

---

## 四、创建 KV 命名空间

1. 登录 [dash.cloudflare.com](https://dash.cloudflare.com) → 左侧「Workers & Pages」→「KV」
2. 点「Create a namespace」→ 命名 `FPF_SYNC` → 创建
3. 记下命名空间的 **ID**（一串字符，下一步用）

---

## 五、部署 Workers 同步服务

### 方式 A：连接 GitHub（推荐，push 自动更新）

1. Workers & Pages →「Create」→「Worker」→ 输入名称 `fuzzy-pinyin-fixer-sync` → 创建
2. 进入 Worker →「Settings」→「Variables」→「KV namespace bindings」→ 点「Add binding」
   - Variable name：`FPF_SYNC`
   - KV namespace：选择刚创建的 `FPF_SYNC`
   - 保存
3. 进入 Worker →「Settings」→「Builds & deployments」→「Connect to Git」→ 选择仓库
   - Build 命令留空、Root directory 填 `cloudflare`
   - 保存 → 自动部署（从 `cloudflare/index.js`）

### 方式 B：wrangler CLI（命令行）

```bash
cd cloudflare
npm i -g wrangler          # 或 npx wrangler
wrangler login
wrangler kv namespace create FPF_SYNC   # 把输出的 id 填进 wrangler.toml
wrangler deploy
```

### 方式 C：dashboard 粘贴（免 GitHub）

1. 创建 Worker → 点「Edit code」→ 把 `cloudflare/index.js` 内容整个粘贴 → Deploy
2. 记得在 Settings → Variables 里绑定 KV（同上）

### 验证 Workers

```bash
# 应返回 invalid key（表示服务在线、校验生效）
curl https://fuzzy-pinyin-fixer-sync.你的用户名.workers.dev/api/sync -H "X-Sync-Key: test"

# 用合法密钥应返回空数据
curl https://fuzzy-pinyin-fixer-sync.你的用户名.workers.dev/api/sync -H "X-Sync-Key: fpf-AAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAA"
# → {"ok":true,"data":null,"updatedAt":null}
```

> Worker 的默认域名：`https://fuzzy-pinyin-fixer-sync.<你的子域>.workers.dev`——**这就是要在应用里填的"同步服务器地址"**。

---

## 六、部署应用（Pages）

### 方式 A：连接 GitHub（推荐）

1. Workers & Pages →「Create」→「Pages」→「Connect to Git」→ 选择仓库
2. 构建配置：
   - Framework preset：**None**
   - Build command：**留空**（项目零构建）
   - Build output directory：**`.`**（项目根目录）
3. 部署 → 得到 `https://<项目名>.pages.dev` 地址

### 方式 B：Direct Upload（免 GitHub）

Workers & Pages →「Create」→「Pages」→「Upload assets」→ 把整个项目目录（`index.html`、`css/`、`js/`、`data/`）拖拽上传。

---

## 七、应用内配置同步（关键步骤）

1. 用浏览器打开你的 Pages 地址（如 `https://fuzzy-pinyin-fixer.pages.dev`）
2. 进入「设置」→「云同步（自动）」：
   - 打开「自动云同步」开关
   - 填入同步服务器地址：`https://fuzzy-pinyin-fixer-sync.<你的子域>.workers.dev`
   - 应用**自动生成同步密钥**（显示在密钥框里）
3. 点击「复制密钥」保存好（**务必保存**，密钥即你数据的钥匙）

**第二台设备接入**：打开同一 Pages 地址 → 设置 → 云同步 → 填同一个服务器地址 + **粘贴同一个密钥** → 打开开关 → 自动拉取合并，进度无缝衔接。

---

## 八、日常使用与更新

- **自动同步**：打开应用自动拉取；答题后自动推送；断网自动重试。无需任何手动操作。
- **更新应用**：`git push` 后 Pages/Workers 自动重新部署（几分钟生效）。
- **数据安全**：本地数据为主、云端为副本；可在设置页随时关闭同步（回到纯本地）或重置密钥。
- **备份兜底**：设置页「导出备份」始终可用。

---

## 九、常见问题

| 问题 | 处理 |
|---|---|
| 设置页提示同步失败/错误 | 检查服务器地址是否填对（`https://...workers.dev`，无尾部斜杠）；确认 Worker 已部署且 KV 已绑定 |
| 两台设备数据没合并 | 确认两端使用**同一个密钥**；检查浏览器控制台网络请求是否 200 |
| `invalid key` | 密钥被改动过——设置页「重置密钥」重新生成，并在所有设备更新 |
| 403/429 | 触发限流（30 次/分），稍等重试即可（正常使用不会触发） |
| 国内访问慢 | Cloudflare 免费版国内节点一般；如明显影响使用，可迁移到腾讯云 CloudBase（方案同构，见 sync-plan） |
| KV 空间满（1GB） | 本项目 3 万条流水 <10MB，几乎不可能；真满了设置页导出备份后「重置密钥」开新空间 |

---

## 附录 A：免 GitHub 部署（Direct Upload + dashboard）

1. Pages：Direct Upload 拖拽上传整个项目目录
2. Workers：dashboard 新建 Worker → Edit code 粘贴 `cloudflare/index.js` → Settings 绑定 KV（`FPF_SYNC`）
3. 其余与应用内配置、日常使用完全相同

> 之后每次代码更新：重新拖拽上传（Pages）+ 重新粘贴（Worker）。

---

## 附录 B：架构与安全（简述）

- 密钥 = 数据空间钥匙（应用生成 32 字节，256-bit），任何人可用自己的密钥开自己的空间，互不可见
- Workers 校验：密钥正则白名单、Body ≤2MB、单空间 ≤5MB、IP+密钥限流 30 次/分
- 同步协议：GET 拉取 / PUT 推送 / DELETE 重置，密钥放 `X-Sync-Key` 头（HTTPS 传输）
- 详细设计见 `docs/sync-plan.md`（Phase 2）与 `docs/PRD.md`（多端同步章节）
