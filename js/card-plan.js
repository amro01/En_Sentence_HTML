/**
 * ====================================================================
 * En_Sentence_HTML - 英语阅读练习生成器
 * Copyright (c) 2026 amro01 (https://github.com/amro01/En_Sentence_HTML)
 *
 * This program is licensed under CC BY-NC-SA 4.0.
 * Unauthorized commercial repackaging or selling is strictly prohibited.
 * ====================================================================
 *
 * 把生成器表单收集到的条目组装成练习卡 HTML。
 * 与 DOM 解耦，便于验证「陷阱卡 100% 抢答 + 普通卡随机 0~2 张」的分配。
 */

import { buildCardHTML } from './templates/card-html.js';
import { splitStarter } from './starter.js';
import { createPeerRelay, pickNormalPeerIndices } from './peer-relay.js';

const HTML_ESCAPES = { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' };

function escapeHTML(text) {
    return String(text == null ? '' : text).replace(/[&<>"']/g, ch => HTML_ESCAPES[ch]);
}

/**
 * @param {Array<object>} items 按页面顺序的条目：
 *   - { type: 'explanation', text }
 *   - { type: 'card', index, englishText, chineseText, targetEnglish, isTrap, explanation, weakId, reviewCount }
 * @param {function} [rng] 随机源（测试用）
 * @returns {{cardsHTML: string, totalSentences: number, peerIndices: number[]}}
 */
export function buildPracticeCards(items, rng) {
    const list = Array.isArray(items) ? items : [];
    const normalIndices = list
        .filter(item => item && item.type === 'card' && !item.isTrap)
        .map(item => item.index);
    const peerIndices = new Set(pickNormalPeerIndices(normalIndices, rng));
    list.forEach(item => {
        if (item && item.type === 'card' && item.isTrap) peerIndices.add(item.index);
    });

    let cardsHTML = '';
    let totalSentences = 0;

    list.forEach(item => {
        if (!item) return;
        if (item.type === 'explanation') {
            cardsHTML += `<div class="explanation-box">${String(item.text || '').replace(/\n/g, '<br>')}</div>`;
            return;
        }
        if (item.type !== 'card') return;

        totalSentences += 1;
        const variants = Array.isArray(item.variants) ? item.variants : [];
        const aiPeer = item.aiPeerTrap && typeof item.aiPeerTrap === 'object' ? item.aiPeerTrap : null;
        const peer = peerIndices.has(item.index)
            ? createPeerRelay({
                peerText: item.englishText,
                correctText: item.targetEnglish,
                isTrap: item.isTrap,
                explanation: item.explanation,
                chunks: aiPeer && Array.isArray(aiPeer.chunks) ? aiPeer.chunks : undefined,
                errorChunkIndex: aiPeer ? aiPeer.error_chunk_index : undefined,
                correctVariants: variants.map(variant => variant.full_sentence),
                rng
            })
            : null;

        cardsHTML += buildCardHTML({
            encodedEnglish: encodeURIComponent(item.targetEnglish),
            encodedZh: encodeURIComponent(item.chineseText),
            index: item.index,
            weakId: item.weakId,
            reviewCount: item.reviewCount,
            chineseDisplay: escapeHTML(item.chineseText).replace(/\n/g, '<br>'),
            englishDisplay: escapeHTML(item.targetEnglish).replace(/\n/g, '<br>'),
            englishElementId: `english-${item.index}`,
            starter: splitStarter(item.targetEnglish).starter,
            variants,
            peer
        });
    });

    return {
        cardsHTML,
        totalSentences,
        peerIndices: [...peerIndices].sort((a, b) => a - b)
    };
}
