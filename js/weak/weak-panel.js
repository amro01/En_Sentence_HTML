/**
 * ====================================================================
 * En_Sentence_HTML - 英语阅读练习生成器
 * Copyright (c) 2026 amro01 (https://github.com/amro01/En_Sentence_HTML)
 *
 * This program is licensed under CC BY-NC-SA 4.0.
 * Unauthorized commercial repackaging or selling is strictly prohibited.
 * ====================================================================
 *
 * 生成器「生疏句循环复习」面板。
 * 所有用户/导入文本都通过 textContent 渲染，只有静态骨架使用 innerHTML。
 */

import {
    WEAK_DEFAULTS,
    addDays,
    describeWeakReasons,
    importPack,
    ingestObservation,
    isEntryDue,
    localDateKey,
    pickReviewBatch,
    reviewPriority,
    sentenceId,
    setManualWeak
} from './weak-core.js';
import {
    buildPoolBackup,
    clearGraduated,
    importText,
    ingestOutboxes,
    loadPool,
    poolSummary,
    purgeOutboxEntries,
    readHashPack,
    removeEntry,
    savePool,
    scanOutboxes
} from './weak-store.js';
import {
    URGENCY_META,
    rankReviewEntries,
    urgencyOf
} from './weak-recommender.js';
import {
    clearSavedDirectoryHandle,
    filesFromDataTransfer,
    getSavedDirectoryHandle,
    getSeenPracticeIds,
    markPracticesSeen,
    pickFeedbackDirectory,
    queryDirectoryPermission,
    scanFeedbackDirectory,
    supportsDirectoryPicker,
    verifyPermission
} from './dir-monitor.js';

const FILTER_OPTIONS = [
    ['due', '待复习（到期/手动）'],
    ['weak', '全部生疏'],
    ['manual', '仅手动标记'],
    ['trap', '仅同伴错句'],
    ['all', '全部（含毕业）'],
    ['graduated', '仅已毕业']
];

const SORT_OPTIONS = [
    ['priority', '优先级'],
    ['oldest', '最久未复习'],
    ['recent', '最近失败'],
    ['fails', '失败次数'],
    ['alpha', '英文 A→Z']
];

const REC_MODE_OPTIONS = [
    ['all', '全量待复习'],
    ['frequent', '仅高频错题'],
    ['trap', '仅同伴错句失误']
];

/** 「批量自选复习」列表展示的推荐条数 */
const REC_LIST_LIMIT = 20;

const PANEL_HTML = `
<div class="weak-overview">
    <span class="weak-stat">生疏 <b id="weakStatWeak">0</b></span>
    <span class="weak-stat">到期 <b id="weakStatDue">0</b></span>
    <span class="weak-stat">手动 <b id="weakStatManual">0</b></span>
    <span class="weak-stat">同伴错句 <b id="weakStatTrap">0</b></span>
    <span class="weak-stat">毕业 <b id="weakStatGraduated">0</b></span>
    <button type="button" class="weak-mini-btn" id="weakSyncBtn">🔄 同步练习记录</button>
    <button type="button" class="weak-mini-btn" id="weakExportBtn">📤 导出备份</button>
    <button type="button" class="weak-mini-btn" id="weakCleanBtn">🧹 清理已毕业</button>
</div>
<div class="dir-monitor" id="dirMonitor">
    <div class="dir-monitor-head">
        <span class="dir-light off" id="dirLight" aria-hidden="true">●</span>
        <span class="dir-name" id="dirName">📁 未设置成绩监控目录</span>
    </div>
    <div class="dir-actions">
        <button type="button" class="weak-mini-btn" id="dirPickBtn">📂 设定/切换成绩目录</button>
        <button type="button" class="weak-mini-btn" id="dirScanBtn" disabled>🔄 立即扫描更新</button>
        <button type="button" class="weak-mini-btn" id="dirClearBtn" disabled>❌ 取消监控</button>
    </div>
    <div class="dir-drop" id="dirDrop">
        <button type="button" class="weak-secondary" id="dirFallbackBtn">📁 选择文件夹（降级）</button>
        <span class="dir-drop-text">不支持目录授权时，也可把整个成绩文件夹拖到这里</span>
        <input type="file" id="dirFallbackInput" class="dir-fallback-input" webkitdirectory directory multiple>
    </div>
    <p class="dir-summary" id="dirSummary">选好目录后即可自动识别练习记录与错句。</p>
</div>
<div class="weak-recommend" id="weakRecommend">
    <div class="weak-recommend-head">
        <span class="weak-recommend-title">🎯 智能推荐复习</span>
        <label>范围 <select id="weakRecMode"></select></label>
        <button type="button" class="weak-primary" id="weakRec3Btn">🎯 填入推荐 3 句</button>
        <button type="button" class="weak-primary" id="weakRec5Btn">🎯 填入推荐 5 句</button>
        <button type="button" class="weak-secondary" id="weakRecToggleBtn" aria-expanded="false">📋 批量自选复习...</button>
    </div>
    <div class="weak-rec-panel" id="weakRecPanel" hidden>
        <div class="weak-rec-list" id="weakRecList"></div>
        <div class="weak-rec-actions">
            <span class="weak-rec-count" id="weakRecCount">已选 0 句</span>
            <button type="button" class="weak-primary" id="weakRecFillBtn">➕ 将选中项填入上方卡片</button>
            <button type="button" class="weak-secondary" id="weakRecClearBtn">清空勾选</button>
        </div>
    </div>
</div>
<div class="weak-controls">
    <label>筛选 <select id="weakFilter"></select></label>
    <label>排序 <select id="weakSort"></select></label>
    <label>数量 <input type="number" id="weakLimit" min="1" max="50" value="5"></label>
    <button type="button" class="weak-primary" id="weakFillBtn">🎯 一键填入到期复习</button>
    <button type="button" class="weak-secondary" id="weakRandomBtn">🎲 随机抽</button>
    <button type="button" class="weak-secondary" id="weakFillSelectedBtn">➕ 填入所选</button>
    <button type="button" class="weak-secondary" id="weakReplaceBtn">🧹 清空后填充</button>
</div>
<details class="weak-import" id="weakImportBox">
    <summary>📥 导入错题包（粘贴 / 文件 / 回传）</summary>
    <textarea id="weakImportText" placeholder="粘贴错题包 base64、JSON，或整份勋章 TXT"></textarea>
    <div class="weak-import-row">
        <input type="file" id="weakImportFile" accept=".txt,.json,application/json,text/plain">
        <button type="button" class="weak-secondary" id="weakImportBtn">解析并导入</button>
    </div>
</details>
<div class="weak-manual">
    <input type="text" id="weakManualEn" placeholder="手动录入英文（按句子去重）">
    <input type="text" id="weakManualZh" placeholder="中文翻译（可选）">
    <button type="button" class="weak-secondary" id="weakManualAddBtn">➕ 加入生疏库</button>
</div>
<div class="weak-list" id="weakList"></div>
<p class="weak-hint" id="weakHint"></p>
`;

