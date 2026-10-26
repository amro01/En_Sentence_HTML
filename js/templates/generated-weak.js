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
 * 生成页内的「生疏句循环复习」运行时。
 *
 * 设计约束：
 * 1. 整段代码包在一个 IIFE 里，只向 window 暴露一个 WeakReview 命名空间。
 * 2. 运行时可访问生成页同作用域的 CONFIG / appState / getStats() / getTrapState() /
 *    showHint()，这些标识符由 generated-js.js 提供。
 * 3. 本文件不直接写全局生疏池，只写本页 Outbox（WEAK_OUTBOX_<practiceId>）；
 *    生成器是生疏池的唯一写入者。
 * 4. 不使用模板字符串 / 反引号 / ${ }，避免与 generated-js.js 的外层模板冲突。
 */

import {
    computeWeakScore,
    normalizeSentence,
    sentenceId,
    toBase64Url
} from '../weak/weak-core.js';

export function buildWeakRuntimeSource() {
    return `
(function () {
    'use strict';

${normalizeSentence.toString()}

${sentenceId.toString()}

${computeWeakScore.toString()}

${toBase64Url.toString()}

    var OUTBOX_PREFIX = 'WEAK_OUTBOX_';
    var outbox = null;
    var storageOk = true;

    function scoreConfig() {
        return {
            timeLimit: CONFIG.timeLimit || 15,
            replayLimit: CONFIG.replayLimit || 3,
            masteryThreshold: CONFIG.masteryThreshold || 3,
            weakThreshold: CONFIG.weakThreshold || 40,
            fastThreshold: CONFIG.fastThreshold || 22
        };
    }

    function decodeSafe(value) {
        try { return decodeURIComponent(value || ''); } catch (e) { return value || ''; }
    }

    function todayKey() {
        var d = new Date();
        var p = function (n) { return n < 10 ? '0' + n : '' + n; };
        return d.getFullYear() + '-' + p(d.getMonth() + 1) + '-' + p(d.getDate());
    }

    function outboxKey() {
        return OUTBOX_PREFIX + CONFIG.practiceId;
    }

    function defaultOutbox() {
        return {
            schema: 1,
            practiceId: CONFIG.practiceId,
            childName: CONFIG.childName,
            date: todayKey(),
            generatorUrl: CONFIG.generatorUrl || '',
            entries: {},
            updatedAt: null
        };
    }

    function loadOutbox() {
        if (outbox) return outbox;
        var raw = null;
        try {
            raw = localStorage.getItem(outboxKey());
        } catch (e) {
            storageOk = false;
        }
        var parsed = null;
        if (raw) {
            try { parsed = JSON.parse(raw); } catch (e) { parsed = null; }
        }
        if (!parsed || typeof parsed !== 'object') parsed = defaultOutbox();
        if (!parsed.entries || typeof parsed.entries !== 'object') parsed.entries = {};
        parsed.practiceId = CONFIG.practiceId;
        outbox = parsed;
        return outbox;
    }

    function saveOutbox() {
        if (!outbox) return false;
        outbox.updatedAt = new Date().toISOString();
        try {
            localStorage.setItem(outboxKey(), JSON.stringify(outbox));
            return true;
        } catch (e) {
            storageOk = false;
            return false;
        }
    }

    function cardInfo(card) {
        var cardIndex = parseInt(card.dataset.cardIndex, 10);
        var currentEn = decodeSafe(card.dataset.english || '');
        var trap = null;
        if (CONFIG.trapData && CONFIG.trapData.length) {
            for (var i = 0; i < CONFIG.trapData.length; i++) {
                if (CONFIG.trapData[i].index === cardIndex) {
                    trap = CONFIG.trapData[i];
                    break;
                }
            }
        }
        var en = trap ? trap.correct : currentEn;
        var zh = card.dataset.zh ? decodeSafe(card.dataset.zh) : '';
        if (!zh) {
            var zhEl = card.querySelector('.chinese');
            if (zhEl) zh = (zhEl.textContent || '').replace(/\\s+/g, ' ').trim();
        }
        return {
            cardIndex: cardIndex,
            trap: trap,
            currentEn: currentEn,
            en: en,
            zh: zh,
            trapEn: trap ? trap.english : ''
        };
    }

    function collectCardSignals(card) {
        var info = cardInfo(card);
        if (!info.en) return null;
        var box = loadOutbox();
        var stats = getStats();
        var ts = getTrapState(info.cardIndex) || {};
        var sig = {
            time: 0,
            replay: 0,
            mastery: 0,
            count: 0,
            isTrap: !!info.trap,
            trapCaught: !!ts.isCaught,
            trapAutoRevealed: !!ts.autoRevealed,
            wrongReadCount: ts.wrongReadCount || 0
        };
        // 陷阱抓获后 data-english 会切换为正确文本，统计键会分裂：
        // 同时读取「当前显示 / 目标正确 / 陷阱错句」三个键，按对象去重后合并。
        var statKeys = [info.currentEn, info.en, info.trapEn];
        var seenStats = [];
        for (var k = 0; k < statKeys.length; k++) {
            var statItem = statKeys[k] ? stats[statKeys[k]] : null;
            if (!statItem || seenStats.indexOf(statItem) >= 0) continue;
            seenStats.push(statItem);
            sig.time = Math.max(sig.time, statItem.time || 0);
            sig.replay += statItem.replay || 0;
            sig.mastery = Math.max(sig.mastery, statItem.mastery_count || 0);
            sig.count += statItem.count || 0;
        }
        var id = sentenceId(info.en);
        var mark = box.entries[id] || null;
        return {
            id: id,
            en: info.en,
            zh: info.zh,
            isTrap: !!info.trap,
            trapEn: info.trapEn,
            sig: sig,
            attempted: sig.count > 0 || sig.replay > 0,
            manualWeak: !!(mark && mark.manualWeak),
            manualAt: (mark && mark.manualAt) || null
        };
    }

    function mergeObs(prev, obs) {
        var base = prev ? Object.assign({}, prev) : {};
        base.id = obs.id;
        base.en = obs.en;
        base.zh = obs.zh || base.zh || '';
        base.isTrap = !!(base.isTrap || obs.isTrap);
        base.trapEn = obs.trapEn || base.trapEn || '';
        base.sig = obs.sig;
        base.attempted = !!obs.attempted;
        base.manualWeak = !!obs.manualWeak;
        base.manualAt = obs.manualAt || base.manualAt || null;
        base.practiceId = CONFIG.practiceId;
        return base;
    }

    function signatureOf(entry) {
        return JSON.stringify([entry.sig, !!entry.manualWeak, !!entry.attempted]);
    }

    function reasonsFor(entry) {
        var cfg = scoreConfig();
        var sig = entry.sig || {};
        var reasons = [];
        if (entry.manualWeak) reasons.push('手动标记');
        if ((sig.time || 0) > cfg.timeLimit) reasons.push('思考' + sig.time + '秒');
        if ((sig.replay || 0) > cfg.replayLimit) reasons.push('重听' + sig.replay + '次');
        if (sig.isTrap && sig.trapAutoRevealed) reasons.push('陷阱自动现形');
        else if (sig.isTrap && !sig.trapCaught) reasons.push('陷阱未抓获');
        if (!reasons.length) reasons.push('综合不熟练');
        return reasons.join(' / ');
    }

    function collectCandidates() {
        var box = loadOutbox();
        var map = {};
        var id;
        for (id in box.entries) {
            if (box.entries[id]) map[id] = Object.assign({}, box.entries[id]);
        }
        var cards = document.querySelectorAll('.card[data-english]');
        for (var i = 0; i < cards.length; i++) {
            var obs = collectCardSignals(cards[i]);
            if (!obs) continue;
            // 未练习且未手标：不要用零信号覆盖历史条目
            if (!obs.attempted && !obs.manualWeak) continue;
            var prev = map[obs.id];
            var entry = mergeObs(prev, obs);
            entry.score = computeWeakScore(obs.sig, scoreConfig());
            entry.weak = entry.manualWeak || entry.score >= scoreConfig().weakThreshold;
            map[obs.id] = entry;
        }
        var list = [];
        for (id in map) {
            var item = map[id];
            if (!item) continue;
            if (item.manualWeak || (item.score || 0) >= scoreConfig().weakThreshold) list.push(item);
        }
        list.sort(function (a, b) {
            var ma = a.manualWeak ? 1 : 0;
            var mb = b.manualWeak ? 1 : 0;
            if (ma !== mb) return mb - ma;
            return (b.score || 0) - (a.score || 0);
        });
        return list;
    }

    /**
     * 把本页所有已尝试/已手标的句子写入 Outbox。
     * 必须包含「低分通过」的观察，生成器才能推进连续达标毕业。
     */
    function finalize(reason) {
        var box = loadOutbox();
        var now = new Date().toISOString();
        var cards = document.querySelectorAll('.card[data-english]');
        var changed = 0;
        for (var i = 0; i < cards.length; i++) {
            var obs = collectCardSignals(cards[i]);
            if (!obs) continue;
            if (!obs.attempted && !obs.manualWeak) continue;
            var prev = box.entries[obs.id];
            var entry = mergeObs(prev, obs);
            entry.score = computeWeakScore(obs.sig, scoreConfig());
            entry.weak = entry.manualWeak || entry.score >= scoreConfig().weakThreshold;
            entry.updatedAt = now;
            entry.sigHash = signatureOf(entry);
            if (prev && prev.sigHash === entry.sigHash && prev.updatedAt) {
                entry.updatedAt = prev.updatedAt;
                entry.manualAt = prev.manualAt;
            } else {
                changed += 1;
            }
            box.entries[obs.id] = entry;
        }
        box.updatedAt = now;
        saveOutbox();
        refreshUi();
        return changed;
    }

    function markMeta(obs, entry) {
        if (!obs.attempted) return obs.manualWeak ? '手动加入 · 尚未练习' : '尚未练习';
        var cfg = scoreConfig();
        var sig = obs.sig || {};
        var parts = [];
        if ((sig.time || 0) > cfg.timeLimit) parts.push('思考' + sig.time + '秒');
        if ((sig.replay || 0) > cfg.replayLimit) parts.push('重听' + sig.replay + '次');
        if (sig.isTrap && sig.trapAutoRevealed) parts.push('陷阱自动现形');
        else if (sig.isTrap && !sig.trapCaught) parts.push('陷阱未抓获');
        var score = (entry && typeof entry.score === 'number') ? entry.score : computeWeakScore(sig, cfg);
        var head = obs.manualWeak ? '手动 · ' : (score >= cfg.weakThreshold ? '自动 · ' : '自动 · 暂无需复习 · ');
        return head + (parts.length ? parts.join(' / ') + ' · ' : '') + '生疏分 ' + score;
    }

    function observationForId(id) {
        var cards = document.querySelectorAll('.card[data-english]');
        for (var i = 0; i < cards.length; i++) {
            var obs = collectCardSignals(cards[i]);
            if (obs && obs.id === id) return obs;
        }
        return null;
    }

    function toggleEntryWeak(id) {
        if (!id) return;
        var box = loadOutbox();
        var prev = box.entries[id] || null;
        var obs = observationForId(id);
        if (!obs) {
            // 句子已不在本页（例如旧的 Outbox 条目）：直接翻转手动标记
            if (!prev) return;
            obs = {
                id: id,
                en: prev.en || '',
                zh: prev.zh || '',
                isTrap: !!prev.isTrap,
                trapEn: prev.trapEn || '',
                sig: prev.sig || { time: 0, replay: 0, mastery: 0, count: 0 },
                attempted: !!prev.attempted,
                manualWeak: !!prev.manualWeak,
                manualAt: prev.manualAt || null
            };
        }
        var on = !(prev && prev.manualWeak);
        var now = new Date().toISOString();
        var entry = mergeObs(prev, obs);
        entry.manualWeak = on;
        entry.manualAt = now;
        entry.updatedAt = now;
        entry.score = computeWeakScore(obs.sig, scoreConfig());
        entry.weak = on || entry.score >= scoreConfig().weakThreshold;
        entry.sigHash = signatureOf(entry);
        box.entries[id] = entry;
        saveOutbox();
        refreshUi();
        if (!storageOk) showHint('浏览器本地存储不可用，请家长尽快复制错题包');
    }

    function parentListEntries() {
        var box = loadOutbox();
        var list = [];
        var seen = {};
        var cards = document.querySelectorAll('.card[data-english]');
        for (var i = 0; i < cards.length; i++) {
            var obs = collectCardSignals(cards[i]);
            if (!obs || seen[obs.id]) continue;
            seen[obs.id] = true;
            list.push({ obs: obs, entry: box.entries[obs.id] || null });
        }
        for (var id in box.entries) {
            if (seen[id] || !box.entries[id]) continue;
            seen[id] = true;
            list.push({ obs: null, orphan: box.entries[id] });
        }
        return list;
    }

    function renderMarkRow(item) {
        var obs = item.obs;
        var entry = item.entry || item.orphan || null;
        var id = obs ? obs.id : item.orphan.id;

        var row = document.createElement('div');
        row.className = 'weak-mark';
        row.dataset.weakId = id;

        var main = document.createElement('div');
        main.className = 'weak-mark-main';

        var en = document.createElement('div');
        en.className = 'weak-mark-en';
        en.textContent = (obs ? obs.en : item.orphan.en) || '';

        var meta = document.createElement('div');
        meta.className = 'weak-mark-meta';
        meta.textContent = obs ? markMeta(obs, entry) : '历史条目 · 生疏分 ' + ((entry && entry.score) || 0);

        main.appendChild(en);
        main.appendChild(meta);
        row.appendChild(main);

        var on = !!(entry && entry.manualWeak);
        var dot = document.createElement('button');
        dot.type = 'button';
        dot.className = 'weak-dot' + (on ? ' on' : '');
        dot.setAttribute('aria-pressed', on ? 'true' : 'false');
        dot.setAttribute('aria-label', '加入明日复习清单');
        dot.title = '加入 / 移出明日复习清单';
        dot.addEventListener('click', function (e) {
            e.preventDefault();
            toggleEntryWeak(id);
        });
        row.appendChild(dot);
        return row;
    }

    function toggleParentZone(force) {
        var body = document.getElementById('parent-zone-body');
        if (!body) return;
        var open = (typeof force === 'boolean') ? force : body.classList.contains('hidden');
        if (open) {
            body.classList.remove('hidden');
            refreshUi();
        } else {
            body.classList.add('hidden');
        }
        var btn = document.getElementById('parent-zone-toggle');
        if (btn) btn.setAttribute('aria-expanded', open ? 'true' : 'false');
    }

    function refreshUi() {
        var list = document.getElementById('weak-mark-list');
        if (!list) return;
        while (list.firstChild) list.removeChild(list.firstChild);

        var items = parentListEntries();
        if (!items.length) {
            var empty = document.createElement('p');
            empty.className = 'weak-empty';
            empty.textContent = '本页还没有可记录的句子';
            list.appendChild(empty);
            return;
        }
        for (var i = 0; i < items.length; i++) list.appendChild(renderMarkRow(items[i]));
    }

    function packObject() {
        var box = loadOutbox();
        var entries = {};
        for (var id in box.entries) {
            var entry = box.entries[id];
            if (!entry) continue;
            // 未练习但有过手动操作（含“解除标记”）也要回传
            if (!entry.attempted && !entry.manualWeak && !entry.manualAt) continue;
            entries[id] = {
                id: id,
                en: entry.en,
                zh: entry.zh || '',
                isTrap: !!entry.isTrap,
                trapEn: entry.trapEn || '',
                sig: entry.sig,
                score: entry.score || 0,
                weak: !!entry.weak,
                manualWeak: !!entry.manualWeak,
                manualAt: entry.manualAt || null,
                attempted: !!entry.attempted,
                practiceId: CONFIG.practiceId,
                updatedAt: entry.updatedAt
            };
        }
        return {
            schema: 1,
            childName: CONFIG.childName,
            exportedAt: new Date().toISOString(),
            practiceId: CONFIG.practiceId,
            entries: entries
        };
    }

    function packText() {
        var pack = packObject();
        if (!Object.keys(pack.entries).length) return '';
        return toBase64Url(JSON.stringify(pack));
    }

    function showCopyBox(text) {
        var overlay = document.createElement('div');
        overlay.className = 'persistent-hint-overlay';
        var box = document.createElement('div');
        box.className = 'persistent-hint-box';

        var title = document.createElement('div');
        title.className = 'hint-main';
        title.textContent = '📋 请手动复制下面的错题包（Ctrl+C）';

        var ta = document.createElement('textarea');
        ta.value = text;
        ta.readOnly = true;
        ta.style.width = '100%';
        ta.style.height = '160px';
        ta.addEventListener('click', function (e) { e.stopPropagation(); });

        var sub = document.createElement('div');
        sub.className = 'hint-sub';
        sub.textContent = '点击遮罩关闭';

        box.appendChild(title);
        box.appendChild(ta);
        box.appendChild(sub);
        overlay.appendChild(box);
        overlay.addEventListener('click', function () { overlay.remove(); });
        document.body.appendChild(overlay);
        ta.focus();
        ta.select();
        try { document.execCommand('copy'); } catch (e) { /* ignore */ }
    }

    // 导出前先落盘，保证没点“领取勋章”也能带上自动判弱结果
    function flushBeforePack() {
        try { finalize('export'); } catch (e) { /* ignore */ }
    }

    function copyPack() {
        flushBeforePack();
        var text = packText();
        if (!text) { showHint('还没有可导出的练习记录'); return; }
        if (navigator.clipboard && navigator.clipboard.writeText) {
            navigator.clipboard.writeText(text).then(function () {
                showHint('📋 错题包已复制');
            }, function () {
                showCopyBox(text);
            });
        } else {
            showCopyBox(text);
        }
    }

    function downloadPack() {
        flushBeforePack();
        var pack = packObject();
        if (!Object.keys(pack.entries).length) { showHint('还没有可导出的练习记录'); return; }
        var blob = new Blob([JSON.stringify(pack, null, 2)], { type: 'application/json;charset=utf-8' });
        var url = URL.createObjectURL(blob);
        var a = document.createElement('a');
        a.href = url;
        a.download = '生疏句_' + todayKey() + '.json';
        document.body.appendChild(a);
        a.click();
        document.body.removeChild(a);
        URL.revokeObjectURL(url);
        showHint('💾 错题包已下载');
    }

    function returnToGenerator() {
        flushBeforePack();
        var pack = packObject();
        if (!Object.keys(pack.entries).length) { showHint('还没有可回传的练习记录'); return; }
        var payload = toBase64Url(JSON.stringify(pack));
        if (payload.length > 60000) { showHint('错题包过大，请使用「复制」或「下载」'); return; }
        var url = String(CONFIG.generatorUrl || '').split('#')[0];
        if (!url) { showHint('未记录生成器地址，请用「复制」或「下载」导入'); return; }
        if (url.indexOf('file:') === 0) {
            showHint('生成器是本机文件，浏览器不允许直接回传，请用「复制」导入');
            return;
        }
        var win = window.open(url + '#weak=' + payload, '_blank');
        if (!win) showHint('浏览器拦截了新窗口，请允许弹窗或改用「复制」');
    }

    function reportSection() {
        var items = collectCandidates();
        if (!items.length) {
            return '🔁 生疏句回顾：\\n  ✨ 今日没有生疏句，全部掌握！\\n\\n';
        }
        var text = '🔁 生疏句回顾（' + items.length + ' 句，建议明天复习）：\\n';
        for (var i = 0; i < items.length; i++) {
            var entry = items[i];
            text += '  🔴 ' + (entry.manualWeak ? '[手动] ' : '') + entry.en + '\\n';
            text += '      原因：' + reasonsFor(entry) + '（生疏分 ' + entry.score + '）\\n';
        }
        return text + '\\n';
    }

    function packBlock() {
        var text = packText();
        if (!text) return '';
        return '--- WEAK-PACK v1 ---\\n' + text + '\\n--- END WEAK-PACK ---\\n';
    }

    function clearOutbox() {
        try { localStorage.removeItem(outboxKey()); } catch (e) { /* ignore */ }
        outbox = null;
    }

    function init() {
        loadOutbox();
        refreshUi();
        if (!storageOk) {
            showHint('本地存储不可用，请家长在页面底部复制错题包');
        }
    }

    window.WeakReview = {
        init: init,
        finalize: finalize,
        refresh: refreshUi,
        toggleParentZone: toggleParentZone,
        toggleEntryWeak: toggleEntryWeak,
        reportSection: reportSection,
        packBlock: packBlock,
        copyPack: copyPack,
        downloadPack: downloadPack,
        returnToGenerator: returnToGenerator,
        clearOutbox: clearOutbox,
        getOutbox: loadOutbox
    };
})();
`;
}

export const WEAK_RUNTIME_SOURCE = buildWeakRuntimeSource();
