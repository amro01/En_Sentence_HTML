/**
 * ====================================================================
 * En_Sentence_HTML - 英语阅读练习生成器
 * Copyright (c) 2026 amro01 (https://github.com/amro01/En_Sentence_HTML)
 *
 * This program is licensed under CC BY-NC-SA 4.0.
 * Unauthorized commercial repackaging or selling is strictly prohibited.
 * ====================================================================
 *
 * 生成器侧存储层：
 * - 主生疏池 EnSentence_WeakPool_v1:<child>（唯一写入者）
 * - 扫描练习页 Outbox（WEAK_OUTBOX_<practiceId>）
 * - 导入 #weak= / 剪贴板 / TXT 中的错题包
 * - localStorage 配额不足时逐级降级（history → 减半 → 四分之一）
 */

import {
    WEAK_SCHEMA,
    WEAK_DEFAULTS,
    buildPack,
    createPool,
    decodePack,
    importPack,
    ingestObservation,
    isEntryDue,
    localDateKey,
    markServed,
    prunePool
} from './weak-core.js';

export const OUTBOX_PREFIX = 'WEAK_OUTBOX_';
export const POOL_PREFIX = 'EnSentence_WeakPool_v1:';

export function childKey(childName) {
    const value = String(childName == null ? '' : childName).trim();
    return value || '宝贝';
}

export function poolKey(childName) {
    return POOL_PREFIX + childKey(childName);
}

export function outboxKey(practiceId) {
    return OUTBOX_PREFIX + String(practiceId || '');
}

function storageOr(storage) {
    if (storage) return storage;
    try {
        return typeof localStorage !== 'undefined' ? localStorage : null;
    } catch (e) {
        return null;
    }
}

function normalizeEntry(entry, fallbackId) {
    entry.id = entry.id || fallbackId;
    entry.en = typeof entry.en === 'string' ? entry.en : '';
    entry.zh = typeof entry.zh === 'string' ? entry.zh : '';
    entry.isTrap = !!entry.isTrap;
    entry.trapEn = typeof entry.trapEn === 'string' ? entry.trapEn : '';
    entry.status = entry.status === 'graduated' ? 'graduated' : 'weak';
    entry.manualWeak = !!entry.manualWeak;
    entry.manualAt = typeof entry.manualAt === 'string' ? entry.manualAt : null;
    entry.nextReviewAt = typeof entry.nextReviewAt === 'string' ? entry.nextReviewAt : null;
    entry.lastWeakAt = typeof entry.lastWeakAt === 'string' ? entry.lastWeakAt : null;
    entry.lastPassAt = typeof entry.lastPassAt === 'string' ? entry.lastPassAt : null;
    entry.lastServedAt = typeof entry.lastServedAt === 'string' ? entry.lastServedAt : null;
    entry.lastObservedAt = typeof entry.lastObservedAt === 'string' ? entry.lastObservedAt : null;
    entry.createdAt = typeof entry.createdAt === 'string' ? entry.createdAt : null;
    entry.updatedAt = typeof entry.updatedAt === 'string' ? entry.updatedAt : null;

    const counters = ['failCount', 'flagCount', 'successStreak', 'servedCount', 'reviewCount', 'ewmaScore', 'lastScore'];
    for (const key of counters) {
        if (!Number.isFinite(entry[key])) entry[key] = 0;
    }

    if (!entry.ingested || typeof entry.ingested !== 'object') entry.ingested = {};
    if (!Array.isArray(entry.history)) entry.history = [];
    if (!entry.lastSignals) entry.lastSignals = entry.sig || null;
    delete entry.sig;
    return entry;
}

export function loadPool(childName, storage) {
    const s = storageOr(storage);
    const child = childKey(childName);
    const empty = createPool(child);
    if (!s) return empty;

    try {
        const raw = s.getItem(poolKey(child));
        if (!raw) return empty;
        const parsed = JSON.parse(raw);
        if (!parsed || typeof parsed !== 'object' || !parsed.entries || typeof parsed.entries !== 'object') {
            return empty;
        }
        parsed.schema = WEAK_SCHEMA;
        parsed.child = child;
        if (typeof parsed.updatedAt !== 'string') parsed.updatedAt = null;
        for (const id of Object.keys(parsed.entries)) {
            const entry = parsed.entries[id];
            if (!entry || typeof entry !== 'object' || !entry.en) {
                delete parsed.entries[id];
                continue;
            }
            normalizeEntry(entry, id);
        }
        return parsed;
    } catch (e) {
        return empty;
    }
}

