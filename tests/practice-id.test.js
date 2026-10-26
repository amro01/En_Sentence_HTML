import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';

import { computePracticeId } from '../js/weak/practice-id.js';

test('Practice_ID：与原算法一致（含 trap checkbox 的 "on"）', () => {
    const date = '2026年-10月-26日';
    // 单卡：英文、中文、trap checkbox 默认值 "on"、空的 correct textarea
    const values = ['Hello', '你好', 'on', ''];

    assert.equal(computePracticeId(date, values), 'STATS_20261026_7rjssy');
    // 末尾追加空值不改变结果（未来即使多一个空 textarea 也不应改 ID）
    assert.equal(computePracticeId(date, values.concat('')), 'STATS_20261026_7rjssy');
    // 日期不同，命名空间不同
    assert.notEqual(computePracticeId('2026年-10月-27日', values), 'STATS_20261026_7rjssy');
    assert.equal(computePracticeId('2026年-10月-26日', []), 'STATS_20261026_0');
});

test('Practice_ID：卡片输出不含隐藏 input，且保留 class="card" 字面量', async () => {
    const source = await readFile(new URL('../js/main.js', import.meta.url), 'utf8');

    assert.ok(source.includes("from './weak/practice-id.js'"));
    assert.ok(source.includes('computePracticeId(date, values)'));
    assert.ok(!source.includes('type="hidden"'));

    const start = source.indexOf('<div class="card" data-english=');
    const end = source.indexOf('`;', start);
    assert.ok(start >= 0 && end > start, '找不到生成卡片的模板字符串');

    const cardTemplate = source.slice(start, end);
    assert.ok(cardTemplate.includes('class="card" data-english='), 'class="card" 字面量被改动');
    assert.ok(cardTemplate.includes('data-zh='));
    assert.ok(cardTemplate.includes('data-weak-id='));
    assert.ok(cardTemplate.includes('data-review-count='));
    assert.ok(!cardTemplate.includes('weak-toggle'), '卡片不应再出现手动复习按钮');
    assert.ok(!cardTemplate.includes('需复习'), '卡片不应出现负面标签字样');
    assert.ok(!cardTemplate.includes('<input'), '练习卡片模板不应新增 input');
});
