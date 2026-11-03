/**
 * ====================================================================
 * En_Sentence_HTML - 英语阅读练习生成器
 * Copyright (c) 2026 amro01 (https://github.com/amro01/En_Sentence_HTML)
 *
 * This program is licensed under CC BY-NC-SA 4.0.
 * Unauthorized commercial repackaging or selling is strictly prohibited.
 * ====================================================================
 *
 * 成绩反馈监控目录（File System Access API + IndexedDB 持久化 + 扫描/去重）。
 *
 * 设计约束：
 * 1. 模块顶层不访问 window / document / indexedDB，可被 Node 直接导入测试。
 * 2. 浏览器不支持目录选择时，调用方仍可用 FileList / 拖拽文件列表调用
 *    scanFeedbackDirectory，行为与目录扫描一致。
 * 3. 只读：扫描不改动用户文件，也不写生疏池；导入由 weak-store 负责。
 */

import { decodePack, extractPackBlock } from './weak-core.js';

export const DIR_DB_NAME = 'EnSentence_DirStore';
export const DIR_DB_VERSION = 1;
export const DIR_HANDLE_KEY = 'monitor_dir_handle';
export const DIR_HANDLES_STORE = 'handles';
export const DIR_SEEN_STORE = 'seen';

export const FEEDBACK_EXTENSIONS = Object.freeze(['.txt', '.json', '.weakpack']);

export const SCAN_LIMITS = Object.freeze({
    /** 单次扫描最多解析的反馈文件数 */
    maxFiles: 200,
    /** 枚举目录时的条目硬上限，防止误选整个磁盘目录 */
    maxEntries: 2000,
    /** 单个反馈文件大小上限（字节） */
    maxFileBytes: 1024 * 1024,
    /** 单文件文本长度上限（与错题包解码上限一致） */
    maxTextLength: 500000,
    /** 目录递归深度 */
    maxDepth: 6
});

/* ============================================================
 *  1. 基础工具
 * ============================================================ */

export function supportsDirectoryPicker() {
    return typeof globalThis !== 'undefined'
        && typeof globalThis.showDirectoryPicker === 'function';
}

export function isFeedbackFile(name) {
    const lower = String(name == null ? '' : name).toLowerCase();
    return FEEDBACK_EXTENSIONS.some(function (ext) { return lower.endsWith(ext); });
}