function trimPoolForStorage(pool) {
    for (const entry of Object.values(pool.entries || {})) {
        if (Array.isArray(entry.history) && entry.history.length > 2) {
            entry.history = entry.history.slice(-2);
        }
        if (entry.ingested && typeof entry.ingested === 'object') {
            const keys = Object.keys(entry.ingested);
            if (keys.length > 2) {
                keys.sort(function (a, b) {
                    return String(entry.ingested[a]).localeCompare(String(entry.ingested[b]));
                });
                for (let i = 0; i < keys.length - 2; i++) delete entry.ingested[keys[i]];
            }
        }
    }
}

function isQuotaError(error) {
    if (!error) return false;
    return error.name === 'QuotaExceededError' ||
        error.name === 'NS_ERROR_DOM_QUOTA_REACHED' ||
        error.code === 22 ||
        error.code === 1014;
}

/**
 * 写入主池。配额不足时逐级降级，返回 { ok, pruned, error }。
 * 注意：降级会删除部分历史/条目，调用方应在 pruned=true 时提示家长。
 */
export function savePool(pool, storage) {
    const s = storageOr(storage);
    if (!pool || typeof pool !== 'object') return { ok: false, error: 'invalid-pool' };
    if (!pool.entries || typeof pool.entries !== 'object') pool.entries = {};
    if (pool.schema !== WEAK_SCHEMA) pool.schema = WEAK_SCHEMA;
    pool.child = childKey(pool.child);
    pool.updatedAt = new Date().toISOString();
    if (!s) return { ok: false, error: 'storage-unavailable' };

    let pruned = false;
    for (let attempt = 0; attempt < 4; attempt++) {
        try {
            s.setItem(poolKey(pool.child), JSON.stringify(pool));
            return { ok: true, pruned: pruned };
        } catch (error) {
            if (!isQuotaError(error)) {
                return { ok: false, error: 'write-failed', detail: String(error && error.message || error) };
            }
            if (attempt === 0) {
                trimPoolForStorage(pool);
            } else if (attempt === 1) {
                prunePool(pool, { maxEntries: Math.max(10, Math.floor(Object.keys(pool.entries).length / 2)) });
            } else if (attempt === 2) {
                prunePool(pool, { maxEntries: Math.max(10, Math.floor(Object.keys(pool.entries).length / 4)) });
            } else {
                return { ok: false, error: 'quota', detail: '存储空间不足' };
            }
            pruned = true;
        }
    }
    return { ok: false, error: 'quota' };
}

/**
 * 扫描同源练习页 Outbox。只读，不删除。
 */
export function scanOutboxes(storage, options) {
    const s = storageOr(storage);
    if (!s) return [];
    const limit = Math.max(1, Number(options && options.limit) || 200);
    const result = [];

    try {
        const total = Number(s.length) || 0;
        for (let i = 0; i < total && result.length < limit; i++) {
            let key = null;
            try { key = s.key(i); } catch (e) { continue; }
            if (!key || key.indexOf(OUTBOX_PREFIX) !== 0) continue;

            let raw = null;
            try { raw = s.getItem(key); } catch (e) { continue; }
            if (!raw) continue;

            let parsed = null;
            try { parsed = JSON.parse(raw); } catch (e) { continue; }
            if (!parsed || parsed.schema !== 1 || !parsed.entries || typeof parsed.entries !== 'object') continue;

            result.push({
                key: key,
                practiceId: parsed.practiceId || key.slice(OUTBOX_PREFIX.length),
                childName: parsed.childName || '',
                outbox: parsed
            });
        }
    } catch (e) {
        /* ignore */
    }
    return result;
}

export function ingestOutboxes(pool, outboxes, options) {
    const opts = options || {};
    const cfg = opts.cfg || WEAK_DEFAULTS;
    const todayKey = opts.today || localDateKey();
    const stats = {
        outboxes: 0,
        skippedOtherChild: 0,
        created: 0,
        merged: 0,
        duplicate: 0,
        ignored: 0,
        invalid: 0
    };

    for (const item of outboxes || []) {
        const outbox = item && item.outbox ? item.outbox : item;
        if (!outbox || typeof outbox !== 'object') continue;

        const outboxChild = String(outbox.childName || item.childName || '').trim();
        if (outboxChild && pool.child && childKey(outboxChild) !== childKey(pool.child)) {
            stats.skippedOtherChild += 1;
            continue;
        }
        stats.outboxes += 1;

        const practiceId = String(outbox.practiceId || item.practiceId || 'outbox').slice(0, 80);
        const entries = outbox.entries && typeof outbox.entries === 'object' ? outbox.entries : {};

        for (const id of Object.keys(entries)) {
            const entry = entries[id];
            if (!entry || typeof entry !== 'object' || !entry.en) {
                stats.invalid += 1;
                continue;
            }
            const result = ingestObservation(pool, {
                id: id,
                en: entry.en,
                zh: entry.zh,
                isTrap: entry.isTrap,
                trapEn: entry.trapEn,
                sig: entry.sig,
                manualWeak: entry.manualWeak,
                manualAt: entry.manualAt,
                attempted: entry.attempted,
                practiceId: entry.practiceId || practiceId,
                updatedAt: entry.updatedAt || outbox.updatedAt
            }, cfg, todayKey);

            if (Object.prototype.hasOwnProperty.call(stats, result.action)) stats[result.action] += 1;
            else stats.invalid += 1;
        }
    }
    return stats;
}

