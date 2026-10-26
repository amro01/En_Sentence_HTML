import test from 'node:test';
import assert from 'node:assert/strict';

import {
    WEAK_DEFAULTS,
    REVIEW_INTERVAL_DAYS,
    normalizeSentence,
    sentenceId,
    computeWeakScore,
    localDateKey,
    addDays,
    daysBetween,
    createPool,
    ingestObservation,
    setManualWeak,
    markServed,
    pickReviewBatch,
    buildPack,
    encodePack,
    decodePack,
    validatePack,
    importPack,
    prunePool,
    describeWeakReasons,
    toBase64Url,
    fromBase64Url,
    extractPackBlock
} from '../js/weak/weak-core.js';
import { WEAK_RUNTIME_SOURCE } from '../js/templates/generated-weak.js';

const CFG = {
    timeLimit: 15,
    replayLimit: 3,
    masteryThreshold: 3,
    weakThreshold: 40,
    fastThreshold: 22
};

const EN = 'I have already finished my homework.';
const ID = sentenceId(EN);

function sig(over) {
    return Object.assign({
        time: 0,
        replay: 0,
        mastery: 0,
        isTrap: false,
        trapCaught: false,
        trapAutoRevealed: false,
        wrongReadCount: 0
    }, over || {});
}

function obs(over) {
    return Object.assign({
        id: ID,
        en: EN,
        zh: '我已经完成作业了。',
        sig: sig(),
        attempted: true,
        practiceId: 'P1',
        updatedAt: '2026-10-26T10:00:00.000Z'
    }, over || {});
}

/* ============================================================
 *  身份 / 评分 / 日期
 * ============================================================ */

test('句子归一化：空白、大小写、首尾标点、弯引号', () => {
    assert.equal(normalizeSentence('  I   HAVE  finished.  '), 'i have finished');
    assert.equal(normalizeSentence('“Hello!”'), 'hello');
    assert.equal(normalizeSentence('Let’s go!'), "let's go");
    assert.equal(normalizeSentence('你好。'), '你好。');
    assert.equal(normalizeSentence(null), '');
});

test('句子 id：稳定、16 位 hex、归一化后一致', () => {
    assert.match(ID, /^[0-9a-f]{16}$/);
    assert.equal(sentenceId('  I have   ALREADY finished my homework. '), ID);
    assert.notEqual(sentenceId('Another sentence.'), ID);
});

test('生疏分：校准样例与边界钳制', () => {
    const T = { timeLimit: 15, replayLimit: 3, masteryThreshold: 3 };
    assert.equal(computeWeakScore(sig({ time: 10, mastery: 3 }), T), 6);
    assert.equal(computeWeakScore(sig({ time: 15, replay: 1, mastery: 3 }), T), 23);
    assert.equal(computeWeakScore(sig({ time: 20, replay: 2, mastery: 1 }), T), 46);
    assert.equal(computeWeakScore(sig({ time: 8, mastery: 0, isTrap: true, trapCaught: false }), T), 41);
    assert.equal(computeWeakScore(sig({
        time: 12, replay: 1, mastery: 3, isTrap: true, trapCaught: true, wrongReadCount: 1
    }), T), 22);
    assert.equal(computeWeakScore(sig({ time: 600, replay: 999, mastery: 0, isTrap: true, trapAutoRevealed: true }), T), 100);
    assert.equal(computeWeakScore(sig({ time: 999, mastery: 0 }), T), 45);
});

test('日期工具：本地键、加天、跨年、差天', () => {
    assert.equal(localDateKey(new Date(2026, 9, 26)), '2026-10-26');
    assert.equal(addDays('2026-10-26', 1), '2026-10-27');
    assert.equal(addDays('2026-12-31', 1), '2027-01-01');
    assert.equal(daysBetween('2026-10-24', '2026-10-26'), 2);
    assert.equal(daysBetween('2026-10-26', '2026-10-24'), -2);
    assert.deepEqual(REVIEW_INTERVAL_DAYS, [1, 2, 4, 7, 14]);
});

/* ============================================================
 *  生命周期
 * ============================================================ */

