import test from 'node:test';
import assert from 'node:assert/strict';

import { WEAK_RUNTIME_SOURCE } from '../js/templates/generated-weak.js';
import { decodePack, sentenceId } from '../js/weak/weak-core.js';

/* ============================================================
 *  极简 DOM 桩：只覆盖 generated-weak.js 用到的 API
 * ============================================================ */

class FakeClassList {
    constructor() { this.set = new Set(); }
    add(name) { this.set.add(name); }
    remove(name) { this.set.delete(name); }
    contains(name) { return this.set.has(name); }
    toggle(name, force) {
        if (force === undefined) {
            if (this.set.has(name)) this.set.delete(name);
            else this.set.add(name);
        } else if (force) {
            this.set.add(name);
        } else {
            this.set.delete(name);
        }
    }
}

class FakeElement {
    constructor(tagName) {
        this.tagName = String(tagName || 'div').toUpperCase();
        this.children = [];
        this.parentNode = null;
        this.nextSibling = null;
        this.firstChild = null;
        this.dataset = {};
        this.style = {};
        this.classList = new FakeClassList();
        this.attributes = {};
        this.textContent = '';
        this.value = '';
        this.id = '';
        this.className = '';
        this.type = '';
        this.readOnly = false;
        this._listeners = {};
    }

    get className() {
        return Array.from(this.classList.set).join(' ');
    }

    set className(value) {
        this.classList.set = new Set(String(value || '').split(/\s+/).filter(Boolean));
    }

    appendChild(child) {
        child.parentNode = this;
        this.children.push(child);
        this._sync();
        return child;
    }

    insertBefore(child, reference) {
        child.parentNode = this;
        const index = this.children.indexOf(reference);
        if (index >= 0) this.children.splice(index, 0, child);
        else this.children.push(child);
        this._sync();
        return child;
    }

    removeChild(child) {
        const index = this.children.indexOf(child);
        if (index >= 0) this.children.splice(index, 1);
        child.parentNode = null;
        this._sync();
        return child;
    }

    remove() {
        if (this.parentNode) this.parentNode.removeChild(this);
    }

    _sync() {
        this.firstChild = this.children[0] || null;
        for (let i = 0; i < this.children.length; i++) {
            this.children[i].nextSibling = this.children[i + 1] || null;
        }
    }

    setAttribute(name, value) { this.attributes[name] = String(value); }
    getAttribute(name) { return this.attributes[name]; }
    addEventListener(type, handler) {
        (this._listeners[type] = this._listeners[type] || []).push(handler);
    }
    dispatch(type) {
        const event = {
            target: this,
            preventDefault() {},
            stopPropagation() {}
        };
        (this._listeners[type] || []).forEach(handler => handler(event));
    }
    closest(selector) {
        if (selector !== '.card') return null;
        let node = this;
        while (node) {
            if (node._isCard) return node;
            node = node.parentNode;
        }
        return null;
    }
    querySelector(selector) {
        if (selector.charAt(0) !== '.') return null;
        return this._findByClass(selector.slice(1));
    }
    _findByClass(name) {
        for (const child of this.children) {
            if (String(child.className || '').split(/\s+/).includes(name)) return child;
            const nested = child._findByClass(name);
            if (nested) return nested;
        }
        return null;
    }
    focus() {}
    select() {}
    click() { this.dispatch('click'); }
    scrollIntoView() { this.scrolled = true; }
}

