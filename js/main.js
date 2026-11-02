// App entry: load the index, route by URL hash, render the landing page
// (overview scatter + ranked table / cards + gene-list mode) and protein pages.
import { oeColor, oeGradient, fmt2, int, pretty_p, pretty_q, escapeHTML, bondList, TYPE_LABEL } from "./format.js";
import { fetchJSON, loadProtein, indexMaps, prefetchProtein } from "./data.js";
import { initSearch, lookup } from "./search.js";
import { renderOverview, renderMini, matchPills, activePills, PILLS, PILL_PARAMS, HET_STEPS, DEFAULT_FILTERS } from "./overview.js";
import { renderTable, renderGeneList } from "./table.js";
import { renderHeadline } from "./headline.js";
import { renderTrack, renderLaneToolbar } from "./residueTrack.js";
import { renderNetwork } from "./network.js";
import { renderClinvar } from "./clinvarPanel.js";
import { renderStructurePanel } from "./partnerStructure.js";
import { init3D } from "./structure3d.js";
import { downloadResiduesCSV, downloadPartnersCSV, downloadSVG } from "./export.js";
import * as S from "./state.js";

const el = (id) => document.getElementById(id);
let INDEX = null, ROWS = [], MAPS = null;
let filters = { ...DEFAULT_FILTERS, pills: [], view: localStorage.getItem("icv-view") || "table" };
let overview = null, table = null;
let page = { uni: null, prot: null, parts: [] };   // live renderers on the protein page
let VARIANT_INDEX = null;

init();

async function init() {
  document.documentElement.style.setProperty("--oe-grad", oeGradient());
  try {
    INDEX = await fetchJSON("data/index.json");
    ROWS = INDEX.proteins; MAPS = indexMaps(INDEX);
  } catch (e) {
    return showError(`Could not load data/index.json (${e.message}). If running locally, serve over http (python -m http.server).`);
  }
  initSearch(INDEX, MAPS, { onVariant: gotoVariant });
  renderLanding();
  init3D("viewer3d");
  window.addEventListener("hashchange", route);
  window.addEventListener("resize", debounce(onResize, 200));
  route();
}

// ---------------------------------------------------------------------------
// Landing
// ---------------------------------------------------------------------------
function renderLanding() {
  el("stat-line").innerHTML = `<b>${int(INDEX.n_proteins)}</b> proteins with PDB-derived interfaces · <b>${int(INDEX.n_sig)}</b> with significantly depleted interfaces (p &lt; 0.05) · <b>${int(INDEX.n_heterogeneity_tested)}</b> tested for partner heterogeneity · gnomAD v4.1 × G2P ${INDEX.g2p_date.slice(0, 4)}`;
  // Controls: "Highlight" pills (AND), a sentence saying what is highlighted, and two
  // segmented switches (plot axes, list style). No dropdowns.
  const count = (pill) => ROWS.reduce((n, r) => n + (pill.test(r) ? 1 : 0), 0);
  el("filters").innerHTML = `
    <div class="ctl-row"><span class="ctl-label">Highlight</span>
      ${PILLS.map((p) => `<button type="button" class="pill-toggle" data-k="${p.key}" aria-pressed="false" title="${escapeHTML(p.help)}">${escapeHTML(p.label)} <span class="pt-n">${int(count(p))}</span></button>` +
        (p.key === "het" ? `<span class="pill-slider" hidden><label for="het-p">p &lt;</label>
          <input id="het-p" type="range" min="0" max="${HET_STEPS.length - 1}" step="1" value="0" aria-label="partner-heterogeneity p-value threshold">
          <b id="het-p-val">0.05</b></span>` : "")).join("")}
    </div>
    <p id="pill-summary" class="pill-summary"></p>
    <div class="ctl-row"><span class="ctl-label">Plot</span>
      <div class="seg" role="radiogroup" data-f="mode">
        <button type="button" data-v="oe">Interface vs rest of protein</button><button type="button" data-v="gene">Interface vs whole gene</button>
      </div></div>`;
  el("list-controls").innerHTML = `<div class="ctl-row"><span class="ctl-label">List</span>
      <div class="seg" role="radiogroup" data-f="view">
        <button type="button" data-v="table">Table</button><button type="button" data-v="cards">Cards</button><button type="button" data-v="list">Paste genes</button>
      </div></div>`;
  // Heterogeneity threshold slider (shown while that pill is on): tighter p -> fewer proteins.
  el("het-p").addEventListener("input", (e) => {
    PILL_PARAMS.hetP = HET_STEPS[+e.target.value];
    el("het-p-val").textContent = String(PILL_PARAMS.hetP);
    document.querySelector('.pill-toggle[data-k="het"] .pt-n').textContent = int(count(PILLS.find((p) => p.key === "het")));
    applyFilters();
  });
  document.querySelectorAll(".pill-toggle").forEach((b) => b.addEventListener("click", () => {
    const k = b.dataset.k, on = filters.pills.includes(k);
    filters.pills = on ? filters.pills.filter((x) => x !== k) : [...filters.pills, k];
    applyFilters();
  }));
  document.querySelectorAll(".seg").forEach((g) => g.querySelectorAll("button").forEach((b) => b.addEventListener("click", () => {
    filters[g.dataset.f] = b.dataset.v;
    if (g.dataset.f === "view") localStorage.setItem("icv-view", filters.view);
    applyFilters();
  })));
  overview = renderOverview(el("overview"), ROWS, { filters, onSelect: (r) => (location.hash = `#/${r.u}`) });
  applyFilters();
}