test('生命周期：判弱 → 累计失败 → 两次快速通过 → 毕业', () => {
    const pool = createPool('宝贝');

    let result = ingestObservation(pool, obs({ sig: sig({ time: 20, replay: 2, mastery: 1 }) }), CFG, '2026-10-26');
    assert.equal(result.action, 'created');
    const entry = pool.entries[ID];
    assert.equal(entry.status, 'weak');
    assert.equal(entry.failCount, 1);
    assert.equal(entry.flagCount, 1);
    assert.equal(entry.successStreak, 0);
    assert.equal(entry.reviewCount, 1);
    assert.equal(entry.nextReviewAt, '2026-10-27');
    assert.equal(entry.ewmaScore, 46);
    assert.equal(entry.lastSignals.time, 20);

    result = ingestObservation(pool, obs({
        practiceId: 'P2',
        updatedAt: '2026-10-27T10:00:00.000Z',
        sig: sig({ time: 20, replay: 2, mastery: 1 })
    }), CFG, '2026-10-27');
    assert.equal(result.action, 'merged');
    assert.equal(entry.failCount, 2);
    assert.equal(entry.nextReviewAt, '2026-10-29');

    result = ingestObservation(pool, obs({
        practiceId: 'P3',
        updatedAt: '2026-10-29T10:00:00.000Z',
        sig: sig({ time: 10, mastery: 3 })
    }), CFG, '2026-10-29');
    assert.equal(entry.successStreak, 1);
    assert.equal(entry.nextReviewAt, '2026-10-30');
    assert.equal(entry.status, 'weak');

    result = ingestObservation(pool, obs({
        practiceId: 'P4',
        updatedAt: '2026-10-30T10:00:00.000Z',
        sig: sig({ time: 10, mastery: 3 })
    }), CFG, '2026-10-30');
    assert.equal(entry.successStreak, 2);
    assert.equal(entry.status, 'graduated');
    assert.equal(entry.nextReviewAt, '2026-11-13');

    const before = JSON.stringify(entry);
    result = ingestObservation(pool, obs({
        practiceId: 'P4',
        updatedAt: '2026-10-30T10:00:00.000Z',
        sig: sig({ time: 10, mastery: 3 })
    }), CFG, '2026-10-30');
    assert.equal(result.action, 'duplicate');
    assert.equal(JSON.stringify(entry), before);

    // 同一 practiceId 的新快照只更新分数，不重复推进生命周期
    ingestObservation(pool, obs({
        practiceId: 'P4',
        updatedAt: '2026-10-30T11:00:00.000Z',
        sig: sig({ time: 20, replay: 2, mastery: 1 })
    }), CFG, '2026-10-30');
    assert.equal(entry.failCount, 2);
    assert.equal(entry.reviewCount, 4);
    assert.equal(entry.status, 'graduated');
    assert.equal(entry.lastScore, 46);
});

test('生命周期：非快速通过会打断连续达标', () => {
    const pool = createPool();
    ingestObservation(pool, obs({ sig: sig({ time: 20, replay: 2, mastery: 1 }) }), CFG, '2026-10-26');
    const entry = pool.entries[ID];
    ingestObservation(pool, obs({
        practiceId: 'P2',
        updatedAt: '2026-10-27T10:00:00.000Z',
        sig: sig({ time: 10, mastery: 3 })
    }), CFG, '2026-10-27');
    assert.equal(entry.successStreak, 1);

    const result = ingestObservation(pool, obs({
        practiceId: 'P3',
        updatedAt: '2026-10-28T10:00:00.000Z',
        sig: sig({ time: 17, replay: 2, mastery: 3 })
    }), CFG, '2026-10-28');
    assert.equal(result.score, 32);
    assert.equal(entry.successStreak, 0);
    assert.equal(entry.status, 'weak');
    assert.equal(entry.nextReviewAt, '2026-10-29');
});

test('未达阈值的陌生句子不建条目', () => {
    const pool = createPool();
    const other = 'A perfectly easy sentence.';
    const result = ingestObservation(pool, {
        id: sentenceId(other),
        en: other,
        sig: sig({ time: 5, mastery: 3 }),
        attempted: true,
        practiceId: 'X1',
        updatedAt: '2026-10-26T10:00:00.000Z'
    }, CFG, '2026-10-26');
    assert.equal(result.action, 'ignored');
    assert.equal(Object.keys(pool.entries).length, 0);
});

