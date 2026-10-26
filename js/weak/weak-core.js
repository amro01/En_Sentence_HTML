/**
 * ====================================================================
 * En_Sentence_HTML - 英语阅读练习生成器
 * Copyright (c) 2026 amro01 (https://github.com/amro01/En_Sentence_HTML)
 *
 * This program is licensed under CC BY-NC-SA 4.0.
 * Unauthorized commercial repackaging or selling is strictly prohibited.
 *
 * 严禁任何个人或机构将本软件及生成的网页用于商业牟利、收费培训或二次打包销售。
 * ====================================================================
 *
 * 生疏句循环复习 · 纯核心逻辑（零 DOM / 零 storage）
 *
 * 约定：normalizeSentence / sentenceId / computeWeakScore / toBase64Url
 * 必须是自包含函数，生成器会把它们的 Function.prototype.toString()
 * 注入练习页，两端共用同一份实现。它们内部不得引用模块级常量。
 */

export const WEAK_SCHEMA = 1;

export const WEAK_DEFAULTS = Object.freeze({
    timeLimit: 15,
    replayLimit: 3,
    masteryThreshold: 3,
    weakThreshold: 40,
    fastThreshold: 22,
    maxEntries: 300,
    maxPackEntries: 300,
    maxTextLength: 500,
    historyLimit: 5,
    ingestedLimit: 8
});

/** 生疏句再次出现的间隔（天）：failCount → 间隔 */
export const REVIEW_INTERVAL_DAYS = Object.freeze([1, 2, 4, 7, 14]);

/* ============================================================
 *  1. 句子身份
 * ============================================================ */

/**
 * 归一化英文句子，用于生成稳定身份。
 * - 空白折叠、去首尾、小写、弯引号归一、去首尾标点
 * - 不改内部标点，不删中文（若句子混有中文）
 */