function applyFilters() {
  // reflect state in the controls
  document.querySelectorAll(".pill-toggle").forEach((b) => { const on = filters.pills.includes(b.dataset.k); b.classList.toggle("on", on); b.setAttribute("aria-pressed", String(on)); });
  document.querySelectorAll(".seg").forEach((g) => g.querySelectorAll("button").forEach((b) => { const on = filters[g.dataset.f] === b.dataset.v; b.classList.toggle("on", on); b.setAttribute("aria-checked", String(on)); }));
  document.querySelector(".pill-slider").hidden = !filters.pills.includes("het");
  const act = activePills(filters);
  const rows = act.length ? ROWS.filter((r) => matchPills(r, filters)) : ROWS;
  const names = act.map((p) => `<b>${escapeHTML(p.label)}</b>${p.key === "het" ? ` (p < ${PILL_PARAMS.hetP})` : ""}`);
  el("pill-summary").innerHTML = act.length
    ? `Highlighting <b>${int(rows.length)}</b> of ${int(ROWS.length)} proteins: ${names.length > 1 ? names.slice(0, -1).join(", ") + " <i>and</i> " + names[names.length - 1] : names[0]}. They're outlined in the plot and listed below. <a href="#" id="pill-clear">Clear</a>`
    : `Click any of these to highlight those proteins in the plot and list them below (several together narrow the set).`;
  el("pill-clear")?.addEventListener("click", (e) => { e.preventDefault(); filters.pills = []; applyFilters(); });
  el("list-title").innerHTML = act.length ? `Highlighted proteins, ranked by interface depletion` : `All proteins, ranked by interface depletion`;
  overview.update(ROWS, filters);
  const c = el("list");
  if (filters.view === "list") { renderGeneList(c, INDEX, MAPS); return; }
  if (filters.view === "cards") { renderCards(c, rows); return; }
  table = renderTable(c, rows);
}