test('手动标记：最高优先级、立即到期、可解除', () => {
    const pool = createPool();
    const manualAt = '2026-10-26T08:00:00.000Z';

    let result = ingestObservation(pool, obs({
        sig: sig(),
        attempted: false,
        manualWeak: true,
        manualAt: manualAt,
        updatedAt: manualAt
    }), CFG, '2026-10-26');
    assert.equal(result.action, 'created');
    const entry = pool.entries[ID];
    assert.equal(entry.manualWeak, true);
    assert.equal(entry.status, 'weak');
    assert.equal(entry.flagCount, 1);
    assert.equal(entry.nextReviewAt, '2026-10-26');
    assert.equal(entry.reviewCount, 0);

    result = ingestObservation(pool, obs({
        sig: sig(),
        attempted: false,
        manualWeak: false,
        manualAt: '2026-10-26T09:00:00.000Z',
        updatedAt: '2026-10-26T09:00:00.000Z'
    }), CFG, '2026-10-26');
    assert.equal(entry.manualWeak, false);
    assert.equal(entry.status, 'graduated');
    assert.equal(entry.nextReviewAt, '2026-11-09');
});

test('手动标记：连续两次快速通过后自动解除并毕业', () => {
    const pool = createPool();
    ingestObservation(pool, obs({
        sig: sig(),
        attempted: false,
        manualWeak: true,
        manualAt: '2026-10-26T08:00:00.000Z',
        updatedAt: '2026-10-26T08:00:00.000Z'
    }), CFG, '2026-10-26');
    const entry = pool.entries[ID];

    ingestObservation(pool, obs({
        practiceId: 'P2',
        updatedAt: '2026-10-27T10:00:00.000Z',
        sig: sig({ time: 10, mastery: 3 })
    }), CFG, '2026-10-27');
    assert.equal(entry.manualWeak, true);
    assert.equal(entry.successStreak, 1);

    ingestObservation(pool, obs({
        practiceId: 'P3',
        updatedAt: '2026-10-28T10:00:00.000Z',
        sig: sig({ time: 10, mastery: 3 })
    }), CFG, '2026-10-28');
    assert.equal(entry.manualWeak, false);
    assert.equal(entry.status, 'graduated');
    assert.equal(entry.nextReviewAt, '2026-11-11');
    assert.equal(entry.flagCount, 1);
});

test('手动标记期间不累计自动失败次数', () => {
    const pool = createPool();
    ingestObservation(pool, obs({
        sig: sig(),
        attempted: false,
        manualWeak: true,
        manualAt: '2026-10-26T08:00:00.000Z',
        updatedAt: '2026-10-26T08:00:00.000Z'
    }), CFG, '2026-10-26');
    const entry = pool.entries[ID];

    ingestObservation(pool, obs({
        practiceId: 'P2',
        updatedAt: '2026-10-27T10:00:00.000Z',
        sig: sig({ time: 25, replay: 4, mastery: 0 })
    }), CFG, '2026-10-27');
    assert.equal(entry.failCount, 0);
    assert.equal(entry.status, 'weak');
    assert.equal(entry.manualWeak, true);
});

test('面板手动标记与解除', () => {
    const pool = createPool();
    ingestObservation(pool, obs({ sig: sig({ time: 20, replay: 2, mastery: 1 }) }), CFG, '2026-10-26');
    const entry = pool.entries[ID];
    assert.equal(entry.flagCount, 1);

    setManualWeak(pool, ID, true, { today: '2026-10-26', now: '2026-10-26T12:00:00.000Z' });
    assert.equal(entry.manualWeak, true);
    assert.equal(entry.flagCount, 2);
    assert.equal(entry.nextReviewAt, '2026-10-26');

    setManualWeak(pool, ID, false, { today: '2026-10-26', now: '2026-10-26T13:00:00.000Z' });
    assert.equal(entry.manualWeak, false);
    assert.equal(entry.status, 'graduated');
    assert.equal(entry.nextReviewAt, '2026-11-09');
});

test('生成计数：同一天只记一次', () => {
    const pool = createPool();
    ingestObservation(pool, obs({ sig: sig({ time: 20, replay: 2, mastery: 1 }) }), CFG, '2026-10-26');
    const entry = pool.entries[ID];

    assert.equal(markServed(pool, [ID], { today: '2026-10-26' }), 1);
    assert.equal(entry.servedCount, 1);
    assert.equal(markServed(pool, [ID], { today: '2026-10-26' }), 0);
    assert.equal(markServed(pool, [ID], { today: '2026-10-27' }), 1);
    assert.equal(entry.servedCount, 2);
});

/* ============================================================
 *  抽样
 * ============================================================ */

