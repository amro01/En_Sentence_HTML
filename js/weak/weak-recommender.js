/**
 * ====================================================================
 * En_Sentence_HTML - 英语阅读练习生成器
 * Copyright (c) 2026 amro01 (https://github.com/amro01/En_Sentence_HTML)
 *
 * This program is licensed under CC BY-NC-SA 4.0.
 * Unauthorized commercial repackaging or selling is strictly prohibited.
 * ====================================================================
 *
 * 生疏句智能推荐（纯逻辑：零 DOM / 零 storage）。
 *
 * 权重公式（各项相加后钳制到 0~100）：
 *   手动红标       +50                      （手动标记永远置顶，见 sortRanked）
 *   遗忘曲线到期   +20 ~ +30                （逾期越久越高，封顶 30）
 *   高频错句       +10 / 次，封顶 +30
 *   毕业观察期     +15                      （连续快速通过 1 次，尚未毕业）
 *   当前生疏度     round(ewmaScore * 0.10)  （0 ~ +10）
 *
 * 排序：手动标记整体优先，其次总分，再按紧急度 / 失败次数 / 逾期天数 /
 * 最久未失败 / id 依次比较，保证同一份池子的推荐结果稳定可复现。
 */

import { daysBetween, isEntryDue, localDateKey } from './weak-core.js';

export const RECOMMEND_MODES = Object.freeze(['all', 'frequent', 'trap']);

/** “高频错题”的最低失败次数 */
export const HIGH_FAIL_THRESHOLD = 2;

/** 生疏分达到该值视为“极度生疏” */
export const CRITICAL_SCORE = 60;

export const URGENCY_META = Object.freeze({
    pinned: { key: 'pinned', rank: 0, label: '⭐ 手动重点' },
    critical: { key: 'critical', rank: 1, label: '🔴 极度生疏' },
    due: { key: 'due', rank: 2, label: '🟠 到期复习' },
    watching: { key: 'watching', rank: 3, label: '🟡 观察中' }
});

export function normalizeRecommendMode(mode) {
    const value = String(mode == null ? '' : mode);
    return RECOMMEND_MODES.indexOf(value) >= 0 ? value : 'all';
}

/** 陷阱失误：未抓获 / 自动现形 / 读错过；无观察记录时按“待确认”计入 */
export function isTrapMistake(entry) {
    if (!entry || !entry.isTrap) return false;
    const sig = entry.lastSignals || null;
    if (!sig) return true;
    return !!sig.trapAutoRevealed || sig.trapCaught === false || Number(sig.wrongReadCount) > 0;
}

function toCount(value) {
    const n = Number(value);
    return Number.isFinite(n) && n > 0 ? n : 0;
}

/**
 * 推荐权重拆解；便于面板展示与单元测试断言。
 * 返回 { parts, due, overdueDays, raw, score }，score 为 0~100。
 */
export function recommendationBreakdown(entry, todayKey) {
    const today = todayKey || localDateKey();
    const due = isEntryDue(entry, today);
    const overdueDays = entry && entry.nextReviewAt
        ? Math.max(0, daysBetween(entry.nextReviewAt, today))
        : 0;
    const weakness = Math.round(Math.min(100, toCount(entry && entry.ewmaScore)) * 0.10);
    const parts = {
        manual: entry && entry.manualWeak ? 50 : 0,
        overdue: due ? 20 + Math.min(10, overdueDays) : 0,
        fail: Math.min(30, toCount(entry && entry.failCount) * 10),
        observing: entry && entry.status === 'weak' && entry.successStreak === 1 ? 15 : 0,
        weakness: weakness
    };
    const raw = parts.manual + parts.overdue + parts.fail + parts.observing + parts.weakness;
    return {
        parts: parts,
        due: due,
        overdueDays: overdueDays,
        raw: raw,
        score: Math.max(0, Math.min(100, raw))
    };
}

