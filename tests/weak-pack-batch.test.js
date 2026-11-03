import test from 'node:test';
import assert from 'node:assert/strict';

import {
    createPool,
    encodePack,
    importPack,
    sentenceId,
    validatePack
} from '../js/weak/weak-core.js';
import {
    SCAN_LIMITS,
    clearSavedDirectoryHandle,
    fingerprintText,
    getSavedDirectoryHandle,
    getSeenPracticeIds,
    isFeedbackFile,
    markPracticesSeen,
    parseFeedbackText,
    queryDirectoryPermission,
    saveDirectoryHandle,
    scanFeedbackDirectory,
    supportsDirectoryPicker,
    verifyPermission
} from '../js/weak/dir-monitor.js';

const S1 = 'I have already finished my homework.';
const S2 = 'She goes to school by bike every day.';
const S3 = 'They are playing football in the park.';
const S4 = 'We will visit the museum tomorrow.';

function packEntry(en, over) {
    return Object.assign({
        en: en,
        zh: '译文：' + en,
        isTrap: false,
        trapEn: '',
        sig: {
            time: 20, replay: 2, mastery: 1, count: 1,
            isTrap: false, trapCaught: false, trapAutoRevealed: false, wrongReadCount: 0
        },
        score: 50,
        weak: true,
        manualWeak: false,
        manualAt: null,
        attempted: true,
        updatedAt: '2026-11-01T10:00:00.000Z'
    }, over || {});
}

function makePack(practiceId, exportedAt, entries, childName) {
    const pack = {
        schema: 1,
        childName: childName == null ? '宝贝' : childName,
        exportedAt: exportedAt,
        practiceId: practiceId,
        entries: {}
    };
    for (const item of entries) pack.entries[sentenceId(item.en)] = item;
    return pack;
}

function medalText(pack) {
    return '🏆 恭喜 ' + pack.childName + ' 获得今日英语勋章！\n\n' +
        '成就：⭐⭐⭐⭐⭐\n\n' +
        '--- WEAK-PACK v1 ---\n' + encodePack(pack) + '\n--- END WEAK-PACK ---\n';
}

function textFile(name, text, over) {
    return Object.assign({
        name: name,
        path: name,
        size: text.length,
        text: async function () { return text; }
    }, over || {});
}

function medalFile(name, pack) {
    return textFile(name, medalText(pack));
}

function handleFile(name, text) {
    return {
        kind: 'file',
        name: name,
        getFile: async function () {
            return { size: text.length, text: async function () { return text; } };
        }
    };
}

/* ============================================================
 *  批量解析
 * ============================================================ */

test('批量解析勋章 TXT：多文件、多练习、按时间升序返回', async () => {
    const p1 = makePack('STATS_20261_abc', '2026-11-01T10:00:00.000Z', [packEntry(S1), packEntry(S2)]);
    const p2 = makePack('STATS_20262_def', '2026-11-02T10:00:00.000Z', [
        packEntry(S3, { score: 70 }),
        packEntry(S4, {
            weak: false,
            score: 10,
            attempted: true,
            sig: {
                time: 5, replay: 0, mastery: 3, count: 1,
                isTrap: false, trapCaught: false, trapAutoRevealed: false, wrongReadCount: 0
            }
        })
    ]);
    const scan = await scanFeedbackDirectory([
        medalFile('b.txt', p2),
        medalFile('a.txt', p1)
    ]);

    assert.equal(scan.scannedFilesCount, 2);
    assert.equal(scan.parsedFilesCount, 2);
    assert.equal(scan.practiceCount, 2);
    assert.equal(scan.weakEntriesCount, 3);
    assert.equal(scan.newEntriesCount, 3);
    assert.deepEqual(scan.practiceIds, ['STATS_20261_abc', 'STATS_20262_def']);
    assert.deepEqual(scan.skippedFiles, []);
    assert.equal(scan.latest.date, '2026-11-02');
    assert.equal(scan.latest.childName, '宝贝');

    // packs 已按时间升序，可直接逐份导入以保持生命周期顺序
    assert.equal(scan.packs.length, 2);
    assert.equal(scan.packs[0].practiceId, 'STATS_20261_abc');
    assert.equal(scan.packs[1].practiceId, 'STATS_20262_def');
    for (const item of scan.packs) validatePack(item.pack);

    const pool = createPool('宝贝');
    const stats = { created: 0, merged: 0, duplicate: 0, ignored: 0, invalid: 0 };
    for (const item of scan.packs) {
        const result = importPack(pool, item.pack, undefined, '2026-11-03');
        for (const key of Object.keys(stats)) stats[key] += result[key] || 0;
    }
    assert.equal(stats.created, 3);
    assert.equal(stats.invalid, 0);
    assert.equal(pool.entries[sentenceId(S4)], undefined);
    const entry = pool.entries[sentenceId(S3)];
    assert.equal(entry.zh, '译文：' + S3);
    assert.equal(entry.failCount, 1);
    assert.equal(entry.reviewCount, 1);
});

