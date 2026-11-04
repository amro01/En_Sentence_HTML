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
 */

import { buildGeneratedHTML } from './templates/generated-html.js';
import { buildPracticeCards } from './card-plan.js';
import { WEAK_DEFAULTS, sentenceId } from './weak/weak-core.js';
import { computePracticeId } from './weak/practice-id.js';
import { initWeakPanel } from './weak/weak-panel.js';
import { recordServed } from './weak/weak-store.js';
import {
    AI_DEFAULT_CONFIG,
    describeAIError,
    generateCardData,
    isAIConfigReady,
    loadAIConfig,
    normalizeAIConfig,
    normalizeVariants,
    saveAIConfig,
    testAIConnection
} from './ai-assistant.js';

function getChildName() {
    const input = document.getElementById('childName');
    return (input && input.value.trim()) || '宝贝';
}

function targetEnglishOf(card) {
    const trap = card.querySelector('.trap-checkbox');
    const english = card.querySelector('.english-input');
    const correct = card.querySelector('.correct-english-input');
    if (trap && trap.checked && correct && correct.value.trim()) return correct.value;
    return english ? english.value : '';
}

function getExistingIds() {
    return [...document.querySelectorAll('#cardsContainer .card-item:not(.explanation-item)')]
        .map(targetEnglishOf)
        .map(value => String(value || '').trim())
        .filter(Boolean)
        .map(sentenceId);
}

function clearCards() {
    document.querySelectorAll('#cardsContainer .card-item:not(.explanation-item)')
        .forEach(card => card.remove());
}

let weakPanel = null;

// --- AI Assistant (generator-side only) ---
const aiBaseUrlEl = document.getElementById('aiBaseUrl');
const aiApiKeyEl = document.getElementById('aiApiKey');
const aiModelSelectEl = document.getElementById('aiModelSelect');
const aiModelCustomEl = document.getElementById('aiModelCustom');
const aiTestBtnEl = document.getElementById('aiTestBtn');
const aiTestStatusEl = document.getElementById('aiTestStatus');
const aiSettingsEl = document.getElementById('aiSettings');

function readAIConfigFromForm() {
    if (!aiBaseUrlEl || !aiApiKeyEl || !aiModelSelectEl || !aiModelCustomEl) {
        return normalizeAIConfig(AI_DEFAULT_CONFIG);
    }
    const customModel = aiModelCustomEl.value.trim();
    const selectedModel = aiModelSelectEl.value === '__custom__' ? '' : aiModelSelectEl.value;
    return normalizeAIConfig({
        baseUrl: aiBaseUrlEl.value,
        apiKey: aiApiKeyEl.value,
        model: customModel || selectedModel
    });
}

function applyAIConfigToForm(config) {
    if (!aiBaseUrlEl || !aiApiKeyEl || !aiModelSelectEl || !aiModelCustomEl) return;
    const value = normalizeAIConfig(config);
    aiBaseUrlEl.value = value.baseUrl;
    aiApiKeyEl.value = value.apiKey;

    const model = value.model || AI_DEFAULT_CONFIG.model;
    const known = [...aiModelSelectEl.options].some(option =>
        option.value === model && option.value !== '__custom__');
    if (known) {
        aiModelSelectEl.value = model;
        aiModelCustomEl.value = '';
    } else {
        aiModelSelectEl.value = '__custom__';
        aiModelCustomEl.value = model;
    }
}

function persistAIConfigFromForm() {
    return saveAIConfig(readAIConfigFromForm());
}

function setAITestStatus(message, kind) {
    if (!aiTestStatusEl) return;
    aiTestStatusEl.textContent = message || '';
    aiTestStatusEl.className = 'ai-test-status' + (kind ? ' ' + kind : '');
}

function createAIAbortController(timeoutMs) {
    if (typeof AbortController !== 'function') return { controller: null, timer: null };
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), timeoutMs);
    return { controller, timer };
}

