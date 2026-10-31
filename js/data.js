// Data access: cached JSON fetches, hover-prefetch, and decoding of the compact
// per-protein schema (v2) into the row objects the renderers use.
import { partnerColor } from "./format.js";

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

  let hi = 0;
  (doc.partners || []).forEach((p, i) => {
    p.index = i;
    p.color = partnerColor(p.type === "heteromeric" ? hi++ : i, p.type);
    p.contactSet = new Set(p.contacts_self || []);
    p.label = p.type === "homomeric" ? `↻ ${p.gene_symbol || p.uniprot_id}` : (p.gene_symbol || p.uniprot_id);
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

// Index helpers -------------------------------------------------------------
export function indexMaps(index) {
  const bySymbol = new Map(), byUni = new Map(), byAlias = new Map();
  for (const p of index.proteins) {
    bySymbol.set(p.s.toUpperCase(), p); byUni.set(p.u.toUpperCase(), p);
    for (const a of p.a || []) if (!byAlias.has(a.toUpperCase())) byAlias.set(a.toUpperCase(), p);
  }
  return { bySymbol, byUni, byAlias };
}
