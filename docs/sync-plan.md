# 多端同步方案调研与设计（sync-plan）

> 日期：2026-08-16
> 状态：调研完成，方案待确认
> 约束：**无服务器**（不部署任何后端）、纯前端 `file://` 直开、数据存 localStorage

---

## 一、背景与目标

模糊音克星是纯静态单页应用（`index.html` 可直接 file:// 打开），全部用户数据存在浏览器 localStorage（`wrongBook` / `mastered` / `history` / `settings` / `reviews` / `cards`）。多端使用（公司电脑/家里电脑）时数据无法互通。

**用户 story**：打开项目 → 绑定同步方式 → 继续之前的进度。

---

## 二、核心调研结论（重要）

### ❌ 坚果云 WebDAV 浏览器直连 —— 不可行

这是用户原始设想的核心路径，但调研确认**此路不通**：

| 问题 | 说明 |
|---|---|
| 坚果云 WebDAV 服务器**未设置 `Access-Control-Allow-Origin` 头** | 浏览器跨域请求被直接拦截（`Failed to fetch`），与登录是否正确无关 |
| preflight 死锁 | 浏览器对非简单请求先发 `OPTIONS` 预检，预检**不带 Authorization**；坚果云这类"标准实现"的服务器在认证前不区分预检请求 → 预检永远 401 → 实际请求永远发不出去 |
| 官方态度 | 社区项目（Awaken 等）联系过坚果云开发，答复"我们实现的是标准 WebDAV 服务端协议"，即**不会为浏览器场景加 CORS 头** |

实证来源：KenNav issue #4（禁用 CORS 检查即可成功，正常浏览器失败）、Awaken 项目技术博客、webdav-client 库 README（明确 Nextcloud/ownCloud 默认同样无 CORS）。

**唯一能在浏览器直连的 WebDAV 变通**：自建 Alist 等中转（需部署，违背约束）或改用支持 CORS 的 WebDAV 服务商（需自己配 Nginx 头，同样需要服务器）。

### ⚠️ File System Access API（读写本地坚果云同步文件夹）—— file:// 下不可用

另一种思路：让应用直接读写用户本机"坚果云同步文件夹"，靠坚果云桌面客户端自动双向同步。但：

- `showDirectoryPicker()` 仅在 **HTTPS 或 localhost 安全上下文**可用，**file:// 协议下直接抛 SecurityError**
- 仅 Chromium 内核（Chrome/Edge）支持，Firefox/Safari 不支持
- 结论：当前项目以 file:// 打开的模式下**不可用**；但若部署到免费静态托管（GitHub Pages / Cloudflare Pages / Gitee Pages，不算"服务器"），此方案立即解锁

### ✅ GitHub Gist API —— 可行（有数据量约束）

- `api.github.com` **全站支持 CORS**（`Access-Control-Allow-Origin: *`），纯前端可直连
- 免费；token 只需 `gist` scope（泄露影响面小）
- 读写：`GET /gists/:id` 拉取、`PATCH /gists/:id` 更新、`POST /gists` 创建
- 限制：未认证 60 次/小时、带 token 5000 次/小时；**单 gist 文件硬上限 1MB**
- ⚠️ **数据量风险**：本项目 `reviews` 流水上限 30000 条，每条约 150~250 字节，JSON 全量约 **4.5~7.5MB，远超 Gist 1MB 上限**。需压缩（gzip→base64，中文 JSON 压缩率约 15~25%，可压到 ~1.5MB，仍贴近上限）或拆分/精简存储
- 国内访问 api.github.com 稳定性一般（可用性波动）

### ✅ 国内 BaaS（LeanCloud / 腾讯云 CloudBase）—— 最成熟可靠

- **无服务器 ≠ 无法用云服务**：BaaS 提供免费后端 + 客户端 SDK，天然支持 CORS，无需自己运维
- 数据量无压力（免费额度以 GB 计），支持结构化存储，天然解决冲突合并
- 门槛：需注册云服务账号、创建应用、拿到 API 凭据（比 Gist 配置略重，但对普通用户仍可接受）
- 国内访问稳定（LeanCloud、CloudBase 均为国内服务）

---

## 三、方案矩阵（2026-08-16 更新：Cloudflare 方案定为主方案）

| 方案 | 可行性 | 全自动 | 数据量 | 成本 | 门槛 | 适用人群 |
|---|---|---|---|---|---|---|
| A. 坚果云 WebDAV 浏览器直连 | ❌ 不可行（CORS，无中转） | — | — | — | — | — |
| A'. 坚果云 WebDAV + Workers 反代 | ✅ 可行（补 CORS 头） | ✅ | 无限制 | 免费 | 中（需 CF 账号） | 已有坚果云、想复用同步盘的人 |
| **B. Cloudflare Workers + KV 直存（选定）** | ✅ 最自洽 | ✅ | 1GB 免费够用 | **免费（永久）** | 中（注册 CF 账号、部署一次） | **本项目主方案** |
| C. 坚果云文件夹 + 手动导出/导入 | ✅ 已实现 | ❌ 半自动 | 无限制 | 免费 | 低 | 兜底（保底可用） |
| D. GitHub Gist 全自动 | ✅ 可行 | ✅ | ⚠️ <1MB 需压缩 | 免费 | 低（需 token） | 备用 |
| E. 国内 BaaS（LeanCloud/CloudBase） | ✅ 最成熟 | ✅ | 无压力 | 免费额度 | 中 | 备选（若 CF 国内访问不佳） |