async function handleTestAIConnection() {
    const config = readAIConfigFromForm();
    persistAIConfigFromForm();
    if (aiSettingsEl) aiSettingsEl.open = true;

    if (!isAIConfigReady(config)) {
        setAITestStatus('请先填写 API Base URL、API Key 与模型名称。', 'error');
        alert('❌ 请先填写 API Base URL、API Key 与模型名称。');
        return;
    }

    const original = aiTestBtnEl ? aiTestBtnEl.textContent : '';
    if (aiTestBtnEl) {
        aiTestBtnEl.disabled = true;
        aiTestBtnEl.textContent = '⏳ 测试中…';
    }
    setAITestStatus('正在发送 1-token 测试请求…', 'loading');

    const { controller, timer } = createAIAbortController(20000);
    try {
        await testAIConnection(config, { signal: controller ? controller.signal : undefined });
        setAITestStatus('✅ 连接成功，模型可用。', 'success');
        alert('✅ 连接成功！模型 ' + config.model + ' 已可用。');
    } catch (error) {
        const message = describeAIError(error);
        setAITestStatus('❌ ' + message, 'error');
        alert('❌ 连接失败：\n\n' + message);
    } finally {
        clearTimeout(timer);
        if (aiTestBtnEl) {
            aiTestBtnEl.disabled = false;
            aiTestBtnEl.textContent = original || '🔌 测试连接';
        }
    }
}

(function initAIConfigUI() {
    if (!aiBaseUrlEl || !aiApiKeyEl || !aiModelSelectEl || !aiModelCustomEl) return;

    applyAIConfigToForm(loadAIConfig());

    [aiBaseUrlEl, aiApiKeyEl, aiModelCustomEl].forEach(el => {
        el.addEventListener('input', () => {
            if (el === aiModelCustomEl) {
                const custom = aiModelCustomEl.value.trim();
                const matched = [...aiModelSelectEl.options].find(option =>
                    option.value === custom && option.value !== '__custom__');
                if (matched) aiModelSelectEl.value = matched.value;
                else if (custom) aiModelSelectEl.value = '__custom__';
            }
            persistAIConfigFromForm();
        });
    });

    aiModelSelectEl.addEventListener('change', () => {
        if (aiModelSelectEl.value === '__custom__') {
            aiModelCustomEl.focus();
        } else {
            aiModelCustomEl.value = '';
        }
        persistAIConfigFromForm();
    });

    if (aiTestBtnEl) aiTestBtnEl.addEventListener('click', handleTestAIConnection);
})();

function setCardAIStatus(card, message, kind) {
    const el = card ? card.querySelector('.ai-card-status') : null;
    if (!el) return;
    el.textContent = message || '';
    el.className = 'ai-card-status' + (kind ? ' ' + kind : '');
}

function readAIVariantsFromCard(card) {
    if (!card || !card.dataset.aiVariants) return [];
    try {
        return normalizeVariants(JSON.parse(card.dataset.aiVariants));
    } catch (e) {
        return [];
    }
}

function readAIPeerTrapFromCard(card, peerText) {
    if (!card || !card.dataset.aiPeerTrap) return null;
    try {
        const trap = JSON.parse(card.dataset.aiPeerTrap);
        if (!trap || typeof trap !== 'object' || !trap.sentence) return null;
        const current = String(peerText == null ? '' : peerText).replace(/\s+/g, ' ').trim();
        const stored = String(trap.sentence).replace(/\s+/g, ' ').trim();
        if (current !== stored) return null;
        if (!Array.isArray(trap.chunks) || !trap.chunks.length) return null;
        const errorIndex = parseInt(trap.error_chunk_index, 10);
        if (!Number.isFinite(errorIndex) || errorIndex < 0 || errorIndex >= trap.chunks.length) return null;
        return trap;
    } catch (e) {
        return null;
    }
}