function createEnvironment(options) {
    const config = options || {};
    const store = new Map();
    const localStorage = {
        getItem(key) { return store.has(key) ? store.get(key) : null; },
        setItem(key, value) { store.set(key, String(value)); },
        removeItem(key) { store.delete(key); }
    };

    const created = [];
    const body = new FakeElement('body');
    const controls = new FakeElement('div');
    controls.className = 'controls';
    body.appendChild(controls);

    const chinese = new FakeElement('div');
    chinese.className = 'chinese';
    chinese.textContent = '我已经完成作业了。';
    const energy = new FakeElement('div');
    energy.className = 'energy-bar';

    const card = new FakeElement('div');
    card.className = 'card';
    card._isCard = true;
    card.dataset.cardIndex = '0';
    card.dataset.english = encodeURIComponent('I have already finished my homework.');
    card.dataset.zh = encodeURIComponent('我已经完成作业了。');
    card.appendChild(chinese);
    card.appendChild(energy);
    body.appendChild(card);

    const cards = [card];
    if (config.trap) {
        const trapChinese = new FakeElement('div');
        trapChinese.className = 'chinese';
        trapChinese.textContent = '我去过学校。';
        const trapEnergy = new FakeElement('div');
        trapEnergy.className = 'energy-bar';

        const trapCard = new FakeElement('div');
        trapCard.className = 'card';
        trapCard._isCard = true;
        trapCard.dataset.cardIndex = '1';
        trapCard.dataset.english = encodeURIComponent('I have went to school.');
        trapCard.dataset.zh = encodeURIComponent('我去过学校。');
        trapCard.appendChild(trapChinese);
        trapCard.appendChild(trapEnergy);
        body.appendChild(trapCard);
        cards.push(trapCard);
    }

    // 生成页模板中的「家长审计区」：默认收起，孩子端不可见
    const zone = new FakeElement('div');
    zone.id = 'parent-zone';
    zone.className = 'parent-zone';

    const zoneToggle = new FakeElement('button');
    zoneToggle.type = 'button';
    zoneToggle.id = 'parent-zone-toggle';
    zoneToggle.className = 'parent-zone-toggle';
    zoneToggle.setAttribute('aria-expanded', 'false');

    const zoneBody = new FakeElement('div');
    zoneBody.id = 'parent-zone-body';
    zoneBody.className = 'parent-zone-body hidden';

    const markList = new FakeElement('div');
    markList.id = 'weak-mark-list';
    markList.className = 'weak-mark-list';

    const copyBtn = new FakeElement('button');
    copyBtn.id = 'weak-copy-btn';
    const saveBtn = new FakeElement('button');
    saveBtn.id = 'weak-save-btn';
    const returnBtn = new FakeElement('button');
    returnBtn.id = 'weak-return-btn';

    zoneBody.appendChild(markList);
    zone.appendChild(zoneToggle);
    zone.appendChild(zoneBody);
    body.appendChild(zone);
    created.push(zone, zoneToggle, zoneBody, markList, copyBtn, saveBtn, returnBtn);

    const document = {
        body,
        createElement(tagName) {
            const el = new FakeElement(tagName);
            created.push(el);
            return el;
        },
        getElementById(id) {
            return created.find(el => el.id === id) || null;
        },
        querySelector(selector) {
            if (selector === '.controls') return controls;
            return null;
        },
        querySelectorAll(selector) {
            if (selector === '.card[data-english]') return cards.slice();
            return [];
        },
        addEventListener() {},
        execCommand() { return true; }
    };

    const stats = {};
    const traps = {};
    const hints = [];
    const opened = [];
    let copied = '';

    const CONFIG = {
        childName: '宝贝',
        practiceId: 'STATS_TEST',
        replayLimit: 3,
        timeLimit: 15,
        masteryThreshold: 3,
        weakThreshold: 40,
        fastThreshold: 22,
        trapData: config.trap
            ? [{ index: 1, english: 'I have went to school.', correct: 'I have gone to school.' }]
            : [],
        generatorUrl: 'http://localhost:8000/index.html'
    };

    const window = {
        open(url) { opened.push(url); return {}; }
    };
    const navigator = {
        clipboard: {
            writeText(text) { copied = text; return Promise.resolve(); }
        }
    };

    const factory = new Function(
        'CONFIG', 'getStats', 'getTrapState', 'showHint',
        'document', 'window', 'localStorage', 'navigator',
        'Blob', 'URL', 'TextEncoder', 'TextDecoder', 'btoa', 'atob',
        WEAK_RUNTIME_SOURCE
    );
    factory(
        CONFIG,
        () => stats,
        cardIndex => traps[cardIndex],
        message => hints.push(message),
        document,
        window,
        localStorage,
        navigator,
        Blob,
        URL,
        TextEncoder,
        TextDecoder,
        btoa,
        atob
    );

    return {
        CONFIG, card, stats, traps, hints, opened, document, created,
        get copied() { return copied; },
        WeakReview: window.WeakReview,
        localStorage
    };
}

const EN = 'I have already finished my homework.';
const ID = sentenceId(EN);

