# 模糊音克星 · 开发交付概览

> 日期：2026-08-16 | 状态：v2 词库 + 多字题 + 答题流水 + 数据备份 + FSRS 记忆调度 + 自动云同步（Cloudflare）+ 同步交互定稿 + 移动端与 PWA 完成

## 本次完成内容

**1. 词库数据（核心数据资产）**
- 候选字：从 `Chinese character list from 2.5 billion words corpus ordered by frequency.xlsx`（14977 字）提取前 3000 常用字，pypinyin 筛选三组音对；2026-08-16 补充词频表发现的 66 个缺失关键字（如 参[shēn]、粘[nián]），最终 **in/ing 211 字 / en/eng 201 字 / l/n 289 字**
- 组词（2026-08-16 v2）：依据《现代汉语语料库词频表.xls》（cncorpus 2000 万字语料）为每个候选字组词 **2-5 个**——词频表匹配 2-5 个直接收、>5 个取词频前 5、<2 个追加人工词库/补充词表兜底；共 **726 条目 / 2588 词条**
- 多音字按**词中实际读音**精确拆分条目（v2 修复：如"参"的 shēn、"尽"的 jǐn/jìn 分别成条）
- 每个词条经 pypinyin 校验目标字读音归属（多音字按读音分属各组，如"行"的 xíng 入 ing 组）
- 自动生成混淆读音选项（in↔ing、en↔eng、l↔n 互换，声调符号按拼音规则标注）
- 产物：`data/words.json`（可审计）+ `data/words.js`（file:// 可直接加载）

**2. 前端应用（纯前端、零依赖、单页）**
- `index.html` + `css/style.css` + `js/store.js` + `js/fsrs.js` + `js/quiz.js` + `js/app.js`
- 7 个视图：首页（模式选择）、答题页、轮末复盘、统计、已掌握、错题本、设置
- 严格遵循 `docs/design-spec.md` 方案 C 的 design tokens（音对三色映射：in/ing 橙、en/eng 紫、l/n 青）
- 核心交互：整词高亮、二选一（差异韵母 n/ng 加粗）、答对 1 秒自动下一题、答错自动进错题本、已掌握标记、错题连续答对 2 次自动移出、键盘 1/2 作答
- **已掌握常驻按钮（右上角）**：随时标记/撤回、与对错解耦；标记揭示正确选项、多字题多选、错题本失效联动
- **上一题回溯**：左下角按钮 + 快捷键 ←；回看已答题（只读锁定态），「继续作答」回到最新；不影响统计，支持无限模式
- **FSRS 记忆调度**（`js/fsrs.js`，FSRS-6 从 fsrs4anki v6.1.1 移植，21 参数，纯 JS）：每答一题更新字卡记忆状态（stability/difficulty/due）；到期队列优先出题（`fromFSRS=true`）；设置页开关可回滚到纯随机旧逻辑；默认开启、第一题即生效
- **自动云同步（Cloudflare Workers + KV，`js/sync.js` + `cloudflare/`）**：启动自动拉取合并、答题防抖 3s 自动推送、关闭 flush、失败指数退避重试；密钥即身份（应用生成 32 字节）；设置页开关/服务器地址/密钥管理/状态显示；部署教程 `docs/deploy-cloudflare.md`
- **数据备份与多端迁移（设置页）**：数据概况 + 一键导出（版本化 JSON 下载）+ 导入（校验 + 双向合并）；配合坚果云同步盘可跨设备迁移。方案调研见 `docs/sync-plan.md`
- **同步交互定稿（设置页 · 云同步区）**：远端密钥输入框只用于粘贴已有密钥（输入过程不写配置），本机密钥只读展示区（系统生成的密钥绝不进输入框），生成前 popconfirm 确认、绑定/生成时本地有数据触发污染警告；备份与迁移区新增「清除本地数据」（双重确认，云端不受影响）用于换人使用/重新开始
- **移动端与 PWA**：480px 断点 + 触屏热区 ≥44px + 安全区（`viewport-fit=cover` + `env(safe-area-inset-*)`）+ `matchMedia('(pointer: coarse)')` 切换答题页键盘提示文案为「点击选项作答」；PWA（`manifest.json` + `sw.js` + 图标 192/512）部署后支持「添加到主屏幕」全屏 + 离线壳缓存（仅 https 形态生效，file:// 下跳过 PWA 部分）
- localStorage 数据键与 PRD 一致：`wrongBook` / `mastered` / `history` / `settings` / `reviews` / `cards`
- 支持 `index.html?view=stats` 深链接
- 测试：`test_logic.js`（27）+ `test_features.js`（32）+ `test_sync.js`（47）+ `test_fsrs.js`（33）+ `test_sync_auto.js`（32）+ `test_sync_ui.js`（28）+ `test_mobile.js`（17）= **216 断言全绿**

## 关键决策

1. **词库以 JS 文件嵌入而非 fetch JSON**：因需支持双击 `index.html` 直接运行（file:// 下 fetch 本地 JSON 会被浏览器 CORS 拦截）
2. **声调互换算法**：pypinyin 对已带声调输入不做转换，改为基于 TONE3 数字声调替换韵母、再按拼音标注规则（a>o/e>iu 标后）加回声调符号
3. **l/n 组选项**：考声母差异，韵母 tag 相同属正常（如 临 lín / nín）
4. **已掌握按字标记**（PRD 明确），多音字任一读音掌握后该字整体不再出题

## 验证结果

- `node scripts/test_logic.js`：**22/22 断言通过**（词库完整性 + 出题逻辑 + 错题闭环）
- Chrome headless 真实渲染冒烟：首页 / 统计 / 已掌握 / 错题本 / 答题全流程 / 复盘页全部通过，无 JS 错误
- 修复的 Bug：`renderers` 未定义引用、`const cards +=` 赋值错误

## 后续事项

- 词库可按需人工校对（编辑 `scripts/words_data/*.py` 后重新 `python scripts/build_words.py`）
- 未来扩展：an/ang、f/h、平翘舌等其他音对（数据结构已支持新增分组）
- 多端同步后续阶段（`docs/sync-plan.md`）：Phase 2 坚果云文件夹半自动/全自动同步、Phase 3 Gist/BaaS 全自动云端同步（待排期）
- FSRS 个性化训练（`docs/fsrs-scenario.md`）：攒够 ≥1000 条流水后，设置页提供"训练参数"（Web Worker 后台拟合 21 个 w，展示 log-loss）；每 1~3 个月重训一次
- FSRS rating 扩展：当前 2 档（答对 3 / 答错 1），可加"简单/一般"自评映射 easy/good（零迁移）
- 多字题回溯提示（L3 发现）：当前多行题答完后回溯提示不带「← 回看上一题」，可后续对齐单行分支
- 真人发音 TTS 属 Out of Scope
