// Residue browser: a genome-browser-style, zoomable view of one protein.
// Lanes share a single x-scale: missense O/E heat strip, interface ticks
// (G2P, PDB-derived), one lane per structural partner (contact
// residues as runs, in the partner's colour), ClinVar lollipops, UniProt
// domains / regions / motifs, DSSP secondary structure, AlphaFold pLDDT, and
// annotated sites / PTMs. A navigator strip on top carries the zoom brush.
// Everything reacts to the shared state (selected partner, range, hover, focus).
import { oeColorHex, fmt2, fmt3, escapeHTML, TYPE_LABEL } from "./format.js";
import { showTip, hideTip } from "./tooltip.js";
import { PLP, BLB } from "./clinvarPanel.js";
import * as S from "./state.js";

const LANE_PREFS_KEY = "icv-lanes";
const DEFAULT_LANES = { partners: true, clinvar: true, domains: true, regions: true, ss: true, plddt: true, sites: true, win: false, winSize: 21 };
export const WIN_SIZES = [5, 11, 21, 31, 51, 101];
const WIN_MAX = 2;   // sliding-window line: y axis is O/E 0–2 (clamped)
const MAX_PARTNER_ROWS = 14;
const SS_COLOR = { H: "#5b7fb5", E: "#d59a3b", C: "#c9ced4", "-": "transparent" };
const PLDDT_COLOR = (v) => (v == null ? "#e4e4ea" : v >= 90 ? "#0053d6" : v >= 70 ? "#65cbf3" : v >= 50 ? "#ffdb13" : "#ff7d45");

export function lanePrefs() { try { return { ...DEFAULT_LANES, ...JSON.parse(localStorage.getItem(LANE_PREFS_KEY) || "{}") }; } catch { return { ...DEFAULT_LANES }; } }
export function setLanePref(k, v) { const p = lanePrefs(); p[k] = v; localStorage.setItem(LANE_PREFS_KEY, JSON.stringify(p)); }

// Greedy row packing for intervals [[s,e,label],...] -> [{s,e,label,row}]
function pack(ivs, minGap = 1) {
  const rows = [], out = [];
  for (const iv of ivs.slice().sort((a, b) => a[0] - b[0] || b[1] - a[1])) {
    let r = rows.findIndex((end) => iv[0] > end + minGap);
    if (r < 0) { r = rows.length; rows.push(-Infinity); }
    rows[r] = iv[1];
    out.push({ s: iv[0], e: iv[1], label: iv[2], row: r });
  }
  return { items: out, nRows: rows.length };
}
const runs = (positions) => { const out = []; for (const p of positions) { if (out.length && p === out[out.length - 1][1] + 1) out[out.length - 1][1] = p; else out.push([p, p]); } return out; };

