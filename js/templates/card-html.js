/**
 * ====================================================================
 * En_Sentence_HTML - 英语阅读练习生成器
 * Copyright (c) 2026 amro01 (https://github.com/amro01/En_Sentence_HTML)
 *
 * This program is licensed under CC BY-NC-SA 4.0.
 * Unauthorized commercial repackaging or selling is strictly prohibited.
 * ====================================================================
 *
 * 练习卡片 HTML 的唯一定义处。
 *
 * v2.8 起所有卡片共用同一 DOM 骨架：中文 → 可选的同伴抢答气泡 → 起手式练习区。
 * 陷阱卡不再有独立的侦探模板；同伴是否说错完全由 `data-peer-relay` 元数据描述。
 */

const HTML_ESCAPES = { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' };

function escapeHTML(text) {
    return String(text == null ? '' : text).replace(/[&<>"']/g, ch => HTML_ESCAPES[ch]);
}

function energyBarHTML() {
    return `
                        <div class="energy-bar">
                            <span class="ear-icon">🎧</span>
                            <span class="ear-icon">🎧</span>
                            <span class="ear-icon">🎧</span>
                        </div>`;
}

function peerBubbleHTML(peer) {
    const chunks = (peer.chunks || []).map((chunk, index) => `
                            <button type="button" class="peer-chunk" data-chunk-index="${index}">${escapeHTML(chunk)}</button>`).join('');
    return `
                        <div class="peer-bubble" role="group" aria-label="同伴抢答">
                            <div class="peer-head"><span class="peer-avatar" aria-hidden="true">${escapeHTML(peer.peer_avatar)}</span> <span class="peer-name">${escapeHTML(peer.peer_name)}</span> 抢答道：</div>
                            <div class="peer-body">
                                <div class="peer-chunks">${chunks}
                                </div>
                                <button type="button" class="peer-ok">👍 这句没问题！</button>
                            </div>
                            <div class="peer-feedback" role="status" aria-live="polite"></div>
                            <span class="peer-badge">👏 ${escapeHTML(peer.peer_name)} 已通过</span>
                        </div>`;
}

/**
 * 统一练习卡片。
 *
 * @param {object} params
 * @param {object|null} [params.peer] 同伴抢答元数据；null = 本卡不触发抢答
 */
export function buildCardHTML(params) {
    const {
        encodedEnglish,
        encodedZh,
        index,
        weakId,
        reviewCount,
        chineseDisplay,
        englishDisplay,
        englishElementId,
        starter,
        variants,
        peer
    } = params;

    const hasPeer = !!peer && peer.has_peer === true;
    const locked = hasPeer;
    const peerAttr = hasPeer
        ? ` data-peer-relay="${escapeHTML(JSON.stringify(peer))}"${locked ? ' data-peer-pending="true"' : ''}`
        : '';
    const starterDisabled = locked ? ' disabled' : '';
    const slotDisabled = locked ? ' disabled aria-disabled="true"' : '';

    // AI 多起手式：每个 variant 一颗胶囊；没有 AI 数据时退回本地切分的单颗胶囊。
    const variantList = (Array.isArray(variants) ? variants : [])
        .map(item => {
            const source = item && typeof item === 'object' ? item : { full_sentence: item };
            return {
                starter: String(source.starter == null ? '' : source.starter).trim(),
                full_sentence: String(source.full_sentence == null ? '' : source.full_sentence).trim(),
                tag: String(source.tag == null ? '' : source.tag).trim()
            };
        })
        .filter(item => item.starter);
    const starters = variantList.length
        ? variantList
        : [{ starter: String(starter == null ? '' : starter), full_sentence: '', tag: '' }];
    const startVariantsAttr = variantList.length
        ? ` data-start-variants="${escapeHTML(JSON.stringify(variantList))}"`
        : '';
    const starterButtonsHTML = starters.map((item, position) => {
        const variantIndex = variantList.length ? ` data-variant-index="${position}"` : '';
        const title = item.tag ? ` title="${escapeHTML(item.tag)}"` : '';
        return `
                                <button type="button" class="starter-chip" onclick="startCardThinking(this)"${variantIndex}${title}${starterDisabled}>${escapeHTML(item.starter)}</button>`;
    }).join('');

    return `
                    <div class="card" data-english="${encodedEnglish}" data-zh="${encodedZh}" data-card-index="${index}" data-weak-id="${weakId}" data-review-count="${reviewCount}"${startVariantsAttr}${peerAttr}>
                        <div class="content">
                            <div class="chinese revealed" title="中文意思">
                                ${chineseDisplay}
                            </div>
                        </div>${hasPeer ? peerBubbleHTML(peer) : `
                        <div class="peer-bubble hidden" aria-hidden="true"></div>`}
                        <div class="start-layout">
                            <div class="start-starters">
                                <span class="start-label">选个开头试试 😊</span>${starterButtonsHTML}
                            </div>
                            <div class="start-slot">
                                <div class="english" id="${englishElementId}">${englishDisplay}</div>
                                <button type="button" class="reveal-btn start-slot-btn" onclick="handleRevealBtn(this, '${englishElementId}')"${slotDisabled}>
                                    <span class="start-slot-hint">想好了？点这里</span>
                                </button>
                            </div>
                        </div>${energyBarHTML()}
                    </div>
                `;
}
