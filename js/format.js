// Shared formatting + the diverging O/E color scale.

// Diverging missense O/E colour (coolwarm): RED = constrained (low O/E),
// white ~ neutral (O/E 1), BLUE = tolerant (high O/E).
// Built from matplotlib-coolwarm endpoints via Lab interpolation, which avoids
// the pale-orange control points of ColorBrewer RdBu (those made mid-range
// misOEUF values read as "orange"). Domain is symmetric about 1 and tightened so
// the typical constrained O/E range lands in saturated red rather than pink.
const CW_RED = "#b40426";
const CW_MID = "#f7f7f7";
const CW_BLUE = "#3b4cc0";
const warm = d3.interpolateLab(CW_RED, CW_MID);   // t 0..1 : red -> white
const cool = d3.interpolateLab(CW_MID, CW_BLUE);  // t 0..1 : white -> blue
const oeT = d3.scaleLinear().domain([0.15, 1.85]).range([0, 1]).clamp(true);

export function oeColor(oe) {
  if (oe == null || Number.isNaN(oe)) return "#cfd3d8";     // no data
  const t = oeT(oe);
  return t <= 0.5 ? warm(t / 0.5) : cool((t - 0.5) / 0.5);
}

// Legend gradient (left = constrained/red -> right = tolerant/blue).
export const OE_GRAD = `linear-gradient(90deg,${CW_RED},${CW_MID} 50%,${CW_BLUE})`;

export const fmt2 = (x) => (x == null ? "–" : (+x).toFixed(2));
export const fmt3 = (x) => (x == null ? "–" : (+x).toFixed(3));
export const int = (x) => (x == null ? "–" : Math.round(+x).toLocaleString());

const SUP = { "-": "⁻", 0: "⁰", 1: "¹", 2: "²", 3: "³", 4: "⁴", 5: "⁵", 6: "⁶", 7: "⁷", 8: "⁸", 9: "⁹" };
const sup = (n) => String(n).split("").map((c) => SUP[c] ?? c).join("");

export function pretty_p(log10p) {
  if (log10p == null) return "–";
  if (log10p < 1) return "n.s.";
  return `p ≈ 10${sup(-Math.round(log10p))}`;   // e.g. 10⁻¹³
}
