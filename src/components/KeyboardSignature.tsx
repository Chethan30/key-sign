import { useEffect, useMemo, useState } from "react";

type KeyboardLayout = "qwerty";
type Key = { x: number; y: number };
type SegmentStyle = "solid" | "dashed" | "dotted";

const keyboardLayouts: Record<KeyboardLayout, Record<string, Key>> = {
  qwerty: {
    // Numbers row
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

    // Q row
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

    // A row
    A: { x: 0.75, y: 1 },
    S: { x: 1.75, y: 1 },
    D: { x: 2.75, y: 1 },
    F: { x: 3.75, y: 1 },
    G: { x: 4.75, y: 1 },
    H: { x: 5.75, y: 1 },
    J: { x: 6.75, y: 1 },
    K: { x: 7.75, y: 1 },
    L: { x: 8.75, y: 1 },

    // Z row
    Z: { x: 1.25, y: 2 },
    X: { x: 2.25, y: 2 },
    C: { x: 3.25, y: 2 },
    V: { x: 4.25, y: 2 },
    B: { x: 5.25, y: 2 },
    N: { x: 6.25, y: 2 },
    M: { x: 7.25, y: 2 },
  },
} as const;

export const KeyboardSignature = () => {
  const [name, setName] = useState("");
  const [currentKeyboardLayout] = useState<KeyboardLayout>("qwerty");
  const [keyboardVisible, setKeyboardVisible] = useState(false);
  const [curved, setCurved] = useState(false);
  const [capsOn, setCapsOn] = useState(false); // NEW: Caps state

  // visual constants
  const KEY_SPACING = 60;
  const KEY_W = 56;
  const KEY_H = 48;
  const PAD_X = 18;
  const PAD_Y = 18;

  const layout = keyboardLayouts[currentKeyboardLayout];
  const all = Object.values(layout);

  // bounds
  const minX = Math.min(...all.map((k) => k.x));
  const maxX = Math.max(...all.map((k) => k.x));
  const minY = Math.min(...all.map((k) => k.y));
  const maxY = Math.max(...all.map((k) => k.y));

  const SHIFT_X = -minX * KEY_SPACING;
  const SHIFT_Y = -minY * KEY_SPACING;

  const WIDTH = (maxX - minX) * KEY_SPACING + KEY_W + PAD_X * 2;
  const HEIGHT = (maxY - minY) * KEY_SPACING + KEY_H + PAD_Y * 2;

  // Track physical CapsLock key
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

  // keyboard flash when name changes
  useEffect(() => {
    if (name.length > 0) {
      setKeyboardVisible(true);
      const timer = setTimeout(() => setKeyboardVisible(false), 100);
      return () => clearTimeout(timer);
    } else {
      setKeyboardVisible(false);
    }
  }, [name]);

  // map a character to the center of its key
  const getKeyCenter = (ch: string) => {
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

  const classifyStyle = (a: string, b: string): SegmentStyle => {
    const isNumOrUnd = (c: string) => /[0-9_]/.test(c);
    const isUpper = (c: string) => /^[A-Z]$/.test(c);
    const isLower = (c: string) => /^[a-z]$/.test(c);
    const isLetter = (c: string) => isUpper(c) || isLower(c);

    if (isNumOrUnd(a) || isNumOrUnd(b)) return "dotted";
    if (isLetter(a) && isLetter(b)) {
      return isUpper(a) && isUpper(b) ? "solid" : "dashed";
    }
    return "solid";
  };

  // Build segments (straight or curved) depending on toggle
  const segments = useMemo(() => {
    if (!name) return [] as Array<{ d: string; style: SegmentStyle }>;

    const pts = name.split("").map(getKeyCenter).filter(Boolean) as Array<{
      x: number;
      y: number;
      ch: string;
    }>;

    if (pts.length < 2) return [];

    const segs: Array<{ d: string; style: SegmentStyle }> = [];

    for (let i = 1; i < pts.length; i++) {
      const a = pts[i - 1];
      const b = pts[i];
      const style = classifyStyle(a.ch, b.ch);

      if (!curved) {
        segs.push({ d: `M ${a.x} ${a.y} L ${b.x} ${b.y}`, style });
      } else {
        const prev = i - 2 >= 0 ? pts[i - 2] : a;
        const dx = b.x - a.x;
        const dy = b.y - a.y;
        const len = Math.hypot(dx, dy) || 1;
        const nx = -dy / len;
        const ny = dx / len;
        const cprod =
          (a.x - prev.x) * (b.y - a.y) - (a.y - prev.y) * (b.x - a.x);
        const sign = cprod === 0 ? 1 : Math.sign(cprod);
        const amp = Math.min(12, len * 0.22);
        const cx = (a.x + b.x) / 2 + nx * amp * sign;
        const cy = (a.y + b.y) / 2 + ny * amp * sign;

        segs.push({ d: `M ${a.x} ${a.y} Q ${cx} ${cy} ${b.x} ${b.y}`, style });
      }
    }

    return segs;
  }, [name, curved, SHIFT_X, SHIFT_Y, PAD_X, PAD_Y]);

  // Active keys (highlight)
  const activeKeys = useMemo(() => {
    const mapped = name
      .split("")
      .map((c) => (/[a-zA-Z]/.test(c) ? c.toUpperCase() : c))
      .filter((c) => c in layout);
    return new Set(mapped);
  }, [name, layout]);

  const exportSVG = () => {
    if (segments.length === 0 || !name) return;
    const mk = (s: { d: string; style: SegmentStyle }) => {
      const dash =
        s.style === "dashed"
          ? ` stroke-dasharray="8 6"`
          : s.style === "dotted"
          ? ` stroke-dasharray="1 8"`
          : "";
      return `<path d="${s.d}" stroke="black" stroke-width="3" fill="none" stroke-linecap="round" stroke-linejoin="round"${dash}/>`;
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
    const W = Math.ceil(WIDTH);
    const H = Math.ceil(HEIGHT);

    const canvas = document.createElement("canvas");
    canvas.width = W * 2;
    canvas.height = H * 2;
    const ctx = canvas.getContext("2d");
    if (!ctx) return;

    ctx.scale(2, 2);
    ctx.fillStyle = "black";
    ctx.fillRect(0, 0, W, H);

    ctx.strokeStyle = "white";
    ctx.lineWidth = 3;
    ctx.lineCap = "round";
    ctx.lineJoin = "round";

    for (const s of segments) {
      if (s.style === "solid") ctx.setLineDash([]);
      else if (s.style === "dashed") ctx.setLineDash([8, 6]);
      else ctx.setLineDash([1, 8]);
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

  // Helper to render label & produce the character appended on click
  const renderKeyLabel = (char: string) => {
    const isLetter = /^[A-Z]$/.test(char);
    return isLetter ? (capsOn ? char : char.toLowerCase()) : char;
  };
  const clickCharToAppend = (char: string) => {
    const isLetter = /^[A-Z]$/.test(char);
    return isLetter ? (capsOn ? char : char.toLowerCase()) : char;
  };

  return (
    <div
      className={`flex flex-col sm:items-center sm:justify-center max-sm:mx-auto max-sm:w-[28rem] sm:w-fit`}
    >
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

        {/* Signature */}
        <svg
          className="pointer-events-none absolute top-0 left-0"
          width={Math.ceil(WIDTH)}
          height={Math.ceil(HEIGHT)}
          style={{ zIndex: 10 }}
        >
          <title>
            A digital signature, created by connecting the points of typed
            characters on the keyboard.
          </title>

          {segments.map((s, i) => (
            <path
              key={i}
              d={s.d}
              stroke="white"
              strokeWidth="3"
              fill="none"
              strokeLinecap="round"
              strokeLinejoin="round"
              strokeDasharray={
                s.style === "dashed"
                  ? "8 6"
                  : s.style === "dotted"
                  ? "1 8"
                  : undefined
              }
            />
          ))}
        </svg>
      </div>

      <div
        className={`max-sm:w-[20rem] max-sm:mx-auto flex flex-col gap-2 sm:mt-8 transition-all ease-in-out ${
          name.length > 0
            ? "opacity-100 translate-y-0 duration-1000"
            : "opacity-0 translate-y-2 duration-150"
        }`}
      >
        {/* Controls */}
        <div className="flex items-center justify-between gap-2 flex-wrap">
          {/* Toggle group */}
          <div className="flex items-center gap-2">
            {/* Caps toggle (unchanged style) */}
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

            {/* Curves toggle — same style, orange light */}
            <button
              type="button"
              aria-pressed={curved}
              onClick={() => setCurved((v) => !v)}
              className={`px-3.5 py-1.5 rounded-md text-sm font-semibold border transition-all duration-100 ease-out flex items-center gap-2 ${
                curved
                  ? "bg-white text-black border-white shadow"
                  : "bg-transparent text-neutral-300 border-neutral-700"
              }`}
              title="Toggle Curved Lines"
            >
              Curves
              <span
                className={`inline-block h-2.5 w-2.5 rounded-full ${
                  curved
                    ? "bg-amber-400 shadow-[0_0_8px] shadow-amber-400/80"
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
