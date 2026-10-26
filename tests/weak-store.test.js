import test from 'node:test';
import assert from 'node:assert/strict';

import {
    WEAK_DEFAULTS,
    buildPack,
    createPool,
    encodePack,
    ingestObservation,
    sentenceId,
    setManualWeak
} from '../js/weak/weak-core.js';
import {
    POOL_PREFIX,
    OUTBOX_PREFIX,
    buildPoolBackup,
    childKey,
    clearGraduated,
    importText,
    ingestOutboxes,
    loadPool,
    outboxKey,
    poolKey,
    poolSummary,
    purgeOutboxEntries,
    readHashPack,
    recordServed,
    removeEntry,
    savePool,
    scanOutboxes,
    syncPool
} from '../js/weak/weak-store.js';

class MemoryStorage {
    constructor(failAbove) {
        this.map = new Map();
        this.failAbove = Number.isFinite(failAbove) ? failAbove : Infinity;
    }
    get length() { return this.map.size; }
    key(index) {
        return Array.from(this.map.keys())[index] == null ? null : Array.from(this.map.keys())[index];
    }
    getItem(key) { return this.map.has(key) ? this.map.get(key) : null; }
    setItem(key, value) {
        const text = String(value);
        if (text.length > this.failAbove) {
            const error = new Error('quota exceeded');
            error.name = 'QuotaExceededError';
            throw error;
        }
        this.map.set(key, text);
    }
    removeItem(key) { this.map.delete(key); }
}

const CFG = WEAK_DEFAULTS;
const EN = 'I have already finished my homework.';
const ID = sentenceId(EN);

function sig(over) {
    return Object.assign({
        time: 0, replay: 0, mastery: 0, count: 0,
        isTrap: false, trapCaught: false, trapAutoRevealed: false, wrongReadCount: 0
    }, over || {});
}

function weakObs(over) {
    return Object.assign({
        id: ID,
        en: EN,
        zh: '我已经完成作业了。',
        sig: sig({ time: 20, replay: 2, mastery: 1, count: 1 }),
        attempted: true,
        practiceId: 'P1',
        updatedAt: '2026-10-26T10:00:00.000Z'
    }, over || {});
}

function outboxFor(entries, over) {
    return Object.assign({
        schema: 1,
        practiceId: 'P1',
        childName: '宝贝',
        updatedAt: '2026-10-26T10:05:00.000Z',
        entries: entries
    }, over || {});
}

function samplePack() {
    return buildPack([
        {
            id: ID, en: EN, zh: '我已经完成作业了。',
            sig: sig({ time: 20, replay: 2, mastery: 1, count: 1 }),
            score: 46, weak: true, manualWeak: false, attempted: true,
            practiceId: 'P1', updatedAt: '2026-10-26T10:00:00.000Z'
        },
        {
            id: sentenceId('Pass sentence.'), en: 'Pass sentence.',
            sig: sig({ time: 10, mastery: 3 }),
            score: 6, weak: false, manualWeak: false, attempted: true,
            practiceId: 'P1', updatedAt: '2026-10-26T10:01:00.000Z'
        }
    ], {
        childName: '宝贝',
        practiceId: 'P1',
        exportedAt: '2026-10-26T10:02:00.000Z'
    });
}

/* ============================================================
 *  键名 / 读写
 * ============================================================ */

test('存储键：按孩子隔离，空名回落默认', () => {
    assert.equal(childKey(' 宝贝 '), '宝贝');
    assert.equal(childKey(''), '宝贝');
    assert.equal(childKey(null), '宝贝');
    assert.equal(poolKey('宝贝'), POOL_PREFIX + '宝贝');
    assert.equal(outboxKey('STATS_X'), OUTBOX_PREFIX + 'STATS_X');
});