// Cards: compact dumbbell forest per protein, batched.
const CARD_BATCH = 60;
function renderCards(c, rows) {
  let shown = 0; c.innerHTML = `<div class="card-grid" id="card-grid"></div><div id="card-more"></div>`;
  const grid = c.querySelector("#card-grid"), more = c.querySelector("#card-more");
  const add = () => {
    const next = rows.slice(shown, shown + CARD_BATCH); shown += next.length;
    grid.insertAdjacentHTML("beforeend", next.map(cardHTML).join(""));
    grid.querySelectorAll(".card:not([data-pf])").forEach((a) => { a.dataset.pf = 1; a.addEventListener("mouseenter", () => prefetchProtein(a.dataset.u)); });
    more.innerHTML = shown < rows.length ? `<button class="show-more">Show ${Math.min(CARD_BATCH, rows.length - shown)} more (${rows.length - shown} remaining)</button>` : "";
    more.querySelector("button")?.addEventListener("click", add);
  };
  add();
}
function cardHTML(p) {
  const strong = (p.p || 0) >= 3;
  return `<a class="card" href="#/${p.u}" data-u="${p.u}">
    <div class="card-top"><span class="card-gene">${escapeHTML(p.s)}</span><span class="card-uni">${p.u}</span></div>
    ${miniForest(p)}
    <div class="card-foot"><span class="sig-pill ${strong ? "sig-strong" : ""}">${pretty_p(p.p)}</span><span>${int(p.np)} partner${p.np === 1 ? "" : "s"}${p.hm ? " · =" : ""}</span></div></a>`;
}
function miniForest(p) {
  const ends = [p.oi, p.ih, p.on, p.nh].filter((v) => v != null);
  const maxAxis = Math.max(1.2, (ends.length ? Math.max(...ends) : 1) * 1.04);
  const W = 196, H = 64, padL = 4, padR = 26, top = 15, rowGap = 19, axisY = H - 13;
  const x = (v) => padL + (Math.min(v, maxAxis) / maxAxis) * (W - padL - padR);
  const rows = [{ oe: p.oi, lo: p.il, hi: p.ih, color: "var(--interface)", y: top }, { oe: p.on, lo: p.nl, hi: p.nh, color: "var(--noninterface)", y: top + rowGap }];
  let g = `<line x1="${x(1)}" x2="${x(1)}" y1="${top - 8}" y2="${axisY - 2}" stroke="var(--line)" stroke-dasharray="2,2"/><text x="${x(1)}" y="${top - 9}" text-anchor="middle" font-size="10" fill="var(--muted)">1</text>`;
  for (const r of rows) {
    if (r.oe == null) continue;
    if (r.lo != null) g += `<line x1="${x(r.lo)}" x2="${x(r.hi)}" y1="${r.y}" y2="${r.y}" stroke="${r.color}" stroke-width="2" opacity="0.45"/>`;
    g += `<circle cx="${x(r.oe)}" cy="${r.y}" r="3.6" fill="${r.color}" stroke="var(--bg)" stroke-width="1"/><text x="${x(r.hi ?? r.oe) + 4}" y="${r.y + 4}" font-size="11" fill="var(--muted)">${fmt2(r.oe)}</text>`;
  }
  g += `<line x1="${padL}" x2="${W - padR}" y1="${axisY}" y2="${axisY}" stroke="var(--line)"/>` + [0, 1].map((t) => `<text x="${x(t)}" y="${axisY + 11}" text-anchor="middle" font-size="10" fill="var(--muted)">${t}</text>`).join("");
  return `<svg class="mini-forest" viewBox="0 0 ${W} ${H}" width="100%" preserveAspectRatio="xMinYMid meet" role="img">${g}</svg>`;
}

