import test from 'node:test';
import assert from 'node:assert/strict';

import { splitStarter, stripRolePrefix } from '../js/starter.js';

test('splitStarter：≤6 词取前 2 词，标点随词保留', () => {
    const result = splitStarter("Don't worry, I'm fine.");
    assert.equal(result.starter, "Don't worry,");
    assert.equal(result.rest, "I'm fine.");
    assert.equal(result.starterWordCount, 2);
});

test('splitStarter：>6 词取前 3 词', () => {
    const result = splitStarter('I would like to have some water please.');
    assert.equal(result.starter, 'I would like');
    assert.equal(result.rest, 'to have some water please.');
    assert.equal(result.starterWordCount, 3);
});

test('splitStarter：恰好 6 词仍按短句规则取 2 词', () => {
    const result = splitStarter('This is a very short sentence.');
    assert.equal(result.words.length, 6);
    assert.equal(result.starter, 'This is');
    assert.equal(result.rest, 'a very short sentence.');
});

test('splitStarter：剥离英文角色前缀与缩写', () => {
    assert.equal(splitStarter('M: Good morning, everyone!').starter, 'Good morning,');
    assert.equal(splitStarter('F: Good morning!').starter, 'Good morning!');
});

test('splitStarter：剥离中文角色名前缀（含全角冒号）', () => {
    assert.equal(splitStarter('Wang Mei：Nice to meet you.').starter, 'Nice to');
    assert.equal(splitStarter('王梅：Nice to meet you.').starter, 'Nice to');
});

test('splitStarter：多行只取第一行非空台词', () => {
    const result = splitStarter('\n  \nM: Hi there!\nF: Hello there!');
    assert.equal(result.starter, 'Hi there!');
    assert.equal(result.words.length, 2);
});

test('splitStarter：词数不足时全取', () => {
    const result = splitStarter('Hello!');
    assert.equal(result.starter, 'Hello!');
    assert.equal(result.rest, '');
    assert.equal(result.starterWordCount, 1);
});

test('splitStarter：空文本与纯空白', () => {
    for (const input of ['', '   ', '\n\n', null, undefined]) {
        assert.deepEqual(splitStarter(input), { starter: '', rest: '', words: [], starterWordCount: 0 });
    }
});

test('splitStarter：maxWords 可覆盖默认规则', () => {
    assert.equal(splitStarter('I would like to have some water please.', { maxWords: 2 }).starter, 'I would');
    assert.equal(splitStarter('Hello there my friend.', { maxWords: 3 }).starter, 'Hello there my');
});

test('stripRolePrefix：无角色前缀时原样返回（去首尾空白）', () => {
    assert.equal(stripRolePrefix('  I have a dream.  '), 'I have a dream.');
    assert.equal(stripRolePrefix('M:'), 'M:');
});
