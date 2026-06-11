// App entry: load the index, route by URL hash, render landing + protein views.
import { oeColor, OE_GRAD, fmt2, int, pretty_p } from "./format.js";
import { renderTrack } from "./residueTrack.js";
import { renderHeadline } from "./headline.js";
import { renderNetwork } from "./network.js";
import { renderClinvar } from "./clinvarPanel.js";
import { init3D } from "./structure3d.js";

const el = (id) => document.getElementById(id);
let INDEX = [];
let bySymbol = new Map();
let byUni = new Map();
let currentTrack = null;

init();

async function init() {
  try {
    const idx = await fetchJSON("data/index.json");
    INDEX = idx.proteins;
    INDEX.forEach((p) => { bySymbol.set(p.gene_symbol.toUpperCase(), p); byUni.set(p.uniprot_id, p); });
    buildSearch();
    renderCards();
    init3D("viewer3d");
    window.addEventListener("hashchange", route);
    window.addEventListener("resize", debounce(onResize, 200));
    route();
  } catch (e) {
    showError(`Could not load data/index.json (${e.message}). If running locally, serve over http (python -m http.server).`);
  }
}

function buildSearch() {
  const dl = el("gene-list");
  dl.innerHTML = INDEX.map((p) => `<option value="${p.gene_symbol}">`).join("");
  el("search-form").addEventListener("submit", (e) => {
    e.preventDefault();
    const q = el("search").value.trim().toUpperCase();
    const hit = bySymbol.get(q) || INDEX.find((p) => p.gene_symbol.toUpperCase().startsWith(q));
    if (hit) { location.hash = `#/${hit.uniprot_id}`; el("search").blur(); }
  });
}

// Render landing cards progressively: only a batch is in the DOM at once, so a
// 1000-protein catalog stays responsive. The rest are reachable via search.
const CARD_BATCH = 60;
let cardsShown = 0;

function renderCards() {
  el("card-grid").innerHTML = "";
  cardsShown = 0;
  appendCards();
}

function cardHTML(p) {
  const strong = (p.depletion_log10p || 0) >= 3;
  return `<a class="card" href="#/${p.uniprot_id}">
    <div class="card-top"><span class="card-gene">${p.gene_symbol}</span><span class="card-uni">${p.uniprot_id}</span></div>
    ${miniForest(p)}
    <div class="card-foot">
      <span class="sig-pill ${strong ? "sig-strong" : ""}">${pretty_p(p.depletion_log10p)}</span>
      <span>${int(p.n_partners)} partners</span>
    </div></a>`;
}

function appendCards() {
  const next = INDEX.slice(cardsShown, cardsShown + CARD_BATCH);
  el("card-grid").insertAdjacentHTML("beforeend", next.map(cardHTML).join(""));
  cardsShown += next.length;
  updateCardChrome();
}

function updateCardChrome() {
  const total = INDEX.length;
  el("card-hint").innerHTML = total > CARD_BATCH
    ? `Showing <b>${cardsShown}</b> of <b>${total}</b> proteins, most interface-depleted first — search any gene above to jump straight to it.`
    : "";
  const more = el("card-more");
  if (cardsShown < total) {
    const remaining = total - cardsShown;
    const n = Math.min(CARD_BATCH, remaining);
    more.innerHTML = `<button id="show-more" class="show-more">Show ${n} more (${remaining} remaining)</button>`;
    el("show-more").addEventListener("click", appendCards);
  } else {
    more.innerHTML = "";
  }
}