test('池读写：空库、往返、垃圾数据容错', () => {
    const storage = new MemoryStorage();
    const empty = loadPool('宝贝', storage);
    assert.equal(empty.child, '宝贝');
    assert.deepEqual(empty.entries, {});

    const pool = createPool('宝贝');
    ingestObservation(pool, weakObs(), CFG, '2026-10-26');
    const result = savePool(pool, storage);
    assert.equal(result.ok, true);
    assert.equal(result.pruned, false);

    const loaded = loadPool('宝贝', storage);
    assert.equal(loaded.entries[ID].en, EN);
    assert.equal(loaded.entries[ID].failCount, 1);
    assert.deepEqual(loaded.entries[ID].ingested, { P1: '2026-10-26T10:00:00.000Z' });
    assert.equal(loaded.entries[ID].sig, undefined);

    storage.setItem(poolKey('宝贝'), '{bad json');
    assert.deepEqual(loadPool('宝贝', storage).entries, {});
});

test('保存降级：配额不足时清理历史并缩减条目', () => {
    const storage = new MemoryStorage(20000);
    const pool = createPool('宝贝');
    for (let i = 0; i < 80; i++) {
        const en = 'Sentence number ' + i + ' with some padding.';
        ingestObservation(pool, {
            id: sentenceId(en),
            en: en,
            zh: '中'.repeat(200),
            sig: sig({ time: 20, replay: 2, mastery: 1, count: 1 }),
            attempted: true,
            practiceId: 'P' + i,
            updatedAt: '2026-10-26T10:00:00.000Z'
        }, CFG, '2026-10-26');
    }
    assert.ok(JSON.stringify(pool).length > 20000);

    const result = savePool(pool, storage);
    assert.equal(result.ok, true);
    assert.equal(result.pruned, true);
    assert.ok(Object.keys(pool.entries).length < 80);
    assert.ok(storage.getItem(poolKey('宝贝')).length <= 20000);
});

test('保存失败：非配额错误直接返回', () => {
    const storage = {
        getItem() { return null; },
        setItem() { throw new Error('disk broken'); },
        removeItem() {}
    };
    const pool = createPool('宝贝');
    const result = savePool(pool, storage);
    assert.equal(result.ok, false);
    assert.equal(result.error, 'write-failed');
});

/* ============================================================
 *  Outbox 扫描 / 合并
 * ============================================================ */

test('扫描 Outbox：前缀、坏 JSON、无关键', () => {
    const storage = new MemoryStorage();
    const entry = weakObs();
    storage.setItem(outboxKey('P1'), JSON.stringify(outboxFor({ [ID]: entry })));
    storage.setItem(outboxKey('BAD'), '{not json');
    storage.setItem('UNRELATED_KEY', JSON.stringify(outboxFor({})));
    storage.setItem(outboxKey('WRONG_SCHEMA'), JSON.stringify({ schema: 2, entries: {} }));

    const list = scanOutboxes(storage);
    assert.equal(list.length, 1);
    assert.equal(list[0].practiceId, 'P1');
    assert.equal(list[0].childName, '宝贝');
    assert.equal(list[0].outbox.entries[ID].en, EN);
});

test('合并 Outbox：按孩子隔离、幂等', () => {
    const pool = createPool('宝贝');
    const entry = weakObs();
    const same = { outbox: outboxFor({ [ID]: entry }) };
    const other = {
        outbox: outboxFor({ [sentenceId('Other.')]: weakObs({ id: sentenceId('Other.'), en: 'Other.' }) }, {
            practiceId: 'P9',
            childName: '另一个孩子'
        })
    };

    const first = ingestOutboxes(pool, [same, other], { cfg: CFG, today: '2026-10-26' });
    assert.equal(first.outboxes, 1);
    assert.equal(first.skippedOtherChild, 1);
    assert.equal(first.created, 1);
    assert.equal(pool.entries[ID].failCount, 1);

    const second = ingestOutboxes(pool, [same], { cfg: CFG, today: '2026-10-26' });
    assert.equal(second.duplicate, 1);
    assert.equal(pool.entries[ID].failCount, 1);
});

