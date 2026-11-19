// Data access: cached JSON fetches, hover-prefetch, and decoding of the compact
// per-protein schema (v2) into the row objects the renderers use.
import { partnerColor, oeCI, EXOGENOUS } from "./format.js";

const cache = new Map();

export async function fetchJSON(url) {
  if (cache.has(url)) return cache.get(url);
  const p = fetch(url).then((r) => { if (!r.ok) throw new Error(`HTTP ${r.status}`); return r.json(); });
  cache.set(url, p);
  p.catch(() => cache.delete(url));
  return p;
}
export function prefetchProtein(uni) {
  if (!uni || cache.has(`data/${uni}.json`)) return;
  fetchJSON(`data/${uni}.json`).catch(() => {});
}
export async function loadProtein(uni) {
  const doc = await fetchJSON(`data/${uni}.json`);
  return doc._decoded ? doc : decodeProtein(doc);
}

// Columnar residues -> array of {pos, aa, obs, exp, oe, is_interface}
// plus lookup maps; partners get a stable colour + index; contact sets become Sets.
export function decodeProtein(doc) {
  const L = doc.length;
  const R = doc.residues || {};
  const iface = new Set(R.interface || []);
  const rows = new Array(L);
  for (let i = 0; i < L; i++) {
    const obs = R.obs ? R.obs[i] : null, exp = R.exp ? R.exp[i] : null;
    rows[i] = {
      pos: i + 1, aa: R.seq ? R.seq[i] : "?", obs, exp,
      oe: exp != null && exp > 0 && obs != null ? obs / exp : null,
      is_interface: iface.has(i + 1),
    };
  }
  doc.residueRows = rows;
  doc.byPos = (p) => (p >= 1 && p <= L ? rows[p - 1] : null);
  doc.interfaceSet = iface;

  // Whole-protein totals, so each partner's "rest of protein" (everything except its
  // contacts) gets obs/exp and a 95% CI, not just the precomputed oe_rest point.
  const S = doc.summary || {};
  const totObs = (S.interface?.obs ?? 0) + (S.noninterface?.obs ?? 0);
  const totExp = (S.interface?.exp ?? 0) + (S.noninterface?.exp ?? 0);
  let hi = 0;
  (doc.partners || []).forEach((p, i) => {
    p.index = i;
    if (p.oe && p.oe.obs != null && totExp - p.oe.exp > 0) {
      const obs = totObs - p.oe.obs, exp = totExp - p.oe.exp, [lo, up] = oeCI(obs, exp);
      p.oe.rest = { obs, exp, oe: p.oe.oe_rest ?? obs / exp, ci_low: lo, ci_high: up };
    }
    p.color = partnerColor(p.type === "heteromeric" || EXOGENOUS.has(p.type) ? hi++ : i, p.type);
    p.contactSet = new Set(p.contacts_self || []);
    p.label = p.type === "homomeric" ? `= ${p.gene_symbol || p.uniprot_id}` : (p.gene_symbol || p.uniprot_id);
  });
  doc.partnerByUni = new Map((doc.partners || []).map((p) => [p.uniprot_id, p]));

  // Residue -> partners touching it (for tooltips / mosaic colouring).
  const touch = new Map();
  for (const p of doc.partners || []) for (const r of p.contacts_self || []) {
    if (!touch.has(r)) touch.set(r, []);
    touch.get(r).push(p);
  }
  doc.partnersAt = (pos) => touch.get(pos) || [];

  // UniProt -> PDB author numbering, per "PDB:CHAIN".
  doc.toAuthor = (pdb, chain, pos) => {
    const s = doc.segments && doc.segments[`${pdb}:${chain}`];
    if (!s) return pos;                      // assume identity numbering
    for (const [a, b, pb] of s.segs) if (pos >= a && pos <= b) return pb + (pos - a);
    return null;                             // not resolved in this chain
  };
  doc.fromAuthor = (pdb, chain, auth) => {
    const s = doc.segments && doc.segments[`${pdb}:${chain}`];
    if (!s) return auth;
    for (const [a, b, pb] of s.segs) { const pe = pb + (b - a); if (auth >= pb && auth <= pe) return a + (auth - pb); }
    return null;
  };
  doc._decoded = true;
  return doc;
}

// Coding exons in residue coordinates, from the GENCODE CDS intervals in variant_index.json
// (the exported transcript). Exons are numbered in transcript order (coding exons only, so
// UTR-only exons are not counted). Residue p spans [p - 0.5, p + 0.5]; CDS nucleotide offset o
// (0-based) sits at 0.5 + o / 3, so a codon split across two exons is drawn split too.
// Returns null when the protein has no transcript or its CDS length is not 3 × length.
export async function loadExons(uni, length) {
  const vi = await fetchJSON("data/variant_index.json");
  const t = vi.transcripts.find((x) => x.uniprot_id === uni);
  if (!t) return null;
  const cds = t.strand === "-" ? t.cds.slice().reverse() : t.cds.slice();
  const nt = cds.reduce((s, [a, b]) => s + b - a + 1, 0);
  if (nt !== 3 * length) return { transcript: t.transcript, mismatch: true, nt };
  let o = 0;
  const exons = cds.map(([g0, g1], i) => {
    const o0 = o; o += g1 - g0 + 1;
    return { n: i + 1, x0: 0.5 + o0 / 3, x1: 0.5 + o / 3, r0: Math.floor(o0 / 3) + 1, r1: Math.floor((o - 1) / 3) + 1, g0, g1 };
  });
  return { transcript: t.transcript, chrom: t.chrom, strand: t.strand, assembly: vi.assembly, gencode: vi.gencode, exons };
}

// Index helpers -------------------------------------------------------------
export function indexMaps(index) {
  const bySymbol = new Map(), byUni = new Map(), byAlias = new Map();
  for (const p of index.proteins) {
    bySymbol.set(p.s.toUpperCase(), p); byUni.set(p.u.toUpperCase(), p);
    for (const a of p.a || []) if (!byAlias.has(a.toUpperCase())) byAlias.set(a.toUpperCase(), p);
  }
  return { bySymbol, byUni, byAlias };
}
