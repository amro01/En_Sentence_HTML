# 🐞 Bug 3 修复方案：放大镜图标错位问题

## 根因分析

### 问题描述

点击句子 A 的放大镜后，句子 B（或其他句子）的放大镜意外消失。这是因为查找 DOM 节点时使用了**位置索引与 `data-card-index` 属性之间的错位**。

### 核心漏洞：索引错位（Index Mismatch）

**关键函数**：[`updateDetectiveVisual(cardIndex)`](js/templates/generated-js.js:300)

```javascript
function updateDetectiveVisual(cardIndex) {
    const card = cards[cardIndex];  // ← BUG：cards 是 NodeList 位置索引
    // cards = document.querySelectorAll('.card') — 按 DOM 位置排列
}
```

这里 `cards` 数组（`document.querySelectorAll('.card')`）是**按 DOM 位置索引**的 NodeList，而 `cardIndex` 参数来自 `data-card-index` 属性——**两者在特定条件下不一致**。

### 何时触发错位？

当存在**说明框（explanation item）**时。在 [`main.js:generatePage()`](js/main.js:200-254) 中：

```javascript
cards.forEach((card, index) => {          // index 基于 .card-item 遍历
    if (card.classList.contains('explanation-item')) {
        // 说明框不生成 .card 元素 ← 跳过了！
    } else {
        cardsHTML += `<div class="card" ... data-card-index="${index}" ...>`;
    }
});
```

`data-card-index` 基于 `.card-item` 的索引（包含说明框），而生成的 `.card` 元素**跳过了说明框**，导致 DOM 中的 `cards` NodeList 位置索引与 `data-card-index` 值不一致。

### 具体示例

假设卡片项为：`[0: 普通句, 1: 说明框, 2: 陷阱句, 3: 普通句]`

| 卡片 | `data-card-index` | `cards` NodeList 中的位置 | `cards[data-card-index]` 实际指向 |
|------|-------------------|--------------------------|-----------------------------------|
| 普通句 A | 0 | 0 (cards[0]) | ✅ 普通句 A（正确） |
| 陷阱句 B | 2 | 1 (cards[1]) | ❌ **普通句 C**（错位！） |
| 普通句 C | 3 | 2 (cards[2]) | ❌ **undefined** |

点击陷阱句 B 的放大镜 → `reportTrap` 获得 `cardIndex=2` → `updateDetectiveVisual(2)` → `cards[2]` 返回的是**普通句 C** → 普通句 C 的放大镜被移除！

这就是"句子的放大镜消失到了错误句子"的原因。

### 受影响的所有代码位置

文件：[`js/templates/generated-js.js`](js/templates/generated-js.js)

| 位置 | 函数 | 问题 |
|------|------|------|
| 第 301 行 | `updateDetectiveVisual(cardIndex)` | `cards[cardIndex]` 使用 NodeList 位置索引 |
| 第 365、379 行 | `reportTrap()` 中调用 | 传入 `cardIndex`（data-card-index） |
| 第 737 行 | `autoRevealTrap(cardIndex)` | `cards[cardIndex]` 同样错位 |
| 第 744-745 行 | `autoRevealTrap()` 中调用 | 传入 `cardIndex` 给 `updateCardUI` 和 `updateDetectiveVisual` |
| 第 988 行 | `refreshPersist()` 中调用 | 传入 `ci` 而非直接传 `card` 元素 |
| 第 393 行 | `initDetectiveMode()` 中调用 | `updateCardUI(ci)` 传入索引而非元素 |
| 第 138-139 行 | `updateCardUI(cardOrIndex)` | 数字分支 `cards[cardOrIndex]` 同样有潜在错位 |

## 修复方案

### 原则

原有的 `updateCardUI` 已经支持**直接传入 card 元素**（元素路径），这个路径是安全的。修复方案遵循同一模式：**所有函数改为接收 card 元素而非数字索引**。

