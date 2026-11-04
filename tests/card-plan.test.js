import test from 'node:test';
import assert from 'node:assert/strict';

import { buildPracticeCards } from '../js/card-plan.js';

function trapItem(over) {
    return Object.assign({
        type: 'card',
        index: 0,
        englishText: 'Where are the books on music, please?',
        chineseText: '请问关于音乐的书在哪里？',
        targetEnglish: 'Where are the books about music, please?',
        isTrap: true,
        explanation: '关于书籍主题，应该用 about 而不是 on 哦！',
        weakId: '',
        reviewCount: 0
    }, over || {});
}

function normalItem(index, en, over) {
    return Object.assign({
        type: 'card',
        index: index,
        englishText: en,
        chineseText: '译文' + index,
        targetEnglish: en,
        isTrap: false,
        explanation: '',
        weakId: '',
        reviewCount: 0
    }, over || {});
}

test('卡片计划：陷阱卡 100% 抢答，普通卡按随机源抽 0~2 张', () => {
    const items = [
        { type: 'explanation', text: '先看提示\n再看句子' },
        trapItem(),
        normalItem(1, 'I have already finished my homework.'),
        normalItem(2, 'She goes to school by bike every day.')
    ];

    const all = buildPracticeCards(items, () => 0.999);
    assert.equal(all.totalSentences, 3);
    assert.deepEqual(all.peerIndices, [0, 1, 2]);
    assert.equal((all.cardsHTML.match(/data-peer-relay=/g) || []).length, 3);
    assert.ok(all.cardsHTML.includes('<div class="explanation-box">先看提示<br>再看句子</div>'));

    // 陷阱卡的目标英文是正确句；同伴说的是错误句
    assert.ok(all.cardsHTML.includes('data-english="' + encodeURIComponent('Where are the books about music, please?') + '"'));
    assert.ok(all.cardsHTML.includes('on music,'));
    assert.ok(all.cardsHTML.includes('关于书籍主题，应该用 about 而不是 on 哦！'));

    const none = buildPracticeCards(items, () => 0);
    assert.deepEqual(none.peerIndices, [0], '陷阱卡始终触发，普通卡可以一张都不抽');
    assert.equal((none.cardsHTML.match(/data-peer-relay=/g) || []).length, 1);
});

test('卡片计划：AI 多起手式与意群胶囊进入生成卡片', () => {
    const variants = [
        { starter: 'Where are...', full_sentence: 'Where are the books about music, please?', tag: '教材标准' },
        { starter: 'Could you tell...', full_sentence: 'Could you tell me where the music books are?', tag: '礼貌询问' }
    ];
    const aiPeerTrap = {
        sentence: 'Where are the books on music, please?',
        chunks: ['Where', 'are the books', 'on music,', 'please?'],
        error_chunk_index: 2,
        error_explanation: 'AI 讲解：应该用 about。'
    };
    const items = [
        trapItem({ variants, aiPeerTrap, explanation: aiPeerTrap.error_explanation })
    ];

    const plan = buildPracticeCards(items, () => 0);
    assert.equal(plan.totalSentences, 1);
    assert.equal((plan.cardsHTML.match(/class="starter-chip"/g) || []).length, 2);
    assert.ok(plan.cardsHTML.includes('data-start-variants="'));
    assert.ok(plan.cardsHTML.includes('AI 讲解：应该用 about。'));

    const attrMatch = plan.cardsHTML.match(/data-peer-relay="([^"]*)"/);
    assert.ok(attrMatch);
    const peer = JSON.parse(attrMatch[1]
        .replace(/&quot;/g, '"')
        .replace(/&#39;/g, "'")
        .replace(/&lt;/g, '<')
        .replace(/&gt;/g, '>')
        .replace(/&amp;/g, '&'));
    assert.deepEqual(peer.chunks, aiPeerTrap.chunks);
    assert.equal(peer.error_chunk_index, 2);
    assert.equal(peer.error_explanation, aiPeerTrap.error_explanation);
    assert.deepEqual(peer.correct_variants, variants.map(variant => variant.full_sentence));
});

test('卡片计划：普通抢答卡说正确的句子，非抢答卡共用同一骨架', () => {
    const items = [
        normalItem(0, 'I have already finished my homework.'),
        normalItem(1, 'She goes to school by bike every day.')
    ];

    const plan = buildPracticeCards(items, () => 0.999);
    assert.equal(plan.peerIndices.length, 2);
    assert.equal((plan.cardsHTML.match(/class="peer-bubble"/g) || []).length, 2);
    assert.equal((plan.cardsHTML.match(/class="peer-bubble hidden"/g) || []).length, 0);
    assert.equal((plan.cardsHTML.match(/data-peer-pending="true"/g) || []).length, 2);
    assert.equal((plan.cardsHTML.match(/class="card" data-english=/g) || []).length, 2);
    assert.ok(plan.cardsHTML.includes('I have already finished my homework.'));
    assert.ok(!plan.cardsHTML.includes('data-trap'));

    const plain = buildPracticeCards(items, () => 0);
    assert.deepEqual(plain.peerIndices, []);
    assert.equal((plain.cardsHTML.match(/class="peer-bubble hidden"/g) || []).length, 2);
    assert.equal((plain.cardsHTML.match(/data-peer-pending="true"/g) || []).length, 0);
    assert.equal((plain.cardsHTML.match(/class="card" data-english=/g) || []).length, 2);
});