function buildSelectionPool() {
    const pool = createPool();

    const A = 'Manual pin sentence.';
    ingestObservation(pool, {
        id: sentenceId(A), en: A, sig: sig(), attempted: false,
        manualWeak: true, manualAt: '2026-10-26T08:00:00.000Z',
        practiceId: 'M1', updatedAt: '2026-10-26T08:00:00.000Z'
    }, CFG, '2026-10-26');

    const B = 'Due weak sentence.';
    ingestObservation(pool, {
        id: sentenceId(B), en: B, sig: sig({ time: 20, replay: 2, mastery: 1 }),
        attempted: true, practiceId: 'B1', updatedAt: '2026-10-20T10:00:00.000Z'
    }, CFG, '2026-10-20');

    const C = 'Future weak sentence.';
    ingestObservation(pool, {
        id: sentenceId(C), en: C, sig: sig({ time: 20, replay: 2, mastery: 1 }),
        attempted: true, practiceId: 'C1', updatedAt: '2026-10-26T09:30:00.000Z'
    }, CFG, '2026-10-26');

    const D = 'Graduated sentence.';
    ingestObservation(pool, {
        id: sentenceId(D), en: D, sig: sig({ time: 20, replay: 2, mastery: 1 }),
        attempted: true, practiceId: 'D1', updatedAt: '2026-10-20T10:00:00.000Z'
    }, CFG, '2026-10-20');
    ingestObservation(pool, {
        id: sentenceId(D), en: D, sig: sig({ time: 10, mastery: 3 }),
        attempted: true, practiceId: 'D2', updatedAt: '2026-10-25T10:00:00.000Z'
    }, CFG, '2026-10-25');
    ingestObservation(pool, {
        id: sentenceId(D), en: D, sig: sig({ time: 10, mastery: 3 }),
        attempted: true, practiceId: 'D3', updatedAt: '2026-10-26T10:00:00.000Z'
    }, CFG, '2026-10-26');

    const E = 'Trap sentence.';
    ingestObservation(pool, {
        id: sentenceId(E), en: E,
        sig: sig({ time: 30, replay: 5, mastery: 0, isTrap: true, trapAutoRevealed: true }),
        attempted: true, practiceId: 'E1', updatedAt: '2026-10-25T11:00:00.000Z'
    }, CFG, '2026-10-25');

    return {
        pool: pool,
        A: sentenceId(A), B: sentenceId(B), C: sentenceId(C),
        D: sentenceId(D), E: sentenceId(E)
    };
}

test('抽样：手动置顶、到期优先、排除毕业', () => {
    const setup = buildSelectionPool();
    const picked = pickReviewBatch(setup.pool, { limit: 2, today: '2026-10-26' });
    assert.equal(picked.length, 2);
    assert.equal(picked[0].id, setup.A);
    assert.equal(picked[1].id, setup.E);

    const pickedNoTrap = pickReviewBatch(setup.pool, { limit: 2, today: '2026-10-26', includeTrap: false });
    assert.deepEqual(pickedNoTrap.map(e => e.id), [setup.A, setup.B]);

    assert.deepEqual(pickReviewBatch(setup.pool, { limit: 0, today: '2026-10-26' }), []);
    const all = pickReviewBatch(setup.pool, { limit: 10, today: '2026-10-26' });
    assert.equal(all.length, 4);
    assert.ok(!all.some(e => e.id === setup.D));
    // 未到期条目只作为补位，排在所有到期条目之后
    assert.equal(all[all.length - 1].id, setup.C);
});

test('抽样：随机策略只从未到期/全部候选中取', () => {
    const setup = buildSelectionPool();
    const picked = pickReviewBatch(setup.pool, {
        limit: 3, today: '2026-10-26', strategy: 'random', rng: () => 0
    });
    assert.equal(picked.length, 3);
    assert.ok(!picked.some(e => e.id === setup.C));
    assert.ok(!picked.some(e => e.id === setup.D));
});

/* ============================================================
 *  错题包
 * ============================================================ */

function samplePack() {
    const entries = [
        {
            id: ID, en: EN, zh: '我已经完成作业了。',
            sig: sig({ time: 20, replay: 2, mastery: 1 }),
            score: 46, weak: true, manualWeak: false, attempted: true,
            practiceId: 'P1', updatedAt: '2026-10-26T10:00:00.000Z'
        },
        {
            id: sentenceId('Pass sentence.'),
            en: 'Pass sentence.',
            sig: sig({ time: 10, mastery: 3 }),
            score: 6, weak: false, manualWeak: false, attempted: true,
            practiceId: 'P1', updatedAt: '2026-10-26T10:01:00.000Z'
        }
    ];
    return buildPack(entries, {
        childName: '宝贝',
        practiceId: 'P1',
        exportedAt: '2026-10-26T10:02:00.000Z'
    });
}