export function renderTrack(container, prot) {
  container.innerHTML = "";
  const L = prot.length, rows = prot.residueRows;
  const prefs = lanePrefs();
  const F = prot.features || {};
  const allPartners = (prot.partners || []).filter((p) => p.contacts_self && p.contacts_self.length);
  let showAllPartners = allPartners.length <= MAX_PARTNER_ROWS;
  const cvPos = (prot.clinvar && prot.clinvar.positions) || [];
  const domainIvs = ["domain", "zf", "tm", "repeat", "dna", "coil", "signal", "propep", "transit", "topo"].flatMap((k) => (F[k] || []).map((iv) => [iv[0], iv[1], iv[2] + (k === "tm" ? " (TM)" : k === "zf" ? " (ZnF)" : "")]));
  const regionIvs = ["region", "motif"].flatMap((k) => F[k] || []);
  const sites = [...(F.site || []).map((x) => ({ pos: x[0], label: x[1], kind: "site" })), ...(F.ptm || []).map((x) => ({ pos: x[0], label: x[1], kind: "ptm" }))];

  // Sliding-window missense O/E: Σobs / Σexp over a centred window of winSize residues
  // (truncated at the termini; residues without an expected count are skipped).
  const winSize = prefs.winSize || DEFAULT_LANES.winSize;
  const cumO = new Float64Array(L + 1), cumE = new Float64Array(L + 1);
  for (let i = 0; i < L; i++) {
    const r = rows[i], ok = r.exp != null && r.exp > 0;
    cumO[i + 1] = cumO[i] + (ok ? r.obs || 0 : 0); cumE[i + 1] = cumE[i] + (ok ? r.exp : 0);
  }
  const winOE = (p) => {
    const h = Math.floor(winSize / 2), a = Math.max(1, p - h), b = Math.min(L, p + h), e = cumE[b] - cumE[a - 1];
    return e > 0 ? (cumO[b] - cumO[a - 1]) / e : null;
  };

  // ---- geometry ----------------------------------------------------------
  const W = Math.max(container.clientWidth || 920, 300);
  const M = { left: W < 600 ? 92 : 132, right: 16, top: 8, bottom: 28 };
  const innerW = W - M.left - M.right;
  const NAV_H = 14, GAP = 7, PROW = 14;   // PROW: height of one partner row

  function layout() {
    const lanes = [];
    let y = M.top + NAV_H + 14;
    const add = (id, h, label, opts = {}) => { lanes.push({ id, y, h, label, ...opts }); y += h + GAP; };
    add("heat", prefs.win ? 48 : 34, "missense O/E");
    add("iface", 9, "interface");
    if (prefs.partners && allPartners.length) {
      const list = partnersShown();
      add("partners", list.length * PROW + 2, "", { list });   // partner names are the labels
      if (allPartners.length > MAX_PARTNER_ROWS) y += 18;  // room for the show-all toggle
    }
    if (prefs.clinvar && cvPos.length) add("clinvar", 56, "ClinVar");
    if (prefs.domains && domainIvs.length) { const pk = pack(domainIvs); add("domains", pk.nRows * 18 + 2, "domains", { pk }); }
    if (prefs.regions && regionIvs.length) { const pk = pack(regionIvs); add("regions", Math.min(pk.nRows, 6) * 16 + 2, "regions / motifs", { pk }); }
    if (prefs.ss && F.ss) add("ss", 10, "2° structure");
    if (prefs.plddt && F.plddt) add("plddt", 28, "pLDDT");
    if (prefs.sites && sites.length) add("sites", 14, "sites / PTMs");
    return { lanes, H: y + M.bottom };
  }
  function partnersShown() {
    const sel = S.get().partner;
    let list = allPartners.slice().sort((a, b) => b.contacts_self.length - a.contacts_self.length);
    if (!showAllPartners) { list = list.slice(0, MAX_PARTNER_ROWS); if (sel && !list.some((p) => p.uniprot_id === sel)) { const p = allPartners.find((q) => q.uniprot_id === sel); if (p) list.push(p); } }
    return list;
  }

  // ---- DOM ------------------------------------------------------------------
  const wrap = d3.select(container).append("div").attr("class", "track-wrap").style("position", "relative");
  const canvas = wrap.append("canvas").style("position", "absolute").style("left", 0).style("top", 0).style("pointer-events", "none");
  const ctx = canvas.node().getContext("2d");
  // positioned so it stacks above the absolutely-positioned canvas (window line, cursor, focus)
  const svg = wrap.append("svg").attr("width", W).style("display", "block").style("position", "relative");
  const gNav = svg.append("g").attr("transform", `translate(${M.left},${M.top})`);
  const gLanes = svg.append("g").attr("transform", `translate(${M.left},0)`);
  const gLabels = svg.append("g");
  const gAxis = svg.append("g").attr("transform", `translate(${M.left},0)`);
  const gSel = svg.append("g").attr("transform", `translate(${M.left},0)`);     // selected-partner contact markers
  const gCursor = svg.append("g").attr("transform", `translate(${M.left},0)`);
  const gFocus = svg.append("g").attr("transform", `translate(${M.left},0)`);
  const overlay = svg.append("rect").attr("x", M.left).attr("fill", "transparent").style("cursor", "crosshair");

  let x = d3.scaleLinear().range([0, innerW]), LY = layout();
  const xNav = d3.scaleLinear().domain([0.5, L + 0.5]).range([0, innerW]);

  function domain() { const r = S.get().range; return r ? [r[0] - 0.5, r[1] + 0.5] : [0.5, L + 0.5]; }
  function visible() { const [a, b] = x.domain(); return [Math.max(1, Math.ceil(a)), Math.min(L, Math.floor(b))]; }

  // ---- navigator + brush ---------------------------------------------------------
  // Overview strip: a plain bar for the whole protein carrying the zoom window (the
  // lanes below already show O/E and interface residues, so it repeats neither).
  const navCanvasDrawn = () => {
    ctx.fillStyle = getComputedStyle(container).getPropertyValue("--line-strong").trim() || "#c8cdd3";
    ctx.fillRect(M.left, M.top + NAV_H / 2 - 1.5, innerW, 3);
  };
  const brush = d3.brushX().extent([[0, 0], [innerW, NAV_H]]).on("brush end", (evt) => {
    if (!evt.sourceEvent) return;    // programmatic move
    if (!evt.selection) { S.set({ range: null }); return; }
    const [a, b] = evt.selection.map(xNav.invert);
    const r = [Math.max(1, Math.round(a)), Math.min(L, Math.round(b))];
    if (r[1] - r[0] >= 5) S.set({ range: r }, { url: evt.type === "end" });
  });
  const gBrush = gNav.append("g").attr("class", "nav-brush").call(brush);
  gBrush.select(".selection").attr("fill", "var(--broad-blue)").attr("fill-opacity", .12).attr("stroke", "var(--broad-blue)");
  gNav.append("text").attr("x", -8).attr("y", NAV_H / 2 + 4).attr("text-anchor", "end").attr("font-size", 12).attr("fill", "var(--muted)").text("zoom (drag)");

  // ---- zoom / pan on the main area ------------------------------------------------
  const zoom = d3.zoom().scaleExtent([1, Math.max(1, L / 15)]).on("zoom", (evt) => {
    if (!evt.sourceEvent) return;
    const t = evt.transform;
    const d0 = [0.5, L + 0.5];
    const nx = t.rescaleX(d3.scaleLinear().domain(d0).range([0, innerW]));
    let [a, b] = nx.domain();
    const span = b - a; a = Math.max(0.5, Math.min(a, L + 0.5 - span)); b = a + span;
    const r = [Math.max(1, Math.round(a + 0.5)), Math.min(L, Math.round(b - 0.5))];
    S.set({ range: t.k <= 1.001 ? null : r }, { url: evt.sourceEvent.type !== "mousemove" && evt.sourceEvent.type !== "wheel" });
  });
  overlay.call(zoom).on("dblclick.zoom", null);
  function syncZoom() {
    const [a, b] = domain(); const k = L / (b - a);
    overlay.call(zoom.transform, d3.zoomIdentity.scale(k).translate(-xNav(a), 0));
  }

  // ---- drawing --------------------------------------------------------------------
  function drawAll() {
    LY = layout();
    const H = LY.H;
    svg.attr("height", H); canvas.attr("width", W * devicePixelRatio).attr("height", H * devicePixelRatio).style("width", W + "px").style("height", H + "px");
    ctx.setTransform(devicePixelRatio, 0, 0, devicePixelRatio, 0, 0); ctx.clearRect(0, 0, W, H);
    x.domain(domain());
    const [v0, v1] = visible(), n = v1 - v0 + 1, bw = innerW / (x.domain()[1] - x.domain()[0]);
    navCanvasDrawn();
    gLanes.selectAll("*").remove(); gLabels.selectAll("*").remove(); gAxis.selectAll("*").remove();
    const lane = (id) => LY.lanes.find((l) => l.id === id);
    const sel = S.get().partner;

    // lane labels + separators
    for (const l of LY.lanes) {
      gLabels.append("text").attr("x", M.left - 8).attr("y", l.y + Math.min(l.h, 22) / 2 + 4.5).attr("text-anchor", "end").attr("font-size", 12).attr("fill", "var(--muted)").text(l.label);
      gLanes.append("line").attr("x1", 0).attr("x2", innerW).attr("y1", l.y + l.h + GAP / 2).attr("y2", l.y + l.h + GAP / 2).attr("stroke", "var(--line)").attr("stroke-opacity", .6);
    }

    // 1. heat strip (canvas)
    { const l = lane("heat");
      for (let p = v0; p <= v1; p++) { const r = rows[p - 1]; ctx.fillStyle = oeColorHex(r.oe); ctx.fillRect(M.left + x(p) - bw / 2, l.y, Math.max(bw, 0.6), l.h); }
      if (bw >= 9) { ctx.fillStyle = "#1b1f23"; ctx.font = `${Math.min(12, bw * 0.8)}px -apple-system,Helvetica,Arial,sans-serif`; ctx.textAlign = "center";
        for (let p = v0; p <= v1; p++) { const r = rows[p - 1]; ctx.fillStyle = r.oe != null && r.oe < 0.6 ? "#fff" : "#1b1f23"; ctx.fillText(r.aa, M.left + x(p), l.y + l.h / 2 + 4); } }
      // sliding-window O/E line over the strip (y: O/E 0 at the bottom, 2 at the top; dashed = 1)
      if (prefs.win) {
        const y = d3.scaleLinear().domain([0, WIN_MAX]).range([l.y + l.h - 2, l.y + 2]).clamp(true);
        const g = gLanes.append("g").style("pointer-events", "none");
        g.append("line").attr("x1", 0).attr("x2", innerW).attr("y1", y(1)).attr("y2", y(1)).attr("stroke", "#1b1f23").attr("stroke-dasharray", "3,3").attr("opacity", .45);
        const line = d3.line().defined((p) => winOE(p) != null).x((p) => x(p)).y((p) => y(winOE(p)));
        const pts = d3.range(v0, v1 + 1), d = line(pts);
        g.append("path").attr("d", d).attr("fill", "none").attr("stroke", "#fff").attr("stroke-width", 3.5).attr("stroke-opacity", .85).attr("stroke-linejoin", "round");
        g.append("path").attr("d", d).attr("fill", "none").attr("stroke", "#1b1f23").attr("stroke-width", 1.6).attr("stroke-linejoin", "round");
        gLabels.append("text").attr("x", M.left - 8).attr("y", l.y + l.h - 4).attr("text-anchor", "end").attr("font-size", 10.5).attr("fill", "var(--muted)").text(`— ${winSize}-res window`);
      }
    }
    // 2. interface ticks
    { const l = lane("iface"); const g = gLanes.append("g");
      const tick = (set, y, color) => { for (const [a, b] of runs([...set].filter((p) => p >= v0 && p <= v1).sort((p, q) => p - q))) g.append("rect").attr("x", x(a) - bw / 2).attr("y", y).attr("width", Math.max((b - a + 1) * bw, 1)).attr("height", 7).attr("fill", color); };
      tick(prot.interfaceSet, l.y, "var(--orange)");
    }
    // 3. partner lanes
    const pl = lane("partners");
    if (pl) {
      const g = gLanes.append("g");
      pl.list.forEach((p, i) => {
        const y = pl.y + 1 + i * PROW, isSel = p.uniprot_id === sel, dim = sel && !isSel;
        const row = g.append("g").style("cursor", "pointer").attr("opacity", dim ? 0.35 : 1)
          .on("click", () => S.set({ partner: isSel ? null : p.uniprot_id }))
          .on("mousemove", (evt) => showTip(`<b>${escapeHTML(p.label)}</b> <span class="muted">${TYPE_LABEL[p.type] || p.type}</span><br><span class="muted">${p.contacts_self.length} contact residues · O/E</span> <b>${fmt2(p.oe?.oe)}</b><br><span class="muted">click to ${isSel ? "deselect" : "select"}</span>`, evt))
          .on("mouseleave", hideTip);
        row.append("rect").attr("x", 0).attr("y", y).attr("width", innerW).attr("height", PROW - 1).attr("fill", isSel ? p.color : "transparent").attr("fill-opacity", .12);
        for (const [a, b] of runs(p.contacts_self.filter((q) => q >= v0 && q <= v1)))
          row.append("rect").attr("x", x(a) - bw / 2).attr("y", y + 2).attr("width", Math.max((b - a + 1) * bw, 1.2)).attr("height", PROW - 5).attr("fill", p.color).attr("rx", 1);
        gLabels.append("text").attr("x", M.left - 10).attr("y", y + 11).attr("text-anchor", "end").attr("font-size", 12).attr("fill", isSel ? "var(--fg)" : "var(--muted)").attr("font-weight", isSel ? 700 : 400)
          .style("cursor", "pointer").attr("opacity", dim ? 0.5 : 1).text(p.label.length > (W < 600 ? 10 : 15) ? p.label.slice(0, W < 600 ? 9 : 14) + "…" : p.label).on("click", () => S.set({ partner: isSel ? null : p.uniprot_id }));
        gLabels.append("circle").attr("cx", M.left - 4).attr("cy", y + 7).attr("r", 3).attr("fill", p.color).attr("opacity", dim ? 0.5 : 1);
      });
      if (allPartners.length > MAX_PARTNER_ROWS) {
        gLabels.append("text").attr("x", M.left).attr("y", pl.y + pl.h + 14).attr("font-size", 12).attr("fill", "var(--broad-blue)").style("cursor", "pointer")
          .text(showAllPartners ? `▴ show top ${MAX_PARTNER_ROWS} partners` : `▾ show all ${allPartners.length} partners`).on("click", () => { showAllPartners = !showAllPartners; drawAll(); });
      }
    }
    // 4. ClinVar lollipops
    const cl = lane("clinvar");
    if (cl) {
      const g = gLanes.append("g"), base = cl.y + cl.h / 2, stem = cl.h / 2 - 5;
      g.append("line").attr("x1", 0).attr("x2", innerW).attr("y1", base).attr("y2", base).attr("stroke", "var(--line)");
      // One lollipop per residue; distinct amino-acid substitutions at that residue are stacked
      // as extra dots along the stem (up to CV_STACK), with a ×n label beyond that.
      const CV_STACK = 3, CV_STEP = 6.5;
      for (const [pos, cat, nAll = 1] of cvPos) {
        if (pos < v0 || pos > v1) continue;
        const dir = cat === "P" ? -1 : 1, col = cat === "P" ? PLP : BLB, iface = prot.interfaceSet.has(pos);
        g.append("line").attr("x1", x(pos)).attr("x2", x(pos)).attr("y1", base).attr("y2", base + dir * stem).attr("stroke", col).attr("opacity", .35);
        for (let i = 0; i < Math.min(nAll, CV_STACK); i++)
          g.append("circle").attr("cx", x(pos)).attr("cy", base + dir * (stem - i * CV_STEP)).attr("r", 3.2).attr("fill", col).attr("stroke", iface ? "var(--orange)" : "var(--bg)").attr("stroke-width", iface ? 1.6 : .6);
        if (nAll > CV_STACK)
          g.append("text").attr("x", x(pos) + 5).attr("y", base + dir * stem + 4).attr("font-size", 10).attr("fill", col).text(`×${nAll}`);
      }
    }
    // 5/6. domains + regions (packed intervals)
    for (const [id, rh] of [["domains", 18], ["regions", 16]]) {
      const l = lane(id); if (!l) continue;
      const g = gLanes.append("g");
      for (const it of l.pk.items) {
        if (it.e < v0 || it.s > v1 || it.row * rh + rh > l.h) continue;
        const x0 = Math.max(0, x(it.s) - bw / 2), x1 = Math.min(innerW, x(it.e) + bw / 2), y = l.y + 1 + it.row * rh;
        const item = g.append("g").on("mousemove", (evt) => showTip(`<b>${escapeHTML(it.label)}</b><br><span class="muted">residues ${it.s}–${it.e}</span>`, evt)).on("mouseleave", hideTip).style("cursor", "default");
        item.append("rect").attr("x", x0).attr("y", y).attr("width", Math.max(x1 - x0, 1.5)).attr("height", rh - 3).attr("rx", 2)
          .attr("fill", id === "domains" ? "var(--domain)" : "var(--region)").attr("stroke", id === "domains" ? "var(--domain-line)" : "none");
        if (x1 - x0 > it.label.length * 6.4 + 10) item.append("text").attr("x", (x0 + x1) / 2).attr("y", y + rh - 6).attr("text-anchor", "middle").attr("font-size", 11.5).attr("fill", "var(--fg)").text(it.label);
      }
    }
    // 7. secondary structure (canvas)
    const sl = lane("ss");
    if (sl) for (let p = v0; p <= v1; p++) { const c = SS_COLOR[F.ss[p - 1]] || "transparent"; if (c === "transparent") continue; ctx.fillStyle = c; ctx.fillRect(M.left + x(p) - bw / 2, sl.y, Math.max(bw, 0.6), sl.h); }
    // 8. pLDDT (canvas bars)
    const pl2 = lane("plddt");
    if (pl2) for (let p = v0; p <= v1; p++) { const v = F.plddt[p - 1]; if (v == null) continue; const h = (v / 100) * pl2.h; ctx.fillStyle = PLDDT_COLOR(v); ctx.fillRect(M.left + x(p) - bw / 2, pl2.y + pl2.h - h, Math.max(bw, 0.6), h); }
    // 9. sites / PTMs
    const st = lane("sites");
    if (st) { const g = gLanes.append("g");
      for (const s of sites) { if (s.pos < v0 || s.pos > v1) continue;
        const el = s.kind === "site" ? g.append("path").attr("d", `M${x(s.pos)},${st.y + 1} l4,8 l-8,0 Z`).attr("fill", "var(--fg)") : g.append("circle").attr("cx", x(s.pos)).attr("cy", st.y + 6).attr("r", 3).attr("fill", "var(--muted)");
        el.on("mousemove", (evt) => showTip(`<b>${s.kind === "site" ? "Site" : "PTM"}</b> residue ${s.pos}<br><span class="muted">${escapeHTML(s.label)}</span>`, evt)).on("mouseleave", hideTip); }
    }
    // axis
    const axY = LY.H - M.bottom + 2;
    gAxis.append("g").attr("transform", `translate(0,${axY})`).call(d3.axisBottom(x).ticks(Math.min(12, Math.floor(innerW / 70))).tickFormat(d3.format("d")))
      .call((a) => a.select(".domain").attr("stroke", "var(--line)")).call((a) => a.selectAll("text").attr("fill", "var(--muted)").attr("font-size", 12));
    overlay.attr("y", LY.lanes[0].y).attr("width", innerW).attr("height", axY - LY.lanes[0].y);
    drawSelection(); drawFocus();
    // brush position
    const r = S.get().range;
    gBrush.call(brush.move, r ? [xNav(r[0]), xNav(r[1])] : null);
  }

  function drawSelection() {
    gSel.selectAll("*").remove();
    const sel = S.get().partner; if (!sel) return;
    const p = prot.partnerByUni.get(sel); if (!p) return;
    const [v0, v1] = visible(), bw = innerW / (x.domain()[1] - x.domain()[0]), heat = LY.lanes[0];
    for (const [a, b] of runs(p.contacts_self.filter((q) => q >= v0 && q <= v1)))
      gSel.append("rect").attr("x", x(a) - bw / 2).attr("y", heat.y + heat.h + 1).attr("width", Math.max((b - a + 1) * bw, 1.2)).attr("height", 3).attr("fill", p.color);
  }
  function drawFocus() {
    gFocus.selectAll("*").remove();
    const pos = S.get().focus; if (!pos || pos < 1 || pos > L) return;
    const [a, b] = x.domain(); if (pos < a || pos > b) return;
    const cx = x(pos), top = LY.lanes[0].y, bot = LY.H - M.bottom;
    gFocus.append("line").attr("x1", cx).attr("x2", cx).attr("y1", top - 8).attr("y2", bot).attr("stroke", "var(--red)").attr("stroke-width", 1.5);
    gFocus.append("path").attr("d", `M${cx},${top - 8} l5,-8 l-10,0 Z`).attr("fill", "var(--red)");
    const r = rows[pos - 1];
    gFocus.append("text").attr("x", cx).attr("y", top - 18).attr("text-anchor", "middle").attr("font-size", 12).attr("font-weight", 600).attr("fill", "var(--red)").text(`${r.aa}${pos}`);
  }
  function drawCursor(pos) {
    gCursor.selectAll("*").remove();
    if (pos == null) return;
    const [a, b] = x.domain(); if (pos < a || pos > b) return;
    gCursor.append("line").attr("x1", x(pos)).attr("x2", x(pos)).attr("y1", LY.lanes[0].y).attr("y2", LY.H - M.bottom).attr("stroke", "var(--fg)").attr("stroke-width", 1).attr("opacity", .8).style("pointer-events", "none");
  }

  // ---- hover ------------------------------------------------------------------------
  overlay.on("mousemove", (evt) => {
    const mx = d3.pointer(evt, overlay.node())[0] - M.left;
    const pos = Math.round(x.invert(mx));
    if (pos < 1 || pos > L) { hideTip(); return; }
    S.set({ hover: pos, hoverSrc: "track" }, { url: false });
    const r = rows[pos - 1];
    const parts = prot.partnersAt(pos);
    const dom = domainIvs.filter((iv) => pos >= iv[0] && pos <= iv[1]).map((iv) => iv[2]);
    const cv = cvPos.filter((c) => c[0] === pos).map((c) => (c[1] === "P" ? "ClinVar P/LP" : "ClinVar B/LB") + (c[3] ? `: ${c[3].split(";").join(", ")}` : ""));
    showTip(`<b>${r.aa}${pos}</b>${r.is_interface ? ' <span style="color:var(--orange)">· G2P interface</span>' : ""}<br>` +
      `<span class="muted">missense O/E</span> <b>${r.oe == null ? "no data" : fmt3(r.oe)}</b> <span class="muted">(obs ${r.obs ?? 0} · exp ${fmt2(r.exp)})</span>` +
      (prefs.win ? `<br><span class="muted">${winSize}-residue window O/E</span> <b>${fmt2(winOE(pos))}</b>` : "") +
      (parts.length ? `<br><span class="muted">contacts:</span> ${parts.map((p) => `<span class="swatch" style="background:${p.color}"></span>${escapeHTML(p.label)}`).join(", ")}` : "") +
      (dom.length ? `<br><span class="muted">${escapeHTML(dom.join(" · "))}</span>` : "") +
      (F.ss && F.ss[pos - 1] && F.ss[pos - 1] !== "-" ? `<br><span class="muted">DSSP ${({ H: "helix", E: "strand", C: "coil" })[F.ss[pos - 1]]}` + (F.plddt && F.plddt[pos - 1] != null ? ` · pLDDT ${F.plddt[pos - 1]}` : "") + (F.asa && F.asa[pos - 1] != null ? ` · ASA ${F.asa[pos - 1]} Å²` : "") + `</span>` : "") +
      (cv.length ? `<br><span style="color:${PLP}">${cv.join(", ")}</span>` : ""), evt);
  }).on("mouseleave", () => { S.set({ hover: null, hoverSrc: "track" }, { url: false }); hideTip(); })
    .on("click", (evt) => { const pos = Math.round(x.invert(d3.pointer(evt, overlay.node())[0] - M.left)); if (pos >= 1 && pos <= L) S.set({ focus: S.get().focus === pos ? null : pos }); });

  drawAll(); syncZoom();
  const unsub = S.subscribe((st, ch) => {
    if (ch.includes("range")) { drawAll(); syncZoom(); }
    else if (ch.includes("partner")) drawAll();
    if (ch.includes("hover")) drawCursor(st.hover);
    if (ch.includes("focus")) drawFocus();
  });
  return { destroy: () => unsub(), redraw: drawAll, svg: svg.node() };
}

