import { useEffect, useMemo, useState } from "react";

type KeyboardLayout = "qwerty";
type Key = { x: number; y: number };
type Pt = { x: number; y: number; ch?: string };

type PairClass = "UU" | "UL" | "LU" | "LL" | "NUM";

// ----------------------- Layout -----------------------
const keyboardLayouts: Record<KeyboardLayout, Record<string, Key>> = {
  qwerty: {
    "1": { x: 0, y: -1 },
    "2": { x: 1, y: -1 },
    "3": { x: 2, y: -1 },
    "4": { x: 3, y: -1 },
    "5": { x: 4, y: -1 },
    "6": { x: 5, y: -1 },
    "7": { x: 6, y: -1 },
    "8": { x: 7, y: -1 },
    "9": { x: 8, y: -1 },
    "0": { x: 9, y: -1 },
    _: { x: 10, y: -1 },

    Q: { x: 0.5, y: 0 },
    W: { x: 1.5, y: 0 },
    E: { x: 2.5, y: 0 },
    R: { x: 3.5, y: 0 },
    T: { x: 4.5, y: 0 },
    Y: { x: 5.5, y: 0 },
    U: { x: 6.5, y: 0 },
    I: { x: 7.5, y: 0 },
    O: { x: 8.5, y: 0 },
    P: { x: 9.5, y: 0 },

    A: { x: 0.75, y: 1 },
    S: { x: 1.75, y: 1 },
    D: { x: 2.75, y: 1 },
    F: { x: 3.75, y: 1 },
    G: { x: 4.75, y: 1 },
    H: { x: 5.75, y: 1 },
    J: { x: 6.75, y: 1 },
    K: { x: 7.75, y: 1 },
    L: { x: 8.75, y: 1 },

    Z: { x: 1.25, y: 2 },
    X: { x: 2.25, y: 2 },
    C: { x: 3.25, y: 2 },
    V: { x: 4.25, y: 2 },
    B: { x: 5.25, y: 2 },
    N: { x: 6.25, y: 2 },
    M: { x: 7.25, y: 2 },
  },
} as const;

// ----------------------- Small helpers -----------------------
const isNumOrUnd = (c: string) => /[0-9_]/.test(c);
const isUpper = (c: string) => /^[A-Z]$/.test(c);
const isLower = (c: string) => /^[a-z]$/.test(c);
const clamp = (v: number, lo: number, hi: number) =>
  Math.max(lo, Math.min(hi, v));

// Tiny FNV-1a 32-bit hash (deterministic, not crypto)
function hash32(s: string) {
  let h = 0x811c9dc5 >>> 0;
  for (let i = 0; i < s.length; i++) {
    h ^= s.charCodeAt(i);
    h = Math.imul(h, 0x01000193);
  }
  return h >>> 0;
}

function classifyPair(a: string, b: string): PairClass {
  if (isNumOrUnd(a) || isNumOrUnd(b)) return "NUM";
  if (isUpper(a) && isUpper(b)) return "UU";
  if (isLower(a) && isLower(b)) return "LL";
  return isUpper(a) && isLower(b) ? "UL" : "LU";
}

// ----------------------- Dash ABC (kept) -----------------------
const DASH_ALPHABET: Record<PairClass, number[][]> = {
  UU: [[]],
  UL: [
    [8, 6],
    [12, 4, 2, 4],
  ],
  LU: [
    [8, 6],
    [3, 3, 1, 3],
  ],
  LL: [
    [2, 6],
    [3, 3, 1, 3],
  ],
  NUM: [
    [1, 8],
    [2, 8],
  ],
};

function legacyDash(a: string, b: string): number[] | undefined {
  if (isNumOrUnd(a) || isNumOrUnd(b)) return [1, 8];
  if (isUpper(a) && isUpper(b)) return [];
  return [8, 6];
}

function makeRng(seedStr: string) {
  const h = hash32(seedStr) || 1;
  let x = h >>> 0;
  return () => {
    x ^= x << 13;
    x ^= x >>> 17;
    x ^= x << 5;
    return (x >>> 0) / 0xffffffff;
  };
}

function dashForPair(a: string, b: string, rng: () => number): number[] {
  const klass = classifyPair(a, b);
  const choices = DASH_ALPHABET[klass];
  const idx = Math.floor(rng() * choices.length) % choices.length;
  return choices[idx];
}

