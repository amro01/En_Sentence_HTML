# Plan: Fix Two Visual Regressions After Phase 2 Refactoring

## Root Cause Analysis

### Issue 1: "生成网页" Button Turned Green

**Original code** ([`En_Sentence.html:327`](../En_Sentence.html:327)):
```html
<button onclick="generatePage()" style="background: #2196F3;">生成练习网页</button>
```

The original used an **inline style** (`style="background: #2196F3"`), which has the highest CSS specificity (1,0,0,0) — it overrides the general `button` rule's `background: #4CAF50` (green) with no contest.

**Refactored code** ([`index.html:66`](../index.html:66)):
```html
<button onclick="generatePage()" class="btn-primary">生成练习网页</button>
```

The refactoring replaced the inline style with a CSS class (`btn-primary`). While `button.btn-primary` (specificity 0,1,1) does have **higher** specificity than plain `button` (0,0,1), it's **less bulletproof** than the original inline style. If the browser has any caching issue or if there's an edge case in specificity resolution, the green `button` rule wins.

**Fix:** Restore the inline style `style="background: #2196F3"` on the button while **keeping the class**. This matches the original approach exactly and guarantees the correct color.

### Issue 2: Purple Moon Glow Missing

**Investigation result:** The moon glow code in the generated template is **100% identical** between the original and refactored versions:

| Aspect | Original ([`En_Sentence.html:705-706`](../En_Sentence.html:705)) | Refactored ([`script.js:342-343`](../script.js:342)) |
|--------|------|-----------|
| `@keyframes pulse` | ✅ Present | ✅ Identical |
| `.moon-glow` class | ✅ Present | ✅ Identical |
| `claimReward()` JS | ✅ Sets `.moon-glow` on 6-star | ✅ Identical |

The glow relies solely on the CSS `text-shadow` property inside the `@keyframes pulse` animation:
```css
@keyframes pulse { 
  0% { text-shadow: 0 0 5px #bf5af2, 0 0 10px #bf5af2; } 
  50% { text-shadow: 0 0 15px #bf5af2, 0 0 25px #bf5af2, 0 0 35px #bf5af2; } 
  100% { text-shadow: 0 0 5px #bf5af2, 0 0 10px #bf5af2; } 
}
.moon-glow { animation: pulse 2s infinite; display: inline-block; }
```

However, `text-shadow` on **emoji characters** (🌙) has inconsistent browser support. Some browsers/renderers don't apply `text-shadow` to emoji text nodes. Adding a **`filter: drop-shadow(...)`** fallback would make the glow more robust across browsers, since `drop-shadow` works on the rendered pixels of the element regardless of whether the content is emoji or regular text.

**Fix:** Add `filter: drop-shadow(0 0 8px #bf5af2)` to the `.moon-glow` class as a fallback, so the glow is produced even if `text-shadow` doesn't render on emoji. Also add `box-shadow` as an additional layer of visual glow.

---

## Fix Steps

### Step 1: Fix button color ([`index.html`](../index.html:66))

Add `style="background: #2196F3"` inline style to the "生成练习网页" button, matching the original code.

**Before:**
```html
<button onclick="generatePage()" class="btn-primary">生成练习网页</button>
```

**After:**
```html
<button onclick="generatePage()" class="btn-primary" style="background: #2196F3;">生成练习网页</button>
```

### Step 2: Fix moon glow ([`script.js:342-343`](../script.js:343))

Add `filter: drop-shadow(0 0 8px #bf5af2)` to the `.moon-glow` class in the generated template's CSS (inside the `pageTemplate` string).

**Before:**
```css
.moon-glow { animation: pulse 2s infinite; display: inline-block; }
```

**After:**
```css
.moon-glow { animation: pulse 2s infinite; display: inline-block; filter: drop-shadow(0 0 8px #bf5af2); }
```

---

## Verification

After applying both fixes:
1. Open `index.html` in browser — the "生成练习网页" button should be blue (`#2196F3`)
2. Generate a practice page, complete all exercises to get 6 stars, claim reward — the moons should display with a purple glow animation