// Compact dumbbell forest plot: interface (orange) vs non-interface (grey)
// missense O/E with 95% CI whiskers and a dashed O/E=1 reference.
// Axis is fixed to 0–1.2 (so cards are visually comparable), extending only
// for the rare gene whose own values run past it. Ticks at 0 and 1.
function miniForest(p) {
  const ends = [p.interface, p.noninterface]
    .flatMap((d) => (d ? [d.oe, d.ci_high] : []))
    .filter((v) => v != null);
  const maxAxis = Math.max(1.2, (ends.length ? Math.max(...ends) : 1) * 1.04);
  const W = 196, H = 58, padL = 4, padR = 22, top = 13, rowGap = 18, axisY = H - 12;
  const x = (v) => padL + (Math.min(v, maxAxis) / maxAxis) * (W - padL - padR);
  const rows = [
    { d: p.interface, color: "var(--interface)", y: top },
    { d: p.noninterface, color: "var(--noninterface)", y: top + rowGap },
  ];
  let g = "";
  // O/E = 1 reference.
  g += `<line x1="${x(1)}" x2="${x(1)}" y1="${top - 8}" y2="${axisY - 2}" stroke="var(--line)" stroke-dasharray="2,2"/>`;
  g += `<text x="${x(1)}" y="${top - 9}" text-anchor="middle" font-size="7" fill="var(--muted)">1</text>`;
  for (const r of rows) {
    const d = r.d; if (!d || d.oe == null) continue;
    if (d.ci_low != null) {
      g += `<line x1="${x(d.ci_low)}" x2="${x(d.ci_high)}" y1="${r.y}" y2="${r.y}" stroke="${r.color}" stroke-width="2" opacity="0.45"/>`;
    }
    g += `<circle cx="${x(d.oe)}" cy="${r.y}" r="3.6" fill="${r.color}" stroke="#fff" stroke-width="1"/>`;
    g += `<text x="${x(d.ci_high) + 5}" y="${r.y + 3}" font-size="8.5" fill="var(--muted)" style="font-variant-numeric:tabular-nums">${fmt2(d.oe)}</text>`;
  }
  // Tiny axis ticks.
  g += `<line x1="${padL}" x2="${W - padR}" y1="${axisY}" y2="${axisY}" stroke="var(--line)"/>`;
  [0, 1].forEach((t) => {
    g += `<text x="${x(t)}" y="${axisY + 9}" text-anchor="middle" font-size="7" fill="var(--muted)">${t}</text>`;
  });
  return `<svg class="mini-forest" viewBox="0 0 ${W} ${H}" width="100%" preserveAspectRatio="xMinYMid meet" role="img">${g}</svg>`;
}

