# 声旁（谐声）系列分析与学习功能建议

> 背景：练习反馈「逐字背效率低、错过的字还会错」。用户观察到同声旁字读音相同（猩/星、苹/平），希望由点及面学习。本文用数据回答三个问题：这个现象叫什么、练习库中哪些字具备该特征（含反例）、如何据此改进学习功能。
>
> 数据：`docs/phonetic-series.json`｜脚本：`python scripts/analyze_phonetic_series.py --report`

## 一、这个现象学术上叫什么

| 术语 | 含义 | 与本项目的关系 |
| --- | --- | --- |
| 形声字 | 现代汉字 80% 以上为「形旁（表义）+ 声旁（表音）」的结构 | 统计对象 |
| 声旁 / 声符 | 形声字中表音的部件（猩、星 中的 星；苹、评 中的 平） | 系列核心 |
| **谐声系列 / 声符系列**（phonetic series） | 同一声旁构成的字群；音韵学有「同声必同部」（段玉裁） | 即用户说的「同字群」，本文分组依据 |
| 字族 / 字族识字 | 教学法术语：同声旁字集中教学（「声旁推音，生字开花」） | 功能设计参照 |
| 右文说 | 宋·王圣美：声旁位置兼表义——「水之文为波，木之文为纹」 | 背景知识 |
| 同源字（王力） | 同一词源派生的一组词（音近义通），用字层面未必共享声旁 | **≠** 本现象，注意区分：用户举的例是谐声系列，不是严格意义的同源字 |

**规律的可信度（文献交叉验证）**：周有光统计现代汉字声旁有效表音率约 39%（声韵调全同）；形声字占 80% 以上。本库 666 字实测：声韵调全同 25%、加声韵同 37%、加仅韵母同 52%——量级与文献一致（练习库偏向易混字，全同比略低于通用字表）。

**结论：用户直觉成立但有明确边界**——约一半练习字可以「由点及面」（学会一个声旁带出一族），另一半（韵母冲突 5 字、l/n 冲突 4 字、完全变读 210 字）恰恰是易错点，需要的不是否定规律，而是把例外显式管理起来。

## 二、统计方法与数据源

1. **拆字**：cjkvi-ids（CHISE IDS 维护版，88939 字）递归分解每个练习字的全部部件；
2. **读音**：Unicode Unihan `kMandarin`（整字与部件）；**部首**：`kRSUnicode`（Unicode 16 起位于 Unihan_IRGSources.txt）用于排除「部首部件冒充声旁」（仍⿰亻乃 的 亻 读 rén、性⿰忄生 的 忄 读 xīn，均为假反例来源）；
3. **五档匹配**：整字读音 vs 每个候选声旁读音 → 声韵调全同 / 声韵同 / 仅韵母同（ü≈u）/ 仅声母同 / 无关；
4. **聚类**：取最高档部件为声旁，按「cat≥2，或 cat==1 且韵母恰为本项目混淆音对（in↔ing、en↔eng）」连边，并查集聚成系列（连边方向指向声旁，使系列根=声旁核心）。

**已知局限**：
- 声旁按读音相似反推，完全变读的（银←艮 gèn、星←生 shēng）落入「无」桶——它们正是需要单独记忆的反例，已在清单中列示；
- 「仅韵母同」的边偶尔捕捉的是字形共享而非严格声旁（行 xíng 经 亍→丁 进入丁族）——但韵母一致性成立，教学上无害；
- IDS 自动拆字含少量省形变体，个別候选部件（𢀖=巠的简化形）显示为生僻字。

<!-- 由 scripts/analyze_phonetic_series.py --report 生成；手工段落见各节叙述 -->

## 统计总览

- 练习字（去重）：666
- 声旁识别五档：声韵调全同 166（25%）｜声韵同 83（12%）｜仅韵母同 99（15%）｜仅声母同 59（9%）｜无可识别声旁 259（39%）
- ≥2 字的谐声系列：109 个，覆盖 400 字（60%）；其余 266 字为单字（含象形/会意/声旁完全变读）
- 前后鼻音冲突系列：3 个；l/n 声母冲突系列：2 个

## 冲突系列（最高教学价值：同声旁但跨越混淆边界）