/** 内容指纹（双 FNV-1a，16 位 hex），用于无 practiceId 的文件去重 */
export function fingerprintText(text) {
    const s = String(text == null ? '' : text);
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

function clampInt(value, min, max, fallback) {
    const n = Math.floor(Number(value));
    if (!Number.isFinite(n)) return fallback;
    return Math.min(max, Math.max(min, n));
}

function messageOf(error) {
    return String(error && error.message ? error.message : error || 'unknown');
}

/* ============================================================
 *  2. IndexedDB：目录句柄持久化 + 已扫描练习 ID
 * ============================================================ */

let dbPromise = null;

function hasIndexedDb() {
    return typeof indexedDB !== 'undefined' && !!indexedDB;
}

function openDirDb() {
    if (!hasIndexedDb()) return Promise.reject(new Error('IndexedDB 不可用'));
    if (dbPromise) return dbPromise;
    dbPromise = new Promise(function (resolve, reject) {
        let request;
        try {
            request = indexedDB.open(DIR_DB_NAME, DIR_DB_VERSION);
        } catch (error) {
            dbPromise = null;
            reject(error);
            return;
        }
        request.onupgradeneeded = function () {
            const db = request.result;
            if (!db.objectStoreNames.contains(DIR_HANDLES_STORE)) db.createObjectStore(DIR_HANDLES_STORE);
            if (!db.objectStoreNames.contains(DIR_SEEN_STORE)) db.createObjectStore(DIR_SEEN_STORE);
        };
        request.onsuccess = function () { resolve(request.result); };
        request.onerror = function () {
            dbPromise = null;
            reject(request.error || new Error('IndexedDB 打开失败'));
        };
        request.onblocked = function () {
            dbPromise = null;
            reject(new Error('IndexedDB 被其他页面占用'));
        };
    });
    return dbPromise;
}

function requestResult(request) {
    return new Promise(function (resolve, reject) {
        request.onsuccess = function () { resolve(request.result); };
        request.onerror = function () { reject(request.error || new Error('IndexedDB 操作失败')); };
    });
}

function withStore(storeName, mode, run) {
    return openDirDb().then(function (db) {
        return new Promise(function (resolve, reject) {
            let tx;
            try {
                tx = db.transaction(storeName, mode);
            } catch (error) {
                reject(error);
                return;
            }
            let result;
            try {
                result = run(tx.objectStore(storeName), tx);
            } catch (error) {
                reject(error);
                return;
            }
            tx.oncomplete = function () { resolve(result); };
            tx.onerror = function () { reject(tx.error || new Error('IndexedDB 事务失败')); };
            tx.onabort = function () { reject(tx.error || new Error('IndexedDB 事务被中止')); };
        });
    });
}

export async function getSavedDirectoryHandle() {
    try {
        const store = await openDirDb();
        const tx = store.transaction(DIR_HANDLES_STORE, 'readonly');
        return (await requestResult(tx.objectStore(DIR_HANDLES_STORE).get(DIR_HANDLE_KEY))) || null;
    } catch (error) {
        return null;
    }
}

export async function saveDirectoryHandle(handle) {
    if (!handle) return false;
    try {
        await withStore(DIR_HANDLES_STORE, 'readwrite', function (store) {
            store.put(handle, DIR_HANDLE_KEY);
        });
        return true;
    } catch (error) {
        return false;
    }
}

export async function clearSavedDirectoryHandle() {
    try {
        await withStore(DIR_HANDLES_STORE, 'readwrite', function (store) {
            store.delete(DIR_HANDLE_KEY);
        });
        await withStore(DIR_SEEN_STORE, 'readwrite', function (store) {
            store.clear();
        });
        return true;
    } catch (error) {
        return false;
    }
}

/** 仅查询权限（不会触发授权弹窗，可在页面加载时调用） */
export async function queryDirectoryPermission(handle) {
    if (!handle || typeof handle.queryPermission !== 'function') return 'unsupported';
    try {
        const state = await handle.queryPermission({ mode: 'read' });
        return state === 'granted' || state === 'prompt' || state === 'denied' ? state : 'prompt';
    } catch (error) {
        return 'unsupported';
    }
}

/**
 * 检查并（必要时）请求只读权限。requestPermission 需要用户手势，
 * 因此只应在按钮点击流程里调用。
 */
export async function verifyPermission(handle, readWrite) {
    if (!handle || typeof handle.queryPermission !== 'function') return 'unsupported';
    const options = { mode: readWrite ? 'readwrite' : 'read' };
    try {
        const current = await handle.queryPermission(options);
        if (current === 'granted') return 'granted';
        if (typeof handle.requestPermission !== 'function') return current || 'prompt';
        const requested = await handle.requestPermission(options);
        return requested === 'granted' ? 'granted' : (requested || 'denied');
    } catch (error) {
        return 'denied';
    }
}

export async function pickFeedbackDirectory() {
    if (!supportsDirectoryPicker()) throw new Error('当前浏览器不支持目录访问');
    const handle = await globalThis.showDirectoryPicker({ id: 'en-sentence-feedback', mode: 'read' });
    await saveDirectoryHandle(handle);
    return handle;
}

export async function getSeenPracticeIds() {
    try {
        const db = await openDirDb();
        const tx = db.transaction(DIR_SEEN_STORE, 'readonly');
        const keys = await requestResult(tx.objectStore(DIR_SEEN_STORE).getAllKeys());
        return Array.isArray(keys) ? keys.map(String) : [];
    } catch (error) {
        return [];
    }
}

export async function markPracticesSeen(ids) {
    const list = (ids || []).map(String).filter(Boolean);
    if (!list.length) return 0;
    try {
        const now = Date.now();
        await withStore(DIR_SEEN_STORE, 'readwrite', function (store) {
            for (let i = 0; i < list.length; i++) store.put(now, list[i]);
        });
        return list.length;
    } catch (error) {
        return 0;
    }
}

/* ============================================================
 *  3. 枚举文件（目录句柄 / FileList / 拖拽）
 * ============================================================ */

function makeHandleEntry(handle, path) {
    const name = path.slice(path.lastIndexOf('/') + 1);
    return {
        name: name,
        path: path,
        open: async function () {
            const file = await handle.getFile();
            return { size: Number(file.size) || 0, text: function () { return file.text(); } };
        }
    };
}

function makeFileEntry(file, prefix) {
    const relative = String(file.webkitRelativePath || '');
    const name = String(file.name || relative || '');
    return {
        name: name,
        path: prefix + (relative || name),
        open: async function () {
            return { size: Number(file.size) || 0, text: function () { return file.text(); } };
        }
    };
}

async function collectFromDirectoryHandle(handle, out, prefix, depth, budget) {
    if (!handle || budget.exceeded) return;
    if (depth > SCAN_LIMITS.maxDepth) return;
    if (typeof handle.values !== 'function') return;
    const values = handle.values();
    for await (const child of values) {
        if (budget.exceeded) break;
        const name = child && child.name ? String(child.name) : '';
        if (!name || name.charAt(0) === '.') continue;
        if (child.kind === 'directory') {
            await collectFromDirectoryHandle(child, out, prefix + name + '/', depth + 1, budget);
            continue;
        }
        if (child.kind !== 'file') continue;
        out.push(makeHandleEntry(child, prefix + name));
        budget.count += 1;
        if (budget.count >= SCAN_LIMITS.maxEntries) budget.exceeded = true;
    }
}

async function collectFromFileList(list, out, prefix) {
    const length = Number(list && list.length) || 0;
    for (let i = 0; i < length; i++) {
        const file = list[i];
        if (!file || typeof file.name !== 'string') continue;
        if (file.name.charAt(0) === '.') continue;
        // 已经是 listFeedbackFiles / filesFromDataTransfer 产出的条目
        if (typeof file.open === 'function') {
            out.push(file);
            continue;
        }
        out.push(makeFileEntry(file, prefix));
    }
}

/**
 * 拖拽目录 → 扁平文件列表。优先使用 webkitGetAsEntry 递归目录；
 * 不支持时退回 dataTransfer.files。
 */
export async function filesFromDataTransfer(dataTransfer, options) {
    const opts = options || {};
    const out = [];
    const items = dataTransfer && dataTransfer.items;
    let handled = 0;

    async function walkEntry(entry, level) {
        if (!entry || level > SCAN_LIMITS.maxDepth) return 0;
        if (entry.isFile) {
            const file = await new Promise(function (resolve, reject) {
                entry.file(resolve, reject);
            });
            const before = out.length;
            await collectFromFileList([file], out, '');
            return out.length - before;
        }
        if (!entry.isDirectory) return 0;
        const reader = entry.createReader();
        let total = 0;
        let batch = [];
        do {
            batch = await new Promise(function (resolve, reject) {
                reader.readEntries(resolve, reject);
            });
            for (let i = 0; i < batch.length; i++) {
                total += await walkEntry(batch[i], level + 1);
                if (total >= opts.maxFiles || total >= SCAN_LIMITS.maxEntries) return total;
            }
        } while (batch.length);
        return total;
    }

    if (items && typeof items.length === 'number') {
        for (let i = 0; i < items.length; i++) {
            const item = items[i];
            if (!item || item.kind !== 'file') continue;
            handled += 1;
            let entry = null;
            try {
                entry = typeof item.webkitGetAsEntry === 'function' ? item.webkitGetAsEntry() : null;
            } catch (error) {
                entry = null;
            }
            if (entry) {
                await walkEntry(entry, 0);
            } else {
                let file = null;
                try { file = typeof item.getAsFile === 'function' ? item.getAsFile() : null; } catch (error) { file = null; }
                if (file) await collectFromFileList([file], out, '');
            }
        }
    }

    if (!handled && dataTransfer && dataTransfer.files) {
        await collectFromFileList(dataTransfer.files, out, '');
    }
    return out;
}

/**
 * 把目录句柄 / 文件句柄 / FileList / File[] / DataTransfer 统一成文件条目。
 */
export async function listFeedbackFiles(source) {
    const out = [];
    if (!source) return out;

    if (typeof source.getData === 'function' && typeof source.items !== 'undefined') {
        return filesFromDataTransfer(source);
    }
    if (source.kind === 'directory' && typeof source.values === 'function') {
        await collectFromDirectoryHandle(source, out, '', 0, { count: 0, exceeded: false });
        return out;
    }
    if (source.kind === 'file' && typeof source.getFile === 'function') {
        out.push(makeHandleEntry(source, String(source.name || '')));
        return out;
    }
    if (typeof source.length === 'number') {
        await collectFromFileList(source, out, '');
        return out;
    }
    if (typeof source.name === 'string' && typeof source.text === 'function') {
        await collectFromFileList([source], out, '');
    }
    return out;
}

async function readEntry(entry) {
    if (entry && typeof entry.open === 'function') {
        const handle = await entry.open();
        return { size: Number(handle.size) || 0, text: String(await handle.text()) };
    }
    if (entry && typeof entry.text === 'function') {
        return { size: Number(entry.size) || 0, text: String(await entry.text()) };
    }
    throw new Error('无法读取文件');
}

/* ============================================================
 *  4. 解析与扫描
 * ============================================================ */

/**
 * 解析单个反馈文件文本。
 * 返回 { ok: true, pack } 或 { ok: false, reason }
 * reason: empty | too-large | no-pack | parse-error
 */
export function parseFeedbackText(name, text) {
    const raw = String(text == null ? '' : text);
    if (!raw.trim()) return { ok: false, reason: 'empty' };
    if (raw.length > SCAN_LIMITS.maxTextLength) return { ok: false, reason: 'too-large' };

    const lower = String(name == null ? '' : name).toLowerCase();
    const hasBlock = !!extractPackBlock(raw);
    if (!hasBlock && lower.endsWith('.txt')) return { ok: false, reason: 'no-pack' };

    try {
        return { ok: true, pack: decodePack(raw) };
    } catch (error) {
        if (!hasBlock && lower.endsWith('.txt')) return { ok: false, reason: 'no-pack' };
        return { ok: false, reason: 'parse-error', error: messageOf(error) };
    }
}

function packVersion(pack) {
    let version = pack && pack.exportedAt ? String(pack.exportedAt) : '';
    const entries = pack && pack.entries ? pack.entries : {};
    for (const id of Object.keys(entries)) {
        const updatedAt = entries[id] && entries[id].updatedAt;
        if (updatedAt && String(updatedAt) > version) version = String(updatedAt);
    }
    return version;
}

function latestBySentence(recordsById, record) {
    const prev = recordsById.get(record.id);
    if (!prev || String(record.updatedAt) >= String(prev.updatedAt)) recordsById.set(record.id, record);
}

/**
 * 扫描成绩反馈目录（或文件列表）。
 *
 * 返回 {
 *   scannedFilesCount,   // 符合扩展名并成功读取的文件数
 *   parsedFilesCount,    // 成功解析出错题包的文件数
 *   practiceCount,       // 去重后的练习记录数
 *   weakEntriesCount,    // 去重后的待复习错句数
 *   newEntriesCount,     // 本次新练习记录里贡献的待复习错句数
 *   weakRecords,         // 去重后的待复习错句（按 updatedAt 倒序）
 *   packs,               // 按时间升序、可直接 importPack 的错题包
 *   practiceIds,         // 去重后的练习 ID（含本次新增）
 *   newPracticeIds,
 *   latest,              // { date, childName, practiceId, file, version } | null
 *   skippedFiles         // [{ file, reason }]
 * }
 *
 * options = {
 *   knownPracticeIds: Set|string[],  // 跨次扫描去重
 *   childName: '',                   // 非空时跳过其他孩子的反馈
 *   maxFiles, maxFileBytes
 * }
 */
export async function scanFeedbackDirectory(source, options) {
    const opts = options || {};
    const maxFiles = clampInt(opts.maxFiles, 1, SCAN_LIMITS.maxFiles, SCAN_LIMITS.maxFiles);
    const maxFileBytes = clampInt(opts.maxFileBytes, 1, SCAN_LIMITS.maxFileBytes, SCAN_LIMITS.maxFileBytes);
    const known = opts.knownPracticeIds instanceof Set
        ? opts.knownPracticeIds
        : new Set(Array.isArray(opts.knownPracticeIds) ? opts.knownPracticeIds.map(String) : []);
    const childFilter = String(opts.childName == null ? '' : opts.childName).trim();

    const files = await listFeedbackFiles(source);
    const byPractice = new Map();
    const skippedFiles = [];
    let matched = 0;
    let scannedFilesCount = 0;
    let parsedFilesCount = 0;

    for (let i = 0; i < files.length; i++) {
        const entry = files[i];
        if (!isFeedbackFile(entry.name)) continue;
        if (matched >= maxFiles) {
            skippedFiles.push({ file: entry.path, reason: 'too-many' });
            continue;
        }
        matched += 1;

        let read;
        try {
            read = await readEntry(entry);
        } catch (error) {
            skippedFiles.push({ file: entry.path, reason: 'read-error' });
            continue;
        }
        scannedFilesCount += 1;

        if (read.size > maxFileBytes) {
            skippedFiles.push({ file: entry.path, reason: 'too-large' });
            continue;
        }

        const parsed = parseFeedbackText(entry.name, read.text);
        if (!parsed.ok) {
            skippedFiles.push({ file: entry.path, reason: parsed.reason });
            continue;
        }

        const pack = parsed.pack;
        const packChild = String(pack.childName || '').trim();
        if (childFilter && packChild && packChild !== childFilter) {
            skippedFiles.push({ file: entry.path, reason: 'other-child' });
            continue;
        }
        parsedFilesCount += 1;

        const key = String(pack.practiceId || '') || ('file_' + fingerprintText(read.text));
        const version = packVersion(pack);
        const prev = byPractice.get(key);
        if (prev) {
            const loser = version >= prev.version ? prev.file : entry.path;
            skippedFiles.push({ file: loser, reason: 'duplicate-practice' });
            if (version < prev.version) continue;
        }
        byPractice.set(key, {
            key: key,
            pack: pack,
            version: version,
            file: entry.path,
            childName: packChild,
            isNew: !known.has(key)
        });
    }

    const recordsById = new Map();
    const newWeakIds = new Set();
    for (const item of byPractice.values()) {
        const entries = item.pack.entries || {};
        for (const id of Object.keys(entries)) {
            const packEntry = entries[id];
            if (!packEntry) continue;
            const record = {
                id: packEntry.id || id,
                en: packEntry.en,
                zh: packEntry.zh || '',
                isTrap: !!packEntry.isTrap,
                trapEn: packEntry.trapEn || '',
                sig: packEntry.sig,
                score: packEntry.score,
                weak: !!packEntry.weak,
                manualWeak: !!packEntry.manualWeak,
                manualAt: packEntry.manualAt || null,
                attempted: !!packEntry.attempted,
                practiceId: packEntry.practiceId || item.key,
                updatedAt: packEntry.updatedAt || item.version,
                childName: item.childName,
                sourceFile: item.file
            };
            if (item.isNew && (record.weak || record.manualWeak)) newWeakIds.add(record.id);
            latestBySentence(recordsById, record);
        }
    }

    const weakRecords = Array.from(recordsById.values()).filter(function (record) {
        return record.weak || record.manualWeak;
    });
    weakRecords.sort(function (a, b) {
        const diff = String(b.updatedAt || '').localeCompare(String(a.updatedAt || ''));
        return diff || String(a.id).localeCompare(String(b.id));
    });

    let latest = null;
    for (const item of byPractice.values()) {
        if (!latest || item.version > latest.version) {
            latest = {
                version: item.version,
                date: item.version ? item.version.slice(0, 10) : '',
                childName: item.childName,
                practiceId: item.key,
                file: item.file
            };
        }
    }

    const ordered = Array.from(byPractice.values()).sort(function (a, b) {
        return String(a.version).localeCompare(String(b.version)) || String(a.key).localeCompare(String(b.key));
    });

    return {
        scannedFilesCount: scannedFilesCount,
        parsedFilesCount: parsedFilesCount,
        practiceCount: byPractice.size,
        weakEntriesCount: weakRecords.length,
        newEntriesCount: newWeakIds.size,
        weakRecords: weakRecords,
        packs: ordered.map(function (item) {
            return {
                practiceId: item.key,
                version: item.version,
                childName: item.childName,
                file: item.file,
                isNew: item.isNew,
                pack: Object.assign({}, item.pack, { practiceId: item.pack.practiceId || item.key })
            };
        }),
        practiceIds: ordered.map(function (item) { return item.key; }),
        newPracticeIds: ordered.filter(function (item) { return item.isNew; }).map(function (item) { return item.key; }),
        latest: latest,
        skippedFiles: skippedFiles
    };
}
