/**
 * ====================================================================
 * En_Sentence_HTML - 英语阅读练习生成器
 * Copyright (c) 2026 amro01 (https://github.com/amro01/En_Sentence_HTML)
 *
 * This program is licensed under CC BY-NC-SA 4.0.
 * Unauthorized commercial repackaging or selling is strictly prohibited.
 * ====================================================================
 *
 * 句首起手式（Sentence Starter）切分。
 *
 * 规则（D3）：
 *   - 只看第一行非空台词（多行对话以第一句为起手式来源）；
 *   - 剥离 `M:` / `F：` / `Wang Mei：` 等角色前缀，与播放解析器 parseDialogues 同一套正则；
 *   - 总词数 ≤ 6 取前 2 词，其余取前 3 词；词数不足时全取；
 *   - 标点随词保留（"Don't", "morning," 原样）。
 */

const ROLE_PATTERN = /^([A-Za-z\s]+|[\u4e00-\u9fa5]+)\s*[:：]\s*(.*)$/;
const SHORT_SENTENCE_WORDS = 6;
const SHORT_STARTER_WORDS = 2;
const LONG_STARTER_WORDS = 3;

export function stripRolePrefix(line) {
    const match = String(line == null ? '' : line).match(ROLE_PATTERN);
    if (!match) return String(line == null ? '' : line).trim();
    const speech = match[2].trim();
    // "M:" 后面什么都没有时退回到原行，避免起手式变成空串
    return speech || String(line).trim();
}

export function splitStarter(englishText, options) {
    const text = String(englishText == null ? '' : englishText);
    const firstLine = text.split('\n').map(line => line.trim()).find(line => line.length > 0) || '';
    const speech = stripRolePrefix(firstLine);
    if (!speech) return { starter: '', rest: '', words: [], starterWordCount: 0 };

    const words = speech.split(/\s+/).filter(Boolean);
    const maxWords = options && (options.maxWords === 2 || options.maxWords === 3)
        ? options.maxWords
        : (words.length <= SHORT_SENTENCE_WORDS ? SHORT_STARTER_WORDS : LONG_STARTER_WORDS);
    const take = Math.min(maxWords, words.length);

    return {
        starter: words.slice(0, take).join(' '),
        rest: words.slice(take).join(' '),
        words,
        starterWordCount: take
    };
}