// ---------------------------------------------------------------------------
// Routing
// ---------------------------------------------------------------------------
function route() {
  const h = location.hash || "#/";
  const m = h.match(/^#\/([^/?]*)(?:\/(\d+))?(?:\?(.*))?$/);
  const key = m ? decodeURIComponent(m[1]).trim() : "";
  if (!key) return showSection("landing");
  if (key === "methods") return showSection("methods");
  const hit = lookup(key);
  if (!hit) return showError(`No protein “${escapeHTML(key)}” in this set.`);
  const q = S.parseQuery(m[3] || "");
  if (m[2]) q.focus = parseInt(m[2], 10);
  if (hit.u !== key) { history.replaceState(null, "", `#/${hit.u}${m[3] ? "?" + m[3] : ""}`); }
  showProtein(hit.u, q);
}
function showSection(id) {
  destroyPage();
  ["landing", "protein", "methods", "error"].forEach((s) => (el(s).hidden = s !== id));
  document.title = id === "methods" ? "Methods · Interface Constraint Visualiser" : "Interface Constraint Visualiser";
  window.scrollTo({ top: 0 });
}
function destroyPage() { for (const p of page.parts) { try { p.destroy && p.destroy(); } catch {} } page = { uni: null, prot: null, parts: [] }; }
function showError(msg) {
  destroyPage(); ["landing", "protein", "methods"].forEach((s) => (el(s).hidden = true));
  const e = el("error"); e.hidden = false; e.innerHTML = `<p class="panel-note" style="color:var(--red)">${msg}</p><p><a href="#/">← back</a></p>`;
}

// ---------------------------------------------------------------------------
// Protein page
// ---------------------------------------------------------------------------
async function showProtein(uni, q) {
  if (page.uni === uni && page.prot) { S.set({ ...q }); return; }   // same protein, URL state changed
  destroyPage();
  ["landing", "methods", "error"].forEach((s) => (el(s).hidden = true)); el("protein").hidden = false;
  window.scrollTo({ top: 0 });
  el("protein-header").innerHTML = `<p class="sub">Loading ${uni}…</p>`;
  ["headline", "track", "track-toolbar", "network", "partner-table", "structure3d"].forEach((id) => { const n = el(id); if (n) n.innerHTML = ""; });
  let prot;
  try { prot = await loadProtein(uni); } catch (e) { return showError(`Could not load ${uni}.json (${e.message}).`); }
  if (location.hash.indexOf(`#/${uni}`) !== 0) return;   // navigated away while loading
  try { renderProtein(uni, prot, q); }
  catch (e) { console.error(e); showError(`Could not render ${escapeHTML(uni)} (${escapeHTML(e.message)}).`); }
}

function renderProtein(uni, prot, q) {
  page.uni = uni; page.prot = prot; window._prot = prot;
  S.reset(uni, q);
  document.title = `${prot.gene_symbol} · Interface Constraint Visualiser`;

  renderHeader(prot);
  renderMini(el("mini-scatter"), ROWS, uni);
  page.parts.push(renderHeadline(el("headline"), prot));
  renderLaneToolbar(el("track-toolbar"), prot, () => { page.track.destroy(); page.track = renderTrack(el("track"), prot); });
  page.track = renderTrack(el("track"), prot); page.parts.push({ destroy: () => page.track.destroy() });
  renderLegend(el("legend"), prot);
  renderClinvar(prot);
  page.parts.push(renderStructurePanel(el("structure3d"), prot));
  page.parts.push(renderNetwork(el("network"), prot));
  renderPartnerTable(prot);
  page.parts.push({ destroy: S.subscribe((st, ch) => { if (ch.includes("partner")) paintPartnerTable(st.partner); if (ch.includes("focus")) focusNote(prot, st.focus); }) });
  page.parts.push(renderContextBar(prot));
  if (q.focus) { focusNote(prot, q.focus); el("track").scrollIntoView({ behavior: "smooth", block: "center" }); }
}

function renderHeader(p) {
  const s = p.summary, gc = p.gene_constraint;
  const more = s.oe_ratio != null && s.oe_ratio < 1;
  const gcLine = gc ? `<div class="sub">Gene-level (gnomAD v4.1): ` +
    (gc.lof_oe != null ? `LoF O/E ${oeVal(gc.lof_oe)} <span class="tag">(90% CI ${fmt2(gc.lof_ci[0])}–${fmt2(gc.lof_ci[1])}, LOEUF ${fmt2(gc.lof_ci[1])})</span>` : "") +
    (gc.mis_oe != null ? ` · missense O/E ${oeVal(gc.mis_oe)} <span class="tag">(${fmt2(gc.mis_ci[0])}–${fmt2(gc.mis_ci[1])})</span>` : "") +
    (gc.pli != null ? ` · pLI ${gc.pli}` : "") + `</div>` : "";
  const gnomadHref = p.gene_id ? `https://gnomad.broadinstitute.org/gene/${p.gene_id}?dataset=gnomad_r4` : "https://gnomad.broadinstitute.org/";
  const aliases = (p.aliases || []).length ? `<span class="tag">also: ${p.aliases.map(escapeHTML).join(", ")}</span>` : "";
  const het = p.heterogeneity;
  el("protein-header").innerHTML = `
    <div class="header-grid"><div>
    <h1>${escapeHTML(p.gene_symbol)} ${p.omim ? `<a class="pill pill-omim" href="https://omim.org/entry/${p.omim.mim}" target="_blank" rel="noopener" title="OMIM disease gene (molecular basis known)">OMIM disease gene</a>` : ""} ${aliases}</h1>
    ${p.protein_name ? `<div class="protein-name">${escapeHTML(p.protein_name)}</div>` : ""}
    <div class="sub">${p.uniprot_id} · ${int(p.length)} aa · <span style="color:var(--orange)">${int(s.n_interface_residues)} G2P interface residues</span> (${Math.round(s.interface_fraction * 100)}%)` +
      ` · ${(() => { const n = (p.partners || []).filter((x) => x.type === "heteromeric").length; return `${int(n)} partner${n === 1 ? "" : "s"}`; })()}${(p.partners || []).some((x) => x.type === "homomeric") ? " · homomer" : ""}</div>
    ${gcLine}
    <div class="ext-links">More: <a href="https://www.uniprot.org/uniprotkb/${p.uniprot_id}/entry" target="_blank" rel="noopener">UniProt</a>
      <a href="${gnomadHref}" target="_blank" rel="noopener">gnomAD</a>
      <a href="https://g2p.broadinstitute.org/" target="_blank" rel="noopener">G2P</a>
      <a href="https://www.genecards.org/cgi-bin/carddisp.pl?gene=${encodeURIComponent(p.gene_symbol)}" target="_blank" rel="noopener">GeneCards</a>
      <a href="https://www.ncbi.nlm.nih.gov/clinvar/?term=${encodeURIComponent(p.gene_symbol)}%5Bgene%5D" target="_blank" rel="noopener">ClinVar</a>
      ${p.omim ? `<a href="https://omim.org/entry/${p.omim.mim}" target="_blank" rel="noopener">OMIM</a>` : ""}
      <a href="https://www.rcsb.org/search?request=%7B%22query%22%3A%7B%22type%22%3A%22terminal%22%2C%22service%22%3A%22text%22%2C%22parameters%22%3A%7B%22attribute%22%3A%22rcsb_polymer_entity_container_identifiers.reference_sequence_identifiers.database_accession%22%2C%22operator%22%3A%22exact_match%22%2C%22value%22%3A%22${p.uniprot_id}%22%7D%7D%2C%22return_type%22%3A%22entry%22%7D" target="_blank" rel="noopener">PDB</a>
      · <a href="#" id="dl-res">residues CSV</a> <a href="#" id="dl-par">partners CSV</a> <a href="#" id="dl-svg">forest SVG</a></div>
    <p class="headline-stat">Interface missense O/E ${oeVal(s.interface.oe)} <span class="tag">(${fmt2(s.interface.ci_low)}–${fmt2(s.interface.ci_high)})</span>
      vs non-interface ${oeVal(s.noninterface.oe)} <span class="tag">(${fmt2(s.noninterface.ci_low)}–${fmt2(s.noninterface.ci_high)})</span> —
      ${s.is_sig && more ? `interface is <b>significantly more</b> constrained` : `<b>no significant</b> interface depletion`} <span class="tag">(${pretty_p(s.log10p, { ns: false })}, one-sided)</span>` +
      (het ? `<br><span class="tag">Partner heterogeneity ${pretty_p(het.log10p)} · ${pretty_q(het.q)}${het.q != null && het.q < 0.1 ? ` — constraint differs between partners (most: ${escapeHTML((p.partnerByUni.get(het.min[0]) || {}).label || het.min[0])} O/E ${fmt2(het.min[1])}; least: ${escapeHTML((p.partnerByUni.get(het.max[0]) || {}).label || het.max[0])} O/E ${fmt2(het.max[1])})` : ""}</span>` : "") +
    `</p><div id="focus-note"></div></div>
    <figure class="mini-fig"><div id="mini-scatter" class="mini-scatter"></div><figcaption>among all ${int(ROWS.length)} proteins</figcaption></figure></div>`;
  el("dl-res").addEventListener("click", (e) => { e.preventDefault(); downloadResiduesCSV(p); });
  el("dl-par").addEventListener("click", (e) => { e.preventDefault(); downloadPartnersCSV(p); });
  el("dl-svg").addEventListener("click", (e) => { e.preventDefault(); const svg = el("headline").querySelector("svg"); if (svg) downloadSVG(svg, `${p.gene_symbol}_interface_forest.svg`); });
}

// Slim bar under the site header that appears once the protein header scrolls away,
// so the protein in view (and the selected partner) is always visible.
function renderContextBar(p) {
  const bar = el("context-bar"), inner = el("context-bar-inner"), s = p.summary;
  const sections = [["sec-constraint", "Constraint"], ["sec-residues", "Residues"], ...(p.clinvar ? [["sec-clinvar", "ClinVar"]] : []), ["sec-structure", "Structure"], ["sec-partners", "Partners"]];
  function draw() {
    const sel = S.get().partner, sp = sel && p.partnerByUni.get(sel);
    inner.innerHTML = `
      <a href="#" class="cb-gene" title="back to top">${escapeHTML(p.gene_symbol)}</a>
      <span class="cb-name">${escapeHTML(p.protein_name || "")}</span>
      <span class="cb-uni">${p.uniprot_id}</span>
      <span class="cb-stat">interface O/E ${oeVal(s.interface.oe)} vs ${oeVal(s.noninterface.oe)} <span class="tag">${pretty_p(s.log10p)}</span></span>
      ${sp ? `<span class="cb-partner" title="selected partner"><span class="pdot" style="background:${sp.color}"></span>${escapeHTML(sp.label)} <button type="button" class="cb-x" title="clear selection">×</button></span>` : ""}
      <nav class="cb-nav">${sections.map(([id, label]) => `<a href="#" data-sec="${id}">${label}</a>`).join("")}</nav>`;
    inner.querySelector(".cb-gene").addEventListener("click", (e) => { e.preventDefault(); window.scrollTo({ top: 0, behavior: "smooth" }); });
    inner.querySelector(".cb-x")?.addEventListener("click", () => S.set({ partner: null }));
    inner.querySelectorAll("[data-sec]").forEach((a) => a.addEventListener("click", (e) => { e.preventDefault(); el(a.dataset.sec)?.scrollIntoView({ behavior: "smooth", block: "start" }); }));
  }
  draw();
  const setTop = () => document.documentElement.style.setProperty("--header-h", document.querySelector("header").offsetHeight + "px");
  setTop(); window.addEventListener("resize", setTop);
  const io = new IntersectionObserver(([e]) => {
    const show = !e.isIntersecting && e.boundingClientRect.top < 0;
    bar.classList.toggle("shown", show); bar.setAttribute("aria-hidden", show ? "false" : "true");
  }, { rootMargin: `-${document.querySelector("header").offsetHeight}px 0px 0px 0px` });
  io.observe(el("protein-header"));
  const unsub = S.subscribe((st, ch) => { if (ch.includes("partner")) draw(); });
  return { destroy: () => { io.disconnect(); unsub(); window.removeEventListener("resize", setTop); bar.classList.remove("shown"); inner.innerHTML = ""; } };
}

function focusNote(prot, pos) {
  const n = el("focus-note"); if (!n) return;
  if (!pos) { n.innerHTML = ""; return; }
  const r = prot.byPos(pos); if (!r) { n.innerHTML = ""; return; }
  const parts = prot.partnersAt(pos);
  n.innerHTML = `<div class="variant-note">Residue <b>${r.aa}${pos}</b> · missense O/E <b>${r.oe == null ? "no data" : fmt2(r.oe)}</b> (obs ${r.obs ?? 0} / exp ${fmt2(r.exp)})` +
    (r.is_interface ? ` · <b style="color:var(--orange)">G2P interface</b>` : "") +
    (parts.length ? ` · contacts ${parts.map((q) => `<b style="color:${q.color}">${escapeHTML(q.label)}</b>`).join(", ")}` : "") +
    ` <a href="#" id="focus-clear" class="tag">clear</a></div>`;
  el("focus-clear").addEventListener("click", (e) => { e.preventDefault(); S.set({ focus: null }); });
}

function renderLegend(c, prot) {
  c.innerHTML = `
    <span class="key"><span class="tick" style="background:var(--orange)"></span>G2P interface residue</span>
    <span class="key">missense O/E:</span><span class="muted">constrained</span><span class="scale" style="background:${oeGradient()}"></span><span class="muted">tolerant</span>
    <span class="key" style="margin-left:auto"><span class="tick" style="background:#0053d6"></span>pLDDT ≥ 90 <span class="tick" style="background:#65cbf3"></span>70–90 <span class="tick" style="background:#ffdb13"></span>50–70 <span class="tick" style="background:#ff7d45"></span>&lt; 50</span>`;
}

function renderPartnerTable(p) {
  const rows = p.partners || [];
  const c = el("partner-table");
  if (!rows.length) { c.innerHTML = ""; return; }
  const oeCell = (b) => (b && b.oe != null ? `<span class="swatch" style="background:${oeColor(b.oe)}"></span>${fmt2(b.oe)}` + (b.ci_low != null ? ` <span class="tag">${fmt2(b.ci_low)}–${fmt2(b.ci_high)}</span>` : "") : "–");
  const body = rows.map((r) => `<tr class="prow ${r.type}" data-u="${r.uniprot_id}">
      <td class="left"><span class="pdot" style="background:${r.color}"></span><b>${escapeHTML(r.label)}</b> <span class="tag">${TYPE_LABEL[r.type] || r.type}</span>${r.has_page ? ` <a class="open" href="#/${r.uniprot_id}" title="open ${escapeHTML(r.label)}">open ↗</a>` : ""}</td>
      <td>${int(r.contacts_self.length)}</td><td class="left tag">${bondList(r.bond_types)}</td>
      <td>${oeCell(r.oe)}</td><td>${r.oe ? pretty_p(r.oe.log10p) : "–"}</td>
      <td>${oeCell(r.partner_side)}</td>
      <td>${r.partner_summary ? `${fmt2(r.partner_summary.oe)} <span class="tag">vs ${fmt2(r.partner_summary.oe_non)}</span>` : "–"}</td>
      <td>${r.structures && r.structures.length ? `<a href="https://www.rcsb.org/structure/${r.structures[0][0]}" target="_blank" rel="noopener">${r.structures[0][0]}</a> <span class="tag">${r.n_pdbs} entr${r.n_pdbs > 1 ? "ies" : "y"}</span>` : "–"}</td></tr>`).join("");
  c.innerHTML = `<table class="partners"><thead><tr><th class="left">Partner</th><th>Contact res.</th><th class="left">Bonds</th>
      <th title="pooled missense O/E of this protein's residues contacting the partner (95% CI)">O/E at this interface</th><th title="one-sided conditional binomial vs the rest of this protein">p vs rest</th>
      <th title="the partner's own residues contacting this protein">Partner's side O/E</th><th title="the partner's overall interface vs non-interface O/E">Partner overall</th><th>Structure</th></tr></thead><tbody>${body}</tbody></table>`;
  c.querySelectorAll("tr.prow").forEach((tr) => {
    tr.addEventListener("click", (e) => { if (e.target.closest("a")) return; S.set({ partner: S.get().partner === tr.dataset.u ? null : tr.dataset.u }); });
    tr.addEventListener("mouseenter", () => { const q = p.partnerByUni.get(tr.dataset.u); if (q && q.has_page) prefetchProtein(q.uniprot_id); });
  });
  paintPartnerTable(S.get().partner);
}
function paintPartnerTable(sel) { el("partner-table").querySelectorAll("tr.prow").forEach((tr) => tr.classList.toggle("selected", tr.dataset.u === sel)); }

function onResize() {
  if (!el("protein").hidden && page.prot) {
    const p = page.prot;
    for (const part of page.parts) part.destroy && part.destroy();
    page.parts = [];
    page.parts.push(renderHeadline(el("headline"), p));
    page.track = renderTrack(el("track"), p); page.parts.push({ destroy: () => page.track.destroy() });
    page.parts.push(renderStructurePanel(el("structure3d"), p));
    page.parts.push(renderNetwork(el("network"), p));
    page.parts.push({ destroy: S.subscribe((st, ch) => { if (ch.includes("partner")) paintPartnerTable(st.partner); if (ch.includes("focus")) focusNote(p, st.focus); }) });
    page.parts.push(renderContextBar(p));
  } else if (!el("landing").hidden && overview) {
    overview = renderOverview(el("overview"), ROWS, { filters, onSelect: (r) => (location.hash = `#/${r.u}`) });
    overview.update(ROWS, filters);
  }
}

// ---------------------------------------------------------------------------
// Variant -> residue (GRCh38, via data/variant_index.json)
// ---------------------------------------------------------------------------
async function gotoVariant(v) {
  try { VARIANT_INDEX = VARIANT_INDEX || (await fetchJSON("data/variant_index.json")); }
  catch (e) { return showError(`Could not load data/variant_index.json (${e.message}).`); }
  for (const t of VARIANT_INDEX.transcripts) {
    if (t.chrom !== v.chrom) continue;
    const res = cdsPosToResidue(t, v.pos);
    if (res) { location.hash = `#/${t.uniprot_id}?hl=${res}`; return; }
  }
  showError(`No protein in this set covers chr${v.chrom}:${v.pos.toLocaleString()} (GRCh38). The site indexes the coding regions of ${ROWS.length} proteins — the variant may be non-coding, outside them, or on a different assembly.`);
}
function cdsPosToResidue(t, pos) {
  const ex = t.cds; let idx = -1;
  for (let i = 0; i < ex.length; i++) if (pos >= ex[i][0] && pos <= ex[i][1]) { idx = i; break; }
  if (idx < 0) return null;
  let off;
  if (t.strand === "+") { off = pos - ex[idx][0]; for (let i = 0; i < idx; i++) off += ex[i][1] - ex[i][0] + 1; }
  else { off = ex[idx][1] - pos; for (let i = idx + 1; i < ex.length; i++) off += ex[i][1] - ex[i][0] + 1; }
  return Math.floor(off / 3) + 1;
}

// An O/E value as readable text with a small colour swatch (text coloured by O/E is
// illegible near O/E = 1, where the scale is almost white).
function oeVal(v) { return `<span class="swatch" style="background:${oeColor(v)}"></span><b>${fmt2(v)}</b>`; }
function debounce(fn, ms) { let t; return (...a) => { clearTimeout(t); t = setTimeout(() => fn(...a), ms); }; }
