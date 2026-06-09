// Shared formatting + the diverging O/E color scale.

// Diverging missense O/E colour (coolwarm): RED = constrained (low O/E),
// white ~ neutral (O/E 1), BLUE = tolerant (high O/E). Domain [0, 2] centred at 1.
// d3.interpolateRdBu(0)=red ... (0.5)=white ... (1)=blue, so t = O/E / 2.
export function oeColor(oe) {
  if (oe == null || Number.isNaN(oe)) return "#cfd3d8";     // no data
  const v = Math.max(0, Math.min(2, oe));
  return d3.interpolateRdBu(v / 2);
}

// Legend gradient stops (left = constrained -> right = tolerant).
export const OE_GRAD = "linear-gradient(90deg," +
  "#b2182b 0%,#ef8a62 25%,#f7f7f7 50%,#67a9cf 75%,#2166ac 100%)";

export const fmt2 = (x) => (x == null ? "–" : (+x).toFixed(2));
export const fmt3 = (x) => (x == null ? "–" : (+x).toFixed(3));
export const int = (x) => (x == null ? "–" : Math.round(+x).toLocaleString());

export function pretty_p(log10p) {
  if (log10p == null) return "–";
  if (log10p < 1) return "n.s.";
  return `p ≈ 10⁻${Math.round(log10p)}`;   // 10^-N
}

// superscript-minus helper not needed elsewhere; keep concise.
