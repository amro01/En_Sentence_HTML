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
    var uiBuilt = false;

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

    function renderToggle(btn, on) {
        btn.textContent = on ? '🔴 已标记需复习' : '🔴 需复习';
        btn.setAttribute('aria-pressed', on ? 'true' : 'false');
        if (on) btn.classList.add('active');
        else btn.classList.remove('active');
    }

    function toggleMark(btn) {
        var card = btn.closest('.card');
        if (!card) return;
        var box = loadOutbox();
        var obs = collectCardSignals(card);
        if (!obs) return;
        var prev = box.entries[obs.id] || null;
        var wasPinned = !!(prev && prev.manualWeak);
        var on = !wasPinned;
        var now = new Date().toISOString();
        var entry = mergeObs(prev, obs);
        entry.manualWeak = on;
        entry.manualAt = now;
        entry.updatedAt = now;
        entry.score = computeWeakScore(obs.sig, scoreConfig());
        entry.weak = on || entry.score >= scoreConfig().weakThreshold;
        entry.sigHash = signatureOf(entry);
        box.entries[obs.id] = entry;
        saveOutbox();
        renderToggle(btn, on);
        refreshUi();
        if (!storageOk) showHint('浏览器本地存储不可用，请尽快复制错题包');
    }

    function ensureToggle(card) {
        var existing = card.querySelector('.weak-toggle');
        if (existing) return existing;
        var row = document.createElement('div');
        row.className = 'weak-row';
        var btn = document.createElement('button');
        btn.type = 'button';
        btn.className = 'weak-toggle';
        btn.setAttribute('aria-pressed', 'false');
        btn.addEventListener('click', function (e) {
            e.preventDefault();
            e.stopPropagation();
            toggleMark(btn);
        });
        row.appendChild(btn);
        var energy = card.querySelector('.energy-bar');
        if (energy && energy.parentNode) energy.parentNode.insertBefore(row, energy.nextSibling);
        else card.appendChild(row);
        return btn;
    }

    function restoreToggles() {
        var cards = document.querySelectorAll('.card[data-english]');
        for (var i = 0; i < cards.length; i++) {
            var btn = ensureToggle(cards[i]);
            var obs = collectCardSignals(cards[i]);
            renderToggle(btn, !!(obs && obs.manualWeak));
        }
    }

    function makeButton(id, text, handler) {
        var btn = document.createElement('button');
        btn.type = 'button';
        btn.id = id;
        btn.className = 'weak-btn';
        btn.textContent = text;
        btn.addEventListener('click', function (e) {
            e.preventDefault();
            handler();
        });
        return btn;
    }

    function ensureUi() {
        if (uiBuilt) return;
        uiBuilt = true;

        // 新版模板已带完整面板；旧页面/测试环境才动态创建
        var panel = document.getElementById('weak-panel');
        if (!panel) {
            panel = document.createElement('div');
            panel.id = 'weak-panel';
            panel.className = 'weak-panel';

            var bar = document.createElement('div');
            bar.className = 'weak-toolbar';
            bar.appendChild(makeButton('weak-copy-btn', '📋 复制错题包', copyPack));
            bar.appendChild(makeButton('weak-save-btn', '💾 下载错题包', downloadPack));
            bar.appendChild(makeButton('weak-return-btn', '⬅️ 回传生成器', returnToGenerator));
            panel.appendChild(bar);

            var list = document.createElement('div');
            list.id = 'weak-list';
            list.className = 'weak-list hidden';
            panel.appendChild(list);

            var controls = document.querySelector('.controls');
            if (controls && controls.parentNode) {
                controls.parentNode.insertBefore(panel, controls.nextSibling);
            } else {
                document.body.insertBefore(panel, document.body.firstChild);
            }
        }

        if (!document.getElementById('weak-count-btn')) {
            var countBtn = document.createElement('button');
            countBtn.type = 'button';
            countBtn.id = 'weak-count-btn';
            countBtn.className = 'weak-btn weak-count-btn';
            countBtn.textContent = '🔁 错题本 (0)';
            countBtn.addEventListener('click', function (e) {
                e.preventDefault();
                toggleList();
            });
            var toolbar = panel.querySelector('.weak-toolbar');
            if (toolbar && toolbar.firstChild) toolbar.insertBefore(countBtn, toolbar.firstChild);
            else if (toolbar) toolbar.appendChild(countBtn);
            else panel.insertBefore(countBtn, panel.firstChild);
        }
    }

    function toggleList() {
        var list = document.getElementById('weak-list');
        if (!list) return;
        if (list.classList.contains('hidden')) expand();
        else list.classList.add('hidden');
    }

    function refreshUi() {
        var items = collectCandidates();
        var countBtn = document.getElementById('weak-count-btn');
        if (countBtn) countBtn.textContent = '🔁 错题本 (' + items.length + ')';

        var list = document.getElementById('weak-list');
        if (!list) return;
        while (list.firstChild) list.removeChild(list.firstChild);

        if (!items.length) {
            var empty = document.createElement('p');
            empty.className = 'weak-empty';
            empty.textContent = '✨ 今天没有生疏句，太棒了！';
            list.appendChild(empty);
            return;
        }

        for (var i = 0; i < items.length; i++) {
            var entry = items[i];
            var row = document.createElement('div');
            row.className = 'weak-item';

            var en = document.createElement('div');
            en.className = 'weak-item-en';
            en.textContent = entry.en;

            var meta = document.createElement('div');
            meta.className = 'weak-item-meta';
            meta.textContent = (entry.manualWeak ? '🔴 手动 · ' : '') +
                '生疏分 ' + entry.score + ' · ' + reasonsFor(entry);

            row.appendChild(en);
            row.appendChild(meta);
            list.appendChild(row);
        }
    }

    function expand() {
        var items = collectCandidates();
        var list = document.getElementById('weak-list');
        if (!list) return;
        if (!items.length) {
            refreshUi();
            list.classList.remove('hidden');
            return;
        }
        list.classList.remove('hidden');
        refreshUi();
        if (list.scrollIntoView) list.scrollIntoView({ behavior: 'smooth', block: 'nearest' });
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
        ensureUi();
        restoreToggles();
        refreshUi();
        if (!storageOk) {
            showHint('本地存储不可用，请完成练习后立即复制错题包');
        }
    }

    function toggleCardWeak(btn) {
        toggleMark(btn);
    }

    window.WeakReview = {
        init: init,
        finalize: finalize,
        expand: expand,
        toggleList: toggleList,
        toggleCardWeak: toggleCardWeak,
        refresh: refreshUi,
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
