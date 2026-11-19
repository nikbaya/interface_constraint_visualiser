// Small exact tests and region summaries computed in the browser: pooled missense O/E
// (with 90% / 95% CIs) and ClinVar counts for any residue set, the one-sided Fisher's exact
// (hypergeometric) test used for P/LP enrichment, and Fisher's exact test for P/LP vs B/LB.
// ClinVar counts are residue-level throughout: a residue counts once per category.
import { lnGamma, oeCI } from "./format.js";

const lnChoose = (n, k) => lnGamma(n + 1) - lnGamma(k + 1) - lnGamma(n - k + 1);

// P[X >= k], X ~ Hypergeometric(N items, K of them marked, n drawn without replacement).
// = one-sided (greater) Fisher's exact test on [[k, n - k], [K - k, N - K - n + k]].
export function hypergeomSF(k, N, K, n) {
  const lo = Math.max(0, n - (N - K)), hi = Math.min(K, n);
  if (k <= lo) return 1;
  if (k > hi) return 0;
  let s = 0;
  for (let x = k; x <= hi; x++) s += Math.exp(lnChoose(K, x) + lnChoose(N - K, n - x) - lnChoose(N, n));
  return Math.min(1, s);
}

// Fisher's exact test on [[a, b], [c, d]], two-sided (sum of tables no more likely than
// the observed one, as scipy.stats.fisher_exact). Returns { or, p }.
export function fisher2x2(a, b, c, d) {
  const r1 = a + b, c1 = a + c, n = a + b + c + d;
  const lo = Math.max(0, c1 - (n - r1)), hi = Math.min(r1, c1);
  const lp = (x) => lnChoose(r1, x) + lnChoose(n - r1, c1 - x) - lnChoose(n, c1);
  const obs = lp(a);
  let p = 0;
  for (let x = lo; x <= hi; x++) { const v = lp(x); if (v <= obs + 1e-7) p += Math.exp(v); }
  const or = b * c === 0 ? (a * d === 0 ? null : Infinity) : (a * d) / (b * c);
  return { or, p: Math.min(1, p) };
}

// ClinVar categories per residue: Map pos -> { P: bool, B: bool } (missense; a residue can be both,
// with different substitutions).
export function clinvarResidues(prot) {
  const m = new Map();
  for (const [pos, cat] of (prot.clinvar && prot.clinvar.positions) || []) {
    if (!m.has(pos)) m.set(pos, { P: false, B: false });
    m.get(pos)[cat === "P" ? "P" : "B"] = true;
  }
  return m;
}

// Pooled missense O/E and ClinVar P/LP / B/LB residue counts for a residue set and its complement.
// `inSet(pos)` -> boolean. Residues without an expected count add nothing to obs / exp.
export function regionStats(prot, inSet) {
  const cv = prot._cvRes || (prot._cvRes = clinvarResidues(prot));
  // P / B: residues with any P/LP / any B/LB substitution (a residue with both counts in each).
  // Ponly / Bonly / mixed: the same residues split so each falls in one class, for P/LP vs B/LB.
  const z = () => ({ n: 0, obs: 0, exp: 0, P: 0, B: 0, Ponly: 0, Bonly: 0, mixed: 0 });
  const s = { in: z(), out: z() };
  for (const r of prot.residueRows) {
    const t = inSet(r.pos) ? s.in : s.out;
    t.n++;
    if (r.exp != null && r.exp > 0) { t.obs += r.obs || 0; t.exp += r.exp; }
    const c = cv.get(r.pos);
    if (c) { t.P += c.P ? 1 : 0; t.B += c.B ? 1 : 0; if (c.P && c.B) t.mixed++; else if (c.P) t.Ponly++; else t.Bonly++; }
  }
  for (const t of [s.in, s.out]) {
    t.oe = t.exp > 0 ? t.obs / t.exp : null;
    t.ci90 = oeCI(t.obs, t.exp, 0.90);
    t.ci95 = oeCI(t.obs, t.exp, 0.95);
  }
  // P/LP relative to B/LB: [[P_in, B_in], [P_out, B_out]] over residues that are only P/LP or only
  // B/LB. Fisher needs each residue in exactly one cell; a residue with both (different
  // substitutions) would sit in both rows, so those are left out (s.mixed reports how many).
  s.mixed = s.in.mixed + s.out.mixed;
  s.fisher = s.in.Ponly + s.in.Bonly + s.out.Ponly + s.out.Bonly > 0 ? fisher2x2(s.in.Ponly, s.in.Bonly, s.out.Ponly, s.out.Bonly) : null;
  return s;
}

// Residue-level P/LP enrichment in a set of `nSet` of the protein's `L` residues, given k of
// its n P/LP residues fall in the set: one-sided Fisher's exact (hypergeometric), as the headline.
export function plpEnrichment(k, n, nSet, L) {
  if (!n || !(nSet > 0 && nSet < L)) return null;
  const p = hypergeomSF(k, L, nSet, n);
  return { k, n, frac: nSet / L, ratio: k / n / (nSet / L), p, log10p: -Math.log10(Math.max(p, 1e-300)) };
}

export const neglog10 = (p) => (p == null ? null : -Math.log10(Math.max(p, 1e-300)));
