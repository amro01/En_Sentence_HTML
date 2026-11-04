import test from 'node:test';
import assert from 'node:assert/strict';

import {
    PEER_CHARACTERS,
    chunkSentence,
    createPeerRelay,
    findErrorChunk,
    pickNormalPeerIndices,
    pickPeerCharacter
} from '../js/peer-relay.js';

test('chunkSentence：示例句切成 4 个意群胶囊', () => {
    assert.deepEqual(
        chunkSentence('Where are the books on music, please?'),
        ['Where are', 'the books', 'on music,', 'please?']
    );
});

test('chunkSentence：3~6 词切 3 段，长句切 4 段，短句按词数', () => {
    assert.deepEqual(chunkSentence('I have already finished my homework.'), ['I have', 'already finished', 'my homework.']);
    assert.deepEqual(chunkSentence('She goes to school by bike every day.'), ['She goes', 'to school', 'by bike', 'every day.']);
    assert.deepEqual(chunkSentence('Hello there!'), ['Hello', 'there!']);
    assert.deepEqual(chunkSentence('   '), []);
});

test('chunkSentence：剥离角色前缀，只取第一行台词', () => {
    assert.deepEqual(chunkSentence('M: Good morning, everyone!'), ['Good', 'morning,', 'everyone!']);
    assert.deepEqual(chunkSentence('\nF: Hello there!\nM: Hi!'), ['Hello', 'there!']);
});

test('findErrorChunk：on → about 命中第 3 个意群并生成讲解', () => {
    const error = findErrorChunk(
        'Where are the books on music, please?',
        'Where are the books about music, please?'
    );
    assert.ok(error);
    assert.equal(error.chunkIndex, 2);
    assert.match(error.explanation, /about/);
    assert.match(error.explanation, /on/);
});

test('findErrorChunk：多词 / 漏词 / 无差异', () => {
    const missing = findErrorChunk('I have went to school.', 'I have gone to school.');
    assert.ok(missing);
    assert.match(missing.explanation, /went/);
    assert.match(missing.explanation, /gone/);

    const extra = findErrorChunk('I have gone to the school.', 'I have gone to school.');
    assert.ok(extra);
    assert.match(extra.explanation, /多余/);

    assert.equal(findErrorChunk('I am fine.', 'I am fine!'), null, '仅标点差异不算错误');
});

test('createPeerRelay：陷阱卡标记为同伴说错并带完整元数据', () => {
    const relay = createPeerRelay({
        peerText: 'Where are the books on music, please?',
        correctText: 'Where are the books about music, please?',
        isTrap: true,
        character: { name: '小熊', avatar: '🐻' },
        explanation: '关于书籍主题，应该用 about 而不是 on 哦！'
    });

    assert.equal(relay.has_peer, true);
    assert.equal(relay.peer_name, '小熊');
    assert.equal(relay.peer_avatar, '🐻');
    assert.equal(relay.is_peer_correct, false);
    assert.equal(relay.chunks.length, 4);
    assert.equal(relay.error_chunk_index, 2);
    assert.equal(relay.error_explanation, '关于书籍主题，应该用 about 而不是 on 哦！');
    assert.deepEqual(relay.correct_variants, ['Where are the books about music, please?']);
});

test('createPeerRelay：优先使用 AI 意群、错误下标与全部正确变体', () => {
    const relay = createPeerRelay({
        peerText: 'She go to school by bike every day.',
        correctText: 'She goes to school by bike every day.',
        isTrap: true,
        chunks: ['She go', 'to school', 'by bike', 'every day.'],
        errorChunkIndex: 0,
        correctVariants: [
            'She goes to school by bike every day.',
            'She rides a bike to school every day.'
        ],
        character: { name: '小熊', avatar: '🐻' }
    });

    assert.deepEqual(relay.chunks, ['She go', 'to school', 'by bike', 'every day.']);
    assert.equal(relay.error_chunk_index, 0);
    assert.equal(relay.is_peer_correct, false);
    assert.deepEqual(relay.correct_variants, [
        'She goes to school by bike every day.',
        'She rides a bike to school every day.'
    ]);

    // 下标越界时回退到词面差异定位，不信任坏数据。
    const fallback = createPeerRelay({
        peerText: 'She go to school by bike every day.',
        correctText: 'She goes to school by bike every day.',
        isTrap: true,
        chunks: ['She go', 'to school', 'by bike', 'every day.'],
        errorChunkIndex: 99,
        character: { name: '小熊', avatar: '🐻' }
    });
    assert.equal(fallback.error_chunk_index, 0);
});

test('createPeerRelay：普通卡同伴说对；完全相同文本不会凭空造错', () => {
    const normal = createPeerRelay({
        peerText: 'I have already finished my homework.',
        correctText: 'I have already finished my homework.',
        isTrap: false,
        character: { name: '青蛙', avatar: '🐸' }
    });
    assert.equal(normal.is_peer_correct, true);
    assert.equal(normal.error_chunk_index, null);
    assert.equal(normal.error_explanation, '');

    const identicalTrap = createPeerRelay({
        peerText: 'I am fine.',
        correctText: 'I am fine.',
        isTrap: true,
        character: { name: '玲玲', avatar: '👧' }
    });
    assert.equal(identicalTrap.is_peer_correct, true);
});

test('pickPeerCharacter：覆盖四位角色且可用固定随机源', () => {
    assert.equal(pickPeerCharacter(() => 0).name, PEER_CHARACTERS[0].name);
    assert.equal(pickPeerCharacter(() => 0.999).name, PEER_CHARACTERS[PEER_CHARACTERS.length - 1].name);
    assert.equal(PEER_CHARACTERS.length, 4);
});

test('pickNormalPeerIndices：只抽 0~2 张且不重复', () => {
    const all = pickNormalPeerIndices([0, 1, 2, 3, 4], () => 0.999);
    assert.equal(all.length, 2);
    assert.equal(new Set(all).size, 2);

    const none = pickNormalPeerIndices([0, 1, 2], () => 0);
    assert.deepEqual(none, []);
});

test('pickNormalPeerIndices：候选不足时不会超抽', () => {
    const one = pickNormalPeerIndices([7], () => 0.999);
    assert.deepEqual(one, [7]);
    const empty = pickNormalPeerIndices([], () => 0.5);
    assert.deepEqual(empty, []);
});
