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

import { WEAK_RUNTIME_SOURCE } from './generated-weak.js';

export function buildGeneratedJS(config) {
    const jsLiteral = (value) => JSON.stringify(value === undefined ? null : value).replace(/</g, '\\u003c');
    return `
                // --- 从生成器注入的配置 ---
                const CONFIG = {
                    childName: ${jsLiteral(config.childName)},
                    practiceId: ${jsLiteral(config.practiceId)},
                    replayLimit: ${Number(config.replayLimit) || 3},
                    timeLimit: ${Number(config.timeLimit) || 15},
                    masteryThreshold: ${Number(config.masteryThreshold) || 3},
                    parentLockEnabled: ${config.parentLockEnabled ? 'true' : 'false'},
                    parentPasscode: ${jsLiteral(config.parentPasscode || '')},
                    totalSentences: ${Number(config.totalSentences) || 0},
                    generatorUrl: ${jsLiteral(config.generatorUrl || '')},
                    weakThreshold: ${Number(config.weakThreshold) || 40},
                    fastThreshold: ${Number(config.fastThreshold) || 22}
                };

                // --- 中英教材常见角色性别字典 ---
                const MALE_NAMES = ['m', 'boy', 'liming', 'li ming', 'daming', 'danny', 'jack', 'tom', 'bob', 'mike', 'john', 'wu binbin', 'wu yifan', 'zoom', 'peter', 'sam', 'ben', 'max', 'leo', 'nick'];
                const FEMALE_NAMES = ['f', 'girl', 'jenny', 'amy', 'lingling','sarah', 'chen jie', 'bai ling', 'mary', 'alice', 'wang mei', 'zip', 'lucy', 'lily', 'emma', 'lisa', 'susan', 'kate', 'ann'];

                // --- 文本解析引擎 ---
                function parseDialogues(text) {
                    const lines = text.split('\\n');
                    const segments = [];
                    lines.forEach(line => {
                        const trimmedLine = line.trim();
                        if (!trimmedLine) return;
                        const match = trimmedLine.match(/^([A-Za-z\\s]+|[\\u4e00-\\u9fa5]+)\\s*[:：]\\s*(.*)$/);
                        if (match) {
                            const roleName = match[1].trim().toLowerCase();
                            const speechText = match[2].trim();
                            if (!speechText) return;
                            let gender = 'male';
                            if (FEMALE_NAMES.includes(roleName)) gender = 'female';
                            segments.push({ text: speechText, gender: gender });
                        } else {
                            segments.push({ text: trimmedLine, gender: 'male' });
                        }
                    });
                    return segments;
                }

                // ============================================================
                //  统一状态管理：所有状态存储在 localStorage.getItem(CONFIG.practiceId)
                // ============================================================
                // appState 结构:
                // {
                //   stats: { [sentenceText]: { replay, time, count, mastery_count } },
                //   peerResolved: { [cardIndex]: true }
                // }
                // ============================================================
const appState = loadAppState();
let sessionStartTime = null;

// Cached DOM references
const starDisplayEl = document.getElementById('star-display');
const starRatingEl = document.getElementById('star-rating');
const medalMsgEl = document.getElementById('medal-message');


                function getDefaultAppState() {
                    return {
                        stats: {},
                        peerResolved: {}
                    };
                }

                function loadAppState() {
                    const saved = localStorage.getItem(CONFIG.practiceId);
                    if (saved) {
                        try {
                            const parsed = JSON.parse(saved);
                            if (!parsed.stats) parsed.stats = {};
                            if (!parsed.peerResolved) parsed.peerResolved = {};
                            // v2.6/v2.7 的侦探状态迁移：已抓获的卡片视为已完成同伴辨析
                            if (parsed.trapsState) {
                                Object.keys(parsed.trapsState).forEach(function(index) {
                                    const trap = parsed.trapsState[index];
                                    if (trap && (trap.isCaught || trap.autoRevealed)) parsed.peerResolved[index] = true;
                                });
                            }
                            delete parsed.trapsState;
                            delete parsed.remainingChances;
                            delete parsed.foundTraps;
                            return parsed;
                        } catch(e) {
                            return getDefaultAppState();
                        }
                    }
                    return getDefaultAppState();
                }

                function saveAppState() {
                    localStorage.setItem(CONFIG.practiceId, JSON.stringify(appState));
                }

                function getStats() { return appState.stats; }

                // ============================================================
                //  家长审计系统 (Parent Audit System)
                //  独立存储，resetChallenge() 不清除
                // ============================================================

                // --- Base64 编解码（防 F12 篡改） ---
                function encodeForStorage(obj) {
                    return btoa(unescape(encodeURIComponent(JSON.stringify(obj))));
                }
                function decodeFromStorage(str) {
                    return JSON.parse(decodeURIComponent(escape(atob(str))));
                }

                function getFirstTryKey() { return 'FTS_' + CONFIG.practiceId; }
                function getMetaKey()    { return 'META_' + CONFIG.practiceId; }

                // --- 首次尝试快照读写 ---
                function loadFirstTrySnapshot() {
                    try {
                        const raw = localStorage.getItem(getFirstTryKey());
                        return raw ? decodeFromStorage(raw) : null;
                    } catch(e) { return null; }
                }
                function saveFirstTrySnapshot(snapshot) {
                    localStorage.setItem(getFirstTryKey(), encodeForStorage(snapshot));
                }

                // --- 元数据（重置次数等）读写 ---
                function loadMetaData() {
                    try {
                        const raw = localStorage.getItem(getMetaKey());
                        if (raw) return decodeFromStorage(raw);
                    } catch(e) { /* ignore */ }
                    return { resetCount: 0, firstCreatedAt: new Date().toISOString(), lastResetAt: null };
                }
                function saveMetaData(meta) {
                    localStorage.setItem(getMetaKey(), encodeForStorage(meta));
                }

                // --- 正常捕获：首次完整尝试的快照 ---
                function tryCaptureFirstTry() {
                    if (loadFirstTrySnapshot()) return;

                    const stats = getStats();
                    const totalCards = CONFIG.totalSentences || document.querySelectorAll('.card[data-english]').length;
                    if (totalCards === 0) return;

                    const allAttempted = Array.from(document.querySelectorAll('.card[data-english]')).every(card => {
                        const text = decodeURIComponent(card.dataset.english);
                        return stats[text] && stats[text].count >= 1;
                    });
                    if (!allAttempted) return;

                    const result = calculateStars();
                    const allTimes = Object.values(stats).reduce((s, v) => s + v.time, 0);
                    const allReplays = Object.values(stats).reduce((s, v) => s + v.replay, 0);
                    const attemptedCount = Object.keys(stats).length;
                    const snapshot = {
                        status: 'complete',
                        timestamp: new Date().toISOString(),
                        starRating: result.stars,
                        avgThinkTime: attemptedCount > 0 ? allTimes / attemptedCount : 0,
                        totalReplay: allReplays,
                        totalSentences: totalCards,
                        attemptedSentences: attemptedCount,
                        stats: JSON.parse(JSON.stringify(stats))
                    };
                    saveFirstTrySnapshot(snapshot);
                }

                // --- 强制捕获：半途重置时的不完整快照 ---
                function forceCapturePartialFirstTry() {
                    const stats = getStats();
                    const totalCards = CONFIG.totalSentences || document.querySelectorAll('.card[data-english]').length;
                    if (totalCards === 0) return;

                    const attemptedKeys = Object.keys(stats);
                    const result = calculateStars();
                    const allTimes = attemptedKeys.reduce((s, k) => s + (stats[k].time || 0), 0);
                    const allReplays = attemptedKeys.reduce((s, k) => s + (stats[k].replay || 0), 0);
                    const snapshot = {
                        status: 'incomplete',
                        timestamp: new Date().toISOString(),
                        starRating: result.stars,
                        avgThinkTime: attemptedKeys.length > 0 ? allTimes / attemptedKeys.length : 0,
                        totalReplay: allReplays,
                        totalSentences: totalCards,
                        attemptedSentences: attemptedKeys.length,
                        stats: JSON.parse(JSON.stringify(stats))
                    };
                    saveFirstTrySnapshot(snapshot);
                }

                // --- 统一的家长锁验证 ---
                function verifyParentLock(context) {
                    if (!CONFIG.parentLockEnabled) return true;

                    const actionLabel = context === 'hardReset' ? '彻底清除所有数据' : '重置挑战';

                    if (CONFIG.parentPasscode) {
                        const pwd = prompt('🔒 请输入家长密码以' + actionLabel + '：');
                        if (pwd !== CONFIG.parentPasscode) {
                            alert('密码错误，操作已取消。');
                            return false;
                        }
                    } else {
                        const a = Math.floor(Math.random() * 90) + 10;
                        const b = Math.floor(Math.random() * 90) + 10;
                        const answer = prompt('🔒 家长验证：' + a + ' + ' + b + ' = ?');
                        if (parseInt(answer) !== a + b) {
                            alert('验证码错误，操作已取消。');
                            return false;
                        }
                    }
                    return true;
                }

                // --- Canvas Confetti ---
                function startConfetti() {
                    const canvas = document.getElementById('confetti-canvas');
                    if (!canvas) return;
                    const ctx = canvas.getContext('2d');
                    canvas.width = window.innerWidth;
                    canvas.height = window.innerHeight;

                    const pieces = [];
                    const colors = ['#ff6b6b','#ffd93d','#6bcb77','#4d96ff','#ff6b9d','#c44dff','#ff9800','#00bcd4'];
                    const count = 120;

                    for (let i = 0; i < count; i++) {
                        pieces.push({
                            x: Math.random() * canvas.width,
                            y: Math.random() * canvas.height * -1 - 20,
                            w: Math.random() * 10 + 4,
                            h: Math.random() * 6 + 3,
                            color: colors[Math.floor(Math.random() * colors.length)],
                            vx: (Math.random() - 0.5) * 4,
                            vy: Math.random() * 3 + 2,
                            rotation: Math.random() * 360,
                            rotSpeed: (Math.random() - 0.5) * 8,
                            opacity: 1
                        });
                    }

                    let frame = 0;
                    const maxFrames = 150;

                    function animate() {
                        if (frame > maxFrames) {
                            ctx.clearRect(0, 0, canvas.width, canvas.height);
                            return;
                        }
                        ctx.clearRect(0, 0, canvas.width, canvas.height);

                        pieces.forEach(p => {
                            p.x += p.vx;
                            p.y += p.vy;
                            p.vy += 0.08;
                            p.rotation += p.rotSpeed;
                            if (frame > maxFrames - 30) {
                                p.opacity = Math.max(0, (maxFrames - frame) / 30);
                            }

                            ctx.save();
                            ctx.translate(p.x, p.y);
                            ctx.rotate(p.rotation * Math.PI / 180);
                            ctx.globalAlpha = p.opacity;
                            ctx.fillStyle = p.color;
                            ctx.fillRect(-p.w/2, -p.h/2, p.w, p.h);
                            ctx.restore();
                        });

                        frame++;
                        requestAnimationFrame(animate);
                    }

                    animate();
                }

                // --- Show hint message ---
                function showHint(msg) {
                    const el = document.createElement('div');
                    el.className = 'hint-msg';
                    el.textContent = msg;
                    document.body.appendChild(el);
                    setTimeout(() => el.remove(), 2200);
                }

${WEAK_RUNTIME_SOURCE}

                // --- Wrap text nodes into clickable word spans ---
                function wrapTextNodesInElement(element) {
                    if (!element) return;
                    const childNodes = Array.from(element.childNodes);
                    childNodes.forEach(node => {
                        if (node.nodeType === Node.TEXT_NODE) {
                            const text = node.textContent;
                            if (text.trim() === '') return;

                            const fragment = document.createDocumentFragment();
                            const parts = text.split(/(\\s+)/);
                            parts.forEach(part => {
                                if (part.trim() === '') {
                                    fragment.appendChild(document.createTextNode(part));
                                } else {
                                    const span = document.createElement('span');
                                    span.className = 'word-span';
                                    const cleanWord = part.replace(/[.,\\/#\\!$%\\^&\\*;:{}_~()?"'’\\-]/g, "").trim();
                                    span.dataset.word = cleanWord;
                                    span.textContent = part;
                                    fragment.appendChild(span);
                                }
                            });
                            element.replaceChild(fragment, node);
                        } else if (node.nodeType === Node.ELEMENT_NODE) {
                            if (!node.classList.contains('word-span')) {
                                wrapTextNodesInElement(node);
                            }
                        }
                    });
                }

                // ============================================================
                //  同伴抢答（Peer Relay）
                //  ------------------------------------------------------------
                //  阶段 1：同伴说出句子（陷阱卡 = 错句；随机普通卡 = 正确句）。
                //          孩子点意群胶囊或「这句没问题」来辨析同伴。
                //  阶段 2：辨析通过后解锁下方起手式练习区。
                //  旧版侦探模式（放大镜 / 搜查机会 / 两击现形）已彻底移除。
                // ============================================================

                function getPeerData(card) {
                    if (!card || !card.dataset.peerRelay) return null;
                    try {
                        const data = JSON.parse(card.dataset.peerRelay);
                        return data && data.has_peer === true ? data : null;
                    } catch (e) {
                        return null;
                    }
                }

                function getCardIndex(card) {
                    const index = parseInt(card && card.dataset ? card.dataset.cardIndex : '', 10);
                    return Number.isFinite(index) ? index : null;
                }

                function isPeerResolved(card) {
                    const index = getCardIndex(card);
                    if (index === null) return false;
                    if (appState.peerResolved[index]) return true;
                    // 兼容旧状态：已经练习过的卡片必然已经过了阶段 1
                    const text = decodeURIComponent(card.dataset.english || '');
                    const statItem = getStats()[text];
                    return !!(statItem && statItem.count > 0);
                }

                function setStartEnabled(card, enabled) {
                    const btn = card.querySelector('.start-slot-btn');
                    if (btn) {
                        btn.disabled = !enabled;
                        if (enabled) btn.removeAttribute('aria-disabled');
                        else btn.setAttribute('aria-disabled', 'true');
                    }
                    card.querySelectorAll('.starter-chip').forEach(chip => {
                        chip.disabled = !enabled;
                    });
                    if (!enabled) {
                        const slot = card.querySelector('.start-slot');
                        if (slot) slot.classList.remove('ready');
                    }
                }

                function lockForPeer(card) {
                    card.setAttribute('data-peer-pending', 'true');
                    card.classList.add('peer-pending');
                    const englishDiv = card.querySelector('.english');
                    if (englishDiv) englishDiv.classList.remove('visible');
                    card.classList.remove('expanded');
                    setStartEnabled(card, false);
                }

                function unlockStart(card) {
                    card.removeAttribute('data-peer-pending');
                    card.classList.remove('peer-pending');
                    setStartEnabled(card, true);
                }

                function peerFeedback(card, kind, message) {
                    const el = card.querySelector('.peer-feedback');
                    if (!el) return;
                    el.className = 'peer-feedback ' + kind;
                    el.textContent = message;
                }

                function shakePeerBubble(card) {
                    const bubble = card.querySelector('.peer-bubble');
                    if (!bubble) return;
                    bubble.classList.remove('shake');
                    // 强制回流，确保连续误点也能重新播放抖动
                    void bubble.offsetWidth;
                    bubble.classList.add('shake');
                    setTimeout(() => bubble.classList.remove('shake'), 650);
                }

                function collapsePeer(card, instant) {
                    const bubble = card.querySelector('.peer-bubble');
                    if (!bubble) return;
                    bubble.querySelectorAll('button').forEach(btn => { btn.disabled = true; });
                    if (instant) {
                        bubble.classList.remove('peer-leaving');
                        bubble.classList.add('resolved');
                        return;
                    }
                    bubble.classList.add('peer-leaving');
                    setTimeout(() => {
                        bubble.classList.remove('peer-leaving');
                        bubble.classList.add('resolved');
                    }, 240);
                }

                function resolvePeer(card, message) {
                    if (card.dataset.peerResolved === 'true') return;
                    const index = getCardIndex(card);
                    if (index === null) return;

                    appState.peerResolved[index] = true;
                    saveAppState();
                    card.dataset.peerResolved = 'true';
                    unlockStart(card);
                    peerFeedback(card, 'success', message);

                    const bubble = card.querySelector('.peer-bubble');
                    if (bubble) {
                        bubble.querySelectorAll('button').forEach(btn => { btn.disabled = true; });
                    }
                    setTimeout(() => collapsePeer(card, false), 1500);
                }

                function handlePeerChoice(card, peer, isOkButton, chunkIndex) {
                    if (!peer) return;
                    if (card.dataset.peerResolved === 'true') return;

                    if (peer.is_peer_correct) {
                        if (isOkButton) {
                            resolvePeer(card, '耶！原来我没说错！给你点赞~ 接下来看你的了！');
                        } else {
                            peerFeedback(card, 'warn', '哈哈，其实我这次没说错哦，这句话很地道！');
                            shakePeerBubble(card);
                        }
                        return;
                    }

                    if (isOkButton) {
                        peerFeedback(card, 'warn', '咦？我好像感觉哪里怪怪的，再帮我仔细瞧瞧？');
                        shakePeerBubble(card);
                        return;
                    }

                    if (chunkIndex === peer.error_chunk_index) {
                        const explanation = peer.error_explanation || '';
                        resolvePeer(
                            card,
                            '哇，被你发现了！' + (explanation ? ' ' + explanation : '') + ' 谢谢你帮我指出来~ 换你来展示一遍吧！'
                        );
                    } else {
                        peerFeedback(card, 'warn', '咦？我好像感觉哪里怪怪的，再帮我仔细瞧瞧？');
                        shakePeerBubble(card);
                    }
                }

                function initPeerRelay() {
                    document.querySelectorAll('.card[data-peer-relay]').forEach(card => {
                        const peer = getPeerData(card);
                        if (!peer) return;

                        if (isPeerResolved(card)) {
                            card.dataset.peerResolved = 'true';
                            unlockStart(card);
                            collapsePeer(card, true);
                            return;
                        }

                        lockForPeer(card);

                        card.querySelectorAll('.peer-chunk').forEach(chunk => {
                            chunk.addEventListener('click', function() {
                                const index = parseInt(this.dataset.chunkIndex, 10);
                                handlePeerChoice(card, peer, false, Number.isFinite(index) ? index : -1);
                            });
                        });

                        const okButton = card.querySelector('.peer-ok');
                        if (okButton) {
                            okButton.addEventListener('click', function() {
                                handlePeerChoice(card, peer, true, -1);
                            });
                        }
                    });
                }

                // ============================================================
                //  起手式练习区（阶段 2）
                // ============================================================

                function getStartVariants(card) {
                    if (!card || !card.dataset.startVariants) return [];
                    try {
                        const parsed = JSON.parse(card.dataset.startVariants);
                        if (!Array.isArray(parsed)) return [];
                        return parsed.filter(item => item && String(item.full_sentence || '').trim());
                    } catch (e) {
                        return [];
                    }
                }

                // 选定 AI 变体后，右侧展示/朗读该变体；统计仍以 data-english 的主句为键，
                // 避免同一张卡片因切换风格而产生多套进度。
                function getActiveEnglish(card) {
                    if (card && card.dataset.activeEnglish) {
                        return decodeURIComponent(card.dataset.activeEnglish);
                    }
                    return decodeURIComponent(card.dataset.english || '');
                }

                function setActiveEnglish(card, fullSentence) {
                    const canonical = decodeURIComponent(card.dataset.english || '');
                    const next = String(fullSentence == null ? '' : fullSentence).trim();
                    if (!next || next === canonical) delete card.dataset.activeEnglish;
                    else card.dataset.activeEnglish = encodeURIComponent(next);

                    const englishDiv = card.querySelector('.english');
                    if (englishDiv) {
                        englishDiv.textContent = next || canonical;
                        wrapTextNodesInElement(englishDiv);
                    }
                }

                function startCardThinking(chip) {
                    const card = chip && chip.closest ? chip.closest('.card') : null;
                    if (!card) return;
                    if (card.hasAttribute('data-peer-pending')) return;

                    card.querySelectorAll('.starter-chip').forEach(c => c.classList.remove('chosen'));
                    chip.classList.add('chosen');

                    const variants = getStartVariants(card);
                    const variantIndex = parseInt(chip.dataset.variantIndex, 10);
                    if (Number.isFinite(variantIndex) && variants[variantIndex]) {
                        setActiveEnglish(card, variants[variantIndex].full_sentence);
                    }

                    const englishText = decodeURIComponent(card.dataset.english);
                    const stats = getStats();
                    if (!stats[englishText]) stats[englishText] = { replay: 0, time: 0, count: 0, mastery_count: 0 };
                    // 思考起点 = 选定起手式的那一刻。已开始过的句子不覆盖时间戳。
                    if (!stats[englishText]._revealTime && !(stats[englishText].count > 0)) {
                        stats[englishText]._revealTime = Date.now();
                        saveAppState();
                    }
                    const slot = card.querySelector('.start-slot');
                    if (slot) slot.classList.add('ready');
                }

                function initStartLayout() {
                    document.querySelectorAll('.card[data-english]').forEach(card => {
                        const englishDiv = card.querySelector('.english');
                        const slot = card.querySelector('.start-slot');
                        const statItem = getStats()[decodeURIComponent(card.dataset.english)];
                        if ((statItem && statItem.count > 0) || (englishDiv && englishDiv.classList.contains('visible'))) {
                            card.classList.add('expanded');
                        }

                        // 整块右侧槽位可点：未展开时点槽位空白处等同点「展开并朗读」
                        if (slot && englishDiv) {
                            slot.addEventListener('click', function(e) {
                                if (card.classList.contains('expanded')) return;
                                if (card.hasAttribute('data-peer-pending')) return;
                                if (e.target.closest('.reveal-btn')) return;
                                const btn = card.querySelector('.reveal-btn');
                                if (btn && !btn.disabled) handleRevealBtn(btn, englishDiv.id);
                            });
                        }
                    });
                }

                // 1. 初始化统计数据
                const maleVoiceSelect = document.getElementById('maleVoiceSelect');
                const femaleVoiceSelect = document.getElementById('femaleVoiceSelect');
                const speedSelect = document.getElementById('speedSelectGenerated');
                let availableVoices = [];

                function populateVoiceList() {
                    if (!('speechSynthesis' in window)) {
                        maleVoiceSelect.innerHTML = '<option value="">浏览器不支持语音</option>';
                        femaleVoiceSelect.innerHTML = '<option value="">浏览器不支持语音</option>';
                        return;
                    }
                    availableVoices = speechSynthesis.getVoices().filter(voice => voice.lang.startsWith('en-'));
                    if (availableVoices.length === 0) {
                        const msg = speechSynthesis.getVoices().length === 0 ? '等待语音加载...' : '无可用英文语音';
                        maleVoiceSelect.innerHTML = '<option value="">' + msg + '</option>';
                        femaleVoiceSelect.innerHTML = '<option value="">' + msg + '</option>';
                        return;
                    }
                    maleVoiceSelect.innerHTML = '';
                    femaleVoiceSelect.innerHTML = '';
                    availableVoices.forEach(voice => {
                        const opt1 = document.createElement('option');
                        opt1.textContent = voice.name + ' (' + voice.lang + ')';
                        opt1.value = voice.name;
                        maleVoiceSelect.appendChild(opt1);
                        const opt2 = document.createElement('option');
                        opt2.textContent = voice.name + ' (' + voice.lang + ')';
                        opt2.value = voice.name;
                        femaleVoiceSelect.appendChild(opt2);
                    });
                    const maleKeywords = ['guy', 'christopher', 'eric', 'brian', 'david', 'james', 'microsoft mark', 'microsoft david', 'google uk english male'];
                    let maleIdx = -1;
                    for (const kw of maleKeywords) {
                        maleIdx = availableVoices.findIndex(v => v.name.toLowerCase().includes(kw));
                        if (maleIdx >= 0) break;
                    }
                    if (maleIdx === -1) maleIdx = availableVoices.findIndex(v => v.name.includes('Microsoft') && v.name.includes('Natural'));
                    if (maleIdx === -1) maleIdx = availableVoices.findIndex(v => v.lang === 'en-US');
                    if (maleIdx === -1) maleIdx = 0;
                    if (maleIdx >= 0 && maleVoiceSelect.options.length > maleIdx) maleVoiceSelect.options[maleIdx].selected = true;
                    const femaleKeywords = ['ava', 'jenny', 'aria', 'michelle', 'sara', 'samantha', 'victoria', 'kate', 'zira', 'hazel', 'heather', 'microsoft ava', 'google uk english female'];
                    let femaleIdx = -1;
                    for (const kw of femaleKeywords) {
                        femaleIdx = availableVoices.findIndex(v => v.name.toLowerCase().includes(kw));
                        if (femaleIdx >= 0) break;
                    }
                    if (femaleIdx === -1) femaleIdx = availableVoices.findIndex(v => v.lang === 'en-US');
                    if (femaleIdx === -1) femaleIdx = Math.min(0, availableVoices.length - 1);
                    if (femaleIdx >= 0 && femaleVoiceSelect.options.length > femaleIdx) femaleVoiceSelect.options[femaleIdx].selected = true;
                }

                populateVoiceList();
                if ('speechSynthesis' in window && speechSynthesis.onvoiceschanged !== undefined) {
                    speechSynthesis.onvoiceschanged = populateVoiceList;
                }

                function updateEnergyBar(energyBar, masteryCount, cardElement) {
                    const ears = energyBar.querySelectorAll('.ear-icon');
                    const count = Math.min(masteryCount, 3);
                    ears.forEach((ear, i) => {
                        if (i < count) ear.classList.add('lit');
                        else ear.classList.remove('lit');
                    });
                    if (masteryCount >= CONFIG.masteryThreshold) cardElement.classList.add('mastered');
                    else cardElement.classList.remove('mastered');
                }

                function handleRevealBtn(btn, elementId) {
                    const card = btn.closest('.card');
                    if (!card) return;
                    if (card.hasAttribute('data-peer-pending')) return;
                    const chineseDiv = card.querySelector('.chinese');
                    if (!chineseDiv || !chineseDiv.classList.contains('revealed')) {
                        alert("请先点击中文，思考如何翻译成英文哦！");
                        return;
                    }
                    const englishText = decodeURIComponent(card.dataset.english);
                    const activeText = getActiveEnglish(card);
                    const englishDiv = document.getElementById(elementId);
                    if (!englishDiv) return;
                    if (!englishDiv.classList.contains('visible')) {
                        englishDiv.classList.add('visible');
                        card.classList.add('expanded');
                        btn.textContent = '再次朗读';
                        btn.classList.add('revealed-once');
                        const stats = getStats();
                        if (!stats[englishText]) stats[englishText] = { replay: 0, time: 0, count: 0, mastery_count: 0 };
                        // 使用每句独立的绝对时间戳（_revealTime），浏览器后台/切标签页不会冻结计时
                        const revealStart = stats[englishText]._revealTime || sessionStartTime || Date.now();
                        const rawDuration = Math.floor((Date.now() - revealStart) / 1000);
                        // 硬上限 300 秒（5分钟），防止长时间挂机产生不合理数据
                        // 不能用 CONFIG.timeLimit 作为上限！保留真实超时数据用于评星判定
                        const HARD_CAP_SECONDS = 300;
                        const duration = Math.min(rawDuration, HARD_CAP_SECONDS);
                        delete stats[englishText]._revealTime;
                        stats[englishText].time = Math.max(stats[englishText].time, duration);
                        stats[englishText].count += 1;
                        saveAppState();
                        tryCaptureFirstTry();
                        speakTextWithTracking(activeText, card, btn);
                    } else {
                        // 只有「确实存在活跃会话且属于本按钮」才拦截
                        if (activePlayback && !activePlayback.finished && activePlayback.btn === btn) {
                            alert("正在朗读中，请稍候...");
                            return;
                        }
                        if (btn.dataset.playing === 'true') {
                            btn.dataset.playing = 'false';
                            btn.disabled = false;
                            btn.classList.remove('playing');
                            card.classList.remove('is-playing');
                        }
                        speakTextWithTracking(activeText, card, btn);
                    }
                }

                // ============================================================
                //  TTS 播放控制器：按钮状态的唯一入口 / 唯一出口
                //  ------------------------------------------------------------
                //  1) 任何出口（end / error / 被抢占 / 单词点读 / 看门狗）都走
                //     finishPlayback()，UI 不可能悬挂在「播放中...」；
                //  2) 统计只在「自然读完」时提交且仅一次（committed 幂等），防刷分；
                //  3) 不押注单个 onend：onstart/onboundary 作为心跳，静默看门狗 +
                //     预估时长上限双重兜底（在线语音的 end 事件可能迟到数秒）；
                //  4) cancel() 与 speak() 必须跨一次宏任务，规避 Chromium 事件被吞的竞态。
                // ============================================================
                const TTS_TIMING = {
                    CHARS_PER_SEC: 13,      // rate=1.0 时英文语音的保守语速（字符/秒）
                    STARTUP_MS: 4000,       // 首个 onstart 之前的最长等待（在线语音首包）
                    SEGMENT_GAP_MS: 3000,   // 下一段尚未开播时的静默容忍
                    TAIL_MS: 1200,          // 最后一段开播后，无 boundary 活动多久视为读完
                    SEGMENT_OVERHEAD_MS: 400,
                    MARGIN_RATIO: 0.3,
                    MARGIN_MS: 1500
                };

                let playbackSeq = 0;
                let activePlayback = null;

                function estimateSpeechMs(segments, rate) {
                    let chars = 0;
                    segments.forEach(function(s) { chars += s.text.length; });
                    const speechMs = (chars / (TTS_TIMING.CHARS_PER_SEC * rate)) * 1000;
                    return Math.round(speechMs * (1 + TTS_TIMING.MARGIN_RATIO)
                        + segments.length * TTS_TIMING.SEGMENT_OVERHEAD_MS
                        + TTS_TIMING.MARGIN_MS);
                }

                // Chromium 已知问题：cancel() 之后同一任务里的 speak() 会被吞掉，
                // 或事件被推迟到下一个 TTS 服务周期。跨一次宏任务再入队。
                function deferSpeech(fn) {
                    if (typeof requestAnimationFrame === 'function') {
                        requestAnimationFrame(function() { setTimeout(fn, 0); });
                    } else {
                        setTimeout(fn, 0);
                    }
                }

                function scheduleSilenceWatchdog(playback) {
                    if (playback.finished) return;
                    clearTimeout(playback.silenceTimer);
                    let delay;
                    if (!playback.activitySeen) delay = TTS_TIMING.STARTUP_MS;
                    else if (playback.startedCount < playback.segmentCount) delay = TTS_TIMING.SEGMENT_GAP_MS;
                    else delay = TTS_TIMING.TAIL_MS;
                    playback.silenceTimer = setTimeout(function() {
                        finishPlayback(playback, 'watchdog');
                    }, delay);
                }

                function notePlaybackActivity(playback, startedSegmentIndex) {
                    if (!playback || playback.finished) return;
                    playback.activitySeen = true;
                    if (startedSegmentIndex !== undefined) {
                        playback.startedCount = Math.max(playback.startedCount, startedSegmentIndex + 1);
                    }
                    scheduleSilenceWatchdog(playback);
                }

                function startPlayback(btnElement, cardElement, segments, rate, context) {
                    // 抢占：任何仍在播的旧会话先走完收尾（否则旧按钮会永久停在播放中）
                    if (activePlayback && !activePlayback.finished) {
                        finishPlayback(activePlayback, 'superseded');
                    }
                    const playback = {
                        id: ++playbackSeq,
                        btn: btnElement,
                        card: cardElement,
                        segmentCount: segments.length,
                        startedCount: 0,
                        activitySeen: false,
                        silenceTimer: null,
                        deadlineTimer: null,
                        finished: false,
                        committed: false,
                        englishText: context.englishText,
                        stats: context.stats,
                        energyBar: context.energyBar
                    };
                    activePlayback = playback;

                    btnElement.dataset.playing = 'true';
                    btnElement.dataset.playToken = String(playback.id);
                    btnElement.disabled = true;
                    btnElement.classList.add('playing');
                    btnElement.textContent = '🔊 播放中...';
                    if (cardElement) cardElement.classList.add('is-playing');

                    // 绝对上限：即使 onstart/onboundary/onend 全部丢失，也会在「启动等待 + 预估时长」后解锁
                    playback.deadlineTimer = setTimeout(function() {
                        finishPlayback(playback, 'watchdog');
                    }, TTS_TIMING.STARTUP_MS + estimateSpeechMs(segments, rate));

                    scheduleSilenceWatchdog(playback);
                    return playback;
                }

                function finishPlayback(playback, reason) {
                    if (!playback || playback.finished) return;
                    playback.finished = true;
                    clearTimeout(playback.silenceTimer);
                    clearTimeout(playback.deadlineTimer);
                    playback.silenceTimer = null;
                    playback.deadlineTimer = null;

                    // 播放失败：终止剩余队列，避免「UI 已解锁、后半句还在念」
                    if (reason === 'error') {
                        try { window.speechSynthesis.cancel(); } catch (e) { /* ignore */ }
                    }

                    // 1) 先解锁 UI —— 只允许「仍持有该按钮」的会话改写它
                    const btn = playback.btn;
                    if (btn && btn.dataset.playToken === String(playback.id)) {
                        btn.disabled = false;
                        btn.textContent = '再次朗读';
                        btn.dataset.playing = 'false';
                        btn.classList.remove('playing');
                        if (playback.card) playback.card.classList.remove('is-playing');
                    }
                    if (activePlayback === playback) activePlayback = null;

                    // 2) 统计只提交一次，且仅在「确实开播过 + 正常读完或被看门狗判为读完」
                    const natural = (reason === 'completed') || (reason === 'watchdog' && playback.activitySeen);
                    if (!playback.committed && natural) {
                        playback.committed = true;
                        commitPlaybackStats(playback);
                    }
                }

                function commitPlaybackStats(playback) {
                    const cardElement = playback.card;
                    const englishText = playback.englishText;
                    const stats = playback.stats;
                    const energyBar = playback.energyBar;
                    if (!cardElement || !englishText || !stats) return;
                    if (!stats[englishText]) stats[englishText] = { replay: 0, time: 0, count: 0, mastery_count: 0 };
                    stats[englishText].replay += 1;
                    stats[englishText].mastery_count += 1;
                    if (energyBar) updateEnergyBar(energyBar, stats[englishText].mastery_count, cardElement);
                    saveAppState();
                }

                function speakTextWithTracking(text, cardElement, btnElement) {
                    if (!('speechSynthesis' in window)) { alert('您的浏览器不支持语音合成功能'); return; }
                    const segments = parseDialogues(text);
                    if (segments.length === 0) return;
                    const maleVoiceName = maleVoiceSelect.value;
                    const femaleVoiceName = femaleVoiceSelect.value;
                    const rate = parseFloat(speedSelect.value) || 0.7;

                    const playback = startPlayback(btnElement, cardElement, segments, rate, {
                        englishText: decodeURIComponent(cardElement.dataset.english),
                        stats: getStats(),
                        energyBar: cardElement.querySelector('.energy-bar')
                    });

                    // 仅在确有任务时 cancel，减少无谓的 cancel/speak 竞态
                    if (speechSynthesis.speaking || speechSynthesis.pending) {
                        window.speechSynthesis.cancel();
                    }

                    deferSpeech(function() {
                        if (playback.finished) return;
                        segments.forEach(function(segment, index) {
                            const utterance = new SpeechSynthesisUtterance(segment.text);
                            let targetVoice = null;
                            if (segment.gender === 'female' && femaleVoiceName) targetVoice = availableVoices.find(v => v.name === femaleVoiceName);
                            else if (maleVoiceName) targetVoice = availableVoices.find(v => v.name === maleVoiceName);
                            if (targetVoice) { utterance.voice = targetVoice; utterance.lang = targetVoice.lang; }
                            else { utterance.lang = 'en-US'; }
                            utterance.rate = rate;

                            // 每一段都绑定事件：中间段的异常/事件丢失同样有兜底与心跳
                            utterance.onstart = function() {
                                if (playback.finished) return;
                                notePlaybackActivity(playback, index);
                                if (index === 0 && btnElement.dataset.playToken === String(playback.id)) {
                                    btnElement.disabled = true;
                                    btnElement.textContent = '🔊 播放中...';
                                    btnElement.classList.add('playing');
                                    btnElement.dataset.playing = 'true';
                                }
                            };
                            utterance.onboundary = function() {
                                notePlaybackActivity(playback);
                            };
                            utterance.onend = function() {
                                if (index === segments.length - 1) {
                                    finishPlayback(playback, 'completed');
                                } else {
                                    notePlaybackActivity(playback);
                                }
                            };
                            utterance.onerror = function(event) {
                                // cancel / 抢占引起的中断不算播放失败（会话早已收尾）
                                if (playback.finished) return;
                                console.warn('[TTS] utterance error:', event && event.error);
                                finishPlayback(playback, 'error');
                            };
                            try {
                                window.speechSynthesis.speak(utterance);
                            } catch (err) {
                                console.warn('[TTS] speak failed:', err);
                                finishPlayback(playback, 'error');
                            }
                        });
                    });
                }

                // --- Speak a single word using current voice settings ---
                function speakSingleWord(word) {
                    if (!('speechSynthesis' in window)) return;
                    // 单词点读必然打断整句朗读：先把当前会话安全收尾，
                    // 否则其 onend 永不触发，按钮会永久停在「播放中...」
                    if (activePlayback && !activePlayback.finished) {
                        finishPlayback(activePlayback, 'interrupted');
                    }
                    if (speechSynthesis.speaking || speechSynthesis.pending) {
                        window.speechSynthesis.cancel();
                    }

                    const utterance = new SpeechSynthesisUtterance(word);
                    utterance.lang = 'en-US';

                    const femaleVoiceSelect = document.getElementById('femaleVoiceSelect');
                    const speedSelectEl = document.getElementById('speedSelectGenerated');

                    if (femaleVoiceSelect && femaleVoiceSelect.value) {
                        const voices = window.speechSynthesis.getVoices();
                        const selectedVoice = voices.find(v => v.name === femaleVoiceSelect.value);
                        if (selectedVoice) {
                            utterance.voice = selectedVoice;
                        }
                    }

                    utterance.rate = speedSelectEl ? (parseFloat(speedSelectEl.value) || 0.7) : 0.7;

                    // 与整句朗读保持一致：cancel 后跨 tick 再 speak
                    deferSpeech(function() {
                        try {
                            window.speechSynthesis.speak(utterance);
                        } catch (err) {
                            console.warn('[TTS] word speak failed:', err);
                        }
                    });
                }

                // --- Global click delegate for word-span clicks ---
                document.addEventListener('click', function(e) {
                    const wordSpan = e.target.closest('.word-span');
                    if (!wordSpan) return;
                    const word = wordSpan.dataset.word;
                    if (word) speakSingleWord(word);
                });

                // --- 星级评定（含防速刷检测） ---
                function calculateStars() {
                    const stats = getStats();
                    let total = 0, perfect = 0;
                    const masteredList = [], polishingList = [];
                    let maxReplayCount = 0;
                    let goldenEarSentence = '';
                    let maxReplay = 0;
                    let allWithinHalfTime = true;
                    let allReplayZero = true;
                    let hasSpeedrunFlag = false;
                    const speedrunSentences = [];
                    for (let key in stats) {
                        const item = stats[key];
                        total++;
                        maxReplay = Math.max(maxReplay, item.replay);
                        if (item.time > CONFIG.timeLimit * 0.5) allWithinHalfTime = false;
                        if (item.replay > 0) allReplayZero = false;
                        if (item.time <= CONFIG.timeLimit || item.mastery_count >= CONFIG.masteryThreshold) {
                            perfect++;
                            masteredList.push(key);
                        } else {
                            polishingList.push(key);
                        }
                        if (item.replay > maxReplayCount) { maxReplayCount = item.replay; goldenEarSentence = key; }
                        // 防速刷：思考时间 < 0.5秒 视为异常
                        if (item.time < 0.5 && item.time > 0) {
                            hasSpeedrunFlag = true;
                            speedrunSentences.push(key + ' (' + item.time + '秒)');
                        }
                    }
                    let stars = 1;
                    if (total > 0) {
                        // 6月亮条件：所有句子在半速时间内完成，重听≤1次，且每句思考时间至少1秒（防背诵秒过）
                        let sixMoonQualified = allWithinHalfTime && maxReplay <= 1 && total === Object.keys(stats).length;
                        if (sixMoonQualified) {
                            for (let key in stats) {
                                if (stats[key].time < 1.0 && stats[key].time > 0) {
                                    sixMoonQualified = false;
                                    break;
                                }
                            }
                        }
                        if (sixMoonQualified) stars = 6;
                        else if (perfect === total && allReplayZero) stars = 5;
                        else if (perfect === total && !allReplayZero) stars = 4;
                        else { const r = perfect / total; if (r >= 0.8) stars = 4; else if (r >= 0.5) stars = 3; else if (r > 0) stars = 2; else stars = 1; }
                    }
                    return { stars, total, perfect, masteredList, polishingList, goldenEarSentence, maxReplayCount, maxReplay, hasSpeedrunFlag, speedrunSentences };
                }

                function generateReport() {
                    const result = calculateStars();
                    let report = '🏆 恭喜 ' + CONFIG.childName + ' 获得今日英语勋章！\\n\\n';
                    report += '基于设定的标准（重听≤' + CONFIG.replayLimit + '次，思考≤' + CONFIG.timeLimit + '秒 或 打磨次数≥' + CONFIG.masteryThreshold + '次），宝贝的表现如下：\\n\\n';
                    if (result.stars === 6) report += '🌙 至高荣誉：紫金闪耀 6 月亮！（所有句子在半速时间内完成，重听≤1次）\\n\\n';
                    else report += '成就：今日获得 ' + '⭐'.repeat(result.stars) + '（' + result.stars + '颗星）\\n\\n';
                    if (result.masteredList.length > 0) {
                        report += '📗 已点亮的句子（掌握）：\\n这些句子你已经完全掌握了，太棒了！\\n';
                        result.masteredList.forEach(s => {
                            const item = getStats()[s];
                            const isMasteryBased = item.time > CONFIG.timeLimit && item.mastery_count >= CONFIG.masteryThreshold;
                            const label = isMasteryBased ? ' 🎯 地道发音大师' : ' ✅ 优秀';
                            report += '  ' + s + label + '\\n';
                        });
                        report += '\\n';
                    }
                    if (result.polishingList.length > 0) {
                        report += '💪 正在打磨的句子（继续精进）：\\n这 ' + result.polishingList.length + ' 个句子是"明日小怪兽"，建议明天再挑战它们两次！\\n';
                        result.polishingList.forEach(s => report += '  🔄 ' + s + '\\n');
                        report += '\\n';
                    }
                    if (result.maxReplayCount > 0) {
                        report += '👂 特别奖项 - 金耳朵成就 🥇\\n';
                        report += '颁发给听取次数最多的句子：\\n';
                        report += '  🏅 "' + result.goldenEarSentence + '" 共听取 ' + result.maxReplayCount + ' 次\\n\\n';
                    }
                    const peerCards = document.querySelectorAll('.card[data-peer-relay]').length;
                    if (peerCards > 0) {
                        report += '🎭 同伴抢答：完成了 ' + peerCards + ' 次接力辨析，帮助同伴发现/确认了句子。\\n\\n';
                    }
                    // 异常检测报告
                    if (result.hasSpeedrunFlag) {
                        report += '⚠️ 异常检测：以下句子思考时间 < 0.5秒，存在快速跳过嫌疑：\\n';
                        result.speedrunSentences.forEach(s => report += '  ' + s + '\\n');
                        report += '\\n';
                    }
                    report += '📊 原始数据：\\n';
                    for (let key in getStats()) {
                        const item = getStats()[key];
                        report += '  ' + key + ' -> 思考' + item.time + '秒, 重听' + item.replay + '次, 练习' + item.count + '次, 打磨' + (item.mastery_count || 0) + '次\\n';
                    }
                    try { report += WeakReview.reportSection(); } catch (e) { /* ignore */ }
                    // === 家长审计数据（不会被重置清除） ===
                    report += '\\n--- 家长审计数据（不会被重置清除） ---\\n';
                    const firstTry = loadFirstTrySnapshot();
                    const meta = loadMetaData();
                    if (firstTry) {
                        const statusLabel = firstTry.status === 'incomplete' ? '（⚠️ 首测未完成，中途重置时强制捕获）' : '';
                        report += '📋 首轮测试数据' + statusLabel + '：\\n';
                        report += '  首测时间: ' + firstTry.timestamp + '\\n';
                        report += '  首测星级: ' + '⭐'.repeat(firstTry.starRating || 0) + ' (' + (firstTry.starRating || 0) + '星)\\n';
                        report += '  首测平均思考时间: ' + (firstTry.avgThinkTime || 0).toFixed(1) + '秒\\n';
                        report += '  首测总重听次数: ' + (firstTry.totalReplay || 0) + '次\\n';
                        if (firstTry.attemptedSentences !== undefined) {
                            report += '  首测完成句子: ' + firstTry.attemptedSentences + '/' + firstTry.totalSentences + '\\n';
                        }
                        if (result.stars === 6 && firstTry.starRating < 6) {
                            report += '\\n⚠️ 当前评价为 6月亮（紫金闪耀），但首测仅为 ' + firstTry.starRating + ' 星。\\n';
                            report += '  提示家长：本次高评价可能来源于反复练习后的熟练表现，\\n';
                            report += '  请结合首测数据评估孩子真实的句子掌握程度。\\n';
                        }
                    } else {
                        report += '📋 首轮测试：尚未完成首轮完整练习，请完成所有句子后再领取勋章。\\n';
                    }
                    report += '🔄 重置次数: ' + (meta.resetCount || 0) + ' 次\\n';
                    if (meta.lastResetAt) {
                        report += '  上次重置时间: ' + meta.lastResetAt + '\\n';
                    }
                    try { report += WeakReview.packBlock(); } catch (e) { /* ignore */ }
                    return report;
                }

                function claimReward() {
                    const result = calculateStars();
                    if (result.total === 0) { alert("还没有练习记录，请先完成练习哦！"); return; }

                    // 检查是否所有卡片都已尝试
                    const totalCards = CONFIG.totalSentences || document.querySelectorAll('.card[data-english]').length;
                    if (result.total < totalCards) {
                        alert('还差 ' + (totalCards - result.total) + ' 个句子未完成！请完成所有练习后再领取勋章。');
                        return;
                    }

                    // 把本次练习的观察写入 Outbox（生疏句 + 低分通过都保留）
                    try { WeakReview.finalize('claim'); } catch (e) { /* ignore */ }

                    // 尝试捕获首次快照（如果尚未捕获）
                    tryCaptureFirstTry();

                    startConfetti();
                    starDisplayEl.classList.remove('hidden');
                    if (result.stars === 6) starRatingEl.innerHTML = '<span class="moon-glow">🌙🌙🌙🌙🌙🌙</span>';
                    else starRatingEl.textContent = '⭐'.repeat(result.stars);
                    const messages = {
                        6: '🚀 超越时空的极速大师！你已经形成了英语反射弧！',
                        5: '🌟 卓越！完美表现，你是英语小天才！',
                        4: '👏 优秀！表现非常棒，继续加油！',
                        3: '💪 加油！多练几次就会更熟练！',
                        2: '👍 不错！明天再挑战一次吧！',
                        1: '🌱 好的开始！每一次练习都在进步！'
                    };
                    let hasMasteryBased = false;
                    if (result.stars === 5) {
                        for (let key in getStats()) {
                            const item = getStats()[key];
                            if (item.time > CONFIG.timeLimit && item.mastery_count >= CONFIG.masteryThreshold) { hasMasteryBased = true; break; }
                        }
                    }
                    let msg = messages[result.stars] || messages[1];
                    if (result.stars === 6) {}
                    else if (hasMasteryBased && result.stars === 5) msg = '🌟 地道发音大师！坚持打磨，发音已臻化境！';
                    medalMsgEl.textContent = msg;
                    const report = generateReport();
                    const today = new Date();
                    const dateStr = today.getFullYear() + '-' + String(today.getMonth()+1).padStart(2,'0') + '-' + String(today.getDate()).padStart(2,'0');
                    // 文件名统一为 YYYY-MM-DD_[孩子名]_[PracticeId]_勋章.txt：
                    // 生成器的成绩监控目录据此稳定追踪每一份练习反馈。
                    const safeChild = String(CONFIG.childName || '宝贝')
                        .replace(/[\\\\/:*?"<>|\\s]+/g, '_')
                        .replace(/^_+|_+$/g, '')
                        .slice(0, 20) || '宝贝';
                    const practiceId = String(CONFIG.practiceId || 'practice')
                        .replace(/[^A-Za-z0-9_-]+/g, '') || 'practice';
                    const filename = dateStr + '_' + safeChild + '_' + practiceId + '_勋章.txt';
                    const blob = new Blob([report], { type: 'text/plain;charset=utf-8' });
                    const url = URL.createObjectURL(blob);
                    const a = document.createElement('a');
                    a.href = url;
                    a.download = filename;
                    document.body.appendChild(a);
                    a.click();
                    document.body.removeChild(a);
                    URL.revokeObjectURL(url);
                    const saveHintEl = document.querySelector('.save-hint');
                    if (saveHintEl) {
                        saveHintEl.textContent = '💡 把勋章文件放进生成器设定的「成绩监控目录」，下次打开生成器点「立即扫描」即可自动追踪复习进度！';
                    }
                    showHint('💡 勋章已下载：放入「成绩监控目录」，生成器会自动追踪复习进度');
                    starDisplayEl.scrollIntoView({ behavior: 'smooth' });
                }

                function resetChallenge() {
                    // 家长锁验证
                    if (!verifyParentLock('reset')) return;

                    // 如果首次快照尚未生成，强制捕获当前不完整数据
                    if (!loadFirstTrySnapshot()) {
                        forceCapturePartialFirstTry();
                    }

                    // 增加重置计数器
                    const meta = loadMetaData();
                    meta.resetCount++;
                    meta.lastResetAt = new Date().toISOString();
                    saveMetaData(meta);

                    if (confirm('宝贝，准备好清空记录，重新冲击 6 枚月亮了吗？')) {
                        // 重置前先落盘本次观察，避免丢失生疏数据
                        try { WeakReview.finalize('reset'); } catch (e) { /* ignore */ }
                        // ① 清空内存中的 appState，防止在页面卸载前被任何异步回调（如语音 onend）重新保存旧数据
                        Object.assign(appState, getDefaultAppState());
                        // ② 取消正在播放的语音合成：先收尾会话（清掉看门狗定时器），
                        //    再 cancel()，避免延迟回调在重置后重新写回旧统计
                        if (activePlayback && !activePlayback.finished) {
                            finishPlayback(activePlayback, 'reset');
                        }
                        if ('speechSynthesis' in window) {
                            window.speechSynthesis.cancel();
                        }
                        // ③ 从 localStorage 删除持久化数据
                        localStorage.removeItem(CONFIG.practiceId);
                        // ④ 使用 replace + 时间戳参数强制无缓存刷新，绕过 BFCache（往返缓存）
                        window.location.replace(window.location.href.split('?')[0] + '?reset=' + Date.now());
                    }
                }

                function hardReset() {
                    // 强制触发家长锁验证
                    if (!verifyParentLock('hardReset')) return;

                    if (confirm('⚠️ 此操作将清除包括家长审计数据在内的所有记录！\\n确定要继续吗？此操作不可撤销！')) {
                        localStorage.removeItem(CONFIG.practiceId);
                        localStorage.removeItem(getFirstTryKey());
                        localStorage.removeItem(getMetaKey());
                        try { WeakReview.clearOutbox(); } catch (e) { /* ignore */ }
                        location.reload();
                    }
                }

                // --- Full refresh persistence: restore UI from appState ---
                function refreshPersist() {
                    const stats = getStats();

                    // 清理所有句子残留的 _revealTime（防止页面刷新后复用旧时间戳）
                    Object.keys(stats).forEach(key => {
                        if (stats[key]._revealTime !== undefined) delete stats[key]._revealTime;
                    });

                    document.querySelectorAll('.card[data-english]').forEach(card => {
                        const englishText = decodeURIComponent(card.dataset.english);
                        const statItem = stats[englishText];
                        const chineseDiv = card.querySelector('.chinese');
                        const englishDiv = card.querySelector('.english');
                        const btn = card.querySelector('.reveal-btn');
                        const energyBar = card.querySelector('.energy-bar');

                        if (!statItem) return;

                        // Reveal translation
                        if (chineseDiv) chineseDiv.classList.add('revealed');
                        // Unlock button
                        if (btn) {
                            btn.classList.remove('locked');
                            btn.disabled = false;
                        }

                        if (statItem.count > 0) {
                            // Show english text if it was visible before (count > 0 means user already saw it)
                            if (englishDiv) englishDiv.classList.add('visible');
                            // Update button text
                            if (btn) {
                                btn.textContent = '再次朗读';
                                btn.classList.add('revealed-once');
                            }
                            card.classList.add('expanded');
                            // Restore energy bar
                            if (energyBar && statItem.mastery_count > 0) {
                                updateEnergyBar(energyBar, statItem.mastery_count, card);
                            }
                        }
                    });
                }

                function initPage() {
                    // Step 1: Restore all UI state from appState
                    refreshPersist();

                    // Step 2: Wrap words for hover + click-to-pronounce
                    document.querySelectorAll('.english').forEach(el => wrapTextNodesInElement(el));

                    // Step 3: Init peer relay (stage 1) — 辨析通过后才解锁起手式
                    initPeerRelay();

                    // Step 4: Init starter layout (stage 2)
                    initStartLayout();

                    // Step 5: Init weak-sentence toolbar / manual marks
                    try { WeakReview.init(); } catch (e) { /* ignore */ }
                }

                if (document.readyState === 'loading') {
                    document.addEventListener('DOMContentLoaded', function() {
                        initPage();
                    });
                } else {
                    initPage();
                }
`;
}