function applyAIResultToCard(card, result) {
    const variants = result && Array.isArray(result.variants) ? result.variants : [];
    if (!variants.length) throw new Error('AI 未返回可用的正确表达');

    const englishInput = card.querySelector('.english-input');
    const correctInput = card.querySelector('.correct-english-input');
    const trapCheckbox = card.querySelector('.trap-checkbox');
    const explanationInput = card.querySelector('.peer-explanation-input');
    const aiPeerCheckbox = card.querySelector('.ai-peer-checkbox');
    const primary = variants[0].full_sentence;

    card.dataset.aiVariants = JSON.stringify(variants);
    delete card.dataset.aiPeerTrap;

    if (result.peer_trap) {
        if (trapCheckbox) {
            trapCheckbox.checked = true;
            window.onTrapToggle(trapCheckbox);
        }
        if (correctInput) correctInput.value = primary;
        if (englishInput) englishInput.value = result.peer_trap.sentence;
        if (explanationInput) explanationInput.value = result.peer_trap.error_explanation;
        card.dataset.aiPeerTrap = JSON.stringify(result.peer_trap);
        if (aiPeerCheckbox) aiPeerCheckbox.checked = true;
    } else if (trapCheckbox && trapCheckbox.checked) {
        // 保留家长已写好的同伴错句，只更新孩子要练的正确表达。
        if (correctInput) correctInput.value = primary;
    } else if (englishInput) {
        englishInput.value = primary;
    }

    return variants;
}

async function handleAIGenerateCard(button) {
    const card = button && button.closest ? button.closest('.card-item') : null;
    if (!card) return;

    const chineseInput = card.querySelector('.chinese-input');
    const englishInput = card.querySelector('.english-input');
    const correctInput = card.querySelector('.correct-english-input');
    const trapCheckbox = card.querySelector('.trap-checkbox');
    const aiPeerCheckbox = card.querySelector('.ai-peer-checkbox');

    const chinese = chineseInput ? chineseInput.value.trim() : '';
    const isTrapCard = !!(trapCheckbox && trapCheckbox.checked);
    const referenceEnglish = isTrapCard
        ? (correctInput ? correctInput.value.trim() : '')
        : (englishInput ? englishInput.value.trim() : '');
    const wantPeerTrap = !!(aiPeerCheckbox && aiPeerCheckbox.checked);

    if (!chinese && !referenceEnglish) {
        setCardAIStatus(card, '请先填写中文或英文参考。', 'error');
        alert('请先填写中文，或在卡片中写好英文参考。');
        return;
    }

    const config = readAIConfigFromForm();
    persistAIConfigFromForm();
    if (!isAIConfigReady(config)) {
        if (aiSettingsEl) aiSettingsEl.open = true;
        setCardAIStatus(card, '请先完成 ⚙️ AI 助手配置。', 'error');
        alert('请先在页面顶部的 ⚙️ AI 助手配置中填写 Base URL、API Key 与模型。');
        return;
    }

    const original = button.textContent;
    button.disabled = true;
    button.textContent = '✨ 生成中…';
    setCardAIStatus(card, '正在请 AI 编写起手式' + (wantPeerTrap ? '和同伴错句' : '') + '…', 'loading');

    const { controller, timer } = createAIAbortController(90000);
    try {
        const result = await generateCardData(
            config,
            { chinese, referenceEnglish, wantPeerTrap },
            { signal: controller ? controller.signal : undefined }
        );
        const variants = applyAIResultToCard(card, result);
        const trapInfo = result.peer_trap
            ? ' · 同伴错句 ' + result.peer_trap.chunks.length + ' 个意群'
            : '';
        setCardAIStatus(
            card,
            '✅ 已生成 ' + variants.length + ' 个起手式' + trapInfo + '，可继续手动修改。',
            'success'
        );
    } catch (error) {
        const message = describeAIError(error);
        setCardAIStatus(card, '❌ ' + message, 'error');
        alert('❌ AI 生成失败：\n\n' + message);
    } finally {
        clearTimeout(timer);
        button.disabled = false;
        button.textContent = original || '✨ AI 智能生成';
    }
}

window.aiGenerateCard = handleAIGenerateCard;
window.testAIConnection = handleTestAIConnection;

