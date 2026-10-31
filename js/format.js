// Shared formatting, the diverging O/E colour scale and the partner palette.

// Diverging missense O/E colour (coolwarm): RED = constrained (low O/E),
// white ~ neutral (O/E 1), BLUE = tolerant (high O/E). Lab interpolation
// between matplotlib-coolwarm endpoints; domain tightened so the typical
// constrained range reads as saturated red rather than pink.
const CW_RED = "#b40426";
const CW_MID = "#f7f7f7";
const CW_BLUE = "#3b4cc0";
const warm = d3.interpolateLab(CW_RED, CW_MID);
const cool = d3.interpolateLab(CW_MID, CW_BLUE);
const oeT = d3.scaleLinear().domain([0.15, 1.85]).range([0, 1]).clamp(true);

export function oeColor(oe) {
  if (oe == null || Number.isNaN(oe)) return "var(--nodata)";
  const t = oeT(oe);
  return t <= 0.5 ? warm(t / 0.5) : cool((t - 0.5) / 0.5);
}
export function oeColorHex(oe) {  // for canvas (no CSS vars)
  if (oe == null || Number.isNaN(oe)) return "#cfd3d8";
  return oeColor(oe);
}

export function oeGradient() {
  return `linear-gradient(90deg,${CW_RED},${CW_MID} 50%,${CW_BLUE})`;
}

// Categorical palette for partners (Okabe-Ito-inspired + extensions). Index wraps;
// a second pass uses a lighter tint.
export const PARTNER_PALETTE = [
  "#0072B2", "#E69F00", "#009E73", "#CC79A7", "#56B4E9", "#D55E00", "#8C564B",
  "#7F7F7F", "#BCBD22", "#17BECF", "#9467BD", "#2CA02C",
];
export function partnerColor(i, type) {
  if (type === "unidentified") return "#9aa0a6";
  if (type === "homomeric") return "#69488E";
  const base = PARTNER_PALETTE[i % PARTNER_PALETTE.length];
  return Math.floor(i / PARTNER_PALETTE.length) % 2 ? d3.color(base).brighter(0.8).formatHex() : base;
}

export const fmt1 = (x) => (x == null ? "–" : (+x).toFixed(1));
export const fmt2 = (x) => (x == null ? "–" : (+x).toFixed(2));
export const fmt3 = (x) => (x == null ? "–" : (+x).toFixed(3));
export const int = (x) => (x == null ? "–" : Math.round(+x).toLocaleString());

const SUP = { "-": "⁻", 0: "⁰", 1: "¹", 2: "²", 3: "³", 4: "⁴", 5: "⁵", 6: "⁶", 7: "⁷", 8: "⁸", 9: "⁹" };
const sup = (n) => String(n).split("").map((c) => SUP[c] ?? c).join("");

// -log10 p -> "p ≈ 10⁻¹³" (or "p = 0.03" in the readable range, "n.s." above 0.05).
export function pretty_p(log10p, { ns = true } = {}) {
  if (log10p == null) return "–";
  if (log10p < 1.301 && ns) return "n.s.";
  if (log10p < 3) return `p = ${Math.pow(10, -log10p).toPrecision(2)}`;
  return `p ≈ 10${sup(-Math.round(log10p))}`;
}
export function pretty_q(q) {
  if (q == null) return "–";
  return q < 0.001 ? `q < 0.001` : `q = ${q.toPrecision(2)}`;
}

export const escapeHTML = (s) => String(s ?? "").replace(/[&<>"']/g, (c) =>
  ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]));

export const BOND_LABEL = { hbond: "H-bond", nonbonded: "non-bonded", salt_bridge: "salt bridge", disulfide: "disulfide" };
export const bondList = (arr) => (arr || []).map((b) => BOND_LABEL[b] || b).join(", ") || "–";
export const TYPE_LABEL = { heteromeric: "heteromer", homomeric: "homomer (self)", processed_chain: "other processed chain", unidentified: "unidentified chain" };
