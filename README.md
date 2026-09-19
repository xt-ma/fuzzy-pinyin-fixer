# 模糊音克星 (fuzzy-pinyin-fixer)

纠正方言模糊音的练习工具：针对 in/ing、en/eng、l/n 不分的常见问题，随机出题让用户选择正确拼音。

## 功能

- 专项练习（按音对：in/ing、en/eng、l/n）+ 综合随机 + 无限模式
- 题量可选 5/10/20/自定义（1-1000）/无限
- 整词展示 + 目标字高亮 + 二选一（如"天津"考"津" → jīn / jīng）
- **双音对 4 选项**：读音同时落在鼻音韵母组与 l/n 的字（如「凝」níng）给出 nin/ning/lin/ling 四选（正确 + 韵母混淆 + 声母混淆 + 双重混淆）
- **多字题**：词内其他可考字一并考察，逐行作答（如"新娘" → 新 xin/xing + 娘 niang/liang）
- **多音字双读音**：同一音对内多音字的不同读音（如「尽」jǐn/jìn）视为不同考点，均可出题；已掌握仍按字整体排除
- **已掌握常驻按钮**（右上角）：随时标记/撤回，不影响对错判定；标记后该字不再出题、错题本对应记录置为失效（撤回恢复）；多字题可多选
- **上一题回溯**（左下角按钮 / 快捷键 ←）：本轮内可回看任意已答题（只读锁定态），「继续作答」回到最新位置
- 答对自动下一题；答错进错题本，可一键重练
- 轮末复盘：正确率 + 错题清单
- 统计：总正确率、7/30 天趋势、音对分布
- **完整答题流水**（每次作答对错都记录），为 FSRS 记忆模型预留数据
- **FSRS 记忆调度**（默认开启，设置页可关）：按记忆曲线安排复习——到期的字优先出题（交错随机），生疏的复习更频繁、熟练的间隔拉长；关闭可回滚到纯随机出题。算法为 FSRS-6（从 fsrs4anki v6.1.1 移植，21 参数，纯 JS）
- **自动云同步**（Cloudflare Workers + KV，免费无服务器）：打开应用自动拉取合并、答题后自动推送、断网自动重试——多设备零手动操作无感同步；密钥即身份（应用生成 32 字节）。设置页同步区：新设备粘贴已有密钥「确定同步」、首台「生成新密钥」并复制保存、本机密钥只读展示、可手动「立即同步」/重置；「清除本地数据」用于换人使用/重新开始（云端数据不受影响）。部署教程见 `docs/deploy-cloudflare.md`
- **数据备份与多端迁移**（设置页）：一键导出全部数据为 JSON 文件，任意设备导入（自动**合并**不覆盖）；配合坚果云等同步盘即可实现多端同步
- **移动端与 PWA**：手机浏览器直接可用（480px 断点 + 触控热区 ≥44px + iOS 16px 防聚焦放大 + 刘海屏安全区）；部署到 Cloudflare Pages 后可"添加到主屏幕"全屏使用，离线壳缓存（manifest + Service Worker，断网可打开）。键盘快捷键文案在触屏设备自动切换为"点击选项作答"。
- 词库基于《现代汉语语料库词频表》（cncorpus 2000 万字语料）+ 人工词库兜底，三组音对共 **726 条目 / 2588 词条**（每字 2-5 个词，按词频取优；66 个新关键字为词频表补充）

## 运行

纯前端、零依赖：直接双击打开 `index.html`，或用任意静态服务器托管整个目录。

```bash
# 本地预览（可选）
python -m http.server 8734
```

## 项目结构