// Lane visibility toolbar (chips); re-renders the track on change.
export function renderLaneToolbar(container, prot, onChange) {
  const prefs = lanePrefs();
  const F = prot.features || {};
  const chips = [
    ["partners", "partners", (prot.partners || []).length], ["clinvar", "ClinVar", prot.clinvar && prot.clinvar.positions && prot.clinvar.positions.length],
    ["domains", "domains", (F.domain || F.zf || F.tm || F.repeat || F.dna || F.coil) ? 1 : 0], ["regions", "regions / motifs", (F.region || F.motif) ? 1 : 0],
    ["ss", "2° structure", F.ss ? 1 : 0], ["plddt", "pLDDT", F.plddt ? 1 : 0], ["sites", "sites / PTMs", (F.site || F.ptm) ? 1 : 0],
  ].filter((c) => c[2]);
  container.innerHTML = `<span class="tag">lanes:</span> ` + chips.map(([k, label]) => `<label class="chip"><input type="checkbox" data-k="${k}" ${prefs[k] ? "checked" : ""}> ${label}</label>`).join("") +
    `<span class="chip-sep"></span><label class="chip" title="Overlay missense O/E pooled over a sliding window of residues (Σobs / Σexp, centred) on the O/E strip; dashed line = O/E 1, axis 0–${WIN_MAX}">` +
    `<input type="checkbox" data-k="win" ${prefs.win ? "checked" : ""}> window O/E ` +
    `<select id="win-size" aria-label="window size (residues)">${WIN_SIZES.map((n) => `<option value="${n}" ${n === prefs.winSize ? "selected" : ""}>${n} res</option>`).join("")}</select></label>` +
    ` <button class="chip-btn" id="track-reset" title="show whole protein">reset zoom</button>`;
  container.querySelectorAll("input").forEach((i) => i.addEventListener("change", () => { setLanePref(i.dataset.k, i.checked); onChange(); }));
  container.querySelector("#win-size").addEventListener("change", (e) => {
    setLanePref("winSize", +e.target.value); setLanePref("win", true);
    container.querySelector('input[data-k="win"]').checked = true; onChange();
  });
  container.querySelector("#track-reset").addEventListener("click", () => S.set({ range: null }));
}