**令（lìng）族**：
- 令（lìng/lìng）、岭（lǐng/lǐng）、拎（līn/līn）、玲（líng/líng）、邻（lín/lín）、铃（líng/líng）、零（líng/líng）、领（lǐng/lǐng）、龄（líng/líng）

**𢀖（jīng）族**：
- 劲（jìn）、径（jìng）、氢（qīng）、痉（jìng）、经（jīng）、轻（qīng）、颈（jǐng）

**女（nǚ）族**：
- 努（nǔ）、女（nǚ）、屡（lǚ）、弩（nǔ）、怒（nù）、缕（lǚ）

**良（liáng）族**：
- 娘（niáng）、粮（liáng）、良（liáng）、酿（niàng）

**井（jǐng）族**：
- 井（jǐng）、进（jìn）、阱（jǐng）

## 反例字清单（声旁读音不可类推）

**韵母不可类推**（声母同、韵母恰差前后鼻音）：
- 劲 jìn（声旁 𢀖 jīng）、拎 līn（声旁 令 lìng）、聘 pìn（声旁 甹 pīng）、进 jìn（声旁 井 jǐng）、邻 lín（声旁 令 lìng）

**声母不可类推**（韵母同、l/n 交叉）：
- 娘 niáng（声旁 良 liáng）、屡 lǚ（声旁 女 nǚ）、缕 lǚ（声旁 女 nǚ）、酿 niàng（声旁 良 liáng）

**声旁完全变读**（形似声旁、读音无关；仅列候选含练习字的 58/210 字，全表见 phonetic-series.json）：
- 两 liǎng（形似 人 rén）、亨 hēng（形似 了 le）、亲 qīn（形似 立 lì）、仍 réng（形似 乃 nǎi）、内 nèi（形似 人 rén）、冥 míng（形似 六 liù）、净 jìng（形似 争 zhēng）、凉 liáng（形似 京 jīng）、凝 níng（形似 人 rén）、凭 píng（形似 任 rèn）、刘 liú（形似 文 wén）、听 tīng（形似 斤 jīn）、命 mìng（形似 人 rén）、囊 náng（形似 井 jǐng）、因 yīn（形似 人 rén）、奈 nài（形似 人 rén）、奉 fèng（形似 人 rén）、姓 xìng（形似 生 shēng）、岚 lán（形似 风 fēng）、庆 qìng（形似 人 rén）、念 niàn（形似 人 rén/今 jīn）、性 xìng（形似 生 shēng）、扔 rēng（形似 乃 nǎi）、拼 pīn（形似 并 bìng）、拿 ná（形似 人 rén）、掠 lüè（形似 京 jīng）、星 xīng（形似 生 shēng）、梁 liáng（形似 刃 rèn）、滥 làn（形似 皿 mǐn）、灵 líng（形似 人 rén）、炼 liàn（形似 人 rén）、烙 lào（形似 人 rén）、男 nán（形似 力 lì）、秦 qín（形似 人 rén）、稳 wěn（形似 心 xīn）、筋 jīn（形似 力 lì）、篮 lán（形似 皿 mǐn）、类 lèi（形似 人 rén）、粱 liáng（形似 刃 rèn）、耕 gēng（形似 井 jǐng）、耿 gěng（形似 人 rén）、腾 teng（形似 人 rén）、荧 yíng（形似 人 rén）、莺 yīng（形似 鸟 niǎo）、蓝 lán（形似 皿 mǐn）、虑 lǜ（形似 心 xīn）、衡 héng（形似 丁 dīng/人 rén）、谅 liàng（形似 京 jīng）、贫 pín（形似 分 fēn）、赁 lìn（形似 任 rèn）、辛 xīn（形似 立 lì）、郑 zhèng（形似 人 rén）、金 jīn（形似 人 rén）、闹 nào（形似 巾 jīn）、靖 jìng（形似 立 lì）、静 jìng（形似 争 zhēng）、音 yīn（形似 立 lì）、鸣 míng（形似 鸟 niǎo）

## 谐声系列总表（按规模降序）

标记：● 声韵调全同｜◑ 声韵同｜○ 仅韵母同｜◔ 仅声母同｜· 无

