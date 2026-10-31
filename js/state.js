// Tiny shared UI state for the protein page: what is selected / hovered, synced
// to the URL so any view is shareable. Every renderer subscribes and reacts to the
// keys it cares about, which is what makes the forest, track, network and 3D
// views move together.
//
//   partner : UniProt ID of the selected partner (null = none)
//   range   : [start, end] residue window shown in the browser (null = whole protein)
//   hover   : hovered residue position (null) — transient, never in the URL
//   pdb     : PDB ID chosen in the 3D panel (null = partner's representative)
//   mode3d  : 'partner' | 'mosaic' | 'complex'
//   focus   : pinned residue (from variant / residue search)

const state = { partner: null, range: null, hover: null, pdb: null, mode3d: "partner", focus: null };
const subs = new Set();
let uni = null;           // current protein (for URL building)
let suppressURL = false;

export function get() { return state; }
export function subscribe(fn) { subs.add(fn); return () => subs.delete(fn); }

export function set(patch, { url = true } = {}) {
  const changed = [];
  for (const [k, v] of Object.entries(patch)) {
    if (!same(state[k], v)) { state[k] = v; changed.push(k); }
  }
  if (!changed.length) return;
  if (url && !suppressURL && changed.some((k) => k !== "hover")) syncURL();
  for (const fn of subs) { try { fn(state, changed); } catch (e) { console.error(e); } }
}

export function reset(newUni, fromURL = {}) {
  uni = newUni;
  suppressURL = true;
  set({ partner: null, range: null, hover: null, pdb: null, mode3d: "partner", focus: null, ...fromURL }, { url: false });
  suppressURL = false;
}

function same(a, b) {
  if (Array.isArray(a) && Array.isArray(b)) return a.length === b.length && a.every((x, i) => x === b[i]);
  return a === b;
}

// URL: #/{uni}?partner=Q..&res=12-340&pdb=6QDV&mode=mosaic&hl=175
export function buildHash() {
  if (!uni) return "#/";
  const q = new URLSearchParams();
  if (state.partner) q.set("partner", state.partner);
  if (state.range) q.set("res", `${state.range[0]}-${state.range[1]}`);
  if (state.pdb) q.set("pdb", state.pdb);
  if (state.mode3d && state.mode3d !== "partner") q.set("mode", state.mode3d);
  if (state.focus) q.set("hl", state.focus);
  const qs = q.toString();
  return `#/${uni}${qs ? "?" + qs : ""}`;
}

function syncURL() {
  const h = buildHash();
  if (location.hash !== h) history.replaceState(null, "", h);
}

export function parseQuery(qs) {
  const q = new URLSearchParams(qs || "");
  const out = {};
  if (q.get("partner")) out.partner = q.get("partner");
  const r = (q.get("res") || "").match(/^(\d+)-(\d+)$/);
  if (r) out.range = [Math.min(+r[1], +r[2]), Math.max(+r[1], +r[2])];
  if (q.get("pdb")) out.pdb = q.get("pdb").toUpperCase();
  if (q.get("mode")) out.mode3d = q.get("mode");
  if (q.get("hl")) out.focus = parseInt(q.get("hl"), 10) || null;
  return out;
}