// --- Auto-populate Date & Card Management ---
(function() {
    function setTodaysDate() {
        const today = new Date();
        const year = today.getFullYear();
        const month = String(today.getMonth() + 1).padStart(2, '0');
        const day = String(today.getDate()).padStart(2, '0');
        document.getElementById('practiceDate').value = `${year}年-${month}月-${day}日`;
    }
    setTodaysDate();
    const cardsContainer = document.getElementById('cardsContainer');

    // --- Trap / peer-relay toggle handler ---
    window.onTrapToggle = function(checkbox) {
        const card = checkbox.closest('.card-item');
        const extraField = card.querySelector('.trap-extra-field');
        const englishInput = card.querySelector('.english-input');
        const engLabel = card.querySelector('.eng-label');
        const aiPeerCheckbox = card.querySelector('.ai-peer-checkbox');

        // AI 错句开关默认跟随「陷阱卡」勾选；用户之后仍可单独覆盖。
        if (aiPeerCheckbox) aiPeerCheckbox.checked = checkbox.checked;

        if (checkbox.checked) {
            card.classList.add('trap-card');
            extraField.classList.add('visible');
            if (engLabel) engLabel.textContent = '同伴会说的错句（抢答内容）';
            if (englishInput) englishInput.placeholder = '同伴故意说错的英文句子';
        } else {
            card.classList.remove('trap-card');
            extraField.classList.remove('visible');
            if (engLabel) engLabel.textContent = '英文段落 (支持多行及 M:/F: 角色标记)';
            if (englishInput) englishInput.placeholder = '英文段落 (支持多行及 M:/F: 角色标记)';
        }
    };

    window.addCard = function(options) {
        createCard(options || {});
    };

    function createCard(options) {
        const newCard = document.createElement('div');
        newCard.className = 'card-item';

        const weak = options.weak && /^[0-9a-f]{16}$/.test(String(options.weak.id || ''))
            ? options.weak
            : null;
        const reviewCount = weak ? Math.max(0, parseInt(weak.reviewCount, 10) || 0) : 0;
        if (weak) {
            newCard.dataset.weakId = weak.id;
            newCard.dataset.reviewCount = String(reviewCount);
        }

        const sortButtons = document.createElement('div');
        sortButtons.className = 'sort-buttons';
        sortButtons.innerHTML = `
            <button type="button" class="sort-btn up" onclick="moveCardUp(this)" title="向上移动">↑</button>
            <button type="button" class="sort-btn down" onclick="moveCardDown(this)" title="向下移动">↓</button>
        `;

        const cardContent = document.createElement('div');
        cardContent.className = 'card-content';
        const reviewLabel = weak && reviewCount > 0 ? ' · 第' + reviewCount + '次' : '';
        cardContent.innerHTML = `
            ${weak ? `<div class="weak-badge">🔁 复习句${reviewLabel}</div>` : ''}
            <label class="eng-label">英文段落 (支持多行及 M:/F: 角色标记)</label>
            <textarea class="english-input" placeholder="英文段落 (支持多行及 M:/F: 角色标记)"></textarea>
            <textarea class="chinese-input" placeholder="中文翻译"></textarea>
            <div class="trap-checkbox-row">
                <input type="checkbox" class="trap-checkbox" onchange="onTrapToggle(this)">
                <label>🎭 让同伴抢答时说错这句</label>
            </div>
            <div class="trap-extra-field">
                <label class="trap-label">正确的英文 (孩子自己练习这句)</label>
                <textarea class="correct-english-input" placeholder="此处输入正确的英文对照文本"></textarea>
                <label class="trap-label">错误讲解 (可选，留空自动生成)</label>
                <textarea class="peer-explanation-input" placeholder="例：关于书籍主题，应该用 about 而不是 on 哦！"></textarea>
            </div>
            <div class="ai-card-tools">
                <button type="button" class="ai-generate-btn" onclick="aiGenerateCard(this)">✨ AI 智能生成</button>
                <label class="ai-peer-option">
                    <input type="checkbox" class="ai-peer-checkbox"${options.isTrap ? ' checked' : ''}>
                    同时生成同伴抢答错句
                </label>
                <div class="ai-card-status" role="status" aria-live="polite"></div>
            </div>
            <button type="button" class="delete-card-btn" onclick="deleteCard(this)">删除此条</button>
        `;

        newCard.appendChild(sortButtons);
        newCard.appendChild(cardContent);
        cardsContainer.appendChild(newCard);

        const englishInput = newCard.querySelector('.english-input');
        const chineseInput = newCard.querySelector('.chinese-input');
        const trapCheckbox = newCard.querySelector('.trap-checkbox');
        const correctInput = newCard.querySelector('.correct-english-input');

        if (options.en != null) englishInput.value = String(options.en);
        if (options.zh != null) chineseInput.value = String(options.zh);

        if (options.isTrap) {
            trapCheckbox.checked = true;
            if (options.correctEn != null) correctInput.value = String(options.correctEn);
            if (options.explanation != null) {
                const explanationInput = newCard.querySelector('.peer-explanation-input');
                if (explanationInput) explanationInput.value = String(options.explanation);
            }
            window.onTrapToggle(trapCheckbox);
        }

        updateAllSortButtons();
    }

    window.addExplanationBox = function() {
        const newBox = document.createElement('div');
        newBox.className = 'card-item explanation-item';

        const sortButtons = document.createElement('div');
        sortButtons.className = 'sort-buttons';
        sortButtons.innerHTML = `
            <button type="button" class="sort-btn up" onclick="moveCardUp(this)" title="向上移动">↑</button>
            <button type="button" class="sort-btn down" onclick="moveCardDown(this)" title="向下移动">↓</button>
        `;

        const boxContent = document.createElement('div');
        boxContent.className = 'card-content';
        boxContent.innerHTML = `
            <textarea placeholder="在此输入说明文字..."></textarea>
            <button type="button" class="delete-card-btn" onclick="deleteCard(this)">删除此条</button>
        `;

        newBox.appendChild(sortButtons);
        newBox.appendChild(boxContent);
        cardsContainer.appendChild(newBox);

        updateAllSortButtons();
    };

    window.deleteCard = function(btn) {
        btn.closest('.card-item')?.remove();
        updateAllSortButtons();
    };

    window.moveCardUp = function(button) {
        const card = button.closest('.card-item');
        const prevCard = card.previousElementSibling;

        if (prevCard && prevCard.classList.contains('card-item')) {
            cardsContainer.insertBefore(card, prevCard);
            updateAllSortButtons();
        }
    };

    window.moveCardDown = function(button) {
        const card = button.closest('.card-item');
        const nextCard = card.nextElementSibling;

        if (nextCard && nextCard.classList.contains('card-item')) {
            cardsContainer.insertBefore(nextCard, card);
            updateAllSortButtons();
        }
    };

    function updateAllSortButtons() {
        const cards = [...cardsContainer.querySelectorAll('.card-item')];

        cards.forEach((card, index) => {
            const upButton = card.querySelector('.sort-btn.up');
            const downButton = card.querySelector('.sort-btn.down');

            if (upButton) upButton.disabled = index === 0;
            if (downButton) downButton.disabled = index === cards.length - 1;
        });
    }

    // 首张卡片统一由工厂创建，避免两套 markup
    window.addCard();
})();