test('错题包：编码/解码往返、报告块提取', () => {
    const pack = samplePack();
    const text = encodePack(pack);
    assert.match(text, /^[A-Za-z0-9_-]+$/);
    assert.equal(fromBase64Url(toBase64Url('中文 test 🎧')), '中文 test 🎧');

    const decoded = decodePack(text);
    assert.equal(decoded.schema, 1);
    assert.equal(decoded.childName, '宝贝');
    assert.equal(Object.keys(decoded.entries).length, 2);
    assert.equal(decoded.entries[ID].en, EN);
    assert.equal(decoded.entries[ID].sig.time, 20);
    assert.equal(decoded.entries[ID].score, 46);

    const report = 'header\n--- WEAK-PACK v1 ---\n' + text + '\n--- END WEAK-PACK ---\nfooter';
    assert.equal(extractPackBlock(report), text);
    assert.equal(decodePack(report).entries[ID].en, EN);
});

test('错题包：钳制越界信号、重算 id、忽略伪造 id', () => {
    const raw = JSON.parse(JSON.stringify(samplePack()));
    raw.entries[ID] = Object.assign({}, raw.entries[ID], {
        sig: {
            time: 9999, replay: -5, mastery: 10000, count: 99999,
            isTrap: true, trapCaught: false, trapAutoRevealed: true, wrongReadCount: -3
        },
        score: 999
    });
    raw.entries.bad = { id: 'bad', en: 'Other sentence.' };

    const clean = validatePack(raw);
    assert.equal(clean.entries[ID].sig.time, 600);
    assert.equal(clean.entries[ID].sig.replay, 0);
    assert.equal(clean.entries[ID].sig.mastery, 999);
    assert.equal(clean.entries[ID].sig.count, 9999);
    assert.equal(clean.entries[ID].sig.wrongReadCount, 0);
    assert.equal(clean.entries[ID].score, 100);
    assert.equal(clean.entries.bad, undefined);
    assert.ok(clean.entries[sentenceId('Other sentence.')]);
});

test('错题包：版本、条数、垃圾输入均拒绝', () => {
    assert.throws(() => validatePack({ schema: 2, entries: {} }), /版本/);
    assert.throws(() => validatePack({ schema: 1 }), /entries/);
    assert.throws(() => decodePack('not-a-pack!!'), /无法识别/);
    assert.throws(() => decodePack(''), /为空/);

    const big = { schema: 1, entries: {} };
    for (let i = 0; i < WEAK_DEFAULTS.maxPackEntries + 1; i++) {
        big.entries['x' + i] = { en: 'sentence number ' + i };
    }
    assert.throws(() => validatePack(big), /过多/);
});

test('导入错题包：幂等、只创建弱句', () => {
    const pool = createPool();
    const pack = samplePack();

    const first = importPack(pool, pack, CFG, '2026-10-26');
    assert.deepEqual(first, { created: 1, merged: 0, duplicate: 0, ignored: 1, invalid: 0 });
    assert.equal(pool.entries[ID].failCount, 1);
    assert.equal(pool.entries[ID].status, 'weak');

    const second = importPack(pool, pack, CFG, '2026-10-26');
    assert.deepEqual(second, { created: 0, merged: 0, duplicate: 1, ignored: 1, invalid: 0 });
    assert.equal(pool.entries[ID].failCount, 1);
});

/* ============================================================
 *  容量 / 展示
 * ============================================================ */

test('容量控制：先淘汰毕业，手动条目保留', () => {
    const pool = createPool();
    for (let i = 0; i < 5; i++) {
        const en = 'Sentence number ' + i + '.';
        ingestObservation(pool, {
            id: sentenceId(en), en: en,
            sig: sig({ time: 20, replay: 2, mastery: 1 }),
            attempted: true,
            practiceId: 'S' + i,
            updatedAt: '2026-10-2' + i + 'T10:00:00.000Z'
        }, CFG, '2026-10-2' + i);
    }
    const manualId = sentenceId('Sentence number 4.');
    setManualWeak(pool, manualId, true, {
        today: '2026-10-26', now: '2026-10-26T12:00:00.000Z'
    });

    const removed = prunePool(pool, { maxEntries: 2 });
    assert.equal(removed, 3);
    assert.equal(Object.keys(pool.entries).length, 2);
    assert.ok(pool.entries[manualId]);
});

