/**
 * ====================================================================
 * En_Sentence_HTML - 英语阅读练习生成器
 * Copyright (c) 2026 amro01 (https://github.com/amro01/En_Sentence_HTML)
 *
 * This program is licensed under CC BY-NC-SA 4.0.
 * Unauthorized commercial repackaging or selling is strictly prohibited.
 * ====================================================================
 *
 * 同伴抢答（Peer Relay）元数据生成。
 *
 * 生成页只消费 `data-peer-relay` 上的 JSON，不再保留 v2.6 的侦探/放大镜逻辑。
 * 本模块全部是纯函数，便于 Node 原生测试：
 *   - 把句子切成 3~4 个意群胶囊；
 *   - 对陷阱句做词级 LCS，定位同伴说错的意群；
 *   - 自动生成温和的错误讲解；
 *   - 为每份练习抽取 0~2 张普通卡触发「同伴说对了」。
 */

import { stripRolePrefix } from './starter.js';

export const PEER_CHARACTERS = Object.freeze([
    Object.freeze({ name: '小明', avatar: '👦' }),
    Object.freeze({ name: '小熊', avatar: '🐻' }),
    Object.freeze({ name: '青蛙', avatar: '🐸' }),
    Object.freeze({ name: '玲玲', avatar: '👧' })
]);

function clamp01(value) {
    const number = Number(value);
    if (!Number.isFinite(number)) return 0;
    if (number <= 0) return 0;
    if (number >= 1) return 0.999999999;
    return number;
}

/** 取第一行非空台词并剥离角色前缀，与起手式/播放解析器保持一致。 */
export function peerSpeechLine(text) {
    const firstLine = String(text == null ? '' : text)
        .split('\n')
        .map(line => line.trim())
        .find(line => line.length > 0) || '';
    return stripRolePrefix(firstLine).replace(/\s+/g, ' ').trim();
}

function chunkCountFor(wordCount) {
    if (wordCount <= 3) return wordCount;
    if (wordCount <= 6) return 3;
    return 4;
}

/**
 * 把句子按词数均衡切成 3~4 个意群。
 * 例：Where are the books on music, please?
 *   -> ["Where are", "the books", "on music,", "please?"]
 */
export function chunkSentence(text) {
    const speech = peerSpeechLine(text);
    if (!speech) return [];
    const words = speech.split(/\s+/).filter(Boolean);
    const count = chunkCountFor(words.length);
    if (count <= 0) return [];
    const base = Math.floor(words.length / count);
    const extra = words.length % count;
    const chunks = [];
    let cursor = 0;
    for (let i = 0; i < count; i++) {
        const size = base + (i < extra ? 1 : 0);
        if (size <= 0) continue;
        chunks.push(words.slice(cursor, cursor + size).join(' '));
        cursor += size;
    }
    if (cursor < words.length) chunks.push(words.slice(cursor).join(' '));
    return chunks;
}

export function pickPeerCharacter(rng) {
    const random = typeof rng === 'function' ? rng : Math.random;
    const index = Math.floor(clamp01(random()) * PEER_CHARACTERS.length);
    return PEER_CHARACTERS[Math.min(index, PEER_CHARACTERS.length - 1)];
}

