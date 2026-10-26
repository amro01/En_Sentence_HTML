/**
 * ====================================================================
 * En_Sentence_HTML - 英语阅读练习生成器
 * Copyright (c) 2026 amro01 (https://github.com/amro01/En_Sentence_HTML)
 *
 * This program is licensed under CC BY-NC-SA 4.0.
 * Unauthorized commercial repackaging or selling is strictly prohibited.
 * ====================================================================
 *
 * Practice_ID 计算（从 main.js 抽出，便于回归测试）。
 * 注意：只允许把练习卡片内的 input/textarea 值按 DOM 顺序传入。
 * 卡片上新增 data-* 属性或按钮不会影响 ID；新增隐藏 input 会。
 */

export function computePracticeId(date, values) {
    let contentHash = 0;
    const list = Array.isArray(values) ? values : [];
    for (let i = 0; i < list.length; i++) {
        const text = String(list[i] == null ? '' : list[i]);
        for (let j = 0; j < text.length; j++) {
            contentHash = ((contentHash << 5) - contentHash) + text.charCodeAt(j);
            contentHash |= 0;
        }
    }
    const cleanDate = String(date == null ? '' : date).replace(/[^0-9]/g, '');
    return 'STATS_' + cleanDate + '_' + Math.abs(contentHash).toString(36);
}