test('同一 PracticeId 多份反馈：保留最新导出，旧的标记为 duplicate-practice', async () => {
    const older = makePack('STATS_DUP', '2026-11-01T09:00:00.000Z', [
        packEntry(S1, { score: 55, updatedAt: '2026-11-01T09:00:00.000Z' })
    ]);
    const newer = makePack('STATS_DUP', '2026-11-02T09:00:00.000Z', [
        packEntry(S1, {
            score: 20,
            weak: false,
            updatedAt: '2026-11-02T09:00:00.000Z'
        })
    ]);
    const scan = await scanFeedbackDirectory([
        medalFile('旧.txt', older),
        medalFile('新.txt', newer)
    ]);

    assert.equal(scan.practiceCount, 1);
    assert.equal(scan.packs.length, 1);
    assert.equal(scan.packs[0].pack.exportedAt, '2026-11-02T09:00:00.000Z');
    assert.equal(scan.weakEntriesCount, 0);
    assert.ok(scan.skippedFiles.some(function (item) {
        return item.file === '旧.txt' && item.reason === 'duplicate-practice';
    }));
});

test('损坏文件 / 旧版无包 TXT / 空文件 / 超大文件：跳过但保留其余结果', async () => {
    const good = makePack('STATS_OK', '2026-11-01T10:00:00.000Z', [packEntry(S1)]);
    const brokenBlock = '勋章\n--- WEAK-PACK v1 ---\nAAAA\n--- END WEAK-PACK ---\n';
    const huge = 'x'.repeat(SCAN_LIMITS.maxTextLength + 10);
    const scan = await scanFeedbackDirectory([
        medalFile('good.txt', good),
        textFile('旧版勋章.txt', '🏆 恭喜宝贝获得五星勋章！\n📁 请存入成就文件夹。\n'),
        textFile('broken.json', '{ 这不是合法 JSON'),
        textFile('broken-block.txt', brokenBlock),
        textFile('empty.txt', '   \n\t'),
        textFile('huge.txt', huge),
        textFile('too-big-by-size.txt', 'x', { size: SCAN_LIMITS.maxFileBytes + 1 }),
        textFile('notes.md', '# 不是反馈文件')
    ]);

    assert.equal(scan.scannedFilesCount, 7);
    assert.equal(scan.parsedFilesCount, 1);
    assert.equal(scan.practiceCount, 1);
    assert.equal(scan.weakEntriesCount, 1);

    const reasons = scan.skippedFiles.map(function (item) { return item.file + ':' + item.reason; });
    assert.ok(reasons.includes('旧版勋章.txt:no-pack'));
    assert.ok(reasons.includes('broken.json:parse-error'));
    assert.ok(reasons.includes('broken-block.txt:parse-error'));
    assert.ok(reasons.includes('empty.txt:empty'));
    assert.ok(reasons.includes('huge.txt:too-large'));
    assert.ok(reasons.includes('too-big-by-size.txt:too-large'));
    assert.ok(!reasons.some(function (item) { return item.indexOf('notes.md') === 0; }));
});

test('直接读取 JSON 错题包与 .weakpack base64', async () => {
    const pack = makePack('STATS_JSON', '2026-11-01T10:00:00.000Z', [packEntry(S1)]);
    const jsonText = JSON.stringify(pack, null, 2);
    const b64Text = encodePack(makePack('STATS_WEAKPACK', '2026-11-02T10:00:00.000Z', [packEntry(S2)]));

    const scan = await scanFeedbackDirectory([
        textFile('生疏句_2026-11-01.json', jsonText),
        textFile('反馈.weakpack', b64Text)
    ]);
    assert.equal(scan.parsedFilesCount, 2);
    assert.equal(scan.practiceCount, 2);
    assert.equal(scan.weakEntriesCount, 2);
    assert.deepEqual(scan.practiceIds, ['STATS_JSON', 'STATS_WEAKPACK']);
});

test('无 PracticeId 的反馈包用内容指纹去重', async () => {
    const pack = makePack('', '2026-11-01T10:00:00.000Z', [packEntry(S1)]);
    const jsonText = JSON.stringify(pack);
    const scan = await scanFeedbackDirectory([
        textFile('a.json', jsonText),
        textFile('a-copy.json', jsonText)
    ]);

    assert.equal(scan.practiceCount, 1);
    assert.equal(scan.practiceIds.length, 1);
    assert.equal(scan.practiceIds[0], 'file_' + fingerprintText(jsonText));
    assert.equal(scan.packs[0].pack.practiceId, scan.practiceIds[0]);
    assert.equal(scan.weakEntriesCount, 1);
    assert.ok(scan.skippedFiles.some(function (item) { return item.reason === 'duplicate-practice'; }));
});

