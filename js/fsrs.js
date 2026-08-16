/* ============================================================
   模糊音克星 · FSRS 间隔重复调度核心（FSRS-6）
   移植自 FSRS4Anki v6.1.1（open-spaced-repetition/fsrs4anki，
   fsrs4anki_scheduler.js，AGPL-3.0），算法与 Anki 内置 FSRS-6 一致。
   参考：https://github.com/open-spaced-repetition/awesome-fsrs/wiki/The-Algorithm

   纯 JS、零依赖、file:// 可运行。
   对外暴露 window.FSRS：
     - review(card, rating, now)  作答后更新卡片状态（调度入口）
     - 各公式纯函数（供测试与复用）
   卡片字段（对齐本项目 cards 表）：
     state: 0=new 1=learning 2=review 3=relearning
     stability / difficulty / due(ms) / scheduledDays(天)
   rating: 1=again 2=hard 3=good 4=easy
   ============================================================ */
(function () {
  "use strict";

  /* ---------- 默认参数（FSRS-6，FSRS4Anki v6.1.1 全局默认） ---------- */
  const W = [
    0.212,   // w0  init stability: again
    1.2931,  // w1  init stability: hard
    2.3065,  // w2  init stability: good
    8.2956,  // w3  init stability: easy
    6.4133,  // w4  init difficulty 偏移
    0.8334,  // w5  init difficulty 指数
    3.0194,  // w6  difficulty delta（rating 敏感）
    0.001,   // w7  mean reversion 权重
    1.8722,  // w8  回忆后稳定性：难度因子
    0.1666,  // w9  回忆后稳定性：稳定性指数
    0.796,   // w10 回忆后稳定性：遗忘因子
    1.4835,  // w11 遗忘后稳定性：系数
    0.0614,  // w12 遗忘后稳定性：难度指数
    0.2629,  // w13 遗忘后稳定性：稳定性指数
    1.6483,  // w14 遗忘后稳定性：遗忘因子
    0.6014,  // w15 hard 惩罚
    1.8729,  // w16 easy 奖励
    0.5425,  // w17 短时稳定性：系数
    0.0912,  // w18 短时稳定性：rating 偏移
    0.0658,  // w19 短时稳定性：稳定性指数
    0.1542,  // w20 decay（遗忘曲线指数）
  ];

  const REQUEST_RETENTION = 0.9; // 目标保留率（0.75~0.95，推荐 0.9）
  const MAXIMUM_INTERVAL = 36500; // 最大间隔（天）
  const DAY_MS = 86400000;
  const RATINGS = { again: 1, hard: 2, good: 3, easy: 4 };

  const DECAY = -W[20];
  const FACTOR = Math.pow(0.9, 1 / DECAY) - 1;

  /* 难度夹取 [1, 10]，保留 2 位小数 */
  function constrainDifficulty(d) {
    return Math.min(Math.max(Number(d.toFixed(2)), 1), 10);
  }

  /* 间隔扰动（防卡片同日扎堆）；ivl < 2.5 天不扰动 */
  function applyFuzz(ivl) {
    if (ivl < 2.5) return Math.max(1, Math.round(ivl));
    const minIvl = Math.max(2, Math.round(ivl * 0.95 - 1));
    const maxIvl = Math.round(ivl * 1.05 + 1);
    return Math.floor(fuzzFn() * (maxIvl - minIvl + 1) + minIvl);
  }

  /* fuzz 随机源（测试可注入固定值） */
  let fuzzFn = () => Math.random();

  /* 遗忘曲线：R(t) = (1 + FACTOR·t/S)^DECAY */
  function forgettingCurve(elapsedDays, stability) {
    return Math.pow(1 + (FACTOR * elapsedDays) / stability, DECAY);
  }

  /* 由稳定性求间隔（天）：s/FACTOR·(R^(1/DECAY) - 1)，夹取 [1, max] */
  function nextInterval(stability) {
    const ivl = (stability / FACTOR) * (Math.pow(REQUEST_RETENTION, 1 / DECAY) - 1);
    return Math.min(Math.max(applyFuzz(ivl), 1), MAXIMUM_INTERVAL);
  }

  /* 难度更新：delta_d 线性阻尼 + 均值回归 */
  function nextDifficulty(d, rating) {
    const deltaD = -W[6] * (rating - 3);
    const nextD = d + ((deltaD * (10 - d)) / 9);
    return constrainDifficulty(meanReversion(initDifficulty(4), nextD));
  }

  function meanReversion(init, current) {
    return W[7] * init + (1 - W[7]) * current;
  }

  /* 回忆成功后稳定性（review 阶段） */
  function nextRecallStability(d, s, r, rating) {
    const hardPenalty = rating === 2 ? W[15] : 1;
    const easyBonus = rating === 4 ? W[16] : 1;
    return Number(
      (
        s *
        (1 +
          Math.exp(W[8]) *
            (11 - d) *
            Math.pow(s, -W[9]) *
            (Math.exp((1 - r) * W[10]) - 1) *
            hardPenalty *
            easyBonus)
      ).toFixed(2)
    );
  }

  /* 遗忘后稳定性（答错，review 阶段） */
  function nextForgetStability(d, s, r) {
    const sMin = s / Math.exp(W[17] * W[18]);
    return Number(
      Math.min(
        W[11] *
          Math.pow(d, -W[12]) *
          (Math.pow(s + 1, W[13]) - 1) *
          Math.exp((1 - r) * W[14]),
        sMin
      ).toFixed(2)
    );
  }

  /* 短时稳定性（learning / relearning 阶段） */
  function nextShortTermStability(s, rating) {
    let sinc = Math.exp(W[17] * (rating - 3 + W[18])) * Math.pow(s, -W[19]);
    if (rating >= 3) sinc = Math.max(sinc, 1);
    return Number((s * sinc).toFixed(2));
  }

  /* 新卡初始难度 */
  function initDifficulty(rating) {
    return Number(constrainDifficulty(W[4] - Math.exp(W[5] * (rating - 1)) + 1).toFixed(2));
  }

  /* 新卡初始稳定性 */
  function initStability(rating) {
    return Number(Math.max(W[rating - 1], 0.1).toFixed(2));
  }

  /* ============================================================
     调度入口：作答后更新卡片状态
     card: {state, stability, difficulty, due, lastTs, ...}
     rating: 1=again 2=hard 3=good 4=easy
     返回更新后的 {state, stability, difficulty, due, scheduledDays}
     ============================================================ */
  function review(card, rating, now) {
    now = now || Date.now();
    const state = card.state || 0;
    let s, d, newState;

    if (state === 2) {
      // Review：用遗忘曲线 + 回忆/遗忘公式
      const elapsed = card.lastTs ? (now - card.lastTs) / DAY_MS : null;
      const r = elapsed == null ? 0.9 : forgettingCurve(elapsed, card.stability);
      s = rating === 1 ? nextForgetStability(card.difficulty, card.stability, r) : nextRecallStability(card.difficulty, card.stability, r, rating);
      d = nextDifficulty(card.difficulty, rating);
    } else {
      // New(0) / Learning(1) / Relearning(3)：短时稳定性
      const baseS = state === 0 ? initStability(rating) : card.stability;
      const baseD = state === 0 ? initDifficulty(rating) : card.difficulty;
      s = nextShortTermStability(baseS, rating);
      d = nextDifficulty(baseD, rating);
    }

    newState = rating === 1 ? 3 : 2; // 答错 → relearning；答对 → review

    const interval = nextInterval(s);
    return {
      state: newState,
      stability: s,
      difficulty: d,
      due: now + interval * DAY_MS,
      scheduledDays: interval,
    };
  }

  /* 卡片是否到期（用于复习队列） */
  function isDue(card, now) {
    return !!(card && card.due && card.due <= (now || Date.now()));
  }

  /* 覆盖 fuzz 随机源（测试注入） */
  function setFuzz(fn) {
    fuzzFn = fn || (() => Math.random());
  }

  window.FSRS = {
    VERSION: "FSRS-6 (FSRS4Anki v6.1.1 移植)",
    W,
    REQUEST_RETENTION,
    MAXIMUM_INTERVAL,
    DECAY,
    FACTOR,
    RATINGS,
    DAY_MS,
    review,
    isDue,
    setFuzz,
    /* 公式（测试/扩展用） */
    forgettingCurve,
    nextInterval,
    nextDifficulty,
    nextRecallStability,
    nextForgetStability,
    nextShortTermStability,
    initDifficulty,
    initStability,
    constrainDifficulty,
  };
})();