/**
 * 读取同源 Outbox → 合并进池 → 写回。
 */
export function syncPool(childName, storage, options) {
    const opts = options || {};
    const pool = loadPool(childName, storage);
    const outboxes = scanOutboxes(storage);
    const stats = ingestOutboxes(pool, outboxes, {
        cfg: opts.cfg,
        today: opts.today
    });
    const save = savePool(pool, storage);
    return { pool: pool, stats: stats, save: save };
}

/**
 * 导入文本：支持 raw JSON / base64url / 勋章 TXT 中的 WEAK-PACK 块。
 */
export function importText(pool, text, options) {
    const opts = options || {};
    const pack = decodePack(text);
    const stats = importPack(pool, pack, opts.cfg, opts.today);
    return { pack: pack, stats: stats };
}

export function readHashPack(hash) {
    const match = String(hash == null ? '' : hash).match(/(?:^|[#&])weak=([A-Za-z0-9_-]+)/);
    if (!match) return null;
    try {
        return decodePack(match[1]);
    } catch (e) {
        return null;
    }
}

export function buildPoolBackup(pool) {
    const entries = Object.values(pool && pool.entries ? pool.entries : {}).map(function (entry) {
        return Object.assign({}, entry, {
            sig: entry.lastSignals || null,
            score: entry.lastScore || 0,
            weak: entry.status === 'weak',
            attempted: false
        });
    });
    return buildPack(entries, {
        childName: pool ? pool.child : '',
        exportedAt: new Date().toISOString()
    });
}

export function poolSummary(pool, today) {
    const todayKey = today || localDateKey();
    const entries = Object.values(pool && pool.entries ? pool.entries : {});
    const summary = {
        total: entries.length,
        weak: 0,
        due: 0,
        manual: 0,
        trap: 0,
        graduated: 0
    };
    for (const entry of entries) {
        if (entry.status === 'graduated') summary.graduated += 1;
        else summary.weak += 1;
        if (entry.status === 'weak' && isEntryDue(entry, todayKey)) summary.due += 1;
        if (entry.manualWeak) summary.manual += 1;
        if (entry.status === 'weak' && entry.isTrap) summary.trap += 1;
    }
    return summary;
}

export function clearGraduated(pool) {
    let removed = 0;
    for (const id of Object.keys(pool.entries || {})) {
        const entry = pool.entries[id];
        if (entry && entry.status === 'graduated' && !entry.manualWeak) {
            delete pool.entries[id];
            removed += 1;
        }
    }
    return removed;
}

export function removeEntry(pool, id) {
    if (!pool || !pool.entries || !pool.entries[id]) return false;
    delete pool.entries[id];
    return true;
}

/**
 * 从同源 Outbox 中清除指定句子，避免“删除/清理后一同步又回来”。
 * 只处理当前孩子的 Outbox；空 childName 的旧数据一并处理。
 */
export function purgeOutboxEntries(ids, childName, storage) {
    const s = storageOr(storage);
    if (!s || !Array.isArray(ids) || !ids.length) return 0;
    const wanted = new Set(ids);
    const child = childName ? childKey(childName) : '';
    let removed = 0;

    for (const item of scanOutboxes(s, { limit: 500 })) {
        if (child && item.childName && childKey(item.childName) !== child) continue;
        const outbox = item.outbox;
        if (!outbox || !outbox.entries) continue;

        let changed = false;
        for (const id of wanted) {
            if (outbox.entries[id]) {
                delete outbox.entries[id];
                removed += 1;
                changed = true;
            }
        }
        if (changed) {
            outbox.updatedAt = new Date().toISOString();
            try { s.setItem(item.key, JSON.stringify(outbox)); } catch (e) { /* ignore */ }
        }
    }
    return removed;
}

/**
 * 下载练习页时调用：累计 servedCount（同一天只记一次）。
 */
export function recordServed(childName, ids, options) {
    const opts = options || {};
    const pool = loadPool(childName, opts.storage);
    const count = markServed(pool, ids || [], {
        today: opts.today || localDateKey(),
        now: opts.now
    });
    if (count) savePool(pool, opts.storage);
    return count;
}
