# Fix Visual Diff Bug — LCS Algorithm Implementation Plan

## Problem Summary

The `computeDiff` function in [`js/templates/generated-js.js:370`](js/templates/generated-js.js:370) uses a **naive index-by-index word comparison**. When comparing two sentences with insertions or deletions, all subsequent words become misaligned.

**Example:**
- Wrong: `"This Tom."`
- Correct: `"This is Tom."`

**Current (broken) output:** `This [red~~Tom.~~] [blue:is] [blue:Tom.]`
- "Tom." is shown as **both deleted AND re-inserted**, because index-1 compares "Tom." vs "is" (mismatch), then index-2 sees only correct word "Tom." (false insertion).

**Expected output:** `This [blue:is] Tom.`
- Only the truly missing word "is" should be highlighted as inserted. "Tom." is correctly matched via LCS.

---

## Algorithm: Word-Level LCS (Longest Common Subsequence)

The correct approach uses DP-based LCS to find which words are common between the two sentences, then backtracks to classify each token as:
1. **Match** — word appears in both, unchanged
2. **Insertion** — word only in `correctText` (shown in blue, `diff-ins`)
3. **Deletion** — word only in `wrongText` (shown in red strikethrough, `diff-del`)

---

## Implementation Steps

### Step 1: Check Git History (Priority)

Run `git log -p -S` to search for previous `computeDiff`, `diffWords`, `compareSentences`, or LCS-based implementations. The user reports this was previously fixed and may exist in the git history of either:
- [`js/templates/generated-js.js`](js/templates/generated-js.js) (current)
- `script.js` (pre-refactor, now removed)

If found, restore the exact working implementation.

### Step 2: Implement LCS `computeDiff` (Fallback)

Replace the current `computeDiff` function (lines 370-391) with:

```javascript
function computeDiff(wrongText, correctText) {
    const w1 = wrongText.trim().split(/\s+/);
    const w2 = correctText.trim().split(/\s+/);
    
    // DP table initialization
    const dp = Array(w1.length + 1).fill(null).map(() => Array(w2.length + 1).fill(0));
    for (let i = 1; i <= w1.length; i++) {
        for (let j = 1; j <= w2.length; j++) {
            if (w1[i-1].toLowerCase() === w2[j-1].toLowerCase()) {
                dp[i][j] = dp[i-1][j-1] + 1;
            } else {
                dp[i][j] = Math.max(dp[i-1][j], dp[i][j-1]);
            }
        }
    }
    
    // Backtrack to build diff result
    let i = w1.length, j = w2.length;
    const result = [];
    while (i > 0 || j > 0) {
        if (i > 0 && j > 0 && w1[i-1].toLowerCase() === w2[j-1].toLowerCase()) {
            result.unshift(w2[j-1]); // Match: keep word from correct sentence
            i--; j--;
        } else if (j > 0 && (i === 0 || dp[i][j-1] >= dp[i-1][j])) {
            // Insertion: word only in correct sentence (blue)
            result.unshift(`<span class="diff-ins" style="color: #1976d2; font-weight: bold;">${w2[j-1]}</span>`);
            j--;
        } else if (i > 0 && (j === 0 || dp[i][j-1] < dp[i-1][j])) {
            // Deletion: word only in wrong sentence (red strikethrough)
            result.unshift(`<span class="diff-del" style="color: #d32f2f; text-decoration: line-through; font-weight: bold;">${w1[i-1]}</span>`);
            i--;
        }
    }
    return result.join(' ');
}
```

**Key properties:**
- `O(n*m)` time complexity, `O(n*m)` space
- Case-insensitive comparison via `.toLowerCase()`
- Uses casing from the correct sentence for matched words
- Inline styles as fallback; classes for CSS extensibility

### Step 3: Update CSS in `generated-css.js`

Add CSS rules for the new classes. Find the existing duplicate `.wrong-word` / `.correct-word` block at lines 120-121 and replace/update:

```css
/* Diff classes for visual error correction */
.diff-del {
    color: #d32f2f !important;
    text-decoration: line-through !important;
    font-weight: bold !important;
    pointer-events: none !important;
}
.diff-del .word-span {
    pointer-events: none !important;
    cursor: default !important;
    background-color: transparent !important;
    color: inherit !important;
    text-decoration: line-through !important;
}
.diff-ins {
    color: #1976d2 !important;
    font-weight: bold !important;
    pointer-events: auto !important;
}
.diff-ins .word-span {
    pointer-events: auto !important;
    cursor: pointer !important;
    color: inherit !important;
}
```

Also remove the duplicate CSS block at lines 62-82 (`.wrong-word` and `.correct-word` with the `.word-span` overrides) since they are superseded by the new rules. The block at lines 120-121 is also made redundant.

**Note:** Keep the `del .word-span` rule at lines 55-61 as it may be used elsewhere.

### Step 4: Update `wrapTextNodesInElement`

In [`js/templates/generated-js.js:761-771`](js/templates/generated-js.js:761), the function currently skips `.wrong-word` and `<del>` elements. Add `.diff-del` to the skip list:

```javascript
const isWrongElement = node.tagName === 'DEL' ||
                       node.classList.contains('wrong-word') ||
                       node.classList.contains('diff-del');
```

Do NOT skip `.diff-ins` elements — blue inserted words should remain clickable for pronunciation (consistent with how `.correct-word` is handled).

### Step 5: Verify Test Cases

| Wrong Text | Correct Text | Expected Diff Output |
|---|---|---|
| `"This Tom."` | `"This is Tom."` | `This [blue:is] Tom.` |
| `"He go school."` | `"He goes to school."` | `He [red:go] [blue:goes] [blue:to] school.` |
| `"I like apples."` | `"I like apples."` | `I like apples.` (no change) |
| `"She run fast."` | `"She runs fast."` | `She [red:run] [blue:runs] fast.` |
| `"A B C"` | `"A B C D"` | `A B C [blue:D]` |
| `"A B C D"` | `"A B C"` | `A B C [red:D]` |

---

## Affected Files

| File | Change |
|---|---|
| [`js/templates/generated-js.js:370-391`](js/templates/generated-js.js:370) | Replace `computeDiff` function body |
| [`js/templates/generated-js.js:761-771`](js/templates/generated-js.js:761) | Add `diff-del` to skip list in `wrapTextNodesInElement` |
| [`js/templates/generated-css.js:55-82`](js/templates/generated-css.js:55) | Remove/replace legacy `.wrong-word` / `.correct-word` CSS |
| [`js/templates/generated-css.js:120-121`](js/templates/generated-css.js:120) | Add new `.diff-del` / `.diff-ins` CSS rules |
