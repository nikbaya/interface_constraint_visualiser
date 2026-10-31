// Header search: fuzzy matching over gene symbols, aliases, UniProt IDs and
// protein names, plus residue queries ("TP53 R175H", "TP53:175") and GRCh38
// variant coordinates ("17-7674220-C-T"). Results drop down under the input
// with keyboard navigation; Enter takes the top hit.
import { escapeHTML, fmt2, oeColor } from "./format.js";
import { prefetchProtein } from "./data.js";

let INDEX = [], MAPS = null, onVariant = null;
let items = [], active = -1;
const el = (id) => document.getElementById(id);

export function initSearch(index, maps, handlers) {
  INDEX = index.proteins; MAPS = maps; onVariant = handlers.onVariant;
  const input = el("search"), box = el("search-results");
  input.setAttribute("placeholder", "Gene, protein, UniProt, TP53 R175H, or 17-7674220-C-T");
  input.addEventListener("input", () => showResults(input.value));
  input.addEventListener("focus", () => { if (input.value) showResults(input.value); });
  input.addEventListener("keydown", (e) => {
    if (e.key === "ArrowDown") { e.preventDefault(); move(1); }
    else if (e.key === "ArrowUp") { e.preventDefault(); move(-1); }
    else if (e.key === "Escape") { hide(); input.blur(); }
  });
  el("search-form").addEventListener("submit", (e) => { e.preventDefault(); submit(input.value); });
  document.addEventListener("click", (e) => { if (!e.target.closest("#search-form")) hide(); });
  document.addEventListener("keydown", (e) => {
    if (e.key === "/" && !/input|textarea/i.test(document.activeElement?.tagName)) { e.preventDefault(); input.focus(); input.select(); }
  });
}

// ---- parsing ---------------------------------------------------------------
export function parseVariant(q) {
  const m = q.trim().match(/^(?:chr)?(\d{1,2}|x|y|m|mt)[-:_ ]0*(\d+)\b/i);
  if (!m) return null;
  let chrom = m[1].toUpperCase(); if (chrom === "MT") chrom = "M";
  return { chrom, pos: parseInt(m[2], 10) };
}
const AA3 = { Ala: "A", Arg: "R", Asn: "N", Asp: "D", Cys: "C", Gln: "Q", Glu: "E", Gly: "G", His: "H", Ile: "I", Leu: "L", Lys: "K", Met: "M", Phe: "F", Pro: "P", Ser: "S", Thr: "T", Trp: "W", Tyr: "Y", Val: "V", Ter: "*" };
// "TP53 R175H" | "TP53 p.Arg175His" | "TP53:175" | "TP53 175" -> {gene, pos, ref, alt}
export function parseResidueQuery(q) {
  const m = q.trim().match(/^([A-Za-z0-9][\w.-]*)[\s:\/]+(?:p\.)?(?:([A-Z][a-z]{2}|[A-Z]))?(\d+)(?:([A-Z][a-z]{2}|[A-Z*]))?$/);
  if (!m) return null;
  const one = (x) => (x == null ? null : (x.length === 3 ? AA3[x] || null : x));
  return { gene: m[1], ref: one(m[2]), pos: parseInt(m[3], 10), alt: one(m[4]) };
}
export function lookup(key) {
  const k = (key || "").toUpperCase();
  return MAPS.byUni.get(k) || MAPS.bySymbol.get(k) || MAPS.byAlias.get(k) || null;
}

// ---- matching --------------------------------------------------------------
export function search(q, limit = 8) {
  const s = q.trim().toLowerCase();
  if (!s) return [];
  const out = [];
  for (const p of INDEX) {
    const sym = p.s.toLowerCase(), uni = p.u.toLowerCase();
    let score = 0, via = null;
    if (sym === s) score = 100;
    else if (uni === s) score = 95;
    else if (sym.startsWith(s)) score = 80 - (sym.length - s.length) * 0.5;
    else if (uni.startsWith(s)) score = 70;
    else {
      const al = (p.a || []).find((a) => a.toLowerCase() === s) || (p.a || []).find((a) => a.toLowerCase().startsWith(s));
      if (al) { score = al.toLowerCase() === s ? 75 : 60; via = al; }
      else if (sym.includes(s)) score = 40;
      else if (p.n && p.n.toLowerCase().includes(s)) { score = s.length >= 3 ? 30 : 0; via = p.n; }
    }
    if (score > 0) out.push({ p, score, via });
  }
  out.sort((a, b) => b.score - a.score || (b.p.p || 0) - (a.p.p || 0) || a.p.s.localeCompare(b.p.s));
  return out.slice(0, limit);
}

// ---- dropdown --------------------------------------------------------------
function showResults(q) {
  const box = el("search-results");
  if (parseVariant(q)) { items = []; box.innerHTML = `<div class="sr-hint">Press Enter to locate this GRCh38 variant</div>`; box.hidden = false; return; }
  const rq = parseResidueQuery(q);
  const hit = rq && lookup(rq.gene);
  if (hit && rq.pos) {
    items = [{ p: hit, pos: rq.pos, label: `${hit.s} residue ${rq.ref || ""}${rq.pos}${rq.alt || ""}` }];
    render(items.map((it) => `<div class="sr-item" data-i="0"><b>${escapeHTML(it.label)}</b><span class="sr-sub">jump to residue</span></div>`));
    return;
  }
  items = search(q).map((r) => ({ p: r.p, via: r.via }));
  if (!items.length) { box.innerHTML = `<div class="sr-hint">No protein matches “${escapeHTML(q)}”</div>`; box.hidden = false; return; }
  render(items.map((it, i) => {
    const p = it.p;
    return `<div class="sr-item" data-i="${i}">
      <span class="sr-dot" style="background:${oeColor(p.oi)}"></span>
      <b>${escapeHTML(p.s)}</b><span class="sr-uni">${p.u}</span>
      <span class="sr-sub">${escapeHTML(it.via && it.via !== p.n ? `alias ${it.via} · ` : "")}${escapeHTML(p.n || "")}</span>
      <span class="sr-oe">O/E ${fmt2(p.oi)} <span class="muted">vs ${fmt2(p.on)}</span></span></div>`;
  }));
}
function render(html) {
  const box = el("search-results");
  box.innerHTML = html.join(""); box.hidden = false; active = -1;
  box.querySelectorAll(".sr-item").forEach((d) => {
    d.addEventListener("mousedown", (e) => { e.preventDefault(); pick(+d.dataset.i); });
    d.addEventListener("mouseenter", () => prefetchProtein(items[+d.dataset.i]?.p?.u));
  });
}
function move(d) {
  const n = items.length; if (!n) return;
  active = (active + d + n) % n;
  el("search-results").querySelectorAll(".sr-item").forEach((x, i) => x.classList.toggle("active", i === active));
}
function hide() { el("search-results").hidden = true; active = -1; }
function pick(i) {
  const it = items[i]; if (!it) return;
  hide(); el("search").blur();
  location.hash = it.pos ? `#/${it.p.u}?hl=${it.pos}` : `#/${it.p.u}`;
}
async function submit(raw) {
  const v = parseVariant(raw);
  if (v) { hide(); el("search").blur(); return onVariant && onVariant(v); }
  if (active >= 0) return pick(active);
  if (!items.length) showResults(raw);
  if (items.length) pick(0);
}