function make(tagName, className, text) {
    const el = document.createElement(tagName);
    if (className) el.className = className;
    if (text != null) el.textContent = String(text);
    return el;
}

function makeButton(label, className, handler) {
    const btn = document.createElement('button');
    btn.type = 'button';
    btn.className = className;
    btn.textContent = label;
    btn.addEventListener('click', function (event) {
        event.preventDefault();
        handler();
    });
    return btn;
}

function fillSelect(select, options, value) {
    select.textContent = '';
    for (const option of options) {
        const el = document.createElement('option');
        el.value = option[0];
        el.textContent = option[1];
        if (option[0] === value) el.selected = true;
        select.appendChild(el);
    }
}

function debounce(fn, delay) {
    let timer = null;
    return function () {
        const args = arguments;
        clearTimeout(timer);
        timer = setTimeout(function () { fn.apply(null, args); }, delay);
    };
}

export function initWeakPanel(options) {
    const root = document.getElementById('weakPanel');
    if (!root) return null;

    const opts = options || {};
    const state = {
        childName: '',
        pool: null,
        filter: 'due',
        sort: 'priority',
        limit: 5,
        selected: new Set(),
        hintTimer: null,
        hashHandled: false,
        recMode: 'all',
        recSelected: new Set(),
        recOpen: false,
        dir: {
            handle: null,
            name: '',
            status: 'none',
            busy: false,
            lastScan: null
        }
    };

    root.innerHTML = PANEL_HTML;

    const els = {
        statWeak: document.getElementById('weakStatWeak'),
        statDue: document.getElementById('weakStatDue'),
        statManual: document.getElementById('weakStatManual'),
        statTrap: document.getElementById('weakStatTrap'),
        statGraduated: document.getElementById('weakStatGraduated'),
        syncBtn: document.getElementById('weakSyncBtn'),
        exportBtn: document.getElementById('weakExportBtn'),
        cleanBtn: document.getElementById('weakCleanBtn'),
        filter: document.getElementById('weakFilter'),
        sort: document.getElementById('weakSort'),
        limit: document.getElementById('weakLimit'),
        fillBtn: document.getElementById('weakFillBtn'),
        randomBtn: document.getElementById('weakRandomBtn'),
        fillSelectedBtn: document.getElementById('weakFillSelectedBtn'),
        replaceBtn: document.getElementById('weakReplaceBtn'),
        importBox: document.getElementById('weakImportBox'),
        importText: document.getElementById('weakImportText'),
        importFile: document.getElementById('weakImportFile'),
        importBtn: document.getElementById('weakImportBtn'),
        manualEn: document.getElementById('weakManualEn'),
        manualZh: document.getElementById('weakManualZh'),
        manualAddBtn: document.getElementById('weakManualAddBtn'),
        list: document.getElementById('weakList'),
        hint: document.getElementById('weakHint'),
        dirMonitor: document.getElementById('dirMonitor'),
        dirLight: document.getElementById('dirLight'),
        dirName: document.getElementById('dirName'),
        dirPickBtn: document.getElementById('dirPickBtn'),
        dirScanBtn: document.getElementById('dirScanBtn'),
        dirClearBtn: document.getElementById('dirClearBtn'),
        dirDrop: document.getElementById('dirDrop'),
        dirFallbackBtn: document.getElementById('dirFallbackBtn'),
        dirFallbackInput: document.getElementById('dirFallbackInput'),
        dirSummary: document.getElementById('dirSummary'),
        recMode: document.getElementById('weakRecMode'),
        rec3Btn: document.getElementById('weakRec3Btn'),
        rec5Btn: document.getElementById('weakRec5Btn'),
        recToggleBtn: document.getElementById('weakRecToggleBtn'),
        recPanel: document.getElementById('weakRecPanel'),
        recList: document.getElementById('weakRecList'),
        recCount: document.getElementById('weakRecCount'),
        recFillBtn: document.getElementById('weakRecFillBtn'),
        recClearBtn: document.getElementById('weakRecClearBtn')
    };

    fillSelect(els.filter, FILTER_OPTIONS, state.filter);
    fillSelect(els.sort, SORT_OPTIONS, state.sort);
    fillSelect(els.recMode, REC_MODE_OPTIONS, state.recMode);

    function getChildName() {
        if (typeof opts.getChildName === 'function') {
            const value = opts.getChildName();
            return String(value == null ? '' : value).trim() || '宝贝';
        }
        const input = document.getElementById('childName');
        return input && input.value.trim() ? input.value.trim() : '宝贝';
    }

    function hint(message) {
        if (!els.hint) return;
        els.hint.textContent = message || '';
        clearTimeout(state.hintTimer);
        state.hintTimer = setTimeout(function () { els.hint.textContent = ''; }, 6000);
    }

    function reload() {
        state.childName = getChildName();
        state.pool = loadPool(state.childName);
        for (const id of [...state.selected]) {
            if (!state.pool.entries[id]) state.selected.delete(id);
        }
        for (const id of [...state.recSelected]) {
            if (!state.pool.entries[id]) state.recSelected.delete(id);
        }
        return state.pool;
    }

    function persist() {
        const result = savePool(state.pool);
        if (!result.ok) {
            hint('保存失败：' + (result.error === 'quota' ? '存储空间不足' : result.error));
        } else if (result.pruned) {
            hint('存储空间不足，已自动清理部分历史/条目');
        }
        return result;
    }

    function currentEntries() {
        const pool = state.pool;
        const today = localDateKey();
        let list = Object.values(pool.entries || {});

        if (state.filter === 'weak') {
            list = list.filter(e => e.status === 'weak');
        } else if (state.filter === 'due') {
            list = list.filter(e => e.status === 'weak' && isEntryDue(e, today));
        } else if (state.filter === 'manual') {
            list = list.filter(e => e.manualWeak);
        } else if (state.filter === 'trap') {
            list = list.filter(e => e.isTrap);
        } else if (state.filter === 'graduated') {
            list = list.filter(e => e.status === 'graduated');
        }

        list.sort(function (a, b) {
            if (state.filter === 'all') {
                const dueDiff = Number(isEntryDue(b, today)) - Number(isEntryDue(a, today));
                if (dueDiff) return dueDiff;
            }
            if (state.sort === 'priority') {
                const diff = reviewPriority(b, today) - reviewPriority(a, today);
                if (diff) return diff;
            } else if (state.sort === 'oldest') {
                const diff = String(a.lastWeakAt || '').localeCompare(String(b.lastWeakAt || ''));
                if (diff) return diff;
            } else if (state.sort === 'recent') {
                const diff = String(b.lastWeakAt || '').localeCompare(String(a.lastWeakAt || ''));
                if (diff) return diff;
            } else if (state.sort === 'fails') {
                const diff = (b.failCount || 0) - (a.failCount || 0);
                if (diff) return diff;
            }
            return String(a.en).localeCompare(String(b.en));
        });

        return list;
    }

    function renderStats() {
        const summary = poolSummary(state.pool, localDateKey());
        els.statWeak.textContent = summary.weak;
        els.statDue.textContent = summary.due;
        els.statManual.textContent = summary.manual;
        els.statTrap.textContent = summary.trap;
        els.statGraduated.textContent = summary.graduated;
    }

    function chip(text, className) {
        return make('span', 'weak-chip' + (className ? ' ' + className : ''), text);
    }

    function renderList() {
        const list = currentEntries();
        els.list.textContent = '';

        if (!list.length) {
            els.list.appendChild(make('div', 'weak-empty', '这个筛选下没有句子。完成练习后点「同步练习记录」，或用下方手动录入。'));
            return;
        }

        for (const entry of list) {
            const row = make('div', 'weak-entry');
            if (state.selected.has(entry.id)) row.classList.add('selected');

            const head = make('div', 'weak-entry-head');

            const checkbox = document.createElement('input');
            checkbox.type = 'checkbox';
            checkbox.className = 'weak-entry-check';
            checkbox.checked = state.selected.has(entry.id);
            checkbox.addEventListener('change', function () {
                if (checkbox.checked) state.selected.add(entry.id);
                else state.selected.delete(entry.id);
                if (checkbox.checked) row.classList.add('selected');
                else row.classList.remove('selected');
            });
            head.appendChild(checkbox);

            const main = make('div', 'weak-entry-main');
            main.appendChild(make('div', 'weak-entry-en', entry.en));
            if (entry.zh) main.appendChild(make('div', 'weak-entry-zh', entry.zh));

            const meta = make('div', 'weak-entry-meta');
            if (entry.status === 'weak') {
                const urgency = urgencyOf(entry, localDateKey());
                row.classList.add('urgency-' + urgency);
                meta.appendChild(chip(URGENCY_META[urgency].label, 'urgency ' + urgency));
            }
            meta.appendChild(chip('分 ' + (entry.ewmaScore || 0), 'score'));
            if (entry.isTrap) meta.appendChild(chip('🎭 同伴错句', 'trap'));
            if (entry.status === 'graduated') meta.appendChild(chip('🎓 已毕业', 'graduated'));
            if (entry.failCount) meta.appendChild(chip('失败 ' + entry.failCount));
            if (entry.successStreak) meta.appendChild(chip('连续达标 ' + entry.successStreak));
            if (entry.servedCount) meta.appendChild(chip('已发出 ' + entry.servedCount));
            main.appendChild(meta);

            main.appendChild(make('div', 'weak-entry-reason', describeWeakReasons(entry, WEAK_DEFAULTS)));

            const actions = make('div', 'weak-entry-actions');

            actions.appendChild(makeButton('➕ 填入', 'weak-action', function () {
                fillEntries([entry], false);
            }));

            if (entry.status !== 'graduated') {
                actions.appendChild(makeButton('✅ 已掌握', 'weak-action', function () {
                    markMastered(entry.id);
                }));
            }
            if (!entry.manualWeak) {
                actions.appendChild(makeButton('🔴 标红', 'weak-action', function () {
                    markWeak(entry.id);
                }));
            }

            if (entry.isTrap && entry.trapEn) {
                actions.appendChild(makeButton('🎭 让同伴说错这句', 'weak-action', function () {
                    addTrapCard(entry);
                }));
            }

            actions.appendChild(makeButton('🗑 删除', 'weak-action danger', function () {
                if (!confirm('从生疏库删除这句话？')) return;
                removeEntry(state.pool, entry.id);
                const purged = purgeOutboxEntries([entry.id], state.childName);
                state.selected.delete(entry.id);
                persist();
                render();
                if (purged) hint('已删除，并清理 ' + purged + ' 个同步缓存');
            }));

            main.appendChild(actions);
            head.appendChild(main);
            row.appendChild(head);
            els.list.appendChild(row);
        }
    }

    function render() {
        renderStats();
        renderList();
        renderRecommend();
    }

    function rankedRecommendations(limit) {
        return rankReviewEntries(state.pool, {
            mode: state.recMode,
            today: localDateKey(),
            limit: limit || REC_LIST_LIMIT
        });
    }

    function renderRecommend() {
        if (!els.recList) return;
        const ranked = rankedRecommendations(REC_LIST_LIMIT);
        for (const id of [...state.recSelected]) {
            if (!state.pool.entries[id]) state.recSelected.delete(id);
        }
        els.recList.textContent = '';

        if (!ranked.length) {
            els.recList.appendChild(make('div', 'weak-empty', '这个范围下没有待复习句。'));
        } else {
            for (const item of ranked) {
                els.recList.appendChild(renderRecommendRow(item));
            }
        }
        els.recCount.textContent = '已选 ' + state.recSelected.size + ' 句';
        els.recFillBtn.disabled = state.recSelected.size === 0;
    }

    function renderRecommendRow(item) {
        const entry = item.entry;
        const row = make('div', 'weak-rec-row');
        if (state.recSelected.has(entry.id)) row.classList.add('selected');

        const checkbox = document.createElement('input');
        checkbox.type = 'checkbox';
        checkbox.className = 'weak-entry-check';
        checkbox.checked = state.recSelected.has(entry.id);
        checkbox.addEventListener('change', function () {
            if (checkbox.checked) state.recSelected.add(entry.id);
            else state.recSelected.delete(entry.id);
            if (checkbox.checked) row.classList.add('selected');
            else row.classList.remove('selected');
            els.recCount.textContent = '已选 ' + state.recSelected.size + ' 句';
            els.recFillBtn.disabled = state.recSelected.size === 0;
        });
        row.appendChild(checkbox);

        const main = make('div', 'weak-rec-main');
        const text = make('div', 'weak-rec-en', entry.en);
        main.appendChild(text);

        const meta = make('div', 'weak-rec-meta');
        meta.appendChild(chip(URGENCY_META[item.urgency].label, 'urgency ' + item.urgency));
        meta.appendChild(chip('推荐 ' + item.score + ' 分'));
        if (entry.isTrap) meta.appendChild(chip('🎭 同伴错句', 'trap'));
        if (entry.failCount) meta.appendChild(chip('失败 ' + entry.failCount));
        if (item.breakdown.overdueDays) meta.appendChild(chip('逾期 ' + item.breakdown.overdueDays + ' 天', 'due'));
        main.appendChild(meta);
        row.appendChild(main);
        return row;
    }

    function existingIds() {
        if (typeof opts.getExistingIds !== 'function') return new Set();
        try {
            return new Set(opts.getExistingIds() || []);
        } catch (e) {
            return new Set();
        }
    }

    // 复习句若原本是同伴错句，自动回填对照英文并勾选同伴抢答，避免丢失配置
    function cardOptionsFor(entry) {
        const trapEn = String(entry.trapEn || '').trim();
        if (entry.isTrap && trapEn) {
            return {
                en: trapEn,
                zh: entry.zh,
                isTrap: true,
                correctEn: entry.en,
                weak: { id: entry.id, reviewCount: entry.reviewCount || 0 }
            };
        }
        return {
            en: entry.en,
            zh: entry.zh,
            weak: { id: entry.id, reviewCount: entry.reviewCount || 0 }
        };
    }

    function fillEntries(entries, replace) {
        if (!entries.length) {
            hint('没有可填入的句子');
            return;
        }
        if (replace) {
            const batch = entries.slice();
            if (!confirm('将清空当前练习卡片（说明框保留），再填入 ' + batch.length + ' 句复习句，继续？')) return;
            if (typeof opts.clearCards === 'function') opts.clearCards();
        }

        const existing = existingIds();
        let added = 0;
        let skipped = 0;

        for (const entry of entries) {
            if (existing.has(entry.id)) {
                skipped += 1;
                continue;
            }
            if (typeof opts.addCard !== 'function') break;
            opts.addCard(cardOptionsFor(entry));
            existing.add(entry.id);
            added += 1;
        }

        if (typeof opts.afterAdd === 'function') opts.afterAdd();
        hint('已填入 ' + added + ' 句' + (skipped ? '，跳过 ' + skipped + ' 句已存在' : ''));
        render();
    }

    function addTrapCard(entry) {
        if (typeof opts.addCard !== 'function') return;
        if (existingIds().has(entry.id)) {
            hint('这句已经在练习卡片里了');
            return;
        }
        opts.addCard({
            en: entry.trapEn,
            zh: entry.zh,
            isTrap: true,
            correctEn: entry.en,
            weak: { id: entry.id, reviewCount: entry.reviewCount || 0 }
        });
        if (typeof opts.afterAdd === 'function') opts.afterAdd();
        hint('已按同伴错句填入');
        render();
    }

    function markMastered(id) {
        const entry = state.pool.entries[id];
        if (!entry) return;
        const now = new Date().toISOString();
        entry.manualWeak = false;
        entry.manualAt = now;
        entry.status = 'graduated';
        entry.nextReviewAt = addDays(localDateKey(), 14);
        entry.successStreak = 0;
        entry.updatedAt = now;
        state.selected.delete(id);
        persist();
        render();
        hint('已标记为掌握，14 天后再做归档检查');
    }

    function markWeak(id) {
        const entry = setManualWeak(state.pool, id, true, {
            today: localDateKey(),
            now: new Date().toISOString()
        });
        if (!entry) return;
        persist();
        render();
        hint('已加入手动生疏标记');
    }

    function batch(limit, strategy) {
        return pickReviewBatch(state.pool, {
            limit: limit,
            strategy: strategy || 'priority',
            today: localDateKey()
        });
    }

    // 一键填充时跳过练习里已有的句子，避免“抽 5 句全被跳过”
    function pickFresh(limit, strategy) {
        const existing = existingIds();
        return batch(1000, strategy)
            .filter(entry => !existing.has(entry.id))
            .slice(0, limit);
    }

    function fillDue() {
        state.limit = Math.max(1, parseInt(els.limit.value, 10) || 5);
        fillEntries(pickFresh(state.limit, 'priority'), false);
    }

    function fillRandom() {
        state.limit = Math.max(1, parseInt(els.limit.value, 10) || 5);
        fillEntries(pickFresh(state.limit, 'random'), false);
    }

    function fillSelected() {
        const list = Object.values(state.pool.entries).filter(e => state.selected.has(e.id));
        fillEntries(list, false);
    }

    function replaceWithDue() {
        state.limit = Math.max(1, parseInt(els.limit.value, 10) || 5);
        const entries = batch(state.limit, 'priority');
        if (!entries.length) {
            hint('当前没有到期复习句');
            return;
        }
        fillEntries(entries, true);
    }

    // 推荐填充：跳过已存在的句子，尽量凑满 count 句新的
    function fillRecommended(count) {
        const existing = existingIds();
        const entries = rankReviewEntries(state.pool, {
            mode: state.recMode,
            today: localDateKey()
        })
            .map(item => item.entry)
            .filter(entry => !existing.has(entry.id))
            .slice(0, count);
        if (!entries.length) {
            hint('没有可推荐的新句子（可能都已在练习卡片里）');
            return;
        }
        fillEntries(entries, false);
    }

    function fillRecommendedSelected() {
        const entries = Object.values(state.pool.entries).filter(entry => state.recSelected.has(entry.id));
        if (!entries.length) {
            hint('请先勾选要复习的句子');
            return;
        }
        fillEntries(entries, false);
    }

    function toggleRecommendPanel(force) {
        state.recOpen = typeof force === 'boolean' ? force : !state.recOpen;
        els.recPanel.hidden = !state.recOpen;
        els.recToggleBtn.setAttribute('aria-expanded', state.recOpen ? 'true' : 'false');
        if (state.recOpen) renderRecommend();
    }

    function handleImport(text) {
        if (!text || !String(text).trim()) {
            hint('请先粘贴或选择错题包');
            return;
        }
        try {
            const result = importText(state.pool, String(text), {
                cfg: WEAK_DEFAULTS,
                today: localDateKey()
            });
            const saveResult = persist();
            render();
            const fromOther = result.pack.childName && result.pack.childName !== state.childName
                ? '（来自 ' + result.pack.childName + '）'
                : '';
            hint('导入完成' + fromOther + '：新增 ' + result.stats.created +
                '，更新 ' + result.stats.merged +
                '，重复 ' + result.stats.duplicate +
                '，忽略 ' + result.stats.ignored +
                (saveResult.pruned ? '（已清理部分历史）' : ''));
        } catch (e) {
            hint('导入失败：' + (e && e.message ? e.message : e));
        }
    }

    function importFromBox() {
        handleImport(els.importText.value);
    }

    function importFromFile(file) {
        if (!file) return;
        const reader = new FileReader();
        reader.onload = function () {
            const text = String(reader.result || '');
            els.importText.value = text;
            handleImport(text);
        };
        reader.onerror = function () { hint('文件读取失败'); };
        reader.readAsText(file, 'utf-8');
    }

    function syncOutboxes(silent) {
        const outboxes = scanOutboxes();
        const stats = ingestOutboxes(state.pool, outboxes, {
            cfg: WEAK_DEFAULTS,
            today: localDateKey()
        });
        const result = persist();
        render();
        if (!silent) {
            hint('同步完成：新增 ' + stats.created +
                '，更新 ' + stats.merged +
                '，重复 ' + stats.duplicate +
                (stats.skippedOtherChild ? '，跳过其他孩子 ' + stats.skippedOtherChild : '') +
                (stats.outboxes === 0 ? '（未发现同源练习记录）' : '') +
                (result.pruned ? '（已清理部分历史）' : ''));
        }
        return stats;
    }

    function scanSummaryText(scan) {
        if (!scan) return '选好目录后即可自动识别练习记录与错句。';
        const parts = ['已识别 ' + scan.practiceCount + ' 份练习记录'];
        parts.push('发现 ' + scan.weakEntriesCount + ' 条待复习错句');
        if (scan.newEntriesCount) parts.push('新增 ' + scan.newEntriesCount + ' 条');
        if (scan.latest && scan.latest.date) {
            parts.push('最近一次反馈来自 ' + scan.latest.date +
                (scan.latest.childName ? ' · ' + scan.latest.childName : ''));
        }
        if (scan.skippedFiles.length) parts.push('跳过 ' + scan.skippedFiles.length + ' 个文件');
        return parts.join('，') + '。';
    }

    function renderDir() {
        const dir = state.dir;
        const hasHandle = !!dir.handle;
        const granted = hasHandle && dir.status === 'granted';
        els.dirScanBtn.disabled = !hasHandle || dir.busy;
        els.dirClearBtn.disabled = !hasHandle;
        els.dirName.textContent = '';
        els.dirLight.className = 'dir-light ' + (granted ? 'ok' : (hasHandle ? 'pending' : 'off'));
        els.dirLight.textContent = granted ? '🟢' : (hasHandle ? '🔴' : '⚪');

        if (!hasHandle) {
            els.dirName.textContent = '📁 未设置成绩监控目录';
        } else if (granted) {
            els.dirName.textContent = '📁 监控中：' + (dir.name || '成绩目录');
        } else if (dir.status === 'prompt') {
            els.dirName.textContent = '📁 ' + (dir.name || '成绩目录') + '（需点击扫描重新授权）';
        } else if (dir.status === 'unsupported') {
            els.dirName.textContent = '📁 ' + (dir.name || '成绩目录') + '（浏览器不支持自动授权）';
        } else {
            els.dirName.textContent = '📁 ' + (dir.name || '成绩目录') + '（权限被拒绝）';
        }
        els.dirSummary.textContent = dir.lastScan
            ? scanSummaryText(dir.lastScan)
            : '选好目录后即可自动识别练习记录与错句。';
    }

    /** 导入扫描结果：逐份练习记录按时间升序合并，保持生命周期顺序 */
    function applyScan(scan) {
        const stats = { created: 0, merged: 0, duplicate: 0, ignored: 0, invalid: 0 };
        for (const item of scan.packs) {
            try {
                const result = importPack(state.pool, item.pack, WEAK_DEFAULTS, localDateKey());
                for (const key of Object.keys(stats)) stats[key] += Number(result[key]) || 0;
            } catch (e) {
                stats.invalid += 1;
            }
        }
        return stats;
    }

    async function performScan(source, options) {
        const scanOpts = options || {};
        const scan = await scanFeedbackDirectory(source, {
            knownPracticeIds: await getSeenPracticeIds(),
            childName: state.childName
        });
        const stats = applyScan(scan);
        await markPracticesSeen(scan.practiceIds);
        state.dir.lastScan = scan;
        persist();
        render();
        if (!scanOpts.silent) {
            hint('扫描完成：' + scan.practiceCount + ' 份记录，' +
                scan.weakEntriesCount + ' 条待复习' +
                (stats.created ? '，新增 ' + stats.created : '') +
                (stats.merged ? '，更新 ' + stats.merged : ''));
        }
        return scan;
    }

    async function scanSource(source, options) {
        if (state.dir.busy) return null;
        state.dir.busy = true;
        renderDir();
        try {
            return await performScan(source, options);
        } catch (e) {
            hint('扫描失败：' + (e && e.message ? e.message : e));
            return null;
        } finally {
            state.dir.busy = false;
            renderDir();
        }
    }

    async function scanDir() {
        if (!state.dir.handle) {
            hint('请先设定成绩监控目录，或用文件夹选择 / 拖拽扫描');
            return null;
        }
        if (state.dir.busy) return null;
        if (state.dir.status !== 'granted') {
            state.dir.busy = true;
            renderDir();
            const permission = await verifyPermission(state.dir.handle, false);
            state.dir.busy = false;
            state.dir.status = permission;
            renderDir();
            if (permission !== 'granted') {
                hint('目录权限未开启：请重新选择目录，或使用文件夹选择 / 拖拽');
                return null;
            }
        }
        return scanSource(state.dir.handle, { silent: false });
    }

    async function pickDir() {
        if (!supportsDirectoryPicker()) {
            hint('当前浏览器不支持目录授权，已打开文件夹选择（降级）');
            els.dirFallbackInput.click();
            return;
        }
        try {
            const handle = await pickFeedbackDirectory();
            state.dir.handle = handle;
            state.dir.name = handle.name || '成绩目录';
            state.dir.status = 'granted';
            state.dir.lastScan = null;
            renderDir();
            await scanDir();
        } catch (e) {
            if (e && (e.name === 'AbortError' || e.name === 'NotAllowedError')) return;
            hint('无法访问目录：' + (e && e.message ? e.message : e) + '，可改用文件夹选择或拖拽');
        }
    }

    async function clearDir() {
        if (!confirm('取消监控成绩目录？（已导入的生疏记录会保留）')) return;
        await clearSavedDirectoryHandle();
        state.dir.handle = null;
        state.dir.name = '';
        state.dir.status = 'none';
        state.dir.lastScan = null;
        state.dir.busy = false;
        renderDir();
        hint('已取消目录监控');
    }

    async function restoreDir() {
        let handle = null;
        try {
            handle = await getSavedDirectoryHandle();
        } catch (e) {
            handle = null;
        }
        if (!handle) {
            renderDir();
            return null;
        }
        state.dir.handle = handle;
        state.dir.name = handle.name || '成绩目录';
        state.dir.status = await queryDirectoryPermission(handle);
        renderDir();
        if (state.dir.status === 'granted') await scanSource(handle, { silent: true });
        return handle;
    }

    function manualAdd() {
        const en = els.manualEn.value.trim();
        const zh = els.manualZh.value.trim();
        if (!en) {
            hint('请先输入英文');
            return;
        }
        const now = new Date().toISOString();
        const result = ingestObservation(state.pool, {
            id: sentenceId(en),
            en: en,
            zh: zh,
            sig: {
                time: 0, replay: 0, mastery: 0, count: 0,
                isTrap: false, trapCaught: false, trapAutoRevealed: false, wrongReadCount: 0
            },
            attempted: false,
            manualWeak: true,
            manualAt: now,
            practiceId: 'manual_' + now,
            updatedAt: now
        }, WEAK_DEFAULTS, localDateKey());

        if (result.action === 'invalid') {
            hint('录入失败');
            return;
        }
        persist();
        els.manualEn.value = '';
        els.manualZh.value = '';
        render();
        hint('已加入生疏库');
    }

    function exportBackup() {
        const pack = buildPoolBackup(state.pool);
        const count = Object.keys(pack.entries).length;
        if (!count) {
            hint('生疏库为空');
            return;
        }
        const blob = new Blob([JSON.stringify(pack, null, 2)], { type: 'application/json;charset=utf-8' });
        const url = URL.createObjectURL(blob);
        const a = document.createElement('a');
        a.href = url;
        const safeChild = state.childName.replace(/[\\/:*?"<>|]+/g, '_');
        a.download = '生疏库_' + safeChild + '_' + localDateKey() + '.json';
        document.body.appendChild(a);
        a.click();
        document.body.removeChild(a);
        URL.revokeObjectURL(url);
        hint('已导出 ' + count + ' 条');
    }

    function cleanGraduatedEntries() {
        if (!confirm('删除所有已毕业且未手动标记的条目？')) return;
        const ids = Object.values(state.pool.entries)
            .filter(entry => entry.status === 'graduated' && !entry.manualWeak)
            .map(entry => entry.id);
        const removed = clearGraduated(state.pool);
        const purged = purgeOutboxEntries(ids, state.childName);
        persist();
        render();
        hint('已清理 ' + removed + ' 条' + (purged ? '，同步缓存 ' + purged + ' 条' : ''));
    }

    function stripHash() {
        try {
            history.replaceState(null, '', location.pathname + location.search);
        } catch (e) { /* ignore */ }
    }

    function checkHashImport() {
        if (state.hashHandled) return;
        state.hashHandled = true;
        const pack = readHashPack(location.hash);
        if (!pack) return;
        const count = Object.keys(pack.entries).length;
        if (!count) {
            stripHash();
            return;
        }
        const from = pack.childName ? '（来自 ' + pack.childName + '）' : '';
        const ok = confirm('发现 ' + count + ' 条回传错题' + from + '，导入到「' + state.childName + '」的生疏库？');
        if (ok) {
            try {
                const stats = importPack(state.pool, pack, WEAK_DEFAULTS, localDateKey());
                persist();
                render();
                hint('回传导入完成：新增 ' + stats.created + '，更新 ' + stats.merged + '，重复 ' + stats.duplicate);
            } catch (e) {
                hint('回传导入失败：' + (e && e.message ? e.message : e));
            }
        }
        stripHash();
    }

    els.filter.addEventListener('change', function () {
        state.filter = els.filter.value;
        render();
    });
    els.sort.addEventListener('change', function () {
        state.sort = els.sort.value;
        render();
    });
    els.limit.addEventListener('change', function () {
        state.limit = Math.max(1, parseInt(els.limit.value, 10) || 5);
    });
    els.syncBtn.addEventListener('click', function () { syncOutboxes(false); });
    els.exportBtn.addEventListener('click', exportBackup);
    els.cleanBtn.addEventListener('click', cleanGraduatedEntries);
    els.fillBtn.addEventListener('click', fillDue);
    els.randomBtn.addEventListener('click', fillRandom);
    els.fillSelectedBtn.addEventListener('click', fillSelected);
    els.replaceBtn.addEventListener('click', replaceWithDue);
    els.importBtn.addEventListener('click', importFromBox);
    els.importFile.addEventListener('change', function () {
        importFromFile(els.importFile.files && els.importFile.files[0]);
    });
    els.manualAddBtn.addEventListener('click', manualAdd);

    els.recMode.addEventListener('change', function () {
        state.recMode = els.recMode.value;
        renderRecommend();
    });
    els.rec3Btn.addEventListener('click', function () { fillRecommended(3); });
    els.rec5Btn.addEventListener('click', function () { fillRecommended(5); });
    els.recToggleBtn.addEventListener('click', function () { toggleRecommendPanel(); });
    els.recFillBtn.addEventListener('click', fillRecommendedSelected);
    els.recClearBtn.addEventListener('click', function () {
        state.recSelected.clear();
        renderRecommend();
    });

    els.dirPickBtn.addEventListener('click', pickDir);
    els.dirScanBtn.addEventListener('click', scanDir);
    els.dirClearBtn.addEventListener('click', clearDir);
    els.dirFallbackBtn.addEventListener('click', function () { els.dirFallbackInput.click(); });
    els.dirFallbackInput.addEventListener('change', function () {
        const files = els.dirFallbackInput.files;
        if (files && files.length) scanSource(files, { silent: false });
        els.dirFallbackInput.value = '';
    });

    ['dragenter', 'dragover'].forEach(function (type) {
        els.dirDrop.addEventListener(type, function (event) {
            event.preventDefault();
            els.dirDrop.classList.add('dragging');
        });
    });
    ['dragleave', 'dragend'].forEach(function (type) {
        els.dirDrop.addEventListener(type, function () {
            els.dirDrop.classList.remove('dragging');
        });
    });
    els.dirDrop.addEventListener('drop', async function (event) {
        event.preventDefault();
        els.dirDrop.classList.remove('dragging');
        if (!event.dataTransfer) return;
        try {
            const files = await filesFromDataTransfer(event.dataTransfer);
            if (!files.length) {
                hint('没有识别到可扫描的 .txt / .json / .weakpack 文件');
                return;
            }
            await scanSource(files, { silent: false });
        } catch (e) {
            hint('读取拖入文件夹失败：' + (e && e.message ? e.message : e));
        }
    });

    const childInput = document.getElementById('childName');
    if (childInput) {
        childInput.addEventListener('input', debounce(function () {
            reload();
            state.dir.lastScan = null;
            render();
            renderDir();
        }, 350));
    }

    // 初始化：加载池 → 处理 #weak= 回传 → 扫描同源 Outbox → 渲染
    reload();
    checkHashImport();
    syncOutboxes(true);
    render();
    renderDir();
    restoreDir();

    return {
        refresh: function () { reload(); render(); },
        sync: syncOutboxes,
        openImport: function () { if (els.importBox) els.importBox.open = true; },
        getPool: function () { return state.pool; }
    };
}
