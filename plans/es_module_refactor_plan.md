# ES Module Refactoring Plan

## Goal

Refactor the project to use **ES Modules** (Vanilla JS, no build tools) by splitting the monolithic [`script.js`](../script.js) into multiple focused module files under a new `js/` directory.

---

## File Structure (after refactoring)

```
EnSentence/
├── index.html          # <script type="module" src="js/main.js"></script>
├── style.css           # unchanged
├── script.js           # DELETE after migration
├── js/
│   ├── main.js         # Entry point: DOM interaction logic + generatePage/downloadPage
│   └── templates/
│       ├── generated-css.js    # exports GENERATED_CSS constant (style string)
│       ├── generated-js.js     # exports buildGeneratedJS(config) function
│       └── generated-html.js   # exports buildGeneratedHTML(params) function
```

---

## Detailed File Breakdown

### 1. [`js/templates/generated-css.js`](../js/templates/generated-css.js)

**Purpose:** Extract the inline `<style>` block from the generated page template into a standalone exported constant.

**Content:**
- Export a single named constant `GENERATED_CSS` (a template literal string).
- Contains lines 254–350 from the original `generatePage()` template (the CSS inside `<style>...</style>`), but **without** the `<style>` tags themselves.

**Why separate?** CSS is purely static — it never changes based on user input. Isolating it avoids re-parsing and makes the template assembly cleaner.

---

### 2. [`js/templates/generated-js.js`](../js/templates/generated-js.js)

**Purpose:** Extract the inline `<script>` block from the generated page template into an exported **function** that accepts a config object and returns the JS string.

**Content:**
- Export a function `buildGeneratedJS(config)`.
- The config object shape:
  ```js
  {
    childName,        // string
    practiceId,       // string
    replayLimit,      // number
    timeLimit,        // number
    masteryThreshold, // number
    detectiveChances, // number
    trapCount,        // number
    trapData          // array
  }
  ```
- Contains lines 394–1273 from the original template, but **without** the `<script>` tags.
- The `${childName}`, `${practiceId}`, etc. interpolations remain as template literal expressions referencing `config.childName`, etc.

**Why a function?** The JS block contains many dynamic values (childName, practiceId, thresholds, trapData) that must be injected at generation time.

---

### 3. [`js/templates/generated-html.js`](../js/templates/generated-html.js)

**Purpose:** Assemble the final HTML page string from its three parts (HTML shell, CSS, JS, and dynamically-generated cardsHTML).

**Content:**
- Import `GENERATED_CSS` from `./generated-css.js`.
- Import `buildGeneratedJS` from `./generated-js.js`.
- Export a function `buildGeneratedHTML(params)` where `params` is:
  ```js
  {
    date,               // string (display date)
    cardsHTML,          // string (already-built card HTML)
    childName,          // string
    practiceId,         // string
    replayThreshold,    // number
    timeThreshold,      // number
    masteryThreshold,   // number
    effectiveChances,   // number
    trapCount,          // number
    trapData,           // array
    hasAnyTrap          // boolean
  }
  ```
- The function:
  1. Calls `buildGeneratedJS({ childName, practiceId, ... })` to get the JS string.
  2. Assembles the full HTML document (lines 247–253 + 351–1276 from original template), slotting in `GENERATED_CSS`, the JS string, `date`, `cardsHTML`, and `hasAnyTrap`.
  3. Returns the complete HTML string.

---

### 4. [`js/main.js`](../js/main.js) — Entry Point

**Purpose:** The single `<script type="module">` entry point. Contains all DOM interaction logic for the generator page, plus simplified `generatePage()` and `downloadPage()`.

**Content (in order):**

#### A. Import
```js
import { buildGeneratedHTML } from './templates/generated-html.js';
```