export function recommendationScore(entry, todayKey) {
    if (!entry || !entry.en) return 0;
    return recommendationBreakdown(entry, todayKey).score;
}

/**
 * 复习紧急度：手动重点 > 极度生疏 > 到期复习 > 观察中。
 * 仅对 status === 'weak' 的条目有意义；毕业条目请直接显示“已毕业”。
 */
export function urgencyOf(entry, todayKey) {
    if (!entry) return 'watching';
    if (entry.manualWeak) return 'pinned';
    if (toCount(entry.failCount) >= HIGH_FAIL_THRESHOLD || toCount(entry.ewmaScore) >= CRITICAL_SCORE) {
        return 'critical';
    }
    if (isEntryDue(entry, todayKey || localDateKey())) return 'due';
    return 'watching';
}

export function urgencyLabel(entry, todayKey) {
    return URGENCY_META[urgencyOf(entry, todayKey)].label;
}

function matchesMode(entry, mode) {
    if (mode === 'frequent') return toCount(entry.failCount) >= HIGH_FAIL_THRESHOLD;
    if (mode === 'trap') return isTrapMistake(entry);
    return true;
}

function compareRanked(a, b) {
    const tierA = a.entry.manualWeak ? 0 : 1;
    const tierB = b.entry.manualWeak ? 0 : 1;
    if (tierA !== tierB) return tierA - tierB;
    if (b.score !== a.score) return b.score - a.score;
    const urgencyDiff = URGENCY_META[a.urgency].rank - URGENCY_META[b.urgency].rank;
    if (urgencyDiff) return urgencyDiff;
    const failDiff = toCount(b.entry.failCount) - toCount(a.entry.failCount);
    if (failDiff) return failDiff;
    if (b.breakdown.overdueDays !== a.breakdown.overdueDays) {
        return b.breakdown.overdueDays - a.breakdown.overdueDays;
    }
    const ta = String(a.entry.lastWeakAt || '');
    const tb = String(b.entry.lastWeakAt || '');
    if (ta !== tb) return ta < tb ? -1 : 1;
    return String(a.entry.id || '').localeCompare(String(b.entry.id || ''));
}

/**
 * 排序全部候选（不截断），返回 [{ entry, score, urgency, breakdown }]。
 *
 * opts = {
 *   mode: 'all' | 'frequent' | 'trap',
 *   today: 'YYYY-MM-DD',
 *   limit: number（0/缺省 = 不截断）,
 *   includeGraduated: false
 * }
 */
export function rankReviewEntries(pool, opts) {
    const options = opts || {};
    const today = options.today || localDateKey();
    const mode = normalizeRecommendMode(options.mode);
    const includeGraduated = options.includeGraduated === true;
    const limit = Math.max(0, Math.floor(Number(options.limit) || 0));
    const entries = pool && pool.entries ? Object.values(pool.entries) : [];
    const ranked = [];

    for (let i = 0; i < entries.length; i++) {
        const entry = entries[i];
        if (!entry || !entry.en) continue;
        if (entry.status === 'graduated' && !includeGraduated) continue;
        if (!matchesMode(entry, mode)) continue;
        const breakdown = recommendationBreakdown(entry, today);
        ranked.push({
            entry: entry,
            score: breakdown.score,
            urgency: urgencyOf(entry, today),
            breakdown: breakdown
        });
    }

    ranked.sort(compareRanked);
    return limit > 0 ? ranked.slice(0, limit) : ranked;
}

/**
 * 智能推荐 Top N 句。
 * getRecommendedSentences(pool, 5, { mode: 'trap', today: '2026-11-03' })
 */
export function getRecommendedSentences(pool, count, options) {
    const n = count == null ? 5 : Math.max(0, Math.floor(Number(count) || 0));
    if (!n) return [];
    const optionsWithLimit = Object.assign({}, options || {}, { limit: n });
    return rankReviewEntries(pool, optionsWithLimit).map(function (item) { return item.entry; });
}