> **决策（2026-08-16）**：**方案 B（Cloudflare Pages + Workers + KV）定为主方案**——免费、全自动、数据与应用同平台、密钥即身份无需账户系统。A'（Workers 反代坚果云）作为"想复用坚果云"的可选后端；C（导出/导入）已实现，始终作为零依赖兜底。Cloudflare 免费版国内访问体验一般，若实际不佳可切换 E（CloudBase 同构迁移成本低）。

---

## 四、推荐落地路径

### Phase 1：数据导出/导入（同步的基石）—— ✅ 已完成

见下方状态说明与 `docs/data-schema.md` 第五节（已实现：校验 + 双向合并，47 项断言）。

### Phase 2（主）：Cloudflare Workers + KV 全自动云同步（设计完成，待实现）

**架构**：

```
浏览器应用（Pages 托管，静态免费）
   │  自动同步（启动拉取 / 答题防抖推送 / 关闭 flush）
   ▼
Workers 同步 API（https://sync.你的域名/api/sync）
   │  校验密钥 → 读写 KV
   ▼
KV 命名空间（按密钥分区：<key>/state.json）
```

**Workers API 规格**（REST，JSON）：

| 方法 | 路径 | 请求 | 响应 | 说明 |
|---|---|---|---|---|
| GET | `/api/sync` | Header `X-Sync-Key` | `{data:{6 表}, updatedAt, size}` | 拉取云端数据；空空间返回空 data |
| PUT | `/api/sync` | Header `X-Sync-Key` + Body `{data, clientId, mergedAt}` | `{ok, updatedAt}` | 推送合并后全量（幂等覆盖本空间） |
| DELETE | `/api/sync` | Header `X-Sync-Key` | `{ok}` | 重置空间（配合"重置密钥"） |

**安全校验（Workers 端，必须实现）**：
1. 密钥正则白名单：`^fpf-[A-Za-z0-9_-]{40,}$` → 非法 400（防 KV key 注入）；
2. Body 大小上限 2MB、单空间数据上限 5MB（超限 413）；
3. 限流：按 IP + 密钥 各 30 次/分钟（超限 429）；
4. CORS：允许 Pages 域名（`Access-Control-Allow-Origin` + `X-Sync-Key` 允许头）；
5. 响应头：`Content-Security-Policy: default-src 'self'`、`X-Content-Type-Options: nosniff`。

**前端自动同步状态机**（纯前端，无需用户点按钮）：

```
[启动/加载] → 拉取 → 双向合并 → 写本地 → 状态 idle
[任何作答/标记变更] → 打 dirty 标记 → 防抖 3~5s → 推送
[轮次结束] → 立即推送
[页面隐藏/关闭] → flush 未推送变更
[推送失败] → 保留 dirty → 指数退避重试 → 下次启动补推
```

- 同步内容 = `Store.exportData()`（6 表版本化 JSON）；拉取 = `Store.importData(云端)`（复用合并，不覆盖本地）；
- 推送幂等：同空间整表覆盖，冲突已在拉取时解决；
- 数据量：全量 <10MB（3 万条流水上限），gzip 传输（CF 自动）；未来超限再做增量（reviews 按 `ts > lastSyncAt`）。

**密钥模型**：应用 `crypto.getRandomValues` 生成 32 字节密钥（`fpf-` 前缀 base64url）→ 存本地 → 请求头携带；设置页可查看/复制/重置；新设备输入同密钥即接管。任何人生成自己的密钥即有自己的空间（密钥即身份，无需账户系统）。

**部署**：`wrangler.toml` + `src/index.js`（Worker）+ Pages 绑定；前端 `js/sync.js` 模块（同步状态机 + API 客户端）。

### Phase 2（备选）：坚果云文件夹同步（仅作兜底/不想用 CF 时）

利用坚果云**桌面客户端**做同步载体：导出文件放入同步文件夹 → 客户端自动上传 → 另一端自动下载 → 导入。半自动，已有导入导出功能即可支撑，无需开发新代码。

---

## 五、多端合并与冲突策略（核心技术点）

多端同步最大的坑是**两设备各自答题后如何合并不丢数据**。本项目数据结构恰好适合合并：