#### B. IIFE — Card Management & Sort Logic (from script.js lines 1–152)
- `setTodaysDate()`, auto-populate date, add label to initial card.
- **All functions must be explicitly attached to `window`** because inline `onclick` handlers in `index.html` reference them by name:
  - `window.onTrapToggle`
  - `window.updateDetectiveChances`
  - `window.addCard`
  - `window.addExplanationBox`
  - `window.deleteCard`
  - `window.moveCardUp`
  - `window.moveCardDown`
- `updateAllSortButtons()` stays as a module-private function (not on window).

> **Note:** In ES modules, top-level `function` declarations are **not** global. Only explicit `window.X = X` assignments make them accessible to inline `onclick` attributes.

#### C. Cached DOM References (from script.js lines 154–156)
```js
const outputCodeEl = document.getElementById('outputCode');
const practiceDateEl = document.getElementById('practiceDate');
```

#### D. `generatePage()` (adapted from script.js lines 159–1279)
- Keeps all **data collection** logic (reading form values, iterating cards, building cardsHTML, computing practiceId, collecting trapData, etc.) — lines 160–244.
- **Removed:** The massive page template string (lines 246–1276).
- **Replaced with:** A call to `buildGeneratedHTML({ ...params })` to assemble the final HTML.
- Sets `outputCodeEl.value` as before.
- Must be explicitly assigned to `window.generatePage = generatePage`.

#### E. `downloadPage()` (from script.js lines 1281–1295)
- Unchanged logic.
- Must be explicitly assigned to `window.downloadPage = downloadPage`.

---

### 5. [`index.html`](../index.html) — Script Tag Change

**Change:** Line 97:
```html
<!-- BEFORE: -->
<script src="script.js"></script>

<!-- AFTER: -->
<script type="module" src="js/main.js"></script>
```

---

## Key Considerations & Risks

### 1. Global Function Accessibility
**Risk:** Inline `onclick` handlers like `onclick="addCard()"` in `index.html` will break if functions are not on `window`.
**Mitigation:** Every function referenced by an inline handler is explicitly assigned to `window.X = X`.

### 2. CORS Restriction with `file://` Protocol
**Risk:** ES modules **do not work** when opening `index.html` directly via `file://` in most browsers (CORS policy blocks module script cross-origin requests).
**Mitigation:** The user must serve the project via a local HTTP server (e.g., `python3 -m http.server` or VS Code Live Server). Add a note in README or a comment in `index.html`.

### 3. Character Encoding of Template Literals
**Risk:** The generated JS template literal (in `generated-js.js`) contains backticks, `${}` expressions, and JS code — these need careful escaping.
**Mitigation:** The `buildGeneratedJS(config)` function returns a string built from a template literal where `${...}` interpolation uses `config` object properties. The inner JS code uses `\\n` for newlines (as in the original).

### 4. `onDetectiveChancesChange` Missing
**Note:** The HTML at line 61 references `onchange="onDetectiveChancesChange()"` but this function is **not defined** anywhere in `script.js`. This is a pre-existing bug, not introduced by the refactoring.

---

## Execution Order (for Code mode)

1. Create `js/` and `js/templates/` directories.
2. Create `js/templates/generated-css.js` — extract CSS string constant.
3. Create `js/templates/generated-js.js` — extract JS generation function.
4. Create `js/templates/generated-html.js` — assemble full HTML.
5. Create `js/main.js` — entry point with all DOM logic, imports, and `window` assignments.
6. Modify `index.html` — change script tag.
7. Test: serve via HTTP server, verify page loads, cards add/delete/sort work, generate produces identical HTML, download works.

---

## Verification Checklist

- [ ] `index.html` loads without console errors.
- [ ] Date auto-populates correctly.
- [ ] Add/Delete/Move cards works.
- [ ] Trap checkbox toggle works (shows/hides correct-english field).
- [ ] Detective chances auto-update when toggling traps.
- [ ] Add Explanation Box works.
- [ ] "生成练习网页" generates valid HTML in the output textarea.
- [ ] "下载HTML文件" triggers a download.
- [ ] Generated HTML page (when opened) functions identically to before.