function cleanWord(word) {
    return String(word || '').toLowerCase().replace(/[^a-z0-9']/g, '');
}

function wordDiff(wrongWords, correctWords) {
    const m = wrongWords.length;
    const n = correctWords.length;
    const dp = Array.from({ length: m + 1 }, () => new Array(n + 1).fill(0));
    for (let i = 1; i <= m; i++) {
        for (let j = 1; j <= n; j++) {
            dp[i][j] = cleanWord(wrongWords[i - 1]) === cleanWord(correctWords[j - 1])
                ? dp[i - 1][j - 1] + 1
                : Math.max(dp[i - 1][j], dp[i][j - 1]);
        }
    }

    const ops = [];
    let i = m;
    let j = n;
    while (i > 0 || j > 0) {
        if (i > 0 && j > 0 && cleanWord(wrongWords[i - 1]) === cleanWord(correctWords[j - 1])) {
            ops.push({ type: 'same', word: wrongWords[i - 1], wrongIndex: i - 1, correctIndex: j - 1 });
            i -= 1;
            j -= 1;
        } else if (j > 0 && (i === 0 || dp[i][j - 1] >= dp[i - 1][j])) {
            ops.push({ type: 'ins', word: correctWords[j - 1], wrongIndex: i, correctIndex: j - 1 });
            j -= 1;
        } else {
            ops.push({ type: 'del', word: wrongWords[i - 1], wrongIndex: i - 1, correctIndex: j });
            i -= 1;
        }
    }
    ops.reverse();
    return ops;
}

function chunkIndexAt(chunks, wordIndex) {
    if (!chunks.length) return 0;
    let cursor = 0;
    for (let i = 0; i < chunks.length; i++) {
        const size = chunks[i].split(/\s+/).filter(Boolean).length;
        if (wordIndex < cursor + size) return i;
        cursor += size;
    }
    return chunks.length - 1;
}

function describeError(delWords, insWords) {
    const wrong = delWords.join(' ');
    const right = insWords.join(' ');
    if (wrong && right) return `这里应该用“${right}”，而不是“${wrong}”哦！`;
    if (wrong) return `这里的“${wrong}”是多余的，应该去掉哦！`;
    if (right) return `这里漏掉了“${right}”，需要补上哦！`;
    return '这句话好像有点不对劲，再仔细看看哦！';
}

/**
 * 定位同伴错句中的错误意群。
 * 返回 null 表示没有检测到词面差异（此时按“同伴说对了”处理，避免让孩子凭空找错）。
 */
export function findErrorChunk(peerText, correctText) {
    const wrongWords = peerSpeechLine(peerText).split(/\s+/).filter(Boolean);
    const correctWords = peerSpeechLine(correctText).split(/\s+/).filter(Boolean);
    if (!wrongWords.length || !correctWords.length) return null;

    const ops = wordDiff(wrongWords, correctWords);
    const dels = ops.filter(op => op.type === 'del');
    const ins = ops.filter(op => op.type === 'ins');
    if (!dels.length && !ins.length) return null;

    let anchor = dels.length ? dels[0].wrongIndex : ins[0].wrongIndex;
    if (anchor >= wrongWords.length) anchor = wrongWords.length - 1;
    if (anchor < 0) anchor = 0;

    const chunks = chunkSentence(peerText);
    return {
        chunkIndex: chunkIndexAt(chunks, anchor),
        explanation: describeError(dels.map(op => op.word), ins.map(op => op.word))
    };
}

/**
 * 生成 `data-peer-relay` JSON。
 *
 * @param {object} options
 * @param {string} options.peerText     同伴说出的句子（陷阱卡 = 错句；普通卡 = 正确句）
 * @param {string} [options.correctText] 正确对照句（陷阱卡必填；普通卡默认同 peerText）
 * @param {boolean} [options.isTrap]    是否故意让同伴说错
 * @param {object} [options.character]  指定角色；不传则随机
 * @param {string} [options.explanation] 家长手写的错误讲解（优先于自动生成）
 * @param {string[]} [options.chunks]    AI 给出的 3~4 个意境胶囊（可选）
 * @param {number} [options.errorChunkIndex] AI 标出的错误胶囊下标（可选）
 * @param {string[]} [options.correctVariants] AI 生成的全部正确表达（可选）
 * @param {function} [options.rng]      随机源，便于测试
 */
export function createPeerRelay(options) {
    const opts = options || {};
    const character = opts.character || pickPeerCharacter(opts.rng);
    const peerText = String(opts.peerText == null ? '' : opts.peerText);
    const correctText = String(opts.correctText == null ? peerText : opts.correctText).trim() || peerText.trim();

    const providedChunks = Array.isArray(opts.chunks)
        ? opts.chunks.map(chunk => String(chunk == null ? '' : chunk).trim()).filter(Boolean)
        : [];
    const chunks = providedChunks.length ? providedChunks : chunkSentence(peerText);

    let error = null;
    if (opts.isTrap) {
        const providedIndex = parseInt(opts.errorChunkIndex, 10);
        if (Number.isFinite(providedIndex) && providedIndex >= 0 && providedIndex < chunks.length) {
            const detected = findErrorChunk(peerText, correctText);
            error = {
                chunkIndex: providedIndex,
                explanation: detected ? detected.explanation : '这句话好像有点不对劲，再仔细看看哦！'
            };
        } else {
            error = findErrorChunk(peerText, correctText);
        }
    }

    const isPeerCorrect = !opts.isTrap || !error;
    const explanation = isPeerCorrect
        ? ''
        : String(opts.explanation == null ? '' : opts.explanation).trim() || error.explanation;

    const variants = Array.isArray(opts.correctVariants)
        ? opts.correctVariants.map(value => String(value == null ? '' : value).trim()).filter(Boolean)
        : [];
    const correctVariants = variants.length ? variants : (correctText ? [correctText] : []);

    return {
        has_peer: true,
        peer_name: character.name,
        peer_avatar: character.avatar,
        is_peer_correct: isPeerCorrect,
        chunks: chunks,
        error_chunk_index: isPeerCorrect ? null : error.chunkIndex,
        error_explanation: explanation,
        correct_variants: correctVariants
    };
}

/**
 * 从普通卡索引中随机抽取 0~2 张触发「同伴说对了」。
 * 返回升序索引数组；抽取过程可注入 rng 以便测试。
 */
export function pickNormalPeerIndices(indices, rng) {
    const random = typeof rng === 'function' ? rng : Math.random;
    const pool = Array.from(new Set((indices || [])
        .map(value => parseInt(value, 10))
        .filter(value => Number.isFinite(value))));
    if (!pool.length) return [];

    for (let i = pool.length - 1; i > 0; i--) {
        const j = Math.floor(clamp01(random()) * (i + 1));
        const tmp = pool[i];
        pool[i] = pool[j];
        pool[j] = tmp;
    }

    const cap = Math.min(2, pool.length);
    const count = Math.min(cap, Math.floor(clamp01(random()) * 3));
    return pool.slice(0, count).sort((a, b) => a - b);
}