test('同步池：扫描 → 合并 → 写回', () => {
    const storage = new MemoryStorage();
    const entry = weakObs();
    storage.setItem(outboxKey('P1'), JSON.stringify(outboxFor({ [ID]: entry })));

    const result = syncPool('宝贝', storage, { today: '2026-10-26' });
    assert.equal(result.save.ok, true);
    assert.equal(result.stats.created, 1);
    assert.equal(loadPool('宝贝', storage).entries[ID].en, EN);

    const again = syncPool('宝贝', storage, { today: '2026-10-26' });
    assert.equal(again.stats.duplicate, 1);
});

/* ============================================================
 *  错题包 / 回传
 * ============================================================ */

test('导入文本：base64、raw JSON、TXT 块、非法输入', () => {
    const pack = samplePack();
    const encoded = encodePack(pack);

    const poolA = createPool('宝贝');
    const fromB64 = importText(poolA, encoded, { cfg: CFG, today: '2026-10-26' });
    assert.equal(fromB64.stats.created, 1);
    assert.equal(fromB64.stats.ignored, 1);

    const poolB = createPool('宝贝');
    const fromJson = importText(poolB, JSON.stringify(pack), { cfg: CFG, today: '2026-10-26' });
    assert.equal(fromJson.stats.created, 1);

    const poolC = createPool('宝贝');
    const report = '勋章\n--- WEAK-PACK v1 ---\n' + encoded + '\n--- END WEAK-PACK ---\n';
    const fromTxt = importText(poolC, report, { cfg: CFG, today: '2026-10-26' });
    assert.equal(fromTxt.stats.created, 1);

    const poolD = createPool('宝贝');
    assert.throws(() => importText(poolD, 'garbage!!', { cfg: CFG }), /无法识别/);
});

test('解析 #weak= 回传 hash', () => {
    const encoded = encodePack(samplePack());
    assert.equal(readHashPack('#weak=' + encoded).entries[ID].en, EN);
    assert.equal(readHashPack('?x=1#weak=' + encoded).entries[ID].en, EN);
    assert.equal(readHashPack('&weak=' + encoded).entries[ID].en, EN);
    assert.equal(readHashPack('#other=1'), null);
    assert.equal(readHashPack('#weak=!!!'), null);
    assert.equal(readHashPack(''), null);
});

test('整库备份包含所有条目且可校验', () => {
    const pool = createPool('宝贝');
    ingestObservation(pool, weakObs(), CFG, '2026-10-26');
    setManualWeak(pool, ID, true, { today: '2026-10-26', now: '2026-10-26T12:00:00.000Z' });

    const backup = buildPoolBackup(pool);
    assert.equal(backup.schema, 1);
    assert.equal(backup.childName, '宝贝');
    assert.equal(Object.keys(backup.entries).length, 1);
    assert.equal(backup.entries[ID].en, EN);
    assert.equal(backup.entries[ID].manualWeak, true);
    assert.equal(backup.entries[ID].sig.time, 20);
});

/* ============================================================
 *  概览 / 清理 / 下载计数
 * ============================================================ */

test('概览统计：弱句/到期/手动/陷阱/毕业', () => {
    const pool = createPool('宝贝');
    const today = '2026-10-26';

    const A = 'Manual trap sentence.';
    const aId = sentenceId(A);
    ingestObservation(pool, {
        id: aId, en: A,
        sig: sig({ time: 8, mastery: 0, isTrap: true, trapCaught: false, count: 1 }),
        attempted: true, practiceId: 'A1', updatedAt: '2026-10-26T10:00:00.000Z'
    }, CFG, today);
    setManualWeak(pool, aId, true, { today: today, now: '2026-10-26T11:00:00.000Z' });

    const B = 'Due weak sentence.';
    ingestObservation(pool, {
        id: sentenceId(B), en: B,
        sig: sig({ time: 20, replay: 2, mastery: 1, count: 1 }),
        attempted: true, practiceId: 'B1', updatedAt: '2026-10-20T10:00:00.000Z'
    }, CFG, '2026-10-20');

    const C = 'Graduated sentence.';
    const cId = sentenceId(C);
    ingestObservation(pool, {
        id: cId, en: C,
        sig: sig({ time: 20, replay: 2, mastery: 1, count: 1 }),
        attempted: true, practiceId: 'C1', updatedAt: '2026-10-20T10:00:00.000Z'
    }, CFG, '2026-10-20');
    ingestObservation(pool, {
        id: cId, en: C, sig: sig({ time: 10, mastery: 3, count: 1 }),
        attempted: true, practiceId: 'C2', updatedAt: '2026-10-25T10:00:00.000Z'
    }, CFG, '2026-10-25');
    ingestObservation(pool, {
        id: cId, en: C, sig: sig({ time: 10, mastery: 3, count: 1 }),
        attempted: true, practiceId: 'C3', updatedAt: '2026-10-26T10:00:00.000Z'
    }, CFG, today);

    const summary = poolSummary(pool, today);
    assert.equal(summary.total, 3);
    assert.equal(summary.weak, 2);
    assert.equal(summary.due, 2);
    assert.equal(summary.manual, 1);
    assert.equal(summary.trap, 1);
    assert.equal(summary.graduated, 1);
});