/* ============================================================
 *  运行时行为
 * ============================================================ */

test('运行时：初始化只暴露 WeakReview，孩子端卡片无任何标记控件', () => {
    const env = createEnvironment();
    assert.equal(typeof env.WeakReview, 'object');
    assert.equal(typeof env.WeakReview.init, 'function');

    env.WeakReview.init();

    assert.equal(env.card.querySelector('.weak-toggle'), null);
    assert.equal(env.card.querySelector('.weak-dot'), null, '卡片正面不得出现复习标记');

    const outbox = env.WeakReview.getOutbox();
    assert.equal(outbox.practiceId, 'STATS_TEST');
    assert.equal(Object.keys(outbox.entries).length, 0);
    assert.ok(env.hints.length === 0);

    // 家长审计区默认收起，点开后才露出结算清单
    const panel = env.document.getElementById('parent-zone-body');
    const toggle = env.document.getElementById('parent-zone-toggle');
    assert.ok(panel.classList.contains('hidden'));
    assert.equal(toggle.getAttribute('aria-expanded'), 'false');

    env.WeakReview.toggleParentZone();
    assert.ok(!panel.classList.contains('hidden'));
    assert.equal(toggle.getAttribute('aria-expanded'), 'true');
    assert.equal(env.document.getElementById('weak-mark-list').children.length, 1);

    env.WeakReview.toggleParentZone();
    assert.ok(panel.classList.contains('hidden'));
});

test('运行时：结算写入 Outbox，包含生疏句与低分通过', () => {
    const env = createEnvironment();
    env.WeakReview.init();

    env.stats[EN] = { time: 20, replay: 2, mastery_count: 1, count: 1 };

    const changed = env.WeakReview.finalize('claim');
    assert.equal(changed, 1);

    const outbox = env.WeakReview.getOutbox();
    const entry = outbox.entries[ID];
    assert.ok(entry);
    assert.equal(entry.en, EN);
    assert.equal(entry.zh, '我已经完成作业了。');
    assert.equal(entry.sig.time, 20);
    assert.equal(entry.sig.replay, 2);
    assert.equal(entry.score, 46);
    assert.equal(entry.weak, true);
    assert.equal(entry.attempted, true);
    assert.equal(entry.manualWeak, false);

    const row = env.document.getElementById('weak-mark-list').children[0];
    assert.ok(row);
    assert.equal(row.querySelector('.weak-mark-en').textContent, EN);
    assert.match(row.querySelector('.weak-mark-meta').textContent, /思考20秒/);
    assert.match(row.querySelector('.weak-mark-meta').textContent, /生疏分 46/);
    const dot = row.querySelector('.weak-dot');
    assert.ok(dot);
    assert.ok(!dot.classList.contains('on'));
    assert.equal(dot.getAttribute('aria-label'), '加入明日复习清单');
});

