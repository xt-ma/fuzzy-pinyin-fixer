# 数据设计说明 · 模糊音克星

> 存储介质：浏览器 localStorage，键前缀 `fpf_`。纯前端，无后端。
> 更新：2026-08-16（加入完整答题流水，为 FSRS 记忆模型做准备）

## 一、数据表总览

| 键 | 粒度 | 写入时机 | 用途 |
|---|---|---|---|
| `settings` | 全局 | 用户改配置时 | 默认题量等 |
| `mastered` | 字 | 手动标记/撤回 | 「已掌握」页 |
| `wrongBook` | 字 | 答错自动 | 错题本 |
| `history` | 轮次 | 每轮结束 | 统计页趋势/正确率 |
| `reviews` | **每次作答** | 每题答完（对错都记） | **流水档案 + FSRS 训练语料** |
| `cards` | 字×音对 | 每题答完同步 | 字级统计 + FSRS 调度状态 |

关系说明：

- 卡片主键 = `pair:char`（如 `en/eng:登`）。同字跨音对（多音字）各自独立成卡。
- `reviews` 是**不可变的追加流水**，任何统计/训练都应以它为数据源；`cards` 是其冗余聚合，便于快速读取。
- `history`（轮次级）与 `reviews`（字次级）并存：前者服务现有统计页，后者服务未来字级分析与 FSRS。

## 二、reviews —— 每次作答流水（新增，核心）

每次作答（无论对错）追加一条：

| 字段 | 类型 | 说明 |
|---|---|---|
| `char` | string | 目标字，如「登」 |
| `pair` | string | 音对，`in/ing` \| `en/eng` \| `l/n` |
| `ts` | number(ms) | 作答时间戳 |
| `rating` | number | **FSRS rating**：`1`=答错(again)、`3`=答对(good)；预留 `2`=hard、`4`=easy |
| `state` | number | FSRS 状态：0=new、1=learning、2=review、3=relearning（FSRS 关闭时恒 0） |
| `elapsedDays` | number\|null | 距该字**上一次作答**的天数（保留 2 位小数）；首见为 null。FSRS 优化器核心输入 |
| `scheduledDays` | number\|null | FSRS 计划间隔天数（FSRS 关闭时为 null） |
| `stability` | number\|null | FSRS 稳定性（FSRS 关闭时为 null） |
| `difficulty` | number\|null | FSRS 难度 1-10（FSRS 关闭时为 null） |
| `word` | string\|null | 题干词语（如「登录」）；单字题无词为 null |
| `correctPy` | string | 正确读音（带声调） |
| `wrongPy` | string\|null | 答错时用户所选的错误读音；答对为 null |
| `mode` | string | `pair` 专项 \| `mix` 综合 |
| `source` | string | 练习入口：`normal` \| `infinite` \| `wrongbook` \| `retry` \| `one` |
| `fromFSRS` | boolean | 是否来自 FSRS 到期复习队列（区分"复习"与"新学"，2026-08-16 起记录） |

容量：上限 30000 条（约 300+ 天的练习量），超出自动丢弃最旧。

## 三、cards —— 每字当前状态（FSRS 调度状态已激活）

键 `pair:char`，每题作答后同步更新（FSRS 开启时由 `js/fsrs.js` 调度器写入）：

| 字段 | 说明 |
|---|---|
| `char` / `pair` | 卡片标识 |
| `state` | FSRS 状态：0=new、1=learning、2=review、3=relearning |
| `stability` / `difficulty` | FSRS 参数（稳定性 / 难度 1-10） |
| `due` / `scheduledDays` | 下次到期时间(ms) / 计划间隔(天) |
| `reps` | 累计练习次数 |
| `correctCount` / `wrongCount` | 累计答对 / 答错次数 |
| `firstTs` / `lastTs` / `lastRating` | 首次 / 最近作答时间与最近评分 |

> FSRS 关闭时（`settings.enableFSRS=false`）：作答只更新 reps/counts 统计，`state/stability/difficulty/due/scheduledDays` 保持初始值（state=0，其余 null）——回滚到纯随机出题的旧行为。

派生指标（无需存储，可随时由 reviews 聚合）：每日对错、正确率时间线、薄弱字排行等。

## 四、现有表（保持不变）