export function normalizeSentence(text) {
    return String(text == null ? '' : text)
        .replace(/\r\n?/g, '\n')
        .replace(/\s+/g, ' ')
        .trim()
        .toLowerCase()
        .replace(/[\u2018\u2019]/g, "'")
        .replace(/^[\s"'“”‘’.,!?;:()\[\]{}<>-]+/, '')
        .replace(/[\s"'“”‘’.,!?;:()\[\]{}<>-]+$/, '');
}

/**
 * 16 位十六进制稳定 id（双 FNV-1a 变体）。
 * 依赖 normalizeSentence（注入生成页时必须同时存在）。
 */
export function sentenceId(text) {
    const s = normalizeSentence(text);
    let h1 = 0x811c9dc5 >>> 0;
    let h2 = 0x9e3779b9 >>> 0;
    for (let i = 0; i < s.length; i++) {
        const c = s.charCodeAt(i);
        h1 = Math.imul(h1 ^ c, 0x01000193) >>> 0;
        h2 = Math.imul(h2 ^ c, 0x85ebca6b) >>> 0;
        h2 = (h2 ^ (h2 >>> 13)) >>> 0;
    }
    return h1.toString(16).padStart(8, '0') + h2.toString(16).padStart(8, '0');
}

/* ============================================================
 *  2. 生疏度评分（0-100）
 *
 *  S = 100 * (0.35*time + 0.25*replay + 0.10*mastery + 0.30*trap)
 *  time   : (time - 0.5T) / T      ，0.5T 以下 0，1.5T 以上 1
 *  replay : replay / (R + 2)
 *  mastery: 1 - mastery / M
 *  trap   : 自动现形/未抓获 = 1；抓获但有读错 = (k/3)*0.6
 * ============================================================ */

export function computeWeakScore(sig, cfg) {
    const clamp01 = function (v) {
        return v < 0 ? 0 : v > 1 ? 1 : v;
    };
    const s = sig || {};
    const c = cfg || {};
    const T = Math.max(1, Number(c.timeLimit) || 15);
    const R = Math.max(1, Number(c.replayLimit) || 3);
    const M = Math.max(1, Number(c.masteryThreshold) || 3);
    const time = Number(s.time) || 0;
    const replay = Number(s.replay) || 0;
    const mastery = Number(s.mastery) || 0;
    const timePart = clamp01((time - T * 0.5) / T);
    const replayPart = clamp01(replay / (R + 2));
    const masteryPart = clamp01(1 - mastery / M);
    let trapPart = 0;
    if (s.isTrap) {
        if (s.trapAutoRevealed || !s.trapCaught) trapPart = 1;
        else trapPart = clamp01((Number(s.wrongReadCount) || 0) / 3) * 0.6;
    }
    const raw = 100 * (0.35 * timePart + 0.25 * replayPart + 0.10 * masteryPart + 0.30 * trapPart);
    return Math.max(0, Math.min(100, Math.round(raw + 1e-9)));
}

/* ============================================================
 *  3. 日期工具（本地日期键 YYYY-MM-DD）
 * ============================================================ */

function pad2(n) {
    return n < 10 ? '0' + n : String(n);
}

export function localDateKey(date) {
    const d = date instanceof Date ? date : new Date();
    return d.getFullYear() + '-' + pad2(d.getMonth() + 1) + '-' + pad2(d.getDate());
}

export function addDays(dateKey, days) {
    const parts = String(dateKey || '').split('-').map(Number);
    if (parts.length !== 3 || !parts[0] || !parts[1] || !parts[2]) {
        throw new Error('无效日期键: ' + dateKey);
    }
    const ts = Date.UTC(parts[0], parts[1] - 1, parts[2]) + (Number(days) || 0) * 86400000;
    const d = new Date(ts);
    return d.getUTCFullYear() + '-' + pad2(d.getUTCMonth() + 1) + '-' + pad2(d.getUTCDate());
}

export function daysBetween(fromKey, toKey) {
    const a = String(fromKey || '').split('-').map(Number);
    const b = String(toKey || '').split('-').map(Number);
    if (a.length !== 3 || b.length !== 3) return 0;
    const ta = Date.UTC(a[0], a[1] - 1, a[2]);
    const tb = Date.UTC(b[0], b[1] - 1, b[2]);
    return Math.round((tb - ta) / 86400000);
}

function isIsoTimestamp(value) {
    return typeof value === 'string' && /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(?:\.\d+)?Z$/.test(value);
}

/* ============================================================
 *  4. 生疏池 / 条目
 * ============================================================ */

export function createPool(child) {
    return {
        schema: WEAK_SCHEMA,
        child: String(child == null ? '' : child),
        updatedAt: null,
        entries: {}
    };
}

function withDefaults(cfg) {
    return Object.assign({}, WEAK_DEFAULTS, cfg || {});
}

function toNumber(value, min, max, fallback) {
    const n = Number(value);
    if (!Number.isFinite(n)) return fallback || 0;
    return Math.min(max, Math.max(min, n));
}

function clampScore(value) {
    return toNumber(value, 0, 100, 0);
}

export function sanitizeSignals(sig) {
    const s = sig && typeof sig === 'object' ? sig : {};
    return {
        time: toNumber(s.time, 0, 600, 0),
        replay: toNumber(s.replay, 0, 999, 0),
        mastery: toNumber(s.mastery, 0, 999, 0),
        count: toNumber(s.count, 0, 9999, 0),
        isTrap: !!s.isTrap,
        trapCaught: !!s.trapCaught,
        trapAutoRevealed: !!s.trapAutoRevealed,
        wrongReadCount: toNumber(s.wrongReadCount, 0, 99, 0)
    };
}

function createEntry(id, obs, updatedAt) {
    return {
        id: id,
        en: obs.en,
        zh: obs.zh || '',
        isTrap: !!obs.isTrap,
        trapEn: obs.trapEn || '',
        status: 'weak',
        manualWeak: false,
        manualAt: null,
        failCount: 0,
        flagCount: 0,
        successStreak: 0,
        servedCount: 0,
        reviewCount: 0,
        ewmaScore: 0,
        lastScore: 0,
        lastSignals: null,
        lastObservedAt: null,
        lastWeakAt: null,
        lastPassAt: null,
        lastServedAt: null,
        nextReviewAt: null,
        ingested: {},
        history: [],
        createdAt: updatedAt,
        updatedAt: updatedAt
    };
}

function pushHistory(entry, event, score, sig, updatedAt, cfg) {
    entry.history.push({
        t: updatedAt,
        event: event,
        score: score,
        time: sig.time,
        replay: sig.replay,
        trap: !!sig.isTrap
    });
    if (entry.history.length > cfg.historyLimit) {
        entry.history.splice(0, entry.history.length - cfg.historyLimit);
    }
}

function trimIngested(entry, limit) {
    const keys = Object.keys(entry.ingested);
    if (keys.length <= limit) return;
    keys.sort(function (a, b) {
        return String(entry.ingested[a] || '').localeCompare(String(entry.ingested[b] || ''));
    });
    const remove = keys.length - limit;
    for (let i = 0; i < remove; i++) delete entry.ingested[keys[i]];
}

function maxTimestamp(a, b) {
    if (!a) return b || null;
    if (!b) return a;
    return a > b ? a : b;
}

/**
 * 合并一次观察（幂等：同一 practiceId + updatedAt 只处理一次）。
 *
 * obs = {
 *   id?, en, zh?, isTrap?, trapEn?,
 *   sig: {time, replay, mastery, count, isTrap, trapCaught, trapAutoRevealed, wrongReadCount},
 *   manualWeak?, manualAt?, attempted?,
 *   practiceId, updatedAt
 * }
 */
export function ingestObservation(pool, obs, cfgInput, today) {
    if (!pool || typeof pool !== 'object') throw new TypeError('pool 不能为空');
    if (!pool.entries || typeof pool.entries !== 'object') pool.entries = {};
    if (!obs || typeof obs !== 'object' || !obs.en) return { action: 'invalid' };

    const cfg = withDefaults(cfgInput);
    const todayKey = today || localDateKey();
    const id = obs.id || sentenceId(obs.en);
    const sig = sanitizeSignals(obs.sig);
    const score = computeWeakScore(sig, cfg);
    const attempted = obs.attempted === true || sig.count > 0 || sig.replay > 0;
    const manualWeak = !!obs.manualWeak;
    const updatedAt = isIsoTimestamp(obs.updatedAt) ? obs.updatedAt : new Date().toISOString();
    const manualAt = isIsoTimestamp(obs.manualAt) ? obs.manualAt : (manualWeak ? updatedAt : null);
    const practiceId = String(obs.practiceId || 'unknown').slice(0, 80);

    let entry = pool.entries[id];
    const isNew = !entry;

    if (!entry) {
        if (!manualWeak && score < cfg.weakThreshold) return { action: 'ignored', score: score };
        entry = createEntry(id, obs, updatedAt);
        pool.entries[id] = entry;
    }

    if (entry.ingested[practiceId] === updatedAt) {
        return { action: 'duplicate', entry: entry, score: score };
    }

    // 基础字段以最新观察为准（中文取最新非空）
    entry.en = obs.en;
    if (typeof obs.zh === 'string' && obs.zh) entry.zh = obs.zh.slice(0, cfg.maxTextLength);
    entry.isTrap = !!(entry.isTrap || obs.isTrap || sig.isTrap);
    if (typeof obs.trapEn === 'string' && obs.trapEn) entry.trapEn = obs.trapEn.slice(0, cfg.maxTextLength);

    // 手动标记：以 manualAt 时间戳为准，旧观察不能覆盖新标记
    let manualChanged = false;
    if (manualAt && (!entry.manualAt || manualAt > entry.manualAt)) {
        const wasPinned = entry.manualWeak;
        entry.manualWeak = manualWeak;
        entry.manualAt = manualAt;
        if (manualWeak && !wasPinned) {
            manualChanged = true;
            entry.status = 'weak';
            entry.flagCount += 1;
            entry.successStreak = 0;
            entry.nextReviewAt = todayKey;
            entry.lastWeakAt = manualAt;
        } else if (!manualWeak && wasPinned) {
            manualChanged = true;
            entry.status = score >= cfg.weakThreshold ? 'weak' : 'graduated';
            entry.nextReviewAt = addDays(todayKey, entry.status === 'weak' ? 1 : 14);
            entry.successStreak = 0;
        }
    }

    const fast = attempted
        && score <= cfg.fastThreshold
        && sig.time <= cfg.timeLimit
        && sig.replay <= cfg.replayLimit;
    const firstForPractice = !entry.ingested[practiceId];

    if (firstForPractice && attempted) {
        if (entry.manualWeak) {
            // 手动红标优先级最高；但连续 2 次快速通过按总规则出库
            if (fast) {
                entry.successStreak += 1;
                entry.lastPassAt = updatedAt;
                if (entry.successStreak >= 2) {
                    entry.manualWeak = false;
                    entry.status = 'graduated';
                    entry.nextReviewAt = addDays(todayKey, 14);
                }
            } else {
                entry.successStreak = 0;
                entry.status = 'weak';
            }
        } else if (score >= cfg.weakThreshold) {
            entry.status = 'weak';
            entry.failCount += 1;
            entry.flagCount += 1;
            entry.successStreak = 0;
            entry.lastWeakAt = updatedAt;
            const step = Math.min(entry.failCount - 1, REVIEW_INTERVAL_DAYS.length - 1);
            entry.nextReviewAt = addDays(todayKey, REVIEW_INTERVAL_DAYS[step]);
        } else if (fast && entry.status === 'weak') {
            entry.successStreak += 1;
            entry.lastPassAt = updatedAt;
            if (entry.successStreak >= 2) {
                entry.status = 'graduated';
                entry.nextReviewAt = addDays(todayKey, 14);
            } else {
                entry.nextReviewAt = addDays(todayKey, 1);
            }
        } else if (entry.status === 'weak') {
            entry.successStreak = 0;
            entry.nextReviewAt = addDays(todayKey, 1);
        }
    }

    entry.ewmaScore = isNew ? score : Math.round(entry.ewmaScore * 0.6 + score * 0.4);
    entry.lastScore = score;
    entry.lastSignals = sig;
    entry.lastObservedAt = updatedAt;
    entry.updatedAt = maxTimestamp(entry.updatedAt, updatedAt);
    if (firstForPractice && attempted) entry.reviewCount += 1;
    entry.ingested[practiceId] = updatedAt;
    trimIngested(entry, cfg.ingestedLimit);

    const event = manualChanged ? 'manual' : (score >= cfg.weakThreshold ? 'weak' : (fast ? 'pass' : 'observe'));
    pushHistory(entry, event, score, sig, updatedAt, cfg);

    pool.updatedAt = maxTimestamp(pool.updatedAt, updatedAt);
    return { action: isNew ? 'created' : 'merged', entry: entry, score: score, manualChanged: manualChanged };
}

/**
 * 生成器面板上的手动标记（直接改池）。
 * 已处于相同状态时不动时间戳，避免无意义的重复写入。
 */
export function setManualWeak(pool, id, on, opts) {
    const options = opts || {};
    const entry = pool && pool.entries ? pool.entries[id] : null;
    if (!entry) return null;
    if (!!on === !!entry.manualWeak) return entry;

    const now = options.now || new Date().toISOString();
    const todayKey = options.today || localDateKey();
    entry.manualWeak = !!on;
    entry.manualAt = now;
    entry.updatedAt = now;
    if (on) {
        entry.status = 'weak';
        entry.flagCount += 1;
        entry.successStreak = 0;
        entry.nextReviewAt = todayKey;
        entry.lastWeakAt = now;
    } else {
        entry.status = 'graduated';
        entry.nextReviewAt = addDays(todayKey, 14);
        entry.successStreak = 0;
    }
    if (pool) pool.updatedAt = now;
    return entry;
}

/** 生成练习并下载时调用：同一日期只计一次 */
export function markServed(pool, ids, opts) {
    const options = opts || {};
    const todayKey = options.today || localDateKey();
    let count = 0;
    (ids || []).forEach(function (id) {
        const entry = pool.entries[id];
        if (!entry) return;
        if (entry.lastServedAt === todayKey) return;
        entry.lastServedAt = todayKey;
        entry.servedCount += 1;
        count += 1;
    });
    if (count) pool.updatedAt = options.now || new Date().toISOString();
    return count;
}

/* ============================================================
 *  5. 抽样 / 排序
 * ============================================================ */

export function isEntryDue(entry, todayKey) {
    if (!entry) return false;
    if (entry.manualWeak) return true;
    return !entry.nextReviewAt || entry.nextReviewAt <= (todayKey || localDateKey());
}

export function reviewPriority(entry, todayKey) {
    if (!entry) return 0;
    if (entry.manualWeak) return 100;
    const today = todayKey || localDateKey();
    const overdue = entry.nextReviewAt ? Math.max(0, daysBetween(entry.nextReviewAt, today)) : 0;
    return Math.min(100, Math.round(
        0.55 * (entry.ewmaScore || 0) +
        0.25 * Math.min(100, (entry.failCount || 0) * 12) +
        0.20 * Math.min(100, overdue * 20)
    ));
}

/**
 * 一键选批：
 *   到期（手动标记永远算到期）优先 → 优先级降序 → 更久未失败者优先
 *   strategy='random' 时在同一批到期/全部候选中洗牌
 */
export function pickReviewBatch(pool, opts) {
    const options = opts || {};
    const todayKey = options.today || localDateKey();
    const limit = options.limit == null ? 5 : Math.max(0, Number(options.limit) || 0);
    const includeTrap = options.includeTrap !== false;
    const strategy = options.strategy === 'random' ? 'random' : 'priority';
    const rng = typeof options.rng === 'function' ? options.rng : Math.random;
    const entries = pool && pool.entries ? Object.values(pool.entries) : [];

    const list = entries
        .filter(function (e) { return e && e.status === 'weak' && (includeTrap || !e.isTrap); })
        .map(function (e) {
            return {
                entry: e,
                due: isEntryDue(e, todayKey),
                priority: reviewPriority(e, todayKey)
            };
        });

    list.sort(function (a, b) {
        if (a.due !== b.due) return a.due ? -1 : 1;
        if (b.priority !== a.priority) return b.priority - a.priority;
        const ta = String(a.entry.lastWeakAt || '');
        const tb = String(b.entry.lastWeakAt || '');
        if (ta !== tb) return ta < tb ? -1 : 1;
        return String(a.entry.id).localeCompare(String(b.entry.id));
    });

    let ordered = list;
    if (strategy === 'random') {
        const dueList = list.filter(function (x) { return x.due; });
        ordered = (dueList.length ? dueList : list).slice();
        for (let i = ordered.length - 1; i > 0; i--) {
            const j = Math.floor(rng() * (i + 1));
            const tmp = ordered[i];
            ordered[i] = ordered[j];
            ordered[j] = tmp;
        }
    }

    return ordered.slice(0, limit).map(function (x) { return x.entry; });
}

/* ============================================================
 *  6. 错题包编解码 / 校验
 * ============================================================ */

export function toBase64Url(text) {
    const bytes = new TextEncoder().encode(String(text));
    let bin = '';
    for (let i = 0; i < bytes.length; i++) bin += String.fromCharCode(bytes[i]);
    return btoa(bin).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
}

export function fromBase64Url(text) {
    const s = String(text == null ? '' : text).trim();
    const padded = s.replace(/-/g, '+').replace(/_/g, '/') + '==='.slice((s.length + 3) % 4);
    const bin = atob(padded);
    const bytes = new Uint8Array(bin.length);
    for (let i = 0; i < bin.length; i++) bytes[i] = bin.charCodeAt(i);
    return new TextDecoder().decode(bytes);
}

export function extractPackBlock(text) {
    const match = String(text == null ? '' : text)
        .match(/---\s*WEAK-PACK v1\s*---\s*([A-Za-z0-9_-]+)\s*---\s*END WEAK-PACK\s*---/i);
    return match ? match[1] : null;
}

function clipString(value, limit) {
    if (typeof value !== 'string') return '';
    return value.slice(0, limit);
}

function packEntryFrom(value, exportedAt) {
    if (!value || typeof value !== 'object') return null;
    const en = typeof value.en === 'string' ? value.en.trim().slice(0, WEAK_DEFAULTS.maxTextLength) : '';
    if (!en) return null;
    return {
        id: sentenceId(en),
        en: en,
        zh: clipString(value.zh, WEAK_DEFAULTS.maxTextLength),
        isTrap: !!value.isTrap,
        trapEn: clipString(value.trapEn, WEAK_DEFAULTS.maxTextLength),
        sig: sanitizeSignals(value.sig),
        score: clampScore(value.score),
        weak: !!value.weak,
        manualWeak: !!value.manualWeak,
        manualAt: isIsoTimestamp(value.manualAt)
            ? value.manualAt
            : (value.manualWeak ? exportedAt : null),
        attempted: !!value.attempted,
        practiceId: clipString(value.practiceId, 80),
        updatedAt: isIsoTimestamp(value.updatedAt) ? value.updatedAt : exportedAt
    };
}

/** 校验并规范化错题包；不信任传入的 id / score */
export function validatePack(raw) {
    if (!raw || typeof raw !== 'object') throw new Error('错题包格式无效');
    if (raw.schema !== WEAK_SCHEMA) throw new Error('不支持的错题包版本');
    if (!raw.entries || typeof raw.entries !== 'object') throw new Error('错题包缺少 entries');

    const pairs = Array.isArray(raw.entries)
        ? raw.entries.map(function (v, i) { return [String(i), v]; })
        : Object.entries(raw.entries);
    if (pairs.length > WEAK_DEFAULTS.maxPackEntries) {
        throw new Error('错题包条目过多（上限 ' + WEAK_DEFAULTS.maxPackEntries + '）');
    }

    const exportedAt = isIsoTimestamp(raw.exportedAt) ? raw.exportedAt : new Date().toISOString();
    const pack = {
        schema: WEAK_SCHEMA,
        childName: clipString(raw.childName, 40),
        exportedAt: exportedAt,
        practiceId: clipString(raw.practiceId, 80),
        entries: {}
    };

    for (let i = 0; i < pairs.length; i++) {
        const entry = packEntryFrom(pairs[i][1], exportedAt);
        if (!entry) continue;
        const prev = pack.entries[entry.id];
        if (!prev || String(entry.updatedAt) >= String(prev.updatedAt)) {
            pack.entries[entry.id] = entry;
        }
    }
    return pack;
}

export function encodePack(pack) {
    return toBase64Url(JSON.stringify(validatePack(pack)));
}

export function decodePack(input) {
    if (typeof input !== 'string') throw new Error('错题包必须是文本');
    const text = input.trim();
    if (!text) throw new Error('错题包为空');
    if (text.length > 500000) throw new Error('错题包过大');

    let jsonText = text;
    if (text.charAt(0) !== '{') {
        const block = extractPackBlock(text);
        if (block) jsonText = fromBase64Url(block);
        else if (/^[A-Za-z0-9_-]+$/.test(text)) jsonText = fromBase64Url(text);
        else throw new Error('无法识别的错题包格式');
    }

    let raw;
    try {
        raw = JSON.parse(jsonText);
    } catch (e) {
        throw new Error('错题包不是有效的 JSON');
    }
    return validatePack(raw);
}

export function buildPack(entries, meta) {
    const options = meta || {};
    const list = Array.isArray(entries) ? entries : Object.values(entries || {});
    const out = {};
    for (let i = 0; i < list.length; i++) {
        const e = list[i];
        if (!e || !e.en) continue;
        const id = e.id || sentenceId(e.en);
        out[id] = {
            id: id,
            en: e.en,
            zh: e.zh || '',
            isTrap: !!e.isTrap,
            trapEn: e.trapEn || '',
            sig: sanitizeSignals(e.sig),
            score: clampScore(e.score),
            weak: !!e.weak,
            manualWeak: !!e.manualWeak,
            manualAt: e.manualAt || null,
            attempted: !!e.attempted,
            practiceId: e.practiceId || '',
            updatedAt: e.updatedAt || null
        };
    }
    return {
        schema: WEAK_SCHEMA,
        childName: options.childName || '',
        exportedAt: options.exportedAt || new Date().toISOString(),
        practiceId: options.practiceId || '',
        entries: out
    };
}

/** 导入错题包到池；返回计数 */
export function importPack(pool, pack, cfg, today) {
    const clean = validatePack(pack);
    const stats = { created: 0, merged: 0, duplicate: 0, ignored: 0, invalid: 0 };
    const todayKey = today || localDateKey();
    const entries = Object.values(clean.entries);

    for (let i = 0; i < entries.length; i++) {
        const entry = entries[i];
        const result = ingestObservation(pool, {
            id: entry.id,
            en: entry.en,
            zh: entry.zh,
            isTrap: entry.isTrap,
            trapEn: entry.trapEn,
            sig: entry.sig,
            manualWeak: entry.manualWeak,
            manualAt: entry.manualAt,
            attempted: entry.attempted,
            practiceId: entry.practiceId || clean.practiceId || ('pack_' + clean.exportedAt),
            updatedAt: entry.updatedAt || clean.exportedAt
        }, cfg, todayKey);
        if (stats[result.action] !== undefined) stats[result.action] += 1;
        else stats.invalid += 1;
    }
    return stats;
}

/* ============================================================
 *  7. 容量控制
 * ============================================================ */

export function prunePool(pool, opts) {
    const options = opts || {};
    const max = Math.max(1, Number(options.maxEntries) || WEAK_DEFAULTS.maxEntries);
    const entries = Object.values(pool.entries || {});
    if (entries.length <= max) return 0;

    let removeCount = entries.length - max;
    const toRemove = new Set();

    const removable = entries.filter(function (e) { return !e.manualWeak; }).sort(function (a, b) {
        const ga = a.status === 'graduated' ? 0 : 1;
        const gb = b.status === 'graduated' ? 0 : 1;
        if (ga !== gb) return ga - gb;
        return String(a.updatedAt || '').localeCompare(String(b.updatedAt || ''));
    });

    for (let i = 0; i < removable.length && removeCount > 0; i++) {
        toRemove.add(removable[i].id);
        removeCount -= 1;
    }

    if (removeCount > 0) {
        const rest = entries
            .filter(function (e) { return !toRemove.has(e.id); })
            .sort(function (a, b) { return String(a.updatedAt || '').localeCompare(String(b.updatedAt || '')); });
        for (let i = 0; i < rest.length && removeCount > 0; i++) {
            toRemove.add(rest[i].id);
            removeCount -= 1;
        }
    }

    toRemove.forEach(function (id) { delete pool.entries[id]; });
    return toRemove.size;
}

/* ============================================================
 *  8. 展示辅助
 * ============================================================ */

export function describeWeakReasons(entry, cfgInput) {
    const cfg = withDefaults(cfgInput);
    const rawSig = entry && (entry.sig || entry.lastSignals);
    const sig = rawSig ? sanitizeSignals(rawSig) : null;
    const reasons = [];
    if (entry && entry.manualWeak) reasons.push('手动标记');
    if (sig && sig.time > cfg.timeLimit) reasons.push('思考' + sig.time + '秒');
    if (sig && sig.replay > cfg.replayLimit) reasons.push('重听' + sig.replay + '次');
    if (sig && sig.isTrap && sig.trapAutoRevealed) reasons.push('陷阱自动现形');
    else if (sig && sig.isTrap && !sig.trapCaught) reasons.push('陷阱未抓获');
    if (!reasons.length) reasons.push('综合不熟练');
    return reasons.join(' / ');
}