function route() {
  const m = location.hash.match(/^#\/(.+)$/);
  if (!m) return showLanding();
  const key = decodeURIComponent(m[1]).trim();
  const hit = byUni.get(key) || bySymbol.get(key.toUpperCase());
  if (!hit) return showLanding();
  showProtein(hit.uniprot_id);
}

function showLanding() {
  el("protein").hidden = true; el("error").hidden = true; el("landing").hidden = false;
  window.scrollTo({ top: 0 });
}

async function showProtein(uni) {
  el("landing").hidden = true; el("error").hidden = true; el("protein").hidden = false;
  window.scrollTo({ top: 0 });
  el("protein-header").innerHTML = `<p class="sub">Loading ${uni}…</p>`;
  ["headline", "track", "legend", "network", "partner-table"].forEach((id) => (el(id).innerHTML = ""));
  let prot;
  try { prot = await fetchJSON(`data/${uni}.json`); }
  catch (e) { return showError(`Could not load ${uni}.json (${e.message}).`); }
  window._prot = prot;

  renderHeader(prot);
  renderHeadline(el("headline"), prot.summary);
  currentTrack = renderTrack(el("track"), prot);
  renderLegend(el("legend"));
  renderClinvar(prot);
  renderNetwork(el("network"), prot, currentTrack);
  renderPartnerTable(prot);
}

function renderHeader(p) {
  const s = p.summary;
  const i = s.interface ? fmt2(s.interface.ci_high) : "–";
  const n = s.noninterface ? fmt2(s.noninterface.ci_high) : "–";
  const more = s.delta_oe != null && s.delta_oe > 0;
  const gc = p.gene_constraint;
  const lofLine = gc
    ? `<div class="sub">Gene LoF constraint (gnomAD v4.1):
         O/E <b style="color:${oeColor(gc.lof_oe)}">${fmt2(gc.lof_oe)}</b>
         <span class="tag">90% CI ${fmt2(gc.lof_oe_ci_lower)}–${fmt2(gc.lof_oe_ci_upper)}
         · LOEUF ${fmt2(gc.lof_oe_ci_upper)}</span></div>`
    : "";
  const nameLine = p.protein_name ? `<div class="protein-name">${p.protein_name}</div>` : "";
  const gnomadHref = p.gene_id
    ? `https://gnomad.broadinstitute.org/gene/${p.gene_id}?dataset=gnomad_r4`
    : `https://gnomad.broadinstitute.org/`;
  const links = `<div class="ext-links">More info:
    <a href="https://www.uniprot.org/uniprotkb/${p.uniprot_id}/entry" target="_blank" rel="noopener">UniProt</a>
    <a href="${gnomadHref}" target="_blank" rel="noopener">gnomAD</a>
    <a href="https://www.genecards.org/cgi-bin/carddisp.pl?gene=${p.gene_symbol}" target="_blank" rel="noopener">GeneCards</a>
    <a href="https://www.ncbi.nlm.nih.gov/clinvar/?term=${p.gene_symbol}%5Bgene%5D" target="_blank" rel="noopener">ClinVar</a></div>`;
  el("protein-header").innerHTML = `
    <h1>${p.gene_symbol}</h1>
    ${nameLine}
    <div class="sub">${p.uniprot_id} · ${int(p.length)} aa · ${int(s.n_interface_residues)} interface residues
      (${(s.interface_fraction * 100).toFixed(0)}%)</div>
    ${lofLine}
    ${links}
    <p class="headline-stat">
      Interface misOEUF <b style="color:${oeColor(s.interface ? s.interface.ci_high : null)}">${i}</b>
      vs non-interface <b>${n}</b> —
      ${more ? "interface is <b>more</b> constrained" : "no interface depletion"}
      <span class="tag">(${pretty_p(s.depletion_log10p)})</span>
    </p>`;
}

function renderLegend(c) {
  c.innerHTML = `
    <span class="key"><span class="tick" style="background:var(--orange)"></span>interface residue</span>
    <span class="key">missense O/E:</span>
    <span class="muted">more constrained</span>
    <span class="scale" style="background:${OE_GRAD}"></span>
    <span class="muted">more tolerant</span>`;
}

function renderPartnerTable(p) {
  const rows = (p.partners || []);
  if (!rows.length) { el("partner-table").innerHTML = ""; return; }
  const oeCell = (b) => (b && b.oe != null
    ? `<span class="swatch" style="display:inline-block;width:9px;height:9px;border-radius:2px;margin-right:5px;background:${oeColor(b.oe)}"></span>${fmt2(b.oe)}`
    : "–");
  const body = rows.map((r) => {
    const oeuf = r.partner_summary ? r.partner_summary.interface_oeuf : null;
    return `<tr class="${r.in_pilot ? "clickable" : ""}" data-uni="${r.in_pilot ? r.uniprot_id : ""}">
      <td>${r.gene_symbol}${r.in_pilot ? "" : ' <span class="tag">(not in set)</span>'}</td>
      <td class="tag" style="text-align:left">${(r.bond_types || []).join(", ")}</td>
      <td>${int(r.n_shared_contacts)}</td>
      <td><span class="swatch" style="display:inline-block;width:9px;height:9px;border-radius:2px;margin-right:5px;background:${oeColor(oeuf)}"></span>${fmt2(oeuf)}</td>
      <td>${oeCell(r.shared_contact_oe_on_partner)}</td>
    </tr>`;
  }).join("");
  el("partner-table").innerHTML = `
    <table>
      <thead><tr><th>Partner</th><th style="text-align:left">Bond types</th><th>Shared contacts</th>
        <th>Partner interface misOEUF</th><th>Partner O/E at contacts</th></tr></thead>
      <tbody>${body}</tbody>
    </table>`;
  el("partner-table").querySelectorAll("tr.clickable").forEach((tr) =>
    tr.addEventListener("click", () => { const u = tr.dataset.uni; if (u) location.hash = `#/${u}`; }));
}

function onResize() {
  if (!el("protein").hidden && window._prot) {
    const p = window._prot;
    renderHeadline(el("headline"), p.summary);
    currentTrack = renderTrack(el("track"), p);
    renderClinvar(p);
    renderNetwork(el("network"), p, currentTrack);
  }
}

function showError(msg) {
  el("landing").hidden = true; el("protein").hidden = true;
  const e = el("error"); e.hidden = false;
  e.innerHTML = `<p class="panel-note" style="color:var(--red)">${msg}</p><p><a href="#/">← back</a></p>`;
}

async function fetchJSON(url) {
  const r = await fetch(url);
  if (!r.ok) throw new Error(`HTTP ${r.status}`);
  return r.json();
}
function debounce(fn, ms) { let t; return (...a) => { clearTimeout(t); t = setTimeout(() => fn(...a), ms); }; }
