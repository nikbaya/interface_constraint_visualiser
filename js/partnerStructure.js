// 3D view of the protein with a partner. Structures are fetched at view time —
// only the needed chains — from the RCSB ModelServer, falling back to PDBe's
// ModelServer and then to the full mmCIF entry. Nothing is stored in this repo.
//
// One colouring rule throughout: this protein's *interface residues* are coloured by
// missense O/E, the rest of it is plain grey, and partners are solid cartoons in their
// site-wide colour. Shown as a molecular surface (default) the interface reads as a
// coloured footprint under the partner; a cartoon view is available too.
//   partner mode : this protein + one partner chain; footprint = contacts with that partner
//   mosaic mode  : this protein alone; each residue coloured by the partner it contacts
//   complex mode : the PDB entry containing the most known partners, all chains
// Hovering in 3D finds the residue on the track; hovering the track marks it in 3D.
import { oeColorHex, fmt2, escapeHTML, TYPE_LABEL } from "./format.js";
import * as S from "./state.js";

const SOURCES = [
  (pdb, chain) => `https://models.rcsb.org/v1/${pdb.toLowerCase()}/atoms?auth_asym_id=${encodeURIComponent(chain)}&encoding=cif`,
  (pdb, chain) => `https://www.ebi.ac.uk/pdbe/model-server/v1/${pdb.toLowerCase()}/atoms?auth_asym_id=${encodeURIComponent(chain)}&encoding=cif`,
];
const FULL_SOURCES = [
  (pdb) => `https://models.rcsb.org/v1/${pdb.toLowerCase()}/full?encoding=cif`,
  (pdb) => `https://files.rcsb.org/download/${pdb.toUpperCase()}.cif`,
  (pdb) => `https://www.ebi.ac.uk/pdbe/entry-files/download/${pdb.toLowerCase()}.cif`,
];
const BODY = "#9ea4ab";          // this protein, away from the interface (darker than O/E≈1 white)
const OTHER_CHAIN = "#dfe2e6";   // chains that are neither this protein nor a known partner
const HOVER_BALL = "#FFD400";
const PARTNER_TAN = "#c4a574";   // single partner: neutral, so it can't be read as an O/E colour
const SURFACE_OPACITY = 0.9;
const AA1 = { ALA: "A", ARG: "R", ASN: "N", ASP: "D", CYS: "C", GLN: "Q", GLU: "E", GLY: "G", HIS: "H", ILE: "I", LEU: "L", LYS: "K", MET: "M", PHE: "F", PRO: "P", SER: "S", THR: "T", TRP: "W", TYR: "Y", VAL: "V", MSE: "M", SEP: "S", TPO: "T", PTR: "Y" };
const cifCache = new Map();

async function fetchText(urls) {
  let lastErr;
  for (const u of urls) {
    if (cifCache.has(u)) return cifCache.get(u);
    try { const r = await fetch(u); if (!r.ok) throw new Error(`HTTP ${r.status}`); const t = await r.text(); cifCache.set(u, t); return t; }
    catch (e) { lastErr = e; }
  }
  throw lastErr || new Error("no source");
}
const hex = (c) => (c.startsWith("#") ? c : d3.color(c).formatHex());