test('运行时：结算清单手动打标/取消，报告与错题包同步', async () => {
    const env = createEnvironment();
    env.WeakReview.init();
    env.stats[EN] = { time: 20, replay: 2, mastery_count: 1, count: 1 };
    env.WeakReview.finalize('claim');

    env.WeakReview.toggleEntryWeak(ID);
    let dot = env.document.getElementById('weak-mark-list').children[0].querySelector('.weak-dot');
    assert.ok(dot.classList.contains('on'));
    assert.equal(dot.getAttribute('aria-pressed'), 'true');
    assert.equal(env.WeakReview.getOutbox().entries[ID].manualWeak, true);

    const report = env.WeakReview.reportSection();
    assert.match(report, /\[手动\]/);
    assert.match(report, new RegExp(EN.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')));

    await env.WeakReview.copyPack();
    await new Promise(resolve => setTimeout(resolve, 0));
    assert.ok(env.copied.length > 0);
    const pack = decodePack(env.copied);
    assert.equal(pack.entries[ID].manualWeak, true);
    assert.equal(pack.entries[ID].sig.time, 20);

    const block = env.WeakReview.packBlock();
    assert.match(block, /--- WEAK-PACK v1 ---/);
    assert.match(block, /--- END WEAK-PACK ---/);

    env.WeakReview.toggleEntryWeak(ID);
    dot = env.document.getElementById('weak-mark-list').children[0].querySelector('.weak-dot');
    assert.ok(!dot.classList.contains('on'));
    assert.equal(env.WeakReview.getOutbox().entries[ID].manualWeak, false);
    const after = decodePack(await (async () => {
        await env.WeakReview.copyPack();
        await new Promise(resolve => setTimeout(resolve, 0));
        return env.copied;
    })());
    assert.equal(after.entries[ID].manualWeak, false);
});

test('运行时：回传生成器携带 #weak= 且可解码', () => {
    const env = createEnvironment();
    env.WeakReview.init();
    env.stats[EN] = { time: 20, replay: 2, mastery_count: 1, count: 1 };
    env.WeakReview.finalize('claim');

    env.WeakReview.returnToGenerator();
    assert.equal(env.opened.length, 1);
    assert.ok(env.opened[0].startsWith('http://localhost:8000/index.html#weak='));

    const payload = env.opened[0].split('#weak=')[1];
    const pack = decodePack(payload);
    assert.equal(pack.entries[ID].en, EN);
});

test('运行时：清理 Outbox 后不残留条目', () => {
    const env = createEnvironment();
    env.WeakReview.init();
    env.stats[EN] = { time: 20, replay: 2, mastery_count: 1, count: 1 };
    env.WeakReview.finalize('claim');
    assert.ok(env.localStorage.getItem('WEAK_OUTBOX_STATS_TEST'));

    env.WeakReview.clearOutbox();
    assert.equal(env.localStorage.getItem('WEAK_OUTBOX_STATS_TEST'), null);
    assert.equal(Object.keys(env.WeakReview.getOutbox().entries).length, 0);
});

test('运行时：未练习也能回传“解除标记”', async () => {
    const env = createEnvironment();
    env.WeakReview.init();

    env.WeakReview.toggleEntryWeak(ID);
    env.WeakReview.toggleEntryWeak(ID);

    const entry = env.WeakReview.getOutbox().entries[ID];
    assert.ok(entry);
    assert.equal(entry.attempted, false);
    assert.equal(entry.manualWeak, false);
    assert.ok(entry.manualAt);

    await env.WeakReview.copyPack();
    await new Promise(resolve => setTimeout(resolve, 0));
    const pack = decodePack(env.copied);
    assert.ok(pack.entries[ID]);
    assert.equal(pack.entries[ID].manualWeak, false);
    assert.ok(pack.entries[ID].manualAt);
});

test('运行时：陷阱统计跨错误键/正确键合并', () => {
    const env = createEnvironment({ trap: true });
    env.WeakReview.init();

    const wrong = 'I have went to school.';
    const right = 'I have gone to school.';
    env.stats[wrong] = { time: 12, replay: 1, mastery_count: 0, count: 1 };
    env.stats[right] = { time: 8, replay: 2, mastery_count: 2, count: 1 };
    env.traps[1] = { isCaught: true, autoRevealed: false, wrongReadCount: 1 };

    env.WeakReview.finalize('claim');

    const entry = env.WeakReview.getOutbox().entries[sentenceId(right)];
    assert.ok(entry);
    assert.equal(entry.en, right);
    assert.equal(entry.sig.time, 12);
    assert.equal(entry.sig.replay, 3);
    assert.equal(entry.sig.mastery, 2);
    assert.equal(entry.sig.count, 2);
    assert.equal(entry.sig.isTrap, true);
    assert.equal(entry.sig.trapCaught, true);
});

test('运行时：不动态创建顶部错题本按钮，标记只在家长清单内', () => {
    const env = createEnvironment();
    env.WeakReview.init();

    assert.equal(env.created.filter(el => el.id === 'weak-panel').length, 0);
    assert.equal(env.created.filter(el => el.id === 'weak-count-btn').length, 0);

    const list = env.document.getElementById('weak-mark-list');
    assert.equal(list.children.length, 1);
    const dot = list.children[0].querySelector('.weak-dot');
    assert.ok(dot);
    assert.equal(dot.textContent, '', '标记控件应为无文字的圆点');

    env.stats[EN] = { time: 20, replay: 2, mastery_count: 1, count: 1 };
    env.WeakReview.finalize('claim');
    assert.match(list.children[0].querySelector('.weak-mark-meta').textContent, /生疏分 46/);
});