| 声旁 | 读音 | 系列成员（读音+声旁关系档位） | 冲突 |
| --- | --- | --- | --- |
| 丁 | dīng | 丁 dīng ·、亭 tíng ○、停 tíng ●、厅 tīng ○、叮 dīng ●、婷 tíng ●、宁 níng/níng ○、拧 níng/nǐng/níng/nǐng ●、狞 níng/níng ●、盯 dīng ●、行 xíng ○、订 dìng ◑、钉 dìng/dīng ●、顶 dǐng ◑ | — |
| 人 | rén | 人 rén ·、参 shēn ○、奋 fèn ○、奔 bēn ○、恩 ēn ○、朕 zhèn ○、渗 shèn ○、焚 fén ○、认 rèn ◑ | — |
| 令 | lìng | 令 lìng/lìng ·、岭 lǐng/lǐng ◑、拎 līn/līn ◔、玲 líng/líng ◑、邻 lín/lín ◔、铃 líng/líng ◑、零 líng/líng ◑、领 lǐng/lǐng ◑、龄 líng/líng ◑ | 前后鼻音  |
| 青 | qīng | 情 qíng ◑、晴 qíng ◑、清 qīng ●、睛 jīng ○、精 jīng ○、菁 jīng ○、蜻 qīng ●、请 qǐng ◑、青 qīng · | — |
| 分 | fēn | 份 fèn ◑、分 fèn/fēn ·、吩 fēn ●、氛 fēn ●、盆 pén ○、粉 fěn ◑、纷 fēn ●、芬 fēn ● | — |
| 正 | zhèng | 征 zhēng ◑、怔 zhèng ●、惩 chéng ○、政 zhèng ●、整 zhěng ◑、正 zhèng ·、症 zhèng ●、证 zhèng ● | — |
| 艮 | gěn | 垦 kěn ○、很 hěn ○、恨 hèn ○、恳 kěn ○、根 gēn ◑、狠 hěn ○、痕 hén ○、跟 gēn ◑ | — |
| 丰 | fēng | 丰 fēng ·、峰 fēng ●、篷 péng ○、缝 fèng ◑、蓬 péng ○、蜂 fēng ●、锋 fēng ● | — |
| 林 | lín | 彬 bīn ○、林 lín/lín ·、淋 lín/lín ●、琳 lín/lín ●、禁 jìn/jīn ○、襟 jīn ◑、霖 lín/lín ● | — |
| 申 | shēn | 伸 shēn ●、呻 shēn ●、婶 shěn ●、审 shěn ◑、申 shēn ·、神 shén ◑、绅 shēn ● | — |
| 龙 | lóng | 咙 lóng ●、垄 lǒng ◑、拢 lǒng ◑、珑 lóng ●、笼 lóng/lǒng ●、胧 lóng ●、龙 lóng · | — |
| 𢀖 | jīng | 劲 jìn ◔、径 jìng ◑、氢 qīng ○、痉 jìng ◑、经 jīng ●、轻 qīng ○、颈 jǐng ◑ | 前后鼻音  |
| 女 | nǚ | 努 nǔ ●、女 nǚ ·、屡 lǚ ○、弩 nǔ ●、怒 nù ◑、缕 lǚ ○ | l/n |
| 廷 | tíng | 庭 tíng ●、廷 tíng ·、挺 tǐng ◑、艇 tǐng ◑、蜓 tíng ●、霆 tíng ● | — |
| 文 | wén | 坟 fén ○、文 wén ·、紊 wěn ◑、纹 wén ●、蚊 wén ●、雯 wén ● | — |
| 朋 | péng | 崩 bēng ○、朋 péng ·、棚 péng ●、绷 bēng ○、蹦 bèng ◑、鹏 péng ● | — |
| 里 | lǐ | 厘 lí ◑、哩 li/lī ◑、狸 lí ◑、理 lǐ ●、里 lǐ ·、鲤 lǐ ● | — |
| 京 | jīng | 京 jīng ·、影 yǐng ○、惊 jīng ●、憬 jǐng ●、景 jǐng ◑ | — |
| 平 | píng | 坪 píng ●、平 píng ·、苹 píng ●、萍 píng ●、评 píng ● | — |
| 并 | bìng | 屏 píng ○、并 bìng ·、摒 bìng ●、瓶 píng ○、饼 bǐng ◑ | — |
| 录 | lù | 录 lù ·、氯 lǜ ●、碌 lù ●、禄 lù ●、绿 lǜ ● | — |
| 曾 | céng | 僧 sēng ○、增 zēng ○、曾 céng ·、赠 zèng ○、蹭 cèng ◑ | — |
| 留 | liú | 榴 liú ●、溜 liū ◑、留 liú ·、瘤 liú ●、馏 liú ● | — |
| 登 | dēng | 凳 dèng ◑、澄 chéng ○、登 dēng ◔、瞪 dèng ◑、蹬 dēng ● | — |
| 门 | mén | 们 men ◑、门 mén ·、问 wèn ○、闷 mèn ◑、闻 wén ○ | — |
| 三 | sān | 兰 lán ○、拦 lán ●、栏 lán ●、烂 làn ◑ | — |
| 争 | zhēng | 争 zhēng ·、挣 zhèng/zhēng ●、睁 zhēng ●、铮 zhēng ● | — |
| 仑 | lún | 仑 lún ·、沦 lún ●、论 lùn ◑、轮 lún ● | — |
| 列 | liè | 列 liè ·、咧 liě ◑、烈 liè ●、裂 liè ● | — |
| 利 | lì | 利 lì ·、梨 lí ◑、犁 lí ◑、莉 lì ● | — |
| 匕 | bǐ | 呢 ne/ní ●、妮 nī ◑、尼 ní ○、泥 ní ● | — |
| 娄 | lóu | 喽 lóu ●、搂 lǒu ◑、楼 lóu ●、髅 lóu ● | — |
| 心 | xīn | 心 xīn ·、沁 qìn ○、瘾 yǐn ●、隐 yǐn ○ | — |
| 成 | chéng | 城 chéng ●、成 chéng ·、盛 shèng ○、诚 chéng ● | — |
| 户 | hù | 庐 lú ○、炉 lú ○、芦 lú ○、驴 lǘ ○ | — |
| 斤 | jīn | 斤 jīn ·、欣 xīn ○、芹 qín ○、近 jìn ◑ | — |
| 星 | xīng | 星 xīng ·、猩 xīng ●、腥 xīng ●、醒 xǐng ◑ | — |
| 真 | zhēn | 嗔 chēn ○、慎 shèn ○、真 zhēn ·、镇 zhèn ◑ | — |
| 罗 | luó | 罗 luó ·、萝 luó ●、逻 luó ●、锣 luó ● | — |
| 良 | liáng | 娘 niáng ○、粮 liáng ●、良 liáng ·、酿 niàng ○ | l/n |
| 辰 | chén | 振 zhèn ○、晨 chén ●、辰 chén ◔、震 zhèn ○ | — |
| 风 | fēng | 枫 fēng ●、疯 fēng ●、讽 fěng ◑、风 fēng · | — |
| 㐬 | liú | 流 liú ●、琉 liú ●、硫 liú ● | — |
| 㐱 | zhěn | 珍 zhēn ◑、诊 zhěn ●、趁 chèn ○ | — |
| 井 | jǐng | 井 jǐng ·、进 jìn ◔、阱 jǐng ● | 前后鼻音  |
| 亨 | hēng | 亨 hēng ·、哼 hēng ●、烹 pēng ○ | — |
| 亲 | qīn | 亲 qīn ·、新 xīn ○、薪 xīn ● | — |
| 今 | jīn | 今 jīn ·、吟 yín ○、琴 qín ○ | — |
| 刃 | rèn | 刃 rèn ·、忍 rěn ◑、韧 rèn ● | — |
| 力 | lì | 力 lì ·、历 lì ●、荔 lì ● | — |
| 厉 | lì | 励 lì ●、厉 lì ·、蛎 lì ● | — |
| 厶 | sī | 漓 lí ●、璃 lí ●、离 lí ○ | — |
| 名 | míng | 名 míng ·、茗 míng ●、铭 míng ● | — |
| 呈 | chéng | 呈 chéng ·、程 chéng ●、逞 chěng ◑ | — |
| 因 | yīn | 因 yīn ·、姻 yīn ●、茵 yīn ● | — |
| 夌 | líng | 凌 líng/líng ●、菱 líng/líng ●、陵 líng/líng ● | — |
| 尞 | liào | 僚 liáo ◑、撩 liáo/liāo ◑、缭 liáo ◑ | — |
| 干 | gàn | 南 nán ○、喃 nán ●、楠 nán ● | — |
| 敬 | jìng | 擎 qíng ○、敬 jìng ◔、警 jǐng ◑ | — |
| 氶 | zhěng | 丞 chéng ○、拯 zhěng ●、蒸 zhēng ◑ | — |
| 生 | shēng | 牲 shēng ●、生 shēng ·、胜 shèng ◑ | — |
| 竟 | jìng | 境 jìng ●、竟 jìng ·、镜 jìng ● | — |
| 粦 | lín | 磷 lín/lín ●、鳞 lín/lín ●、麟 lín/lín ● | — |
| 艹 | cao | 劳 láo ○、唠 lào/láo ●、捞 lāo ◑ | — |
| 路 | lù | 璐 lù ●、路 lù ·、露 lù ● | — |
| 连 | lián | 莲 lián ●、连 lián ·、链 liàn ◑ | — |
| 那 | nà | 哪 nǎ ◑、娜 nuó/nà ●、那 nà · | — |
| 郎 | láng | 廊 láng ●、螂 láng ●、郎 láng · | — |
| 雷 | léi | 擂 lèi/léi ●、蕾 lěi ◑、雷 léi · | — |
| 𠬶 | jìn | 侵 qīn ○、寝 qǐn ○、浸 jìn ● | — |
| 㚅 | lóng | 窿 lóng ●、隆 lóng ● | — |
| 丙 | bǐng | 柄 bǐng ●、病 bìng ◑ | — |
| 两 | liǎng | 两 liǎng ·、辆 liàng ◑ | — |
| 乃 | nǎi | 乃 nǎi ·、奶 nǎi ● | — |
| 乘 | chéng | 乘 chéng ·、剩 shèng ○ | — |
| 佥 | qiān | 敛 liǎn ○、脸 liǎn ○ | — |
| 兼 | jiān | 廉 lián ○、镰 lián ● | — |
| 农 | nóng | 农 nóng ·、浓 nóng ● | — |
| 冡 | méng | 朦 méng ●、蒙 méng/měng ● | — |
| 刑 | xíng | 刑 xíng ·、型 xíng ● | — |
| 卢 | lú | 卢 lú ·、颅 lú ● | — |
| 吕 | lǚ | 侣 lǚ ●、吕 lǚ · | — |
| 堇 | jǐn | 勤 qín ○、谨 jǐn ● | — |
| 婴 | yīng | 婴 yīng ·、樱 yīng ● | — |
| 孟 | mèng | 孟 mèng ◔、猛 měng ◑ | — |
| 宾 | bīn | 宾 bīn ◔、滨 bīn ● | — |
| 巾 | jīn | 巾 jīn ·、锦 jǐn ◑ | — |
| 引 | yǐn | 引 yǐn ·、蚓 yǐn ● | — |
| 彭 | péng | 彭 péng ·、膨 péng ● | — |
| 拉 | lā | 啦 la ◑、拉 lā ◔ | — |
| 更 | gèng | 哽 gěng ◑、更 gèng/gēng · | — |
| 本 | běn | 本 běn ·、笨 bèn ◑ | — |
| 来 | lái | 来 lái ·、莱 lái ● | — |
| 民 | mín | 抿 mǐn ◑、民 mín · | — |
| 洛 | luò | 洛 luò ·、落 luò/là ● | — |
| 禽 | qín | 擒 qín ●、禽 qín ◔ | — |
| 立 | lì | 立 lì ·、粒 lì ● | — |
| 翁 | wēng | 嗡 wēng ●、翁 wēng · | — |
| 老 | lǎo | 姥 lǎo ●、老 lǎo · | — |
| 英 | yīng | 瑛 yīng ●、英 yīng ◔ | — |
| 虑 | lǜ | 滤 lǜ ●、虑 lǜ · | — |
| 览 | lǎn | 揽 lǎn ●、览 lǎn · | — |
| 贞 | zhēn | 侦 zhēn ●、贞 zhēn · | — |
| 贲 | bēn | 喷 pēn ○、愤 fèn ○ | — |
| 钅 | jīn | 钦 qīn ○、银 yín ○ | — |
| 音 | yīn | 歆 xīn ○、音 yīn · | — |
| 顷 | qǐng | 倾 qīng ◑、顷 qǐng · | — |
| 频 | pín | 濒 bīn ○、频 pín · | — |
| 鱼 | yú | 噜 lū ◑、鲁 lǔ ○ | — |