// Cached DOM references for generatePage and downloadPage
const outputCodeEl = document.getElementById('outputCode');
const practiceDateEl = document.getElementById('practiceDate');

// --- Generate Page ---
function generatePage() {
    const date = practiceDateEl.value || '未指定日期';
    const childName = document.getElementById('childName').value || '宝贝';
    const replayThreshold = parseInt(document.getElementById('replayThreshold').value) || 3;
    const timeThreshold = parseInt(document.getElementById('timeThreshold').value) || 15;
    const masteryThreshold = parseInt(document.getElementById('masteryThreshold').value) || 3;
    const parentLockEnabled = document.getElementById('enableParentLock')?.checked ?? true;
    const parentPasscode = document.getElementById('parentPasscode')?.value || '';
    const cards = document.querySelectorAll('#cardsContainer .card-item');

    // 只收集卡片内的 input/textarea 值；data-* 属性与按钮不参与 Practice_ID
    const values = [];
    cards.forEach(card => {
        card.querySelectorAll('input, textarea').forEach(input => {
            // 错误讲解只影响抢答文案，不改变练习内容，不应重置 Practice_ID 与历史统计
            if (input.classList.contains('peer-explanation-input')) return;
            // AI 开关只是生成器操作入口；若参与 Practice_ID，会给旧练习额外插入 "on" 并重置进度
            if (input.classList.contains('ai-peer-checkbox')) return;
            values.push(input.value || '');
        });
    });
    const practiceId = computePracticeId(date, values);

    // 第一遍：按页面顺序收集说明框和卡片描述（不立即渲染）
    const items = [];
    cards.forEach((card, index) => {
        if (card.classList.contains('explanation-item')) {
            const explanationText = card.querySelector('textarea')?.value || '';
            if (explanationText.trim() !== '') {
                items.push({ type: 'explanation', text: explanationText });
            }
            return;
        }

        const englishInput = card.querySelector('.english-input');
        const chineseInput = card.querySelector('.chinese-input');
        const trapCheckbox = card.querySelector('.trap-checkbox');
        const correctEnglishInput = card.querySelector('.correct-english-input');
        const peerExplanationInput = card.querySelector('.peer-explanation-input');

        const englishText = englishInput ? englishInput.value : '';
        if (englishText.trim() === '') return;

        const chineseText = chineseInput ? chineseInput.value : '';
        const correctEnglish = correctEnglishInput ? correctEnglishInput.value : '';
        const isTrap = !!(trapCheckbox && trapCheckbox.checked && correctEnglish.trim());
        const targetEnglish = isTrap ? correctEnglish : englishText;

        if (card.dataset.weakId) {
            // 句子被编辑后旧生疏身份失效，避免把复习次数记到别的句子
            if (sentenceId(targetEnglish) !== card.dataset.weakId) {
                card.dataset.weakId = '';
                card.dataset.reviewCount = '0';
            }
        }
        const weakId = /^[0-9a-f]{16}$/.test(card.dataset.weakId || '') ? card.dataset.weakId : '';
        const reviewCount = Math.max(0, parseInt(card.dataset.reviewCount || '0', 10) || 0);

        // 只有当前练习目标仍是 AI 主变体时，才把多起手式与 AI 意群带进生成页；
        // 手动改过英文后自动退回本地切分，避免出现过期的起手式/错误胶囊。
        const aiVariants = readAIVariantsFromCard(card);
        const usableVariants = aiVariants.length
            && aiVariants[0].full_sentence === targetEnglish.trim()
            ? aiVariants
            : [];
        const aiPeerTrap = isTrap ? readAIPeerTrapFromCard(card, englishText) : null;

        items.push({
            type: 'card',
            index,
            englishText,
            chineseText,
            isTrap,
            targetEnglish,
            explanation: peerExplanationInput ? peerExplanationInput.value : '',
            weakId,
            reviewCount,
            variants: usableVariants,
            aiPeerTrap
        });
    });

    // 同伴抢答：陷阱卡 100% 触发；普通卡每份练习随机 0~2 张。
    const { cardsHTML, totalSentences } = buildPracticeCards(items);

    // Assemble full page via template modules
    const pageTemplate = buildGeneratedHTML({
        date,
        cardsHTML,
        totalSentences,
        childName,
        practiceId,
        replayThreshold,
        timeThreshold,
        masteryThreshold,
        parentLockEnabled,
        parentPasscode,
        generatorUrl: location.href.split('#')[0],
        weakThreshold: WEAK_DEFAULTS.weakThreshold,
        fastThreshold: WEAK_DEFAULTS.fastThreshold
    });

    outputCodeEl.value = pageTemplate;
    outputCodeEl.readOnly = false;
}

