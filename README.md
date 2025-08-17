# key-sign

**Digitized signatures from your keyboard.**  
What if your signature were determined by how your **username** maps onto a keyboard?  
If your name could be used as a **fingerprint**?

A small Sunday project — now with **curved lines** and support for **letters + numbers + `_`**.

---

## Demo

- Straight, dashed, and dotted line styles
- Optional curved segments (quadratic Bézier)
- Export to **SVG** and **PNG**

---

## Features

- **Username-ready character support:** `a–z`, `A–Z`, `0–9`, and `_`
- **Line style rules:**
  - **solid** — between two letters of the **same case** (AA or aa)
  - **dashed** — between **mixed case** letters (Aa or aA)
  - **dotted** — if **either** side is a **digit** or `_`
- **Curved lines toggle:** switch between straight segments and smooth quadratic curves
- **Dynamic sizing:** canvas auto-fits the keyboard based on layout bounds (no clipping)
- **One-click exports:** **SVG** and **PNG**

---

## How it works

1. Each character maps to a key position on a QWERTY layout.  
   Lowercase letters reuse the same coordinates as their uppercase keys.
2. The component connects consecutive characters with a segment:
   - Straight `L` or quadratic `Q` (when curved mode is ON).
3. Segment style follows the rules above (solid/dashed/dotted).
4. Container and SVG dimensions are computed from the layout so nothing overflows, even if you shift rows.

---

## Quick start

```bash
# or npm
npm install
npm run dev
```

### Keyboard layout

- Default: QWERTY
- Numbers 1–0 + \_ live on a top row (e.g., y = -1)
- You can tweak key positions and spacing in the layout map.
- Want Dvorak/Colemak? Add another layout record and a layout switcher.

### Exports

- SVG: preserves dash patterns and curves as vector paths
- PNG: renders at 2× scale on a black background for crisp output

### Contributing

- Issues and PRs welcome! If you add a new layout:
- Keep key spacing consistent, or adjust the spacing constants.
- Rely on dynamic sizing so your layout won’t clip.

### License

MIT © 2025 Chethan Birur Nataraja

### Acknowledgements

Inspired by Conrad Crawford's staruday project [cnrad/keyboard-signature](https://github.com/cnrad/keyboard-signature)