// ----------------------- Bigram → HSL color (NEW) -----------------------
/**
 * Stable per-segment color:
 * - Hue: from hash(prev+curr+class)
 * - Saturation/Lightness: per class, with a tiny length-based tweak on L
 */
function colorForPair(prev: string, curr: string, pxLen: number) {
  const klass = classifyPair(prev, curr);
  const seed = `${prev}${curr}|${klass}`;
  const hue = hash32(seed) % 360; // 0..359

  const base = {
    UU: { s: 45, l: 58 },
    UL: { s: 60, l: 52 },
    LU: { s: 60, l: 52 },
    LL: { s: 55, l: 48 },
    NUM: { s: 35, l: 64 },
  }[klass];

  // length → lightness delta (-6..+6 over ~0..120px)
  const lenClamped = clamp(pxLen, 0, 120);
  const deltaL = Math.round((lenClamped / 120) * 12) - 6;

  const s = clamp(base.s, 30, 80);
  const l = clamp(base.l + deltaL, 20, 80);
  return `hsl(${hue}deg ${s}% ${l}%)`;
}

// ----------------------- Catmull–Rom (simple) -----------------------
/** Convert (p0,p1,p2,p3) to cubic controls for segment p1→p2; α=0.5 centripetal. */
function catmullRomCubicForSegment(
  p0: Pt,
  p1: Pt,
  p2: Pt,
  p3: Pt,
  alpha = 0.2
) {
  const d01 = Math.pow(Math.hypot(p1.x - p0.x, p1.y - p0.y), alpha) || 1;
  const d12 = Math.pow(Math.hypot(p2.x - p1.x, p2.y - p1.y), alpha) || 1;
  const d23 = Math.pow(Math.hypot(p3.x - p2.x, p3.y - p2.y), alpha) || 1;

  const t1 = d01 + d12;
  const t2 = d12 + d23;

  const m1x = (p2.x - p1.x) / d12 - (p1.x - p0.x) / d01;
  const m1y = (p2.y - p1.y) / d12 - (p1.y - p0.y) / d01;
  const m2x = (p3.x - p2.x) / d23 - (p2.x - p1.x) / d12;
  const m2y = (p3.y - p2.y) / d23 - (p2.y - p1.y) / d12;

  const tx1 = (m1x * d12) / (t1 || 1);
  const ty1 = (m1y * d12) / (t1 || 1);
  const tx2 = (m2x * d12) / (t2 || 1);
  const ty2 = (m2y * d12) / (t2 || 1);

  const c1x = p1.x + tx1 / 3;
  const c1y = p1.y + ty1 / 3;
  const c2x = p2.x - tx2 / 3;
  const c2y = p2.y - ty2 / 3;

  return { c1x, c1y, c2x, c2y };
}

// ----------------------- CODEC model (NEW) -----------------------
/**
 * We export a compact JSON "codec" that captures just enough to compare
 * two signatures deterministically.
 *
 * v:      version tag
 * layout: 'qwerty' (so future layouts can co-exist)
 * dash:   'abc' or 'legacy' (so dashing is reproducible)
 * color:  'bigram-hsl-v1'
 * len:    number of characters (quick sanity check)
 * hash:   name hash (not the raw name), so matching can verify provenance
 * seg:    list of per-segment features:
 *         a: prev char (exact case), b: curr char (exact case)
 *         cls: UU/UL/LU/LL/NUM
 *         dir: 0..7 (8-way direction; 0 = east, 2 = north, 4 = west, 6 = south)
 *         lb:  0..3 (length bin)
 */
type CodecSeg = {
  a: string;
  b: string;
  cls: PairClass;
  dir: number;
  lb: number;
};
type Codec = {
  v: "ks1";
  layout: KeyboardLayout;
  dash: "abc" | "legacy";
  color: "bigram-hsl-v1";
  len: number;
  hash: string;
  seg: CodecSeg[];
};

function direction8(dx: number, dy: number) {
  // atan2: -π..π; divide by 45° and round to 8 buckets
  const theta = Math.atan2(dy, dx); // radians
  const dir = (Math.round(theta / (Math.PI / 4)) + 8) % 8; // 0..7
  return dir;
}

function lengthBin(len: number) {
  // Buckets tuned to your spacing (60px grid)
  if (len < 40) return 0;
  if (len < 80) return 1;
  if (len < 120) return 2;
  return 3;
}

