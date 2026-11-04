import test from 'node:test';
import assert from 'node:assert/strict';

import { buildCardHTML } from '../js/templates/card-html.js';

const BASE = {
    encodedEnglish: encodeURIComponent('I have gone to school.'),
    encodedZh: encodeURIComponent('我去过学校。'),
    index: 3,
    weakId: '0123456789abcdef',
    reviewCount: 2,
    chineseDisplay: '我去过学校。',
    englishDisplay: 'I have gone to school.',
    englishElementId: 'english-3',
    starter: 'I have'
};

const PEER = {
    has_peer: true,
    peer_name: '小明',
    peer_avatar: '👦',
    is_peer_correct: false,
    chunks: ['Where are', 'the books', 'on music,', 'please?'],
    error_chunk_index: 2,
    error_explanation: '这里应该用“about”，而不是“on”哦！',
    correct_variants: ['Where are the books about music, please?']
};

test('统一卡片模板：无抢答时仍保持同一骨架，起手式区默认可用', () => {
    const html = buildCardHTML({ ...BASE, peer: null });

    assert.ok(html.includes('class="card" data-english='));
    assert.ok(!html.includes('data-mode'), '不再有普通卡/陷阱卡物理分支');
    assert.ok(!html.includes('data-trap'), '旧的陷阱属性已移除');
    assert.ok(!html.includes('data-peer-relay'));
    assert.ok(!html.includes('data-peer-pending'));
    assert.ok(html.includes('class="peer-bubble hidden"'));
    assert.ok(html.includes('class="chinese revealed"'), '中文默认清晰展示');
    assert.ok(html.includes('选个开头试试 😊'));
    assert.ok(html.includes('onclick="startCardThinking(this)"'));
    assert.ok(html.includes('>I have</button>'));
    assert.ok(html.includes('想好了？点这里'));
    assert.ok(!html.includes('disabled'), '无抢答卡片的起手式与朗读按钮不得锁定');
    assert.match(html, /class="start-slot">\s*<div class="english" id="english-3">I have gone to school\.<\/div>/);
    assert.ok(!html.includes('onclick="revealChinese'), '中文不再有揭示门');
    assert.ok(!html.includes('detective'), '不再渲染侦探模式元素');
    assert.ok(!html.includes('<input'), '练习卡片模板不得新增 input');
    assert.ok(!html.includes('需复习'));
});

test('统一卡片模板：抢答卡渲染气泡、意群胶囊与阶段 1 锁定', () => {
    const html = buildCardHTML({ ...BASE, peer: PEER });

    assert.ok(html.includes('data-peer-pending="true"'));
    assert.ok(html.includes('class="peer-bubble"'));
    assert.ok(html.includes('👦'));
    assert.ok(html.includes('小明'));
    assert.ok(html.includes('抢答道：'));
    assert.ok(html.includes('Where are'));
    assert.ok(html.includes('the books'));
    assert.ok(html.includes('on music,'));
    assert.ok(html.includes('please?'));
    assert.ok(html.includes('data-chunk-index="2"'));
    assert.ok(html.includes('👍 这句没问题！'));
    assert.ok(html.includes('class="peer-badge"'));
    assert.ok(html.includes('disabled'), '阶段 1 未通过前起手式与朗读按钮必须禁用');
    assert.ok(!/class="peer-chunk"[^>]*disabled/.test(html), '阶段 1 的意群胶囊必须保持可点');
    assert.ok(!/class="peer-ok"[^>]*disabled/.test(html), '阶段 1 的「没问题」按钮必须保持可点');
    assert.ok(html.includes('data-peer-relay="'));

    // data-peer-relay 必须经过 HTML 属性转义，防止元数据破坏标签
    const attrMatch = html.match(/data-peer-relay="([^"]*)"/);
    assert.ok(attrMatch);
    assert.ok(!attrMatch[1].includes('"'), 'JSON 内的双引号必须被转义');
    assert.ok(attrMatch[1].includes('&quot;'));

    const decoded = attrMatch[1]
        .replace(/&quot;/g, '"')
        .replace(/&#39;/g, "'")
        .replace(/&lt;/g, '<')
        .replace(/&gt;/g, '>')
        .replace(/&amp;/g, '&');
    assert.deepEqual(JSON.parse(decoded), PEER);
});

test('统一卡片模板：AI variants 渲染多颗起手式胶囊并携带变体数据', () => {
    const variants = [
        { starter: 'Where are...', full_sentence: 'Where are the books about music, please?', tag: '教材标准' },
        { starter: 'Could you <tell>...', full_sentence: 'Could you tell me where the music books are?', tag: '礼貌"询问"' }
    ];
    const html = buildCardHTML({ ...BASE, starter: 'Where are', variants, peer: null });

    assert.equal((html.match(/class="starter-chip"/g) || []).length, 2);
    assert.ok(html.includes('>Where are...</button>'));
    assert.ok(html.includes('Could you &lt;tell&gt;...'));
    assert.ok(html.includes('title="教材标准"'));
    assert.ok(html.includes('title="礼貌&quot;询问&quot;"'));
    assert.ok(html.includes('data-variant-index="0"'));
    assert.ok(html.includes('data-variant-index="1"'));

    const attrMatch = html.match(/data-start-variants="([^"]*)"/);
    assert.ok(attrMatch);
    const decoded = attrMatch[1]
        .replace(/&quot;/g, '"')
        .replace(/&#39;/g, "'")
        .replace(/&lt;/g, '<')
        .replace(/&gt;/g, '>')
        .replace(/&amp;/g, '&');
    assert.deepEqual(JSON.parse(decoded), variants);
});

test('统一卡片模板：起手式与意群文本按 HTML 转义', () => {
    const html = buildCardHTML({
        ...BASE,
        starter: '<b>"I&I"</b>',
        peer: { ...PEER, chunks: ['<script>alert(1)</script>'] }
    });
    assert.ok(html.includes('&lt;b&gt;&quot;I&amp;I&quot;&lt;/b&gt;'));
    assert.ok(!html.includes('<b>"I&I"</b>'));
    assert.ok(html.includes('&lt;script&gt;alert(1)&lt;/script&gt;'));
    assert.ok(!html.includes('<script>alert(1)</script>'));
});