test('展示辅助：能说明手动/超时原因', () => {
    const pool = createPool();
    ingestObservation(pool, obs({ sig: sig({ time: 20, replay: 2, mastery: 1 }) }), CFG, '2026-10-26');
    const reasons = describeWeakReasons(pool.entries[ID], Object.assign({}, CFG, { replayLimit: 1 }));
    assert.match(reasons, /思考20秒/);
    assert.match(reasons, /重听2次/);

    setManualWeak(pool, ID, true, { today: '2026-10-26', now: '2026-10-26T12:00:00.000Z' });
    assert.match(describeWeakReasons(pool.entries[ID], CFG), /手动标记/);
});

/* ============================================================
 *  生成页运行时
 * ============================================================ */

test('生成页运行时：自包含、可解析、只暴露一个命名空间', () => {
    assert.ok(WEAK_RUNTIME_SOURCE.includes('WEAK_OUTBOX_'));
    assert.ok(WEAK_RUNTIME_SOURCE.includes('window.WeakReview'));
    assert.ok(!WEAK_RUNTIME_SOURCE.includes('${'));
    assert.doesNotThrow(() => new Function(WEAK_RUNTIME_SOURCE));
});

/* ============================================================
 *  生成页组装冒烟
 * ============================================================ */

test('生成页：运行时已注入、脚本可解析、注入值不截断 script', async () => {
    const { buildGeneratedHTML } = await import('../js/templates/generated-html.js');
    const html = buildGeneratedHTML({
        date: '2026年-10月-26日',
        cardsHTML: '<div class="card" data-english="abc" data-zh="%E4%BD%A0%E5%A5%BD" data-card-index="0" data-weak-id="0123456789abcdef" data-review-count="2"><div class="content"><div class="chinese"></div><div class="english" id="english-0"></div></div><button class="reveal-btn locked" disabled></button><div class="energy-bar"></div><div class="weak-row"><button type="button" class="weak-toggle" aria-pressed="false" onclick="WeakReview.toggleCardWeak(this)">🔴 需复习</button></div></div>',
        hasAnyTrap: false,
        childName: '宝贝"</script><x>',
        practiceId: 'STATS_TEST',
        replayThreshold: 3,
        timeThreshold: 15,
        masteryThreshold: 3,
        effectiveChances: 0,
        trapCount: 0,
        trapData: [],
        parentLockEnabled: true,
        parentPasscode: 'p"</script>'
    });

    assert.ok(html.includes('window.WeakReview'));
    assert.ok(html.includes('WEAK_OUTBOX_'));
    assert.ok(html.includes('totalSentences: 1'));
    assert.ok(html.includes('id="weak-panel"'));
    assert.ok(html.includes('id="weak-count-btn"'));
    assert.ok(html.includes('WeakReview.toggleList'));
    assert.ok(html.includes('WeakReview.toggleCardWeak'));
    assert.ok(html.includes('data-zh='));
    assert.ok(!html.includes('</script><x>'));
    assert.ok(!html.includes('p"</script>'));

    const match = html.match(/<script>([\s\S]*)<\/script>/);
    assert.ok(match);
    assert.doesNotThrow(() => new Function(match[1]));
});

test('手动标记缺少时间戳时用观察时间兜底', () => {
    const pool = createPool();
    const result = ingestObservation(pool, {
        id: ID, en: EN, sig: sig(), attempted: false,
        manualWeak: true, manualAt: null,
        practiceId: 'M1', updatedAt: '2026-10-26T08:00:00.000Z'
    }, CFG, '2026-10-26');
    assert.equal(result.action, 'created');
    assert.equal(pool.entries[ID].manualWeak, true);
    assert.equal(pool.entries[ID].manualAt, '2026-10-26T08:00:00.000Z');

    const pack = validatePack({
        schema: 1,
        exportedAt: '2026-10-26T09:00:00.000Z',
        entries: {
            x: { en: 'Pack manual sentence.', manualWeak: true, attempted: false }
        }
    });
    assert.equal(pack.entries[sentenceId('Pack manual sentence.')].manualAt, '2026-10-26T09:00:00.000Z');
});