export function renderStructurePanel(container, prot) {
  container.innerHTML = "";
  const partners = (prot.partners || []).filter((p) => p.structures && p.structures.length);
  if (!partners.length && !prot.best_pdb) { container.innerHTML = '<p class="panel-note">No PDB chains available for this protein.</p>'; return { destroy() {} }; }
  if (!window.$3Dmol) { container.innerHTML = '<p class="panel-note">3D viewer unavailable (3Dmol.js did not load).</p>'; return { destroy() {} }; }

  container.innerHTML = `
    <div class="s3-controls">
      <label>mode <select id="s3-mode"><option value="partner">protein + partner</option><option value="mosaic">partner mosaic</option>${prot.best_pdb ? '<option value="complex">whole complex</option>' : ""}</select></label>
      <label id="s3-partner-wrap">partner <select id="s3-partner"></select></label>
      <label id="s3-pdb-wrap">PDB <select id="s3-pdb"></select></label>
      <label>show <select id="s3-view"><option value="surface">surface</option><option value="cartoon">cartoon</option></select></label>
      <label class="chip"><input type="checkbox" id="s3-spin"> spin</label>
      <span id="s3-status" class="tag"></span>
    </div>
    <div class="s3-stage"><div id="s3-viewer"></div><div id="s3-legend" class="s3-legend"></div></div>
    <p id="s3-note" class="panel-note"></p>`;
  const $ = (id) => container.querySelector("#" + id);
  const viewer = window.$3Dmol.createViewer($("s3-viewer"), { backgroundColor: getComputedStyle(document.documentElement).getPropertyValue("--bg").trim() || "white", antialias: true });
  let token = 0, models = [], current = null, calib = null;

  const modeSel = $("s3-mode"), partnerSel = $("s3-partner"), pdbSel = $("s3-pdb"), viewSel = $("s3-view");
  viewSel.value = localStorage.getItem("icv-3d-view") || "surface";
  partnerSel.innerHTML = partners.map((p) => `<option value="${p.uniprot_id}">${escapeHTML(p.label)} (${p.structures.length} entr${p.structures.length > 1 ? "ies" : "y"})</option>`).join("");
  function fillPdbs() {
    if (modeSel.value === "complex") { pdbSel.innerHTML = `<option value="${prot.best_pdb.pdb}">${prot.best_pdb.pdb} (${prot.best_pdb.n_partners} partner${prot.best_pdb.n_partners === 1 ? "" : "s"})</option>`; return; }
    const p = prot.partnerByUni.get(partnerSel.value) || partners[0];
    pdbSel.innerHTML = (p ? p.structures : []).map((s) => `<option value="${s[0]}|${s[1]}|${s[2]}">${s[0]} ${s[1]}–${s[2]} · ${s[3]} contact res${s[4] > 1 ? ` · mode ${s[4]}` : ""}</option>`).join("");
  }
  function setStatus(t, err) { $("s3-status").textContent = t; $("s3-status").style.color = err ? "var(--red)" : ""; }

  // ---- load ------------------------------------------------------------------------
  async function load() {
    const my = ++token;
    const mode = modeSel.value;
    const p = prot.partnerByUni.get(partnerSel.value) || partners[0];
    let pdb, chain, pchain;
    if (mode === "complex") { pdb = prot.best_pdb.pdb; chain = prot.best_pdb.self_chains[0]; }
    else { [pdb, chain, pchain] = (pdbSel.value || "").split("|"); if (!pdb) [pdb, chain, pchain] = p.structures[0]; }
    current = { mode, pdb, chain, pchain, partner: p };
    $("s3-partner-wrap").style.display = mode === "complex" ? "none" : "";
    setStatus(`loading ${pdb}…`);
    viewer.removeAllModels(); viewer.removeAllSurfaces(); viewer.removeAllLabels(); viewer.removeAllShapes(); models = [];
    try {
      if (mode === "complex") {
        const txt = await fetchText(FULL_SOURCES.map((f) => f(pdb)));
        if (my !== token) return;
        models.push({ m: viewer.addModel(txt, "cif"), role: "complex" });
      } else {
        const chains = mode === "partner" && pchain ? [chain, pchain] : [chain];
        const txts = await Promise.all(chains.map((c) => fetchText(SOURCES.map((f) => f(pdb, c)))));
        if (my !== token) return;
        txts.forEach((t, i) => models.push({ m: viewer.addModel(t, "cif"), role: i === 0 ? "self" : "partner", chain: chains[i] }));
      }
    } catch (e) {
      if (my !== token) return;
      setStatus(`could not fetch ${pdb} (${e.message})`, true);
      $("s3-note").innerHTML = `Structure servers unreachable. <a href="https://www.rcsb.org/structure/${pdb}" target="_blank" rel="noopener">Open ${pdb} at RCSB</a>.`;
      return;
    }
    calib = mode === "complex" ? prot.best_pdb.self_chains.map((c) => calibrate(models[0].m, pdb, c)).find(Boolean) : calibrate(models[0].m, pdb, chain);
    await style(my);
    if (my !== token) return;
    if (mode === "complex") viewer.zoomTo(); else { viewer.zoomTo({ chain }); viewer.zoom(0.85); }
    viewer.render();
    setStatus(`${pdb}`);
    $("s3-note").innerHTML = noteHTML();
  }

  // ---- colouring -------------------------------------------------------------------------
  // Colour of a residue of *this* protein: O/E if it is at the interface being shown,
  // the partner's colour in mosaic mode, otherwise the plain body grey.
  function selfColor(chainId, atom) {
    const pos = prot.fromAuthor(current.pdb, chainId, atom.resi);
    if (pos == null) return BODY;
    const r = prot.byPos(pos);
    if (current.mode === "mosaic") {
      const parts = prot.partnersAt(pos).filter((q) => q.type !== "unidentified");
      if (!parts.length) return BODY;
      return hex(parts.reduce((a, b) => (b.contacts_self.length < a.contacts_self.length ? b : a)).color);  // smallest footprint wins
    }
    const atIface = current.mode === "partner" ? current.partner.contactSet.has(pos) : prot.interfaceSet.has(pos);
    return atIface && r ? hex(oeColorHex(r.oe)) : BODY;
  }

  async function style(my = token) {
    const { mode } = current;
    const view = viewSel.value, sel = S.get().partner;
    viewer.removeAllSurfaces();
    const selfChains = mode === "complex" ? prot.best_pdb.self_chains : [current.chain];
    const legend = [];
    const surfaceJobs = [];

    if (mode === "complex") {
      const m = models[0].m;
      m.setStyle({}, { cartoon: { color: OTHER_CHAIN } });
      const seen = new Map();
      for (const [c, u] of prot.best_pdb.chains) {
        const pp = prot.partnerByUni.get(u);
        if (u !== prot.uniprot_id && pp) { m.setStyle({ chain: c }, { cartoon: { color: hex(pp.color), opacity: sel && sel !== u ? 0.35 : 1 } }); seen.set(u, pp); }
      }
      for (const c of selfChains) {
        m.setStyle({ chain: c }, { cartoon: { colorfunc: (a) => selfColor(c, a) } });
        if (view === "surface") surfaceJobs.push(viewer.addSurface(window.$3Dmol.SurfaceType.MS, { colorfunc: (a) => selfColor(c, a), opacity: SURFACE_OPACITY }, { model: m, chain: c }, { model: m, chain: c }));
      }
      legend.push(`<span class="key"><span class="scale" style="background:var(--oe-grad);width:64px"></span>${escapeHTML(prot.gene_symbol)} interface residues by missense O/E</span>`);
      legend.push(`<span class="key"><span class="tick" style="background:${BODY}"></span>rest of ${escapeHTML(prot.gene_symbol)}</span>`);
      for (const pp of seen.values()) legend.push(`<span class="key"><span class="tick" style="background:${pp.color}"></span>${escapeHTML(pp.label)}</span>`);
    } else {
      const selfM = models[0].m;
      selfM.setStyle({}, { cartoon: { colorfunc: (a) => selfColor(current.chain, a) } });
      if (view === "surface") surfaceJobs.push(viewer.addSurface(window.$3Dmol.SurfaceType.MS, { colorfunc: (a) => selfColor(current.chain, a), opacity: SURFACE_OPACITY }, { model: selfM }, { model: selfM }));
      if (mode === "mosaic") {
        const shown = (prot.partners || []).filter((q) => q.type !== "unidentified" && q.contacts_self.some((p) => prot.toAuthor(current.pdb, current.chain, p) != null));
        for (const q of shown.slice(0, 16)) legend.push(`<span class="key"><span class="tick" style="background:${q.color}"></span>${escapeHTML(q.label)}</span>`);
        if (shown.length > 16) legend.push(`<span class="key">+${shown.length - 16} more</span>`);
        legend.push(`<span class="key"><span class="tick" style="background:${BODY}"></span>no contact</span>`);
      } else {
        const partner = current.partner;
        if (models[1]) models[1].m.setStyle({}, { cartoon: { color: PARTNER_TAN, thickness: 0.6 } });
        legend.push(`<span class="key"><span class="scale" style="background:var(--oe-grad);width:64px"></span>${escapeHTML(prot.gene_symbol)} residues contacting ${escapeHTML(partner.label)}, by missense O/E</span>`);
        legend.push(`<span class="key"><span class="tick" style="background:${BODY}"></span>rest of ${escapeHTML(prot.gene_symbol)}</span>`);
        if (current.pchain) legend.push(`<span class="key"><span class="tick" style="background:${PARTNER_TAN}"></span>${escapeHTML(partner.label)}</span>`);
      }
    }
    $("s3-legend").innerHTML = legend.join("");
    for (const md of models) md.m.setHoverable({}, true, onHover, onUnhover);
    viewer.render();
    if (surfaceJobs.length) {
      setStatus(`${current.pdb} · computing surface…`);
      try { await Promise.all(surfaceJobs); } catch (e) { console.warn(e); }
      if (my !== token) return;
      viewer.render(); setStatus(current.pdb);
    }
  }

  // Check UniProt -> author numbering against the loaded coordinates: the residue names
  // in the chain must match this protein's sequence. SIFTS often leaves author starts
  // blank for cryo-EM entries, so when the stored map is missing or matches poorly, find
  // the constant offset that best aligns the chain to the sequence and use that instead.
  function calibrate(model, pdb, chain) {
    const cas = model.selectedAtoms({ chain, atom: "CA" }).filter((a) => AA1[a.resn]);
    if (cas.length < 8) return null;
    const key = `${pdb}:${chain}`, seq = prot.residues.seq;
    const rate = (mapFn) => { let hit = 0; for (const a of cas) { const pos = mapFn(a.resi); if (pos != null && pos >= 1 && pos <= seq.length && seq[pos - 1] === AA1[a.resn]) hit++; } return hit / cas.length; };
    const stored = prot.segments && prot.segments[key];
    const cur = rate((r) => prot.fromAuthor(pdb, chain, r));
    if (cur >= 0.9) return { key, rate: cur, source: stored ? (stored.approx ? "approx" : "sifts") : "identity" };
    let best = { d: 0, rate: -1 };
    for (let d = -600; d <= 600; d++) { const r = rate((x) => x - d); if (r > best.rate) best = { d, rate: r }; if (r > 0.98) break; }
    if (best.rate >= 0.6 && best.rate > cur) {
      prot.segments = prot.segments || {};
      prot.segments[key] = { segs: [[1, seq.length, 1 + best.d]], approx: false, calibrated: true };
      return { key, rate: best.rate, source: "offset", d: best.d };
    }
    return { key, rate: cur, source: "unverified" };
  }

  function noteHTML() {
    const { mode, pdb, chain, pchain, partner } = current;
    const c = calib, pct = c ? Math.round(c.rate * 100) : null;
    const num = !c ? "" : c.source === "unverified"
      ? ` <span style="color:var(--red)">Residue numbering could not be matched to the sequence (${pct}% identity) — colours may be misplaced.</span>`
      : ` <span class="tag">Numbering checked against the sequence: ${pct}% of residues match${c.source === "offset" ? ` (author numbering offset ${c.d > 0 ? "+" : ""}${c.d})` : ""}.</span>`;
    const link = `<a href="https://www.rcsb.org/structure/${pdb}" target="_blank" rel="noopener">${pdb} at RCSB</a>`;
    if (mode === "complex") return `${link}: the entry containing the most of this protein's known partners (${prot.best_pdb.n_partners}). ${escapeHTML(prot.gene_symbol)}'s interface residues (with any partner) are coloured by O/E; click a partner anywhere on the page to dim the others.${num}`;
    if (mode === "mosaic") return `${link}, chain ${chain}: each residue of ${escapeHTML(prot.gene_symbol)} coloured by the partner it contacts (where several do, the partner with the smaller footprint).${num}`;
    return `${link}, chains ${chain} (${escapeHTML(prot.gene_symbol)}) and ${pchain} (${escapeHTML(partner.label)}, ${TYPE_LABEL[partner.type] || partner.type}). The coloured patch is ${escapeHTML(prot.gene_symbol)}'s interface with ${escapeHTML(partner.label)} — the ${partner.contacts_self.length} residues counted in its O/E (G2P contacts across all entries of this pair). Hover to find a residue on the track; drag to rotate, scroll to zoom.${num}`;
  }

  // ---- hover sync ------------------------------------------------------------------
  function onHover(atom) {
    if (!current) return;
    const selfChains = current.mode === "complex" ? prot.best_pdb.self_chains : [current.chain];
    const isSelf = current.mode === "complex" ? selfChains.includes(atom.chain) : atom.model === models[0].m.getID();
    const pos = isSelf ? prot.fromAuthor(current.pdb, atom.chain, atom.resi) : null;
    const r = pos != null ? prot.byPos(pos) : null;
    viewer.removeAllLabels();
    const txt = r ? `${r.aa}${pos} · O/E ${r.oe == null ? "–" : fmt2(r.oe)}${r.is_interface ? " · interface" : ""}` : `${atom.resn} ${atom.resi} · chain ${atom.chain}`;
    viewer.addLabel(txt, { position: atom, backgroundColor: "#1b1f23", backgroundOpacity: 0.85, fontColor: "white", fontSize: 13, borderThickness: 0, inFront: true });
    viewer.render();
    if (r) S.set({ hover: pos, hoverSrc: "3d" }, { url: false });
  }
  function onUnhover() { viewer.removeAllLabels(); viewer.render(); S.set({ hover: null, hoverSrc: "3d" }, { url: false }); }

  function highlightFromTrack(pos) {
    if (!current || !models.length) return;
    viewer.removeAllShapes(); viewer.removeAllLabels();
    if (pos == null) { viewer.render(); return; }
    const r = prot.byPos(pos);
    const txt = r ? `${r.aa}${pos} · O/E ${r.oe == null ? "–" : fmt2(r.oe)}${r.is_interface ? " · interface" : ""}` : `${pos}`;
    const a = prot.toAuthor(current.pdb, current.chain, pos);
    const atoms = a == null ? [] : models[0].m.selectedAtoms({ chain: current.chain, resi: a, atom: "CA" });
    if (atoms.length) {
      const c = { x: atoms[0].x, y: atoms[0].y, z: atoms[0].z };
      viewer.addSphere({ center: c, radius: viewSel.value === "surface" ? 3.2 : 2.3, color: HOVER_BALL, alpha: 0.95 });
      viewer.addLabel(txt, { position: c, backgroundColor: "#1b1f23", backgroundOpacity: 0.85, fontColor: "white", fontSize: 13, borderThickness: 0, inFront: true });
    } else {
      viewer.addLabel(`${txt} — not resolved in ${current.pdb}`, { position: { x: 0, y: 0, z: 0 }, useScreen: true, screenOffset: { x: 10, y: 10 }, backgroundColor: "#63666A", backgroundOpacity: 0.85, fontColor: "white", fontSize: 12, borderThickness: 0 });
    }
    viewer.render();
  }

  // ---- wiring ------------------------------------------------------------------------
  modeSel.addEventListener("change", () => { S.set({ mode3d: modeSel.value }); fillPdbs(); load(); });
  partnerSel.addEventListener("change", () => { S.set({ partner: partnerSel.value, pdb: null }); fillPdbs(); load(); });
  pdbSel.addEventListener("change", () => { S.set({ pdb: pdbSel.value.split("|")[0] }); load(); });
  viewSel.addEventListener("change", () => { localStorage.setItem("icv-3d-view", viewSel.value); if (models.length) style(); });
  $("s3-spin").addEventListener("change", (e) => { if (e.target.checked) viewer.spin("y", 0.4); else viewer.spin(false); });

  const st = S.get();
  if (st.mode3d && [...modeSel.options].some((o) => o.value === st.mode3d)) modeSel.value = st.mode3d;
  if (st.partner && prot.partnerByUni.get(st.partner)?.structures?.length) partnerSel.value = st.partner;
  fillPdbs();
  if (st.pdb) { const o = [...pdbSel.options].find((o) => o.value.startsWith(st.pdb + "|")); if (o) pdbSel.value = o.value; }
  load();

  let raf = null;
  const unsub = S.subscribe((s, ch) => {
    if (ch.includes("partner")) {
      if (s.partner && prot.partnerByUni.get(s.partner)?.structures?.length && modeSel.value === "partner") { if (partnerSel.value !== s.partner) { partnerSel.value = s.partner; fillPdbs(); load(); } }
      else if (models.length && modeSel.value === "complex") style();
    }
    if (ch.includes("hover") && s.hoverSrc !== "3d") { cancelAnimationFrame(raf); raf = requestAnimationFrame(() => highlightFromTrack(s.hover)); }
    if (ch.includes("range") && s.range && models.length && current) {
      const resi = []; for (let p = s.range[0]; p <= s.range[1]; p += Math.max(1, Math.floor((s.range[1] - s.range[0]) / 200))) { const a = prot.toAuthor(current.pdb, current.chain, p); if (a != null) resi.push(a); }
      if (resi.length) viewer.zoomTo({ chain: current.chain, resi }, 400);
    }
  });
  return { destroy: () => { unsub(); token++; viewer.spin(false); } };
}
