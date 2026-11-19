// Small exact tests and region summaries computed in the browser: pooled missense O/E
// (with 90% / 95% CIs) and ClinVar counts for any residue set, the one-sided binomial
// used for P/LP interface enrichment, and Fisher's exact test for P/LP vs B/LB.
import { lnGamma, oeCI } from "./format.js";

const lnChoose = (n, k) => lnGamma(n + 1) - lnGamma(k + 1) - lnGamma(n - k + 1);

// P[X >= k], X ~ Binomial(n, p)  (scipy.stats.binom.sf(k - 1, n, p))
export function binomSF(k, n, p) {
  if (k <= 0) return 1;
  if (k > n) return 0;
  if (p <= 0) return 0;
  if (p >= 1) return 1;
  let s = 0;
  for (let i = k; i <= n; i++) s += Math.exp(lnChoose(n, i) + i * Math.log(p) + (n - i) * Math.log1p(-p));
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

// ClinVar allele counts per residue: Map pos -> { P: n, B: n } (missense, distinct substitutions).
export function clinvarAlleles(prot) {
  const m = new Map();
  for (const [pos, cat, n = 1] of (prot.clinvar && prot.clinvar.positions) || []) {
    if (!m.has(pos)) m.set(pos, { P: 0, B: 0 });
    m.get(pos)[cat === "P" ? "P" : "B"] += n;
  }
  return m;
}

// Pooled missense O/E and ClinVar P/LP / B/LB alleles for a residue set and its complement.
// `inSet(pos)` -> boolean. Residues without an expected count add nothing to obs / exp.
export function regionStats(prot, inSet) {
  const cv = prot._cvAlleles || (prot._cvAlleles = clinvarAlleles(prot));
  const z = () => ({ n: 0, obs: 0, exp: 0, P: 0, B: 0, plpRes: 0 });
  const s = { in: z(), out: z() };
  for (const r of prot.residueRows) {
    const t = inSet(r.pos) ? s.in : s.out;
    t.n++;
    if (r.exp != null && r.exp > 0) { t.obs += r.obs || 0; t.exp += r.exp; }
    const c = cv.get(r.pos);
    if (c) { t.P += c.P; t.B += c.B; if (c.P) t.plpRes++; }
  }
  for (const t of [s.in, s.out]) {
    t.oe = t.exp > 0 ? t.obs / t.exp : null;
    t.ci90 = oeCI(t.obs, t.exp, 0.90);
    t.ci95 = oeCI(t.obs, t.exp, 0.95);
  }
  // P/LP relative to B/LB: [[P_in, B_in], [P_out, B_out]]
  s.fisher = s.in.P + s.in.B + s.out.P + s.out.B > 0 ? fisher2x2(s.in.P, s.in.B, s.out.P, s.out.B) : null;
  return s;
}

// One-sided binomial P/LP enrichment on alleles: k of n P/LP alleles fall in a set that
// holds a fraction `frac` of the protein's residues.
export function plpEnrichment(k, n, frac) {
  if (!n || !(frac > 0 && frac < 1)) return null;
  const p = binomSF(k, n, frac);
  return { k, n, frac, ratio: k / n / frac, p, log10p: -Math.log10(Math.max(p, 1e-300)) };
}

export const neglog10 = (p) => (p == null ? null : -Math.log10(Math.max(p, 1e-300)));