### 具体修改

#### 修改 1：重构 `updateDetectiveVisual`（第 300-310 行）

**改前**：接受 `cardIndex`（数字），通过 `cards[cardIndex]` 查找元素
**改后**：接受 `cardElement`（元素），直接操作传入的元素

```javascript
// 改前
function updateDetectiveVisual(cardIndex) {
    const card = cards[cardIndex];
    if (!card) return;
    const englishDiv = card.querySelector('.english');
    ...
}

// 改后
function updateDetectiveVisual(cardElement) {
    if (!cardElement) return;
    const englishDiv = cardElement.querySelector('.english');
    ...
}
```

#### 修改 2：更新 `reportTrap` 中的调用（第 365、379 行）

`reportTrap` 中已有 `cardElement` 参数（就是被点击的卡片元素），直接传入即可。

```javascript
// 改前
updateDetectiveVisual(cardIndex);

// 改后
updateDetectiveVisual(cardElement);
```

#### 修改 3：重构 `autoRevealTrap`（第 733-753 行）

**改前**：接受 `cardIndex`，通过 `cards[cardIndex]` 获取卡片
**改后**：通过 `document.querySelector` 按 `data-card-index` 查找卡片，然后将元素传给子函数

```javascript
// 改前
function autoRevealTrap(cardIndex) {
    const card = cards[cardIndex];
    ...
    updateCardUI(cardIndex);
    updateDetectiveVisual(cardIndex);
}

// 改后
function autoRevealTrap(cardIndex) {
    const card = document.querySelector(`.card[data-card-index="${cardIndex}"]`);
    if (!card) return;
    ...
    updateCardUI(card);
    updateDetectiveVisual(card);
}
```

#### 修改 4：更新 `refreshPersist` 中的调用（第 987-989 行）

`refreshPersist` 中本来就在 `cards.forEach(card => ...)` 循环中，`card` 元素可直接使用。

```javascript
// 改前
if (trapState && trapState.isSearched) {
    updateDetectiveVisual(ci);
}

// 改后
if (trapState && trapState.isSearched) {
    updateDetectiveVisual(card);
}
```

#### 修改 5：更新 `initDetectiveMode` 中的调用（第 391-394 行）

同样在 `forEach(card => ...)` 循环中，直接传 `card` 元素。

```javascript
// 改前
document.querySelectorAll('.card[data-trap="true"]').forEach(card => {
    const ci = parseInt(card.dataset.cardIndex);
    if (!isNaN(ci)) updateCardUI(ci);
});

// 改后
document.querySelectorAll('.card[data-trap="true"]').forEach(card => {
    updateCardUI(card);
});
```

### 修改汇总

| 文件位置 | 修改内容 |
|---------|---------|
| `generated-js.js:300-310` | `updateDetectiveVisual(cardIndex)` → `updateDetectiveVisual(cardElement)` |
| `generated-js.js:365` | `updateDetectiveVisual(cardIndex)` → `updateDetectiveVisual(cardElement)` |
| `generated-js.js:379` | `updateDetectiveVisual(cardIndex)` → `updateDetectiveVisual(cardElement)` |
| `generated-js.js:733-753` | `autoRevealTrap` 改用 `document.querySelector` 查找卡片 + 传元素 |
| `generated-js.js:987-989` | `updateDetectiveVisual(ci)` → `updateDetectiveVisual(card)` |
| `generated-js.js:391-394` | `updateCardUI(ci)` → `updateCardUI(card)` |

### 额外说明

- **没有选择器范围（Scope）问题**：代码中没有使用 `document.querySelector` 全局选择器去移除放大镜，问题纯粹是索引错位。
- 修复后，所有放大镜的隐藏操作都基于**被点击卡片的实际 DOM 元素引用**，不再依赖易错的位置索引，消除错位可能。
- 该修复兼容各种场景：有/无说明框、有/无排序调整。
