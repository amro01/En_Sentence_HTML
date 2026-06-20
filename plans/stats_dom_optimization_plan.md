# Optimization Plan: Refactor Stats Timestamp & Cache DOM Queries

## Overview

Two optimization tasks for [`script.js`](script.js):
1. **Refactor Stats temporary timestamp** — Move `start` out of `stats` into a separate variable, remove all `if (key === 'start') continue;` filters.
2. **Cache repeated DOM queries** — Reduce redundant `document.querySelectorAll()` / `getElementById()` calls.

---

## Task 1: Refactor Stats Temporary Timestamp

### Current Problem

The field `start` is mixed into the `stats` object (which stores per-sentence practice data), creating data pollution. Every function that iterates `stats` must explicitly filter out `'start'`, which is error-prone and ugly.

**Where `start` is written:**
- [`revealChinese()`](script.js:835) — `stats[englishText].start = Date.now();`

**Where `start` is read:**
- [`handleRevealBtn()`](script.js:873) — `(stats[englishText]?.start || Date.now())` to calculate duration.

**Where `start` is filtered out:**
- [`calculateStars()`](script.js:1011) — `if (key === 'start') continue;`
- [`calculateStars()`](script.js:1028) — `Object.keys(stats).filter(k => k !== 'start').length`
- [`generateReport()`](script.js:1081) — `if (key === 'start') continue;`
- [`claimReward()`](script.js:1122) — `if (key === 'start') continue;`

### Proposed Solution

Introduce a module-level variable `let sessionStartTime = null;` in the generated template, alongside `const appState = loadAppState();`. This variable holds the timestamp of when the user last revealed a sentence.

**Changes (all within the generated page template, lines ~390–1270):**

| Location | Current Code | New Code |
|---|---|---|
| After [`const appState = loadAppState();`](script.js:440) | *(nothing)* | Add `let sessionStartTime = null;` |
| [`revealChinese()`](script.js:835) | `stats[englishText].start = Date.now();` | `sessionStartTime = Date.now();` |
| [`handleRevealBtn()`](script.js:873) | `(stats[englishText]?.start \|\| Date.now())` | `(sessionStartTime \|\| Date.now())` |
| [`calculateStars()`](script.js:1010-1011) | `for (let key in stats) { if (key === 'start') continue;` | `for (let key in stats) {` |
| [`calculateStars()`](script.js:1028) | `Object.keys(stats).filter(k => k !== 'start').length` | `Object.keys(stats).length` |
| [`generateReport()`](script.js:1080-1081) | `for (let key in getStats()) { if (key === 'start') continue;` | `for (let key in getStats()) {` |
| [`claimReward()`](script.js:1121-1122) | `for (let key in getStats()) { if (key === 'start') continue;` | `for (let key in getStats()) {` |
| Comment at [line 434](script.js:434) | `{ replay, time, count, mastery_count, start }` | `{ replay, time, count, mastery_count }` |

### Why This Is Safe

- `sessionStartTime` is only used to measure the time between "revealing Chinese" and "first showing English" for a single sentence session.
- If `sessionStartTime` is `null` (never set), the fallback `Date.now()` on [line 873](script.js:873) still works.
- Removing `start` from `stats` means no `localStorage` data migration is needed — old saved data with `start` will simply have an ignored key when iterated, and `start` will naturally not be written anymore going forward.

---

## Task 2: Cache Repeated DOM Queries

### Current Problem

Within the generated template, `document.querySelectorAll('.card')` is called **6 times** across different functions. Other DOM elements are queried repeatedly too.

**Frequency of `document.querySelectorAll('.card')`:**

| Function | Line | Calls on load? |
|---|---|---|
| `updateCardUI()` | [504](script.js:504) | Yes (called from `initPage` → `refreshPersist`) |
| `updateDetectiveVisual()` | [643](script.js:643) | Yes (called from `initDetectiveMode`) |
| `initDetectiveMode()` | [738](script.js:738) | Yes (called from `initPage`) |
| `autoRevealTrap()` | [980](script.js:980) | No (triggered on 2nd wrong read) |
| `refreshPersist()` | [1173](script.js:1173) | Yes (called from `initPage`) |
| `initPage()` | [1246](script.js:1246) | Yes (called on DOMContentLoaded) |

**Other repeated queries:**
- `document.getElementById('chance-icons')` — [`updateChanceDisplay()`](script.js:535), called from multiple places
- `document.getElementById('star-display')` — [`claimReward()`](script.js:1103,1161)
- `document.getElementById('star-rating')` — [`claimReward()`](script.js:1104)

### Proposed Solution

#### 2a. Cache all `.card` elements at module scope

After line 440 (`const appState = loadAppState();`), add:

```javascript
const cards = document.querySelectorAll('.card');
```

Then replace all 6 `document.querySelectorAll('.card')` calls with the cached `cards` variable.

**Critical consideration:** `document.querySelectorAll()` returns a **static** (non-live) `NodeList`. Since cards are never added/removed dynamically in the generated page, caching at module scope is safe.

#### 2b. Cache frequently used element IDs

Add near the top of the generated template (after `appState`):

```javascript
const chanceIconsEl = document.getElementById('chance-icons');
const starDisplayEl = document.getElementById('star-display');
const starRatingEl = document.getElementById('star-rating');
const medalMsgEl = document.getElementById('medal-message');
const detSummaryEl = document.getElementById('detective-summary');
```

Then use these cached references instead of re-querying.

#### 2c. Top-level script.js cache

For the top-level [`generatePage()`](script.js:155) and [`downloadPage()`](script.js:1279) functions:

```javascript
const outputCodeEl = document.getElementById('outputCode');
const practiceDateEl = document.getElementById('practiceDate');
```

Cache these at module level (near line 5) and replace inline `document.getElementById('outputCode')` and `document.getElementById('practiceDate')` calls.

---

## File Scope Summary

The changes span two scopes within [`script.js`](script.js):

| Scope | Lines | Changes |
|---|---|---|
| **Top-level IIFE + functions** | 1–1294 | Cache `outputCodeEl` and `practiceDateEl` near line 5 |
| **Generated page template** (inside the `<script>` tag) | ~390–1270 | All Task 1 + Task 2a + Task 2b changes |

Note: The generated template is stored as a JavaScript string in [line 242](script.js:242) (`const pageTemplate = ...`). All template-internal changes must be made **inside the string literals** within the `generatePage()` function.

---

## Verification Checklist

After changes:

1. **Timer accuracy**: Reveal Chinese → click "显示/朗读英文" → verify the time recorded in `stats[englishText].time` still reflects the correct duration.
2. **Star calculation**: Complete a practice session with varying times/replays → verify `calculateStars()` returns correct star counts.
3. **Report generation**: Call `generateReport()` → verify all sentences appear in the report (no `start` entries).
4. **Claim reward**: Call `claimReward()` → verify `medal-message` and `detective-summary` display correctly.
5. **DOM caching**: Verify all UI updates still work (energy bars, detective mode, card restoration on reload).
6. **LocalStorage**: Verify old saved data (which may still contain `start` key) doesn't cause errors — the `key === 'start'` guard is removed but old `start` entries will just be harmless extra keys in `stats`.
