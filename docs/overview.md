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

## 更新记录

**2026-09-19（工程质量专项 T1-T9）**
- **测试门禁建立**：修复 test_sync_ui.js（TTS 元素缺失致整套件失效一个月）；新增 `scripts/test_all.js` 聚合入口 + `npm test` + pre-commit 钩子（`scripts/git-hooks/`，启用：`git config core.hooksPath scripts/git-hooks`）
- **多音字双读音进题池**：出题去重粒度由"字"细化为"字+读音"（25 个同音对双读音字生效，如「尽」jǐn/jìn）；已掌握仍按字整体排除；无限模式补题按复合键排重；PRD 出题规则同步更新
- **回溯态交互修正**：回溯查看历史题时点「已掌握」不再自动前进到下一道历史题（`isAtLatest` 才调度自动切题）
- **修复筛选激活态 bug**：「已掌握」页音对筛选的激活高亮改 class 实现（旧 outline 内联方案被 innerHTML 重建抹掉，激活态从未真正显示）
- **测试基建**：8 套件重复手写的 DOM 桩抽取为 `scripts/helpers/test-env.js`（含 spy/immediate/manual 三种定时器策略）
- **代码卫生**：删除死变量、escapeHtml 收敛为唯一实现（quiz.js 导出）、addHistory 魔法数改用 HISTORY_LIMIT、sw.js 移除 icon-512 残留
- **配置卫生**：wrangler.toml（含 KV namespace ID）移出版本库，改用 wrangler.toml.example 模板
- **UI 微调**：顶栏 logo 字号 15→17px（可辨形）；移动端 row-between 内 Tag 不再拉伸占整行；音对卡「N 字」不拆行
- **测试规模**：8 套件 **255 断言**全绿（logic 32 / features 40 / sync 47 / fsrs 33 / sync_auto 32 / sync_ui 28 / mobile 17 / tts 26）；sw.js 缓存版本递增至 fpf-shell-v7

**2026-09-19（v2 体验与重构：T12-T14）**
- **T12 无障碍与微动效**：导航/表格操作链接 role=button + tabindex + Enter/Space 激活委托；:focus-visible 焦点环；朗读开关 aria-pressed；进度条 progressbar 语义；反馈条/视图切换动效并尊重 prefers-reduced-motion；顺带修复键盘快捷键真 bug（离开答题页后监听被移除且从不重绑）
- **T13 薄弱字 TOP 10**：统计页新增排行（cards 按 pair:char 聚合，错误次数→正确率→最近作答排序），每行带单字重练入口
- **T14 渲染层拆分**：app.js（1589 行）拆为 js/ui.js（window.UI 共享工具）+ 7 个 js/view-*.js（window.Views 视图模块）+ 瘦控制器 app.js（切换/入口/事件绑定）；script 加载顺序 words→fsrs→store→tts→sync→quiz→ui→views→app
- **拆分中发现并修复 ASI 隐藏 bug 家族**：4 处字符串拼接在 `))` 后换行直接跟 `"</div>"`（缺 `+`），ASI 使其成为被丢弃的独立语句——首页/复盘/已掌握的卡片闭合 div 丢失（浏览器自动补全掩盖），错题本底部说明 alert 从未渲染过；已补齐并在测试中断言
- 测试规模：8 套件 **275 断言**全绿（logic 32 / features 49 / sync 47 / fsrs 33 / sync_auto 32 / sync_ui 28 / mobile 28 / tts 26）；sw 壳缓存 v9→v10