function downloadPage() {
    const code = outputCodeEl.value;
    if (!code) { alert('请先生成网页代码'); return; }
    const blob = new Blob([code], { type: 'text/html;charset=utf-8' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    const dateValue = practiceDateEl.value || '新练习';
    const safeDate = dateValue.replace(/[^a-zA-Z0-9\u4e00-\u9fa5年\u6708\u65e5-]+/g, '_');
    a.href = url;
    a.download = `练习_${safeDate}.html`;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(url);

    // 只有真正下载才累计「已发出」次数；反复点生成不会刷计数
    const weakIds = [...document.querySelectorAll('#cardsContainer .card-item:not(.explanation-item)')]
        .filter(card => targetEnglishOf(card).trim())
        .map(card => card.dataset.weakId)
        .filter(id => /^[0-9a-f]{16}$/.test(id || ''));
    if (weakIds.length) {
        try { recordServed(getChildName(), weakIds); } catch (e) { /* ignore */ }
        if (weakPanel) weakPanel.refresh();
    }
}

// Expose to global scope for inline onclick handlers
window.generatePage = generatePage;
window.downloadPage = downloadPage;

weakPanel = initWeakPanel({
    getChildName,
    getExistingIds,
    clearCards,
    addCard: options => window.addCard(options)
});