| 数据 | 合并策略 |
|---|---|
| `reviews`（流水） | **按 (char, pair, ts) 去重追加** —— append-only，天然可合并，绝不覆盖 |
| `cards`（字卡聚合） | 不直接合并，**由合并后的 reviews 重建**（reps/count/lastTs 全部可推导），保证一致 |
| `wrongBook` / `mastered` | 按 char 合并；同 key 冲突取 `lastTime` 较新者；`hidden` 标记保留 |
| `history`（轮次汇总） | 按 (date, total, correct) 去重追加 |
| `settings` | 以 `lastUpdated` 较新端为准（或本地优先，二选一） |

**同步协议建议**（简单可靠）：
1. 拉取云端数据 → 与本地做"双向合并"（不是单向覆盖）
2. 合并结果同时写本地 + 上传云端
3. 记录 `lastSyncAt`，启动时提示"上次同步 X 前/后有过未同步修改"

**风险说明**：单用户多设备、几乎不会同时答题的场景下，冲突概率极低；即便冲突，reviews 按 ts 去重也能保证流水不丢。

---

## 六、安全注意（2026-08-16 更新：方案 B 威胁模型）

**身份模型**：密钥即身份（无账户系统）。任何人可生成自己的密钥开自己的空间；隔离性依赖 256-bit 密钥熵。攻击者拿到域名后：能访问应用、能开自己的空空间，**无法读取他人空间**（密钥隔离）。

| 攻击路径 | 风险 | 防护 |
|---|---|---|
| 暴力猜测密钥 | 低（256-bit 不可能） | 密钥必须应用生成的高熵随机串，**禁止自定义弱密钥** |
| 中间人窃听 | 已防 | HTTPS；密钥放 `X-Sync-Key` Header（不进 URL/日志） |
| KV key 注入 | 低 | Workers 正则白名单 `^fpf-[A-Za-z0-9_-]{40,}$` |
| XSS 窃取密钥/数据 | 中（最现实） | 输出转义（已有 escapeHtml）；同步/导入数据只当数据解析；CSP 头兜底 |
| API 刷量耗尽配额 | 中 | Workers 限流（IP+密钥 30 次/分）、Body ≤2MB、单空间 ≤5MB |
| 钓鱼/伪造域名 | 中 | 设置页提示核对域名；密钥可重置 |
| 本机窃取（恶意扩展） | 中 | 浏览器应用固有局限；可选端到端加密（AES-GCM） |
| 密钥丢失 | 体验问题 | 导出备份兜底（已有）+ 设置页强调保存密钥 |

**其他**：若复用坚果云 WebDAV（方案 A'），只能用"应用密码"；Gist（方案 D）token 仅授 gist scope、secret gist 勿存敏感信息。

---

## 七、后续开发任务清单（2026-08-16 更新）

- [x] **P1 数据导出/导入**（JSON 合并导入、版本校验、设置页入口）—— 已完成（`scripts/test_sync.js` 47 断言）
- [x] **P1 reviews/cards 合并** —— 已完成（data-schema 第五节）
- [x] **P1 FSRS 记忆调度** —— 已完成（`scripts/test_fsrs.js` 33 断言）
- [x] **P1 Workers 同步服务** —— 已完成（`cloudflare/index.js` + `wrangler.toml`：GET/PUT/DELETE /api/sync + 密钥正则/Body 限大小/限流/CORS/CSP）
- [x] **P1 前端 `js/sync.js`** —— 已完成（同步状态机：启动拉取/答题防抖 3s 推送/关闭 flush/指数退避重试；`set` 打点 + `_withSuppress` 防循环；exportData 剥离设备级同步配置）
- [x] **P1 设置页同步模块** —— 已完成（开关/服务器地址/密钥生成/复制/重置/状态显示，同步完成自动刷新）
- [x] **P1 测试** —— `scripts/test_sync_auto.js` 32 断言全绿；设置页 UI 冒烟通过；全量 27+32+47+33+32=171
- [ ] **部署（用户操作）**：按 `docs/deploy-cloudflare.md` —— 注册 CF → 创建 KV → 部署 Worker → 部署 Pages → 设置页填地址开启同步
- [ ] **P2 增量同步**（流水按 `ts > lastSyncAt`）——数据量逼近 KV 上限时再做
- [ ] **P2 端到端加密**（可选增强）——AES-GCM，云端只见密文
- [ ] 文档：README / PRD / data-schema 已同步；部署教程 `docs/deploy-cloudflare.md` 已就绪

---

## 附：一句话结论

**"浏览器直连坚果云 WebDAV"被 CORS 卡死不可行**，但 **Cloudflare Workers + KV 方案（免费、无服务器、全自动）已定为多端同步主方案**：应用托管 Pages（静态免费）→ Workers 同步 API（免费 10 万请求/天）→ KV 分区存储；密钥即身份，自动同步无感。导出/导入 + 合并（Phase 1）已实现，作为零依赖兜底。
