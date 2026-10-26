# Git 冲突解决计划: `js/templates/generated-js.js`

## 概述

当前文件 `js/templates/generated-js.js` 存在 **4 个 Git 冲突区域**。本地分支（HEAD）新增了"防刷分"功能，远程分支（Incoming）对多个函数做了重构。

**合并原则：**
1. ✅ **保留本地**：`calculateStars()` 和 `generateReport()` 中的"防刷分"检测逻辑（不在冲突区内，天然保留）
2. ✅ **采用远程**：所有非"防刷分"的冲突区域，使用远程分支的最新代码

---

## 冲突区域详解

### 冲突 1：`updateCardUI` 函数签名（第 279-288 行）

| 版本 | 代码 | 说明 |
|------|------|------|
| **HEAD** | `function updateCardUI(cardIndex) { const card = getCardByIndex(cardIndex);` | 只接受索引，使用 `getCardByIndex()` 查询 DOM |
| **Remote** | `function updateCardUI(cardOrIndex) { const card = (typeof cardOrIndex === 'number') ? cards[cardOrIndex] : cardOrIndex;` | 接受索引或元素，使用 `cards[]` 数组 |

**调用分析：**
- 第 553 行：`updateCardUI(cardElement);` — 传的是 DOM 元素
- 第 584 行：`updateCardUI(card);` — 传的是 DOM 元素
- 第 954 行：`updateCardUI(card);` — 传的是 DOM 元素

**方案：采用远程** ✅ 远程版本同时支持元素和索引参数，与实际调用方式一致。

---

### 冲突 2：`computeDiff` + `updateDetectiveVisual` 函数（第 406-495 行）

这是一个大面积重写区域，两个函数被完全替换。

#### `computeDiff` 差异算法

| 版本 | 比较方式 | 生成的 CSS 类 | CSS 兼容性 |
|------|---------|--------------|-----------|
| **HEAD** | 大小写不敏感 `.toLowerCase()` | `<span class="diff-ins">` / `<span class="diff-del">` | ✅ 完全匹配 CSS |
| **Remote** | 大小写敏感 `===` | `<span class="correct-word">` / `<span class="wrong-word">` | ❌ CSS 中无此样式 |

#### `updateDetectiveVisual`

| 版本 | 签名 | 调用方式 |
|------|------|---------|
| **HEAD** | `updateDetectiveVisual(cardIndex)` | 传索引 |
| **Remote** | `updateDetectiveVisual(cardElement)` | 传元素（第 557、571、955 行一致） |

**方案：采用远程，但修正 CSS 类名** ⚠️

远程的 `computeDiff` 生成了 CSS 中不存在样式的类名 `wrong-word`/`correct-word`。需要将远程 `computeDiff` 的输出类名改为与 CSS 匹配的 `diff-del`/`diff-ins`，同时保留远程函数的其他逻辑（大小写敏感比较、简单的回溯算法）。

**具体修正：**
```diff
- case 'del':  return '<span class="wrong-word">' + op.word + '</span>';
- case 'ins':  return '<span class="correct-word">' + op.word + '</span>';
+ case 'del':  return '<span class="diff-del">' + op.word + '</span>';
+ case 'ins':  return '<span class="diff-ins">' + op.word + '</span>';
```

> **为什么不是完全照搬远程？** 因为 CSS 文件（`generated-css.js`）定义了 `.diff-del` 和 `.diff-ins` 样式，但没有定义 `.wrong-word`/`.correct-word`。若不修正，陷阱揭示后的差异文本将丢失红蓝高亮，影响功能可用性。这是一种"兼容性修正"而非"保留本地逻辑"。

---

### 冲突 3：`autoRevealTrap` 卡片查找（第 943-947 行）

| 版本 | 代码 |
|------|------|
| **HEAD** | `const card = getCardByIndex(cardIndex);` |
| **Remote** | `const card = document.querySelector('.card[data-card-index="' + cardIndex + '"]');` |

**方案：采用远程** ✅ 两者功能等价，远程版本更显式。

---

### 冲突 4：`resetChallenge` 清理逻辑（第 1200-1210 行）

| 版本 | 行为 |
|------|------|
| **HEAD** | 仅注释：`// 只清除练习数据，保留 FIRST_TRY_KEY 和 META_KEY` |
| **Remote** | 1. 清空内存 `appState` 2. 取消语音合成 3. 删除 localStorage |

**方案：采用远程** ✅ 远程版本更健壮，能防止异步回调重新写入旧数据。

---

## "防刷分"功能确认（自动保留）

以下"防刷分"相关代码位于**非冲突区域**，将自动保留：

1. **第 992-996 行**（`calculateStars`）：检测思考时间 < 0.5 秒的异常句子
   ```javascript
   if (item.time < 0.5 && item.time > 0) {
       hasSpeedrunFlag = true;
       speedrunSentences.push(key + ' (' + item.time + '秒)');
   }
   ```

2. **第 1000-1008 行**（`calculateStars`）：6月亮条件中的最小思考时间要求（≥1秒）
   ```javascript
   if (stats[key].time < 1.0 && stats[key].time > 0) {
       sixMoonQualified = false;
       break;
   }
   ```

3. **第 1025 行**（`calculateStars` 返回值）：包含 `hasSpeedrunFlag` 和 `speedrunSentences`

4. **第 1062-1066 行**（`generateReport`）：异常检测报告
   ```javascript
   if (result.hasSpeedrunFlag) {
       report += '⚠️ 异常检测：以下句子思考时间 < 0.5秒，存在快速跳过嫌疑：\\n';
       ...
   }
   ```

---

## 执行步骤

1. **切换至 Code 模式**，读取 `js/templates/generated-js.js`
2. **按顺序解决 4 个冲突**：
   - 冲突 1（第 279-288 行）：取远程版本
   - 冲突 2（第 406-495 行）：取远程版本，**修正 CSS 类名**（`wrong-word`→`diff-del`，`correct-word`→`diff-ins`）
   - 冲突 3（第 943-947 行）：取远程版本
   - 冲突 4（第 1200-1210 行）：取远程版本
3. **删除所有 Git 冲突标记**（`<<<<<<<`、`=======`、`>>>>>>>`）
4. **验证**：确保无语法错误，防刷分逻辑完整保留
5. **提交**：`git add` + `git commit` 完成合并