## 五、学习功能建议（按投入产出排序）

设计原则：**规律负责「带」，例外负责「防」**——字族让学会一个字顺带一族；冲突族与反例清单让 FSRS 把复习火力集中在真正会错的地方。

### P0 出题与反馈（改 quiz.js / store.js，复用现有 FSRS）

1. **错题解析显示声旁族**：答错后附「同声旁家族」卡片。例：答错 蜻 → 显示「青族：清 qīng、晴 qíng、情 qíng、请 qǐng、精 jīng……全是 ing」；答错 拎 → 显示「令族 9 字，只有 拎 līn、邻 lín 是 in，其余全 ing」。数据即 phonetic-series.json，一次 join。
2. **字族练习模式**：首页新增入口，按系列成组出题（先声旁字、后族内字，答对整族标记熟）。适合「由点及面」的 400 字（60%）。
3. **冲突系列专练**：令、𢀖（巠）、女、良、井 五族是「声旁规律的反例」，单独成关卡并配提示文案，替代撒网式练习。
4. **FSRS 系列联动**：族内一字答错 → 同族字复习进度适当提前（错误呈族内相关性）；系列全部掌握可整族免复。

### P1 内容与可视化（新增静态视图）

5. **字族图谱页**：109 个系列按音对/规模浏览，冲突族高亮（数据构建进 data/，与 words.js 同管线）。
6. **学习教程/文章页**：声旁规律科普（对应本文档第一节）、按音对的绕口令与口诀。示例（全 in/ing 族字，来自本库数据）：「**亭上一只蜻蜓停，盯着钉子听琴声**」（亭停蜻叮盯钉听——丁族+青族）；l/n 可用经典「牛郎恋刘娘」。
7. **TTS 结合**（已有 docs/tts-prd.md）：字族卡逐字朗读，音形双通道强化声旁-读音联结——模糊音矫正本质是听觉问题。

