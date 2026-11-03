import test from 'node:test';
import assert from 'node:assert/strict';

import { createPool } from '../js/weak/weak-core.js';
import {
    HIGH_FAIL_THRESHOLD,
    URGENCY_META,
    getRecommendedSentences,
    isTrapMistake,
    rankReviewEntries,
    recommendationBreakdown,
    recommendationScore,
    urgencyLabel,
    urgencyOf
} from '../js/weak/weak-recommender.js';

const TODAY = '2026-11-03';

function entry(id, over) {
    return Object.assign({
        id: id,
        en: 'Sentence ' + id + '.',
        zh: '第 ' + id + ' 句。',
        isTrap: false,
        trapEn: '',
        status: 'weak',
        manualWeak: false,
        manualAt: null,
        failCount: 0,
        flagCount: 0,
        successStreak: 0,
        servedCount: 0,
        reviewCount: 0,
        ewmaScore: 0,
        lastScore: 0,
        lastSignals: null,
        lastWeakAt: null,
        lastPassAt: null,
        nextReviewAt: null,
        updatedAt: '2026-10-01T00:00:00.000Z'
    }, over || {});
}

function poolOf() {
    const pool = createPool('宝贝');
    for (let i = 0; i < arguments.length; i++) {
        const item = arguments[i];
        pool.entries[item.id] = item;
    }
    return pool;
}

function sig(over) {
    return Object.assign({
        time: 0,
        replay: 0,
        mastery: 0,
        count: 1,
        isTrap: false,
        trapCaught: false,
        trapAutoRevealed: false,
        wrongReadCount: 0
    }, over || {});
}

/* ============================================================
 *  权重拆解
 * ============================================================ */

test('推荐权重：手动 / 到期 / 失败 / 观察期 / 生疏度逐项累加', () => {
    let b = recommendationBreakdown(entry('a', { nextReviewAt: TODAY, ewmaScore: 50 }), TODAY);
    assert.equal(b.parts.overdue, 20);
    assert.equal(b.parts.fail, 0);
    assert.equal(b.parts.weakness, 5);
    assert.equal(b.score, 25);

    b = recommendationBreakdown(entry('a', { nextReviewAt: '2026-10-29' }), TODAY);
    assert.equal(b.overdueDays, 5);
    assert.equal(b.parts.overdue, 25);

    b = recommendationBreakdown(entry('a', { nextReviewAt: '2026-09-01' }), TODAY);
    assert.equal(b.parts.overdue, 30);

    b = recommendationBreakdown(entry('a', { nextReviewAt: '2026-11-20', ewmaScore: 30 }), TODAY);
    assert.equal(b.due, false);
    assert.equal(b.parts.overdue, 0);
    assert.equal(b.score, 3);

    b = recommendationBreakdown(entry('a', { failCount: 3 }), TODAY);
    assert.equal(b.parts.fail, 30);
    b = recommendationBreakdown(entry('a', { failCount: 9 }), TODAY);
    assert.equal(b.parts.fail, 30);

    b = recommendationBreakdown(entry('a', { successStreak: 1 }), TODAY);
    assert.equal(b.parts.observing, 15);
    b = recommendationBreakdown(entry('a', { successStreak: 2 }), TODAY);
    assert.equal(b.parts.observing, 0);
    b = recommendationBreakdown(entry('a', { successStreak: 1, status: 'graduated' }), TODAY);
    assert.equal(b.parts.observing, 0);
});

test('推荐权重：手动标记 +50，总分钳制在 0~100', () => {
    const b = recommendationBreakdown(entry('a', {
        manualWeak: true,
        nextReviewAt: TODAY,
        failCount: 3,
        successStreak: 1,
        ewmaScore: 100
    }), TODAY);
    assert.equal(b.parts.manual, 50);
    assert.equal(b.parts.observing, 15);
    assert.ok(b.raw > 100);
    assert.equal(b.score, 100);

    assert.equal(recommendationScore(null, TODAY), 0);
    assert.equal(recommendationScore(entry('a', { ewmaScore: 999, nextReviewAt: '2026-12-01' }), TODAY), 10);
});

/* ============================================================
 *  排序
 * ============================================================ */

test('排序：手动重点整体置顶，其余按分数与失败次数降序', () => {
    const pool = poolOf(
        entry('a', { nextReviewAt: TODAY, failCount: 1, ewmaScore: 70 }),
        entry('b', { nextReviewAt: '2026-10-01', ewmaScore: 10 }),
        entry('c', { manualWeak: true, nextReviewAt: TODAY, ewmaScore: 0 }),
        entry('d', { nextReviewAt: '2026-11-20', failCount: 3, ewmaScore: 90 })
    );
    const ids = rankReviewEntries(pool, { today: TODAY }).map(item => item.entry.id);
    assert.deepEqual(ids, ['c', 'd', 'a', 'b']);
});

test('排序：同分同层时结果稳定可复现', () => {
    const pool = poolOf(
        entry('m2', { nextReviewAt: TODAY }),
        entry('m1', { nextReviewAt: TODAY }),
        entry('m3', { nextReviewAt: TODAY })
    );
    const first = rankReviewEntries(pool, { today: TODAY }).map(item => item.entry.id);
    const second = rankReviewEntries(pool, { today: TODAY }).map(item => item.entry.id);
    assert.deepEqual(first, ['m1', 'm2', 'm3']);
    assert.deepEqual(second, first);
});

/* ============================================================
 *  紧急度
 * ============================================================ */