/* ============================================================
 *  跨次扫描去重
 * ============================================================ */

test('knownPracticeIds：已扫过的练习不再算新增，但仍返回完整记录', async () => {
    const p1 = makePack('STATS_P1', '2026-11-01T10:00:00.000Z', [packEntry(S1), packEntry(S2)]);
    const p2 = makePack('STATS_P2', '2026-11-02T10:00:00.000Z', [packEntry(S3)]);
    const files = [medalFile('p1.txt', p1), medalFile('p2.txt', p2)];

    const first = await scanFeedbackDirectory(files);
    assert.equal(first.newEntriesCount, 3);

    const second = await scanFeedbackDirectory(files, { knownPracticeIds: first.practiceIds });
    assert.equal(second.newEntriesCount, 0);
    assert.deepEqual(second.newPracticeIds, []);
    assert.equal(second.weakEntriesCount, 3);

    const partial = await scanFeedbackDirectory(files, { knownPracticeIds: ['STATS_P1'] });
    assert.deepEqual(partial.newPracticeIds, ['STATS_P2']);
    assert.equal(partial.newEntriesCount, 1);
});

/* ============================================================
 *  目录句柄 / 孩子过滤 / 权限降级
 * ============================================================ */

test('FileSystemDirectoryHandle：递归读取子目录并跳过隐藏项', async () => {
    const p1 = makePack('STATS_DIR1', '2026-11-01T10:00:00.000Z', [packEntry(S1)]);
    const p2 = makePack('STATS_DIR2', '2026-11-02T10:00:00.000Z', [packEntry(S2)]);
    const dirHandle = {
        kind: 'directory',
        name: '成绩反馈',
        values: function () {
            return [
                handleFile('a.txt', medalText(p1)),
                handleFile('.hidden.txt', 'ignored'),
                {
                    kind: 'directory',
                    name: 'sub',
                    values: function () {
                        return [handleFile('b.txt', medalText(p2))];
                    }
                }
            ][Symbol.iterator]();
        }
    };

    const scan = await scanFeedbackDirectory(dirHandle);
    assert.equal(scan.scannedFilesCount, 2);
    assert.equal(scan.practiceCount, 2);
    assert.deepEqual(scan.packs.map(function (item) { return item.file; }), ['a.txt', 'sub/b.txt']);
});

test('按孩子名过滤：其他孩子的反馈跳过且不导入', async () => {
    const mine = makePack('STATS_MINE', '2026-11-01T10:00:00.000Z', [packEntry(S1)], '宝贝');
    const other = makePack('STATS_OTHER', '2026-11-02T10:00:00.000Z', [packEntry(S2)], '小明');
    const scan = await scanFeedbackDirectory([
        medalFile('mine.txt', mine),
        medalFile('other.txt', other)
    ], { childName: '宝贝' });

    assert.equal(scan.practiceCount, 1);
    assert.deepEqual(scan.practiceIds, ['STATS_MINE']);
    assert.ok(scan.skippedFiles.some(function (item) {
        return item.file === 'other.txt' && item.reason === 'other-child';
    }));
});

test('解析工具：扩展名、单文件解析与指纹稳定性', () => {
    assert.equal(isFeedbackFile('a.TXT'), true);
    assert.equal(isFeedbackFile('a.weakpack'), true);
    assert.equal(isFeedbackFile('a.json'), true);
    assert.equal(isFeedbackFile('a.html'), false);

    const good = makePack('STATS_X', '2026-11-01T10:00:00.000Z', [packEntry(S1)]);
    const parsed = parseFeedbackText('x.txt', medalText(good));
    assert.equal(parsed.ok, true);
    assert.equal(parsed.pack.practiceId, 'STATS_X');
    assert.equal(parseFeedbackText('x.txt', '没有错题包').reason, 'no-pack');
    assert.equal(parseFeedbackText('x.json', 'not json').reason, 'parse-error');
    assert.equal(parseFeedbackText('x.txt', '').reason, 'empty');

    assert.equal(fingerprintText('same'), fingerprintText('same'));
    assert.notEqual(fingerprintText('same'), fingerprintText('different'));
    assert.match(fingerprintText('same'), /^[0-9a-f]{16}$/);
});

test('无浏览器环境优雅降级：不抛异常', async () => {
    assert.equal(supportsDirectoryPicker(), false);
    assert.equal(await getSavedDirectoryHandle(), null);
    assert.equal(await saveDirectoryHandle({ name: 'x' }), false);
    assert.equal(await clearSavedDirectoryHandle(), false);
    assert.deepEqual(await getSeenPracticeIds(), []);
    assert.equal(await markPracticesSeen(['P1']), 0);
    assert.equal(await queryDirectoryPermission(null), 'unsupported');
    assert.equal(await verifyPermission(null, false), 'unsupported');
});