### P2 全站划词查询（用户提议，本站可实现）

8. **悬浮拼音卡**：练习页/图谱页指向任意字 → 悬浮显示读音、所属系列、族内其他字与声旁关系档位。参照 Saladict 的划词交互范式，但数据全本地（666 字查表），无需浏览器扩展。移动端用长按触发。

### 社区/商业产品参照

- **Outlier Dictionary of Chinese Characters**（Outlier Linguistics，Pleco 插件）：古文字学依据的形/音/义部件解释，付费、面向深度学习者；证明「按声旁理解汉字」有成熟付费市场。
- **Mandarin Blueprint**：phonetic component 记忆法体系化课程（Hanzi Movie Method）。
- **字族文识字法**：大陆小学「集中识字」流派，把同声旁字编成韵文教学；实证研究（含特殊教育）显示识字成效提升，同时强调必须显式处理声旁表音例外——与本文数据结论一致。
- **Saladict 沙拉查词**（开源浏览器扩展）：划词/悬浮取词交互范式的标杆。
- **zi.tools 字统网 / 汉典 zdic**：字源和谐声查询的中文工具站。

## 参考

- 周有光声旁有效表音率 ~39%、形声字占比 >80%：[形声字（百度百科）](https://baike.baidu.com/item/形声字/6106941)、[《小学汉字形声字表音特点及其分布的研究》（华东师大）](https://faculty.ecnu.edu.cn/_upload/article/files/db/2b/c6497b87406cbba204e82c2be105/408d22da-cf3d-45d1-8590-be438fac1349.pdf)
- [Review: The Outlier Dictionary of Chinese Characters（Hacking Chinese）](https://www.hackingchinese.com)
- [Outlier Teaches You How to Learn Chinese Characters（Sinosplice）](https://sinosplice.com)
- 字族文识字成效研究：[国小学生字教学行动研究](https://ndltd.ncl.edu.tw)、[字族文教学策略对国小智能障碍学生之识字成效](https://ir.nptu.edu.tw)
- [以聲符部件為主之漢字學習系統設計研究（Chang, 2012, ACL Anthology）](https://aclanthology.org)
- [沙拉查词 Saladict](https://saladict.net)
- 拆字与读音数据：[cjkvi/cjkvi-ids](https://github.com/cjkvi/cjkvi-ids)、[Unicode Unihan Database](https://www.unicode.org/charts/unihan.html)
