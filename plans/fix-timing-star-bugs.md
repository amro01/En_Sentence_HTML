# 计时与评星漏洞修复方案

## 1. 根因分析 (Root Cause Analysis)

### Bug A: 共享的 `sessionStartTime` 全局变量导致计时串扰

**文件**: [`js/templates/generated-js.js`](js/templates/generated-js.js:68)

```js
let sessionStartTime = null;   // 行 68 — 单一全局变量
```

```js
// 行 596 — 在 revealChinese 中设置
sessionStartTime = Date.now();
```

```js
// 行 634 — 在 handleRevealBtn 中使用
const duration = Math.floor((Date.now() - (sessionStartTime || Date.now())) / 1000);
```

**问题**: `sessionStartTime` 是一个**全局变量，所有卡片共用**。当用户依次点击多个卡片的中文时，后一个卡片的中文点击会**覆盖**前一个卡片的 `sessionStartTime`。

**攻击路径示例**（2个句子）:
1. 点击卡片 0 的中文 → `sessionStartTime = T0`
2. 点击卡片 1 的中文 → `sessionStartTime = T1` ⚠️ 覆盖了 T0！
3. 点击卡片 0 的按钮 → `duration = 现在 - T1` ❌ 应该用 T0，但用了 T1！
4. 卡片 0 的 `time` 被错误记录为很短的时间

### Bug B: `sessionStartTime || Date.now()` 空值回退产生零时长

**文件**: [`js/templates/generated-js.js`](js/templates/generated-js.js:634)

```js
const duration = Math.floor((Date.now() - (sessionStartTime || Date.now())) / 1000);
```

如果 `sessionStartTime` 为 `null`（页面刷新后恢复状态时），`sessionStartTime || Date.now()` 返回 `Date.now()`，导致 `Date.now() - Date.now() = 0`，duration 为 0。

### Bug C: 0 秒时间结合平均值产生 15.0 秒假象

假设场景（2个句子，阈值 15 秒）:
| 句子 | 实际思考 | 记录的 time | 是否达标 |
|------|---------|------------|---------|
| A | 30秒（真实等待） | 30 | ❌ 30 > 15 |
| B | 5秒（正常） | 0（Bug B导致） | ✅ 0 ≤ 15 |

- `avgThinkTime = (30 + 0) / 2 = 15.0` ← **用户看到的 15.0 秒！**
- 句子 B 的 `time=0` 使 `0 <= CONFIG.timeLimit(15)` 成立，被判为"完美"
- 如果句子 A 通过 `mastery_count >= 3`（打磨3次）也被判为"完美"
- 则 `perfect === total`，且如果 `allReplayZero` → **错误获得 5 星**

---

## 2. 修复方案

### 修复 1: 每句独立绝对时间戳（替代共享 sessionStartTime）

**改动**: 在 `revealChinese()` 中，将 `_revealTime` 存储在 stats 对象**每个句子的独立字段**中：

```js
// revealChinese() 中
if (!stats[englishText]) {
    stats[englishText] = { replay: 0, time: 0, count: 0, mastery_count: 0 };
}
stats[englishText]._revealTime = Date.now(); // 每个句子独立的时间戳
sessionStartTime = Date.now(); // 保留向后兼容
saveAppState();
```

**改动**: 在 `handleRevealBtn()` 中，优先使用 `_revealTime`：

```js
const revealStart = stats[englishText]._revealTime || sessionStartTime || Date.now();
const duration = Math.floor((Date.now() - revealStart) / 1000);
// 硬上限 300 秒（防止长时间挂机数据污染），但绝对不能使用 CONFIG.timeThreshold
const HARD_CAP = 300;
const cappedDuration = Math.min(duration, HARD_CAP);
stats[englishText].time = Math.max(stats[englishText].time, cappedDuration);
// 使用后立即清理，防止页面刷新后复用旧时间戳
delete stats[englishText]._revealTime;
```

**改动**: 在 `refreshPersist()` 中，清理所有 `_revealTime`：

```js
// 在 refreshPersist 开头
Object.keys(stats).forEach(key => {
    if (stats[key]._revealTime !== undefined) delete stats[key]._revealTime;
});
```

### 修复 2: 修正评星边界判定

**当前代码**:
```js
if (item.time <= CONFIG.timeLimit || item.mastery_count >= CONFIG.masteryThreshold) {
```

改为更严格的**显式判定**，防止任何边界混淆：
```js
const timeOK = item.time <= CONFIG.timeLimit;
const masteryOK = item.mastery_count >= CONFIG.masteryThreshold;
if (timeOK || masteryOK) {
    perfect++;
    masteredList.push(key);
}
```

**同时修正 5 星逻辑**：5 星要求所有句子同时满足 `time <= threshold`（时间达标）且 `replay === 0`（零重听），不允许用打磨次数替代时间达标。

### 修复 3: `refreshPersist()` 中清理 _revealTime

确保 `_revealTime` 不会在页面刷新后残留造成错误。

---

## 3. 修改文件

仅需修改 [`js/templates/generated-js.js`](js/templates/generated-js.js)。

| 位置 | 变更 |
|------|------|
| `revealChinese()` (行 585) | 添加 `stats[englishText]._revealTime = Date.now()` |
| `handleRevealBtn()` (行 620) | 改用 `_revealTime` 优先、硬上限 300 秒、使用后 `delete` |
| `refreshPersist()` | 清理所有 `_revealTime` |
| `calculateStars()` (行 847) | 保留现有逻辑（已正确使用 `time <= CONFIG.timeLimit`） |