| 键 | 结构 | 说明 |
|---|---|---|
| `wrongBook` | `{char: {char, pair, wrongPy, correctPy, word, count, streak, lastTime, hidden}}` | 错题去重累积；重练连对 2 次自动移出；`hidden=true` 表示该字已标记已掌握——条目隐藏且不参与错题重练（保留数据），撤回已掌握时恢复 |
| `mastered` | `{char: {char, pair, time}}` | 已掌握字（右上角按钮随时标记/撤回） |
| `history` | `[{date, mode, pair, total, correct, durationSec}]` | 最近 500 轮汇总 |
| `settings` | `{defaultCount: number\|"infinite", enableFSRS: boolean}` | 默认题量（5/10/20/自定义数/无限）；`enableFSRS` 记忆调度开关（默认 true） |

## 五、导出 / 导入（备份与迁移）

设置页提供一键导出/导入，全部 6 张表打包为**版本化 JSON 文件**；导入采用**双向合并**（不覆盖），是跨设备迁移与多端同步的地基（方案见 `docs/sync-plan.md`）。

导出文件结构（v2）：

```json
{
  "app": "fuzzy-pinyin-fixer",
  "version": 2,
  "exportedAt": "2026-08-16T13:30:00+08:00",
  "data": { "reviews": [], "cards": {}, "wrongBook": {}, "mastered": {}, "history": [], "settings": {} }
}
```

**导入校验**（任一不过即整体拒绝，本地数据不动）：

| 检查 | 规则 |
|---|---|
| JSON 可解析 | 否 → 「文件不是有效的 JSON」 |
| `app` 标识 | 存在且不匹配 → 「不是本应用的备份文件」 |
| `version` | `> EXPORT_VERSION(2)` → 「版本过高，请升级应用」 |
| `data` 段 | 缺失 → 拒绝 |

**合并策略**（跨端同步的数据基础）：

| 表 | 策略 |
|---|---|
| `reviews` | 按 `(char, pair, ts)` 去重合并 → 按 ts 升序 → 超 30000 丢最旧；坏条目跳过不整体拒绝 |
| `cards` | 按 key 合并，同 key 冲突取 `lastTs` 较新者（整卡替换，保留 FSRS 扩展字段） |
| `wrongBook` | 按 key 合并，冲突取 `lastTime` 较新者；**替换时保护本地 `hidden` 标记**（远端旧版无此字段时保留本地值） |
| `mastered` | 按 key 合并，冲突取 `time` 较新者 |
| `history` | 整条序列化去重 → 超 500 丢最旧 |
| `settings` | 本地有记录 → 本地优先（不覆盖当前偏好）、补远端独有键；本地无记录（换设备/清空后）→ 采用备份值 |

导入返回 `{ok, merged:{reviews,cards,wrongBook,mastered,history,settings}}`（各表新增计数），供 UI 展示。

## 六、FSRS 记忆模型映射（后续接入，暂不实现）

参考：<https://github.com/open-spaced-repetition/fsrs4anki>（算法见 awesome-fsrs wiki）。

**状态（2026-08-16）：调度已接入，个性化训练待做。**

**调度（已完成）**：
- 核心：`js/fsrs.js`（FSRS-6，21 参数，从 fsrs4anki v6.1.1 移植，纯 JS 零依赖，`window.FSRS`）
- 每答一题 → `FSRS.review(card, rating, now)` 更新卡片 `state/stability/difficulty/due/scheduledDays` 写回 `cards`（`settings.enableFSRS=true` 时；默认开启）
- 出题：`due <= now` 的字优先（`buildQuestionsFSRS`，交错随机，`fromFSRS=true`），不足随机补充；关闭开关回滚到 `buildQuestionsRandom`（旧逻辑保留）
- 训练数据侧已齐备：`reviews` 完整记录 `rating` 与 `elapsedDays`；`scheduledDays` 自调度接入后开始填充

**个性化训练（待做，可选）**：定期用 `reviews` 历史拟合 FSRS-6 的 21 个 w 参数替换默认值。训练数据量参考：Anki 24.04+ 至少 400 条 review、旧版 1000 条；建议本项目 ≥1000 条后在设置页提供"训练参数"入口（Web Worker 后台跑，展示 log-loss 对比），之后每 1~3 个月重训一次。默认参数对任何数据量开箱即用（详见 `docs/fsrs-scenario.md`）。

## 七、历史数据说明

- 2026-08-16 之前的历史数据**没有字级流水**（`reviews` 表从接入时开始累积）；旧 `history` 轮次汇总无法回溯到字级，无需迁移。
- 旧 localStorage 数据与新增表完全兼容（新键不影响旧键读取）。