test('紧急度：手动 > 极度生疏 > 到期 > 观察中', () => {
    assert.equal(urgencyOf(entry('a', { manualWeak: true }), TODAY), 'pinned');
    assert.equal(urgencyOf(entry('a', { failCount: HIGH_FAIL_THRESHOLD }), TODAY), 'critical');
    assert.equal(urgencyOf(entry('a', { ewmaScore: 60 }), TODAY), 'critical');
    assert.equal(urgencyOf(entry('a', { nextReviewAt: TODAY }), TODAY), 'due');
    assert.equal(urgencyOf(entry('a', { nextReviewAt: '2026-11-30', ewmaScore: 10 }), TODAY), 'watching');
    assert.equal(urgencyLabel(entry('a', { manualWeak: true }), TODAY), '⭐ 手动重点');
    assert.equal(urgencyLabel(entry('a', { failCount: 2 }), TODAY), '🔴 极度生疏');
    assert.equal(urgencyLabel(entry('a', { nextReviewAt: TODAY }), TODAY), '🟠 到期复习');
    assert.equal(urgencyLabel(entry('a', { nextReviewAt: '2026-11-30' }), TODAY), '🟡 观察中');
    assert.equal(URGENCY_META.pinned.rank, 0);
});

test('陷阱失误判定：自动现形 / 未抓获 / 读错计入，成功抓获且无读错不计入', () => {
    assert.equal(isTrapMistake(entry('a', { isTrap: true, lastSignals: sig({ isTrap: true, trapAutoRevealed: true }) })), true);
    assert.equal(isTrapMistake(entry('a', { isTrap: true, lastSignals: sig({ isTrap: true, trapCaught: false }) })), true);
    assert.equal(isTrapMistake(entry('a', { isTrap: true, lastSignals: sig({ isTrap: true, trapCaught: true, wrongReadCount: 2 }) })), true);
    assert.equal(isTrapMistake(entry('a', { isTrap: true, lastSignals: sig({ isTrap: true, trapCaught: true }) })), false);
    assert.equal(isTrapMistake(entry('a', { isTrap: true })), true);
    assert.equal(isTrapMistake(entry('a')), false);
});

/* ============================================================
 *  模式过滤 / Top-N / 边界
 * ============================================================ */

function modePool() {
    return poolOf(
        entry('hi', { failCount: 2, nextReviewAt: TODAY }),
        entry('one', { failCount: 1, nextReviewAt: TODAY }),
        entry('trap-caught', {
            isTrap: true,
            lastSignals: sig({ isTrap: true, trapCaught: true }),
            nextReviewAt: TODAY
        }),
        entry('trap-missed', {
            isTrap: true,
            lastSignals: sig({ isTrap: true, trapCaught: false }),
            nextReviewAt: TODAY
        })
    );
}

test('模式过滤：全量 / 仅高频错题 / 仅陷阱失误题', () => {
    const pool = modePool();
    const idList = items => items.map(item => item.entry.id);

    assert.deepEqual(
        idList(rankReviewEntries(pool, { today: TODAY, mode: 'frequent' })),
        ['hi']
    );
    assert.deepEqual(
        idList(rankReviewEntries(pool, { today: TODAY, mode: 'trap' })),
        ['trap-missed']
    );
    assert.equal(rankReviewEntries(pool, { today: TODAY, mode: 'all' }).length, 4);
    assert.equal(rankReviewEntries(pool, { today: TODAY, mode: 'bogus' }).length, 4);
});

test('Top-N：正常截断、空池、数量不足、count=0', () => {
    const pool = modePool();
    assert.equal(getRecommendedSentences(pool, 3, { today: TODAY }).length, 3);
    assert.equal(getRecommendedSentences(pool, 99, { today: TODAY }).length, 4);
    assert.deepEqual(getRecommendedSentences(pool, 0, { today: TODAY }), []);
    assert.deepEqual(getRecommendedSentences(createPool('宝贝'), 5, { today: TODAY }), []);
    assert.deepEqual(getRecommendedSentences(null, 5, { today: TODAY }), []);
});

test('Top-N 默认 5 句且优先级与 rankReviewEntries 一致', () => {
    const entries = [];
    for (let i = 0; i < 8; i++) {
        entries.push(entry('s' + i, { nextReviewAt: TODAY, failCount: i }));
    }
    const pool = poolOf.apply(null, entries);
    const top = getRecommendedSentences(pool, undefined, { today: TODAY }).map(e => e.id);
    const ranked = rankReviewEntries(pool, { today: TODAY });
    assert.equal(top.length, 5);
    assert.deepEqual(top, ranked.slice(0, 5).map(item => item.entry.id));
});

test('全部毕业：默认不推荐，显式包含时可推荐', () => {
    const pool = poolOf(
        entry('g1', { status: 'graduated', nextReviewAt: '2026-11-17', ewmaScore: 80 }),
        entry('g2', { status: 'graduated', nextReviewAt: '2026-11-17', ewmaScore: 40 })
    );
    assert.deepEqual(getRecommendedSentences(pool, 5, { today: TODAY }), []);
    const included = rankReviewEntries(pool, { today: TODAY, includeGraduated: true });
    assert.equal(included.length, 2);
    assert.equal(included[0].entry.id, 'g1');
});

test('推荐句保持生疏池对象引用，便于面板直接回填', () => {
    const only = entry('ref', { nextReviewAt: TODAY });
    const pool = poolOf(only);
    const result = getRecommendedSentences(pool, 1, { today: TODAY });
    assert.equal(result[0], only);
});