function buildCodec(
  name: string,
  layout: KeyboardLayout,
  useDashAlphabet: boolean,
  segs: CodecSeg[]
): Codec {
  const lower = name.toLowerCase();
  const h = hash32(`${layout}|${lower}`).toString(16).padStart(8, "0");
  return {
    v: "ks1",
    layout,
    dash: useDashAlphabet ? "abc" : "legacy",
    color: "bigram-hsl-v1",
    len: name.length,
    hash: h,
    seg: segs,
  };
}

// For SVG <metadata>, we must escape XML entities
function escapeXml(s: string) {
  return s.replace(
    /[<>&'"]/g,
    (c) =>
      ({ "<": "&lt;", ">": "&gt;", "&": "&amp;", "'": "&apos;", '"': "&quot;" }[
        c
      ]!)
  );
}

// ----------------------- Component -----------------------
export const KeyboardSignature = () => {
  const [name, setName] = useState("");
  const [currentKeyboardLayout] = useState<KeyboardLayout>("qwerty");
  const [keyboardVisible, setKeyboardVisible] = useState(false);
  const [capsOn, setCapsOn] = useState(false);

  const [useCatmullRom, setUseCatmullRom] = useState(false);
  const [useDashAlphabet, setUseDashAlphabet] = useState(true);

  // Visual constants & bounds
  const KEY_SPACING = 60,
    KEY_W = 56,
    KEY_H = 48,
    PAD_X = 18,
    PAD_Y = 18;
  const layout = keyboardLayouts[currentKeyboardLayout];
  const all = Object.values(layout);
  const minX = Math.min(...all.map((k) => k.x));
  const maxX = Math.max(...all.map((k) => k.x));
  const minY = Math.min(...all.map((k) => k.y));
  const maxY = Math.max(...all.map((k) => k.y));
  const SHIFT_X = -minX * KEY_SPACING;
  const SHIFT_Y = -minY * KEY_SPACING;
  const WIDTH = (maxX - minX) * KEY_SPACING + KEY_W + PAD_X * 2;
  const HEIGHT = (maxY - minY) * KEY_SPACING + KEY_H + PAD_Y * 2;

  // Sync physical CapsLock
  useEffect(() => {
    const syncCaps = (e: KeyboardEvent) => {
      if (typeof e.getModifierState === "function") {
        setCapsOn(e.getModifierState("CapsLock"));
      }
    };
    window.addEventListener("keydown", syncCaps);
    window.addEventListener("keyup", syncCaps);
    return () => {
      window.removeEventListener("keydown", syncCaps);
      window.removeEventListener("keyup", syncCaps);
    };
  }, []);

  // Flash keyboard when name changes
  useEffect(() => {
    if (name.length > 0) {
      setKeyboardVisible(true);
      const timer = setTimeout(() => setKeyboardVisible(false), 100);
      return () => clearTimeout(timer);
    } else {
      setKeyboardVisible(false);
    }
  }, [name]);

  // Map char → key center (letters share coords via uppercase; keep original case in .ch)
  const getKeyCenter = (ch: string): Pt | null => {
    if (!ch) return null;
    const isLetter = /[a-zA-Z]/.test(ch);
    const key = (isLetter ? ch.toUpperCase() : ch) as keyof typeof layout;
    if (!(key in layout)) return null;
    const { x, y } = layout[key];
    return {
      x: x * KEY_SPACING + SHIFT_X + PAD_X + KEY_W / 2,
      y: y * KEY_SPACING + SHIFT_Y + PAD_Y + KEY_H / 2,
      ch,
    };
  };

  // -------- Build segments (now with color + features for CODEC) --------
  type RenderSeg = {
    d: string;
    dash?: number[];
    color?: string;
    feat: CodecSeg;
  };

  const segments = useMemo(() => {
    if (!name) return [] as RenderSeg[];
    const rng = makeRng(`key-sign:${name}:${currentKeyboardLayout}`);

    const pts = name.split("").map(getKeyCenter).filter(Boolean) as Pt[];
    if (pts.length < 2) return [];

    const segs: RenderSeg[] = [];

    for (let i = 0; i < pts.length - 1; i++) {
      const p1 = pts[i];
      const p2 = pts[i + 1];
      const p0 = i - 1 >= 0 ? pts[i - 1] : p1; // clamp ends
      const p3 = i + 2 < pts.length ? pts[i + 2] : p2;

      // length + direction (for color & codec)
      const dx = p2.x - p1.x,
        dy = p2.y - p1.y;
      const segLen = Math.hypot(dx, dy);
      const dir = direction8(dx, dy);
      const lb = lengthBin(segLen);

      const dash = useDashAlphabet
        ? dashForPair(p1.ch!, p2.ch!, rng)
        : legacyDash(p1.ch!, p2.ch!);
      const color = colorForPair(p1.ch!, p2.ch!, segLen); // NEW: per-bigram color

      const feat: CodecSeg = {
        a: p1.ch!,
        b: p2.ch!,
        cls: classifyPair(p1.ch!, p2.ch!),
        dir,
        lb,
      };

      if (!useCatmullRom) {
        segs.push({
          d: `M ${p1.x} ${p1.y} L ${p2.x} ${p2.y}`,
          dash,
          color,
          feat,
        });
      } else {
        const { c1x, c1y, c2x, c2y } = catmullRomCubicForSegment(
          p0,
          p1,
          p2,
          p3,
          0
        );
        segs.push({
          d: `M ${p1.x} ${p1.y} C ${c1x} ${c1y} ${c2x} ${c2y} ${p2.x} ${p2.y}`,
          dash,
          color,
          feat,
        });
      }
    }

    return segs;
  }, [
    name,
    currentKeyboardLayout,
    getKeyCenter,
    useDashAlphabet,
    useCatmullRom,
  ]);

  // Build CODEC (NEW)
  const codec: Codec | null = useMemo(() => {
    if (!name || segments.length === 0) return null;
    const feats = segments.map((s) => s.feat);
    return buildCodec(name, currentKeyboardLayout, useDashAlphabet, feats);
  }, [name, segments, currentKeyboardLayout, useDashAlphabet]);

  // Active keys for highlight
  const activeKeys = useMemo(() => {
    const mapped = name
      .split("")
      .map((c) => (/[a-zA-Z]/.test(c) ? c.toUpperCase() : c))
      .filter((c) => c in layout);
    return new Set(mapped);
  }, [name, layout]);

  // ----------------------- Exports -----------------------
  const exportSVG = () => {
    if (segments.length === 0 || !name) return;
    const mk = (s: RenderSeg) => {
      const dashAttr =
        s.dash && s.dash.length
          ? ` stroke-dasharray="${s.dash.join(" ")}"`
          : "";
      const stroke = s.color ?? "black";
      return `<path d="${s.d}" stroke="${stroke}" stroke-width="3" fill="none" stroke-linecap="round" stroke-linejoin="round"${dashAttr}/>`;
    };
    const svg = `<svg width="${Math.ceil(WIDTH)}" height="${Math.ceil(
      HEIGHT
    )}" xmlns="http://www.w3.org/2000/svg">
${segments.map(mk).join("\n")}
</svg>`;
    const blob = new Blob([svg], { type: "image/svg+xml" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `${name}-signature.svg`;
    a.click();
    URL.revokeObjectURL(url);
  };

  const exportPNG = () => {
    if (segments.length === 0 || !name) return;
    const W = Math.ceil(WIDTH),
      H = Math.ceil(HEIGHT);
    const canvas = document.createElement("canvas");
    canvas.width = W * 2;
    canvas.height = H * 2;
    const ctx = canvas.getContext("2d");
    if (!ctx) return;
    ctx.scale(2, 2);
    ctx.fillStyle = "black";
    ctx.fillRect(0, 0, W, H);
    ctx.lineWidth = 3;
    ctx.lineCap = "round";
    ctx.lineJoin = "round";
    for (const s of segments) {
      ctx.setLineDash(s.dash ?? []);
      ctx.strokeStyle = s.color ?? "white";
      const path = new Path2D(s.d);
      ctx.stroke(path);
    }
    canvas.toBlob((blob) => {
      if (!blob) return;
      const url = URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url;
      a.download = `${name}-signature.png`;
      a.click();
      URL.revokeObjectURL(url);
    });
  };

  // NEW: Export CODEC as .txt (pretty JSON)
  const exportCODECtxt = () => {
    if (!codec) return;
    const text = JSON.stringify(codec, null, 2);
    const blob = new Blob([text], { type: "text/plain" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `${name}-keysig-codec.txt`;
    a.click();
    URL.revokeObjectURL(url);
  };

  // NEW: Export CODEC as .svg (metadata only)
  const exportCODECsvg = () => {
    if (!codec) return;
    const json = JSON.stringify(codec);
    const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="0" height="0">
  <metadata id="key-sign-codec">${escapeXml(json)}</metadata>
</svg>`;
    const blob = new Blob([svg], { type: "image/svg+xml" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `${name}-keysig-codec.svg`;
    a.click();
    URL.revokeObjectURL(url);
  };

  // Keyboard labels & clicks honor Caps toggle
  const renderKeyLabel = (char: string) =>
    /^[A-Z]$/.test(char) ? (capsOn ? char : char.toLowerCase()) : char;
  const clickCharToAppend = (char: string) =>
    /^[A-Z]$/.test(char) ? (capsOn ? char : char.toLowerCase()) : char;

  return (
    <div className="flex flex-col sm:items-center sm:justify-center max-sm:mx-auto max-sm:w-[28rem] sm:w-fit">
      <input
        autoFocus
        value={name}
        onChange={(e) => setName(e.target.value)}
        placeholder="Enter your name"
        className="placeholder-neutral-800 [&::placeholder]:duration-200 [&::placeholder]:transition-all focus:placeholder-neutral-600 tracking-wide text-4xl text-white bg-transparent duration-150 transition-all ease-out px-4 py-2 text-center outline-none"
      />

      <div className="relative mb-4 mt-8 max-sm:mt-0 max-sm:scale-70 max-sm:-ml-22">
        {/* Keyboard */}
        <div
          className={`relative transition-opacity ease-out ${
            name.length === 0
              ? "opacity-100"
              : keyboardVisible
              ? "opacity-100 brightness-125 duration-50"
              : "opacity-0 duration-4000"
          }`}
          style={{
            width: `${Math.ceil(WIDTH)}px`,
            height: `${Math.ceil(HEIGHT)}px`,
          }}
        >
          {Object.entries(layout).map(([char, pos]) => {
            const isActive = activeKeys.has(char);
            const lastChar = name.slice(-1);
            const isCurrentKey =
              lastChar &&
              (/[a-zA-Z]/.test(lastChar)
                ? lastChar.toUpperCase()
                : lastChar) === char;

            return (
              <div
                key={char}
                onClick={() => setName((p) => p + clickCharToAppend(char))}
                className={`absolute w-14 h-12 rounded-lg border flex items-center justify-center text-sm font-mono transition-all duration-200 active:scale-95 ${
                  isCurrentKey
                    ? "bg-white/50 border-neutral-400 text-black shadow-lg shadow-white-500/50 scale-110"
                    : isActive
                    ? "bg-neutral-900 border-neutral-800 text-white"
                    : "bg-transparent border-neutral-800/50 text-neutral-300"
                }`}
                style={{
                  left: `${pos.x * KEY_SPACING + SHIFT_X + PAD_X}px`,
                  top: `${pos.y * KEY_SPACING + SHIFT_Y + PAD_Y}px`,
                }}
              >
                {renderKeyLabel(char)}
              </div>
            );
          })}
        </div>

        {/* Signature overlay */}
        <svg
          className="pointer-events-none absolute top-0 left-0"
          width={Math.ceil(WIDTH)}
          height={Math.ceil(HEIGHT)}
          style={{ zIndex: 10 }}
        >
          <title>Keyboard-derived signature path.</title>
          {segments.map((s, i) => (
            <path
              key={i}
              d={s.d}
              stroke={s.color ?? "white"}
              strokeWidth="3"
              fill="none"
              strokeLinecap="round"
              strokeLinejoin="round"
              strokeDasharray={
                s.dash && s.dash.length ? s.dash.join(" ") : undefined
              }
            />
          ))}
        </svg>
      </div>

      {/* Controls */}
      <div
        className={`max-sm:w-[20rem] max-sm:mx-auto flex flex-col gap-3 sm:mt-8 transition-all ease-in-out ${
          name.length > 0
            ? "opacity-100 translate-y-0 duration-1000"
            : "opacity-0 translate-y-2 duration-150"
        }`}
      >
        <div className="flex items-center justify-between gap-2 flex-wrap">
          {/* Toggle group */}
          <div className="flex items-center gap-2">
            {/* Caps */}
            <button
              type="button"
              aria-pressed={capsOn}
              onClick={() => setCapsOn((v) => !v)}
              className={`px-3.5 py-1.5 rounded-md text-sm font-semibold border transition-all duration-100 ease-out flex items-center gap-2 ${
                capsOn
                  ? "bg-white text-black border-white shadow"
                  : "bg-transparent text-neutral-300 border-neutral-700"
              }`}
              title="Toggle Caps"
            >
              Caps
              <span
                className={`inline-block h-2.5 w-2.5 rounded-full ${
                  capsOn
                    ? "bg-emerald-400 shadow-[0_0_8px] shadow-emerald-400/80"
                    : "bg-neutral-600"
                }`}
              />
            </button>

            {/* Curves (Catmull–Rom) */}
            <button
              type="button"
              aria-pressed={useCatmullRom}
              onClick={() => setUseCatmullRom((v) => !v)}
              className={`px-3.5 py-1.5 rounded-md text-sm font-semibold border transition-all duration-100 ease-out flex items-center gap-2 ${
                useCatmullRom
                  ? "bg-white text-black border-white shadow"
                  : "bg-transparent text-neutral-300 border-neutral-700"
              }`}
              title="Toggle Catmull–Rom smoothing"
            >
              Curves
              <span
                className={`inline-block h-2.5 w-2.5 rounded-full ${
                  useCatmullRom
                    ? "bg-amber-400 shadow-[0_0_8px] shadow-amber-400/80"
                    : "bg-neutral-600"
                }`}
              />
            </button>

            {/* Dash alphabet */}
            <button
              type="button"
              aria-pressed={useDashAlphabet}
              onClick={() => setUseDashAlphabet((v) => !v)}
              className={`px-3.5 py-1.5 rounded-md text-sm font-semibold border transition-all duration-100 ease-out flex items-center gap-2 ${
                useDashAlphabet
                  ? "bg-white text-black border-white shadow"
                  : "bg-transparent text-neutral-300 border-neutral-700"
              }`}
              title="Toggle dash alphabet"
            >
              Dash ABC
              <span
                className={`inline-block h-2.5 w-2.5 rounded-full ${
                  useDashAlphabet
                    ? "bg-violet-400 shadow-[0_0_8px] shadow-violet-400/80"
                    : "bg-neutral-600"
                }`}
              />
            </button>
          </div>

          {/* Export buttons */}
          <div className="grid grid-cols-2 gap-2">
            <button
              type="button"
              onClick={exportSVG}
              className="bg-white text-black px-3.5 py-1.5 origin-right rounded-md text-sm font-semibold cursor-pointer active:scale-98 active:brightness-70 hover:brightness-85 transition-all duration-100 ease-out"
            >
              Export SVG
            </button>
            <button
              type="button"
              onClick={exportPNG}
              className="bg-white text-black px-3.5 py-1.5 origin-left rounded-md text-sm font-semibold cursor-pointer active:scale-98 active:brightness-70 hover:brightness-85 transition-all duration-100 ease-out"
            >
              Export PNG
            </button>
          </div>
        </div>

        {/* NEW: CODEC export buttons */}
        {codec && (
          <div className="flex items-center gap-2">
            <button
              type="button"
              onClick={exportCODECtxt}
              className="bg-white text-black px-3.5 py-1.5 rounded-md text-sm font-semibold cursor-pointer active:scale-98 hover:brightness-90 transition-all duration-100 ease-out"
              title="Download a text recipe that can be re-read and compared"
            >
              Export CODEC (txt)
            </button>
            <button
              type="button"
              onClick={exportCODECsvg}
              className="bg-white text-black px-3.5 py-1.5 rounded-md text-sm font-semibold cursor-pointer active:scale-98 hover:brightness-90 transition-all duration-100 ease-out"
              title="Download an SVG containing the recipe in <metadata>"
            >
              Export CODEC (svg)
            </button>
          </div>
        )}

        <a
          href="https://github.com/Chethan30/key-sign"
          target="_blank"
          rel="noreferrer noopener"
          className="font-medium text-neutral-500 border border-neutral-700/50 px-3.5 py-1.5 bg-neutral-900/50 text-sm rounded-md text-center hover:bg-neutral-900/75 hover:text-neutral-200 transition-all duration-100 ease-out"
        >
          View on GitHub
        </a>
      </div>
    </div>
  );
};