test('清理毕业：保留手动标记，删除毕业条目，移除单条', () => {
    const pool = createPool('宝贝');
    ingestObservation(pool, weakObs(), CFG, '2026-10-26');
    pool.entries[ID].status = 'graduated';
    pool.entries[ID].manualWeak = false;

    const other = 'Manual graduated.';
    ingestObservation(pool, {
        id: sentenceId(other), en: other,
        sig: sig({ time: 20, replay: 2, mastery: 1, count: 1 }),
        attempted: true, practiceId: 'M1', updatedAt: '2026-10-26T10:00:00.000Z'
    }, CFG, '2026-10-26');
    pool.entries[sentenceId(other)].status = 'graduated';
    pool.entries[sentenceId(other)].manualWeak = true;

    assert.equal(clearGraduated(pool), 1);
    assert.ok(!pool.entries[ID]);
    assert.ok(pool.entries[sentenceId(other)]);

    assert.equal(removeEntry(pool, sentenceId(other)), true);
    assert.equal(removeEntry(pool, sentenceId(other)), false);
});

test('下载计数：同一天只记一次', () => {
    const storage = new MemoryStorage();
    const pool = createPool('宝贝');
    ingestObservation(pool, weakObs(), CFG, '2026-10-26');
    savePool(pool, storage);

    assert.equal(recordServed('宝贝', [ID], { storage: storage, today: '2026-10-26' }), 1);
    assert.equal(loadPool('宝贝', storage).entries[ID].servedCount, 1);
    assert.equal(recordServed('宝贝', [ID], { storage: storage, today: '2026-10-26' }), 0);
    assert.equal(recordServed('宝贝', [ID], { storage: storage, today: '2026-10-27' }), 1);
});

test('面板模块可被 Node 导入（无顶层 DOM 访问）', async () => {
    const mod = await import('../js/weak/weak-panel.js');
    assert.equal(typeof mod.initWeakPanel, 'function');
});

test('删除条目时可清理同源 Outbox，避免同步复活', () => {
    const storage = new MemoryStorage();
    const A = sentenceId('Delete me.');
    const B = sentenceId('Keep me.');
    const entryA = weakObs({ id: A, en: 'Delete me.' });
    const entryB = weakObs({ id: B, en: 'Keep me.' });
    storage.setItem(outboxKey('P1'), JSON.stringify(outboxFor({ [A]: entryA, [B]: entryB })));
    storage.setItem(outboxKey('P2'), JSON.stringify(outboxFor({ [A]: entryA }, {
        practiceId: 'P2',
        childName: '另一个孩子'
    })));

    const purged = purgeOutboxEntries([A], '宝贝', storage);
    assert.equal(purged, 1);

    const same = JSON.parse(storage.getItem(outboxKey('P1')));
    assert.equal(same.entries[A], undefined);
    assert.ok(same.entries[B]);

    const other = JSON.parse(storage.getItem(outboxKey('P2')));
    assert.ok(other.entries[A]);
});