```
index.html            单页应用入口（file:// 可直接运行）
manifest.json         PWA 配置（应用名/主题色/图标）
sw.js                 PWA Service Worker（应用壳缓存，仅 https 生效）
package.json          仅承载 npm test 脚本入口（零依赖，无 node_modules）
icons/icon-192.png    PWA 图标（192×192）
css/style.css         全局样式（基于 docs/design-spec.md 方案 C tokens + 响应式/触屏适配）
js/store.js           localStorage 数据层（wrongBook/mastered/history/settings/reviews/cards + FSRS 调度写入）
js/fsrs.js            FSRS-6 间隔重复调度核心（从 fsrs4anki v6.1.1 移植，纯 JS 零依赖）
js/sync.js            自动云同步模块（密钥生成/状态机/拉取推送/失败重试，配合 cloudflare/）
js/quiz.js            题目生成与轮次状态机（考点粒度=字+读音，含多字题 rows / FSRS 到期队列出题）
js/ui.js              共享 UI 工具（window.UI：toast/popconfirm/统计聚合/表格卡片化标注等）
js/view-*.js          视图模块（window.Views：home/quiz/result/stats/mastered/wrongbook/settings）
js/app.js             应用控制器（视图切换/练习入口/App 全局动作/全局事件绑定与初始化）
data/words.js         词库数据（构建产物，供 <script> 直接加载）
data/words.json       词库数据（可审计的 JSON 源）
cloudflare/           Cloudflare Worker 同步服务（index.js + wrangler.toml.example；
                      实际 wrangler.toml 含 KV namespace ID，已 gitignore 不入库）
docs/                 PRD、设计规范、数据设计、分析报告、部署教程
scripts/              词库构建与测试脚本（helpers/ 为测试共享桩；git-hooks/ 为 pre-commit 钩子）
```

## 部署（多端云同步）

应用本身可 file:// 直接运行；需要多端自动同步时，按 [`docs/deploy-cloudflare.md`](docs/deploy-cloudflare.md) 部署到 Cloudflare（免费）：Pages 托管应用 + Workers 同步 API + KV 存储，然后设置页填入服务器地址、开启自动云同步即可。

## 词库构建与校验

词库流程（候选字 → 组词 → 校验 → 产物）：

1. `scripts/extract_candidates.py` — 从 25 亿字语料词频表提取前 3000 常用字，用 pypinyin 筛选三组音对候选字（对应 `data/words.json` 的 entries）
2. `scripts/generate_words_data.py` — 依据《现代汉语语料库词频表.xls》为每个候选字组词（2-5 个：词频表匹配 2-5 个直接收、>5 个取前 5、<2 个追加 `scripts/words_data/backup/` 人工词库），输出 `scripts/words_data/*.py`
3. `scripts/build_words.py` — 合并配词 → pypinyin 校验每个词中目标字读音归属 → 自动生成混淆读音选项 → 输出 `data/words.json` 与 `data/words.js`

数据校验与逻辑测试：

```bash
npm test                        # 一键运行全部套件（等价 node scripts/test_all.js）
node scripts/test_logic.js      # 词库完整性 + 出题逻辑（32 项断言）
node scripts/test_features.js   # 已掌握按钮 + 回溯 + 回溯态已掌握交互（40 项断言）
node scripts/test_sync.js       # 数据导出/导入/合并/校验（47 项断言）
node scripts/test_fsrs.js       # FSRS 调度 + 到期队列 + 回滚切换（33 项断言）
node scripts/test_sync_auto.js  # 自动云同步：密钥/打点/推送/重试/双设备（32 项断言）
node scripts/test_sync_ui.js    # 同步设置区 UI：绑定/校验/警告/清除数据（28 项断言）
node scripts/test_mobile.js     # 移动端适配：键盘提示切换 + PWA 文件（17 项断言）
node scripts/test_tts.js        # TTS：开关/voice 选择/超时兜底/引擎降级（26 项断言）
python scripts/analyze_wordfreq.py # 词频表组词覆盖率分析（docs/wordfreq_analysis.json）
```

共 **8 个套件 / 255 项断言**。提交前自动跑测试：启用仓库自带的 pre-commit 钩子（每个克隆执行一次）：

```bash
git config core.hooksPath scripts/git-hooks
```

## 文档

- `docs/PRD.md` — 产品需求文档
- `docs/design-spec.md` — UI 设计规范（方案 C 定稿）
- `docs/mockups/` — 高保真设计稿
