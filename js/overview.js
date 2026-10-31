// Landing-page overview of every protein: canvas scatter (interface O/E vs
// non-interface O/E, or vs whole-gene O/E) with hover,
// click-through, shared filters, and a small "you are here" version for the
// protein page.
import { fmt2, pretty_p, escapeHTML, int } from "./format.js";
import { showTip, hideTip } from "./tooltip.js";
import { prefetchProtein } from "./data.js";

// Highlight pills: each picks out a subset of proteins in plain language. Active pills
// combine with AND (each one narrows the set). The plot always shows every protein;
// highlighted ones are drawn in colour, the rest fade into context.
// Tunable pill parameters (the heterogeneity threshold has a slider on the landing page).
export const PILL_PARAMS = { hetP: 0.05 };
export const HET_STEPS = [0.05, 0.01, 0.005, 0.001, 0.0001];

export const PILLS = [
  { key: "sig", label: "Significant interface depletion", test: (r) => r.sig,
    help: "Interface residues are significantly depleted of missense variation vs the rest of the protein (one-sided p < 0.05)" },
  { key: "clinvar", label: "ClinVar P/LP variants", test: (r) => r.cv > 0,
    help: "At least one pathogenic / likely-pathogenic missense variant in ClinVar" },
  { key: "omim", label: "OMIM disease gene", test: (r) => !!r.om,
    help: "OMIM phenotype with a known molecular basis (mapping key 3)" },
  { key: "homomer", label: "Forms homomers", test: (r) => !!r.hm,
    help: "Also binds other copies of itself (dimers, tetramers…) in a PDB structure" },
  { key: "partners", label: "2+ partners", test: (r) => r.np >= 2,
    help: "Structures show it binding at least two different proteins" },
  { key: "het", label: "Partner-specific constraint", test: (r) => r.hp != null && r.hp >= -Math.log10(PILL_PARAMS.hetP),
    help: "Interface constraint differs between its partners (partner-heterogeneity test, nominal p below the slider threshold; default 0.05)" },
];
export const DEFAULT_FILTERS = { pills: [], mode: "oe" };
export const activePills = (f) => PILLS.filter((p) => (f.pills || []).includes(p.key));
export function matchPills(r, f) { return activePills(f).every((p) => p.test(r)); }

const COL = { sig: "#F36C3E", ns: "#8d939a", hi: "#111" };

export function renderOverview(container, allRows, { onSelect, filters = DEFAULT_FILTERS } = {}) {
  container.innerHTML = "";
  const W = Math.max(container.clientWidth || 900, 300), H = Math.min(460, Math.max(300, W * 0.5));
  const M = { top: 20, right: 18, bottom: 50, left: 62 };
  const iw = W - M.left - M.right, ih = H - M.top - M.bottom;

  const wrap = d3.select(container).append("div").attr("class", "ov-wrap").style("position", "relative").style("height", H + "px");
  const canvas = wrap.append("canvas").attr("width", W * devicePixelRatio).attr("height", H * devicePixelRatio)
    .style("width", W + "px").style("height", H + "px").style("position", "absolute").style("left", 0).style("top", 0);
  const ctx = canvas.node().getContext("2d"); ctx.scale(devicePixelRatio, devicePixelRatio);
  const svg = wrap.append("svg").attr("width", W).attr("height", H).style("position", "absolute").style("left", 0).style("top", 0);
  const g = svg.append("g").attr("transform", `translate(${M.left},${M.top})`);
  const axX = g.append("g").attr("transform", `translate(0,${ih})`), axY = g.append("g");
  const labX = g.append("text").attr("x", iw / 2).attr("y", ih + 42).attr("text-anchor", "middle").attr("font-size", 13).attr("fill", "var(--muted)");
  const labY = g.append("text").attr("transform", "rotate(-90)").attr("x", -ih / 2).attr("y", -46).attr("text-anchor", "middle").attr("font-size", 13).attr("fill", "var(--muted)");
  const ref = g.append("g");
  const hiG = g.append("g");
  const count = d3.select(container).append("p").attr("class", "panel-note ov-count");

  let rows = [], x, y, mode = filters.mode || "oe", cur = filters, qt, hovered = null, pinned = null;

  // Two views, both O/E vs O/E on a shared 0–1.6 scale: y = interface O/E;
  // x = rest of the protein ("oe") or the whole gene from gnomAD's gene table ("gene").
  const narrow = W < 600;   // phones: shorter axis titles, no in-plot annotation
  function coords(r) {
    return [Math.min((mode === "gene" ? r.gm : r.on) ?? 0, 1.6), Math.min(r.oi ?? 0, 1.6)];
  }
  function setScales() {
    x = d3.scaleLinear().domain([0, 1.6]).range([0, iw]);
    y = d3.scaleLinear().domain([0, 1.6]).range([ih, 0]);
    labX.text(mode === "gene"
      ? (narrow ? "whole-gene missense O/E (gnomAD)" : "whole-gene missense O/E (gnomAD v4.1 gene-level constraint)")
      : (narrow ? "rest-of-protein missense O/E" : "non-interface missense O/E (rest of the protein)"));
    labY.text("interface missense O/E");
    axX.call(d3.axisBottom(x).ticks(narrow ? 4 : 8)).call(style);
    axY.call(d3.axisLeft(y).ticks(6)).call(style);
    ref.selectAll("*").remove();
    ref.append("line").attr("x1", x(0)).attr("y1", y(0)).attr("x2", x(1.6)).attr("y2", y(1.6)).attr("stroke", "var(--line)").attr("stroke-dasharray", "3,3");
    ref.append("text").attr("x", x(1.55)).attr("y", y(1.55) - 6).attr("text-anchor", "end").attr("font-size", 12).attr("fill", "var(--muted)").text("equal O/E");
    if (!narrow) ref.append("text").attr("x", 6).attr("y", 14).attr("font-size", 12).attr("fill", "var(--muted)")
      .text(mode === "gene" ? "below the line = interface more constrained than the gene as a whole" : "below the line = interface more constrained than the rest of the protein");
  }
  function style(s) { s.select(".domain").attr("stroke", "var(--line)"); s.selectAll("line").attr("stroke", "var(--line)"); s.selectAll("text").attr("fill", "var(--muted)").attr("font-size", 12); }

  function draw() {
    ctx.clearRect(0, 0, W, H);
    ctx.save(); ctx.translate(M.left, M.top);
    const pts = [];
    for (const r of rows) {
      if (mode === "gene" && r.gm == null) continue;   // no gene-level estimate
      const [cx, cy] = coords(r);
      const px = x(cx), py = y(cy);
      pts.push({ r, px, py });
    }
    // Highlight: non-matching proteins become faint context underneath.
    const hl = activePills(cur).length > 0;
    const on = hl ? pts.filter((p) => matchPills(p.r, cur)) : pts;
    if (hl) {
      ctx.fillStyle = "#c9cdd2"; ctx.globalAlpha = 0.28;
      for (const p of pts) { if (matchPills(p.r, cur)) continue; ctx.beginPath(); ctx.arc(p.px, p.py, 2, 0, 2 * Math.PI); ctx.fill(); }
    }
    // non-significant first (underneath), then significant
    for (const pass of [false, true]) {
      ctx.fillStyle = pass ? COL.sig : COL.ns;
      ctx.globalAlpha = pass ? 0.8 : (hl ? 0.6 : 0.35);
      for (const p of on) {
        if (!!p.r.sig !== pass) continue;
        ctx.beginPath(); ctx.arc(p.px, p.py, hl ? (pass ? 3.6 : 3) : (pass ? 3 : 2.4), 0, 2 * Math.PI); ctx.fill();
        if (hl) { ctx.globalAlpha = 0.9; ctx.strokeStyle = "#1a1a1a"; ctx.lineWidth = 0.6; ctx.stroke(); ctx.globalAlpha = pass ? 0.8 : 0.6; }
      }
    }
    ctx.restore();
    qt = d3.quadtree().x((p) => p.px).y((p) => p.py).addAll(on);
    const nMissing = mode === "gene" ? rows.filter((r) => r.gm == null).length : 0;
    count.html((nMissing ? `${int(nMissing)} proteins without a gnomAD gene-level missense O/E not shown · ` : "") + ` <span style="color:${COL.sig}">●</span> interface significantly depleted (p < 0.05) · <span style="color:${COL.ns}">●</span> not significant`);
  }
  function drawHighlight() {
    hiG.selectAll("*").remove();
    for (const [p, cls] of [[pinned, "pin"], [hovered, "hov"]]) {
      if (!p) continue;
      hiG.append("circle").attr("cx", p.px).attr("cy", p.py).attr("r", 6).attr("fill", "none").attr("stroke", COL.hi).attr("stroke-width", 1.5);
      hiG.append("text").attr("x", p.px + 8).attr("y", p.py - 7).attr("font-size", 13).attr("font-weight", 600).attr("fill", "var(--fg)")
        .attr("paint-order", "stroke").attr("stroke", "var(--bg)").attr("stroke-width", 3).text(p.r.s);
    }
  }

  svg.on("mousemove", (evt) => {
    const [mx, my] = d3.pointer(evt, g.node());
    const p = qt && qt.find(mx, my, 9);
    if (p !== hovered) { hovered = p; drawHighlight(); if (p) prefetchProtein(p.r.u); }
    if (!p) { hideTip(); svg.style("cursor", "default"); return; }
    svg.style("cursor", "pointer");
    const r = p.r;
    showTip(`<b>${escapeHTML(r.s)}</b> <span class="muted">${r.u}</span><br>
      <span class="muted">interface O/E</span> <b>${fmt2(r.oi)}</b> <span class="muted nowrap">(${fmt2(r.il)}–${fmt2(r.ih)})</span><br>
      <span class="muted">non-interface O/E</span> ${fmt2(r.on)}<br>
      <span class="muted">whole-gene missense O/E</span> ${fmt2(r.gm)}${r.gm != null ? ` <span class="muted nowrap">(90% CI ${fmt2(r.gml)}–${fmt2(r.gmh)})</span>` : ""}<br>
      ${r.om || r.cv ? `<span class="muted">${[r.om ? "OMIM disease gene" : "", r.cv ? `${r.cv} ClinVar P/LP missense residue${r.cv === 1 ? "" : "s"}` : ""].filter(Boolean).join(" · ")}</span><br>` : ""}
      <span class="muted">${pretty_p(r.p)}</span> · ${r.np} partner${r.np === 1 ? "" : "s"}${r.hp != null && r.hp >= 1.301 ? ` · <span style='color:var(--purple)'>partner-specific constraint (${pretty_p(r.hp, { ns: false })})</span>` : ""}<br>
      <span class="muted">click to open</span>`, evt);
  }).on("mouseleave", () => { hovered = null; drawHighlight(); hideTip(); })
    .on("click", () => { if (hovered && onSelect) onSelect(hovered.r); });

  function update(newRows, newFilters) {
    rows = newRows; if (newFilters) { cur = newFilters; if (newFilters.mode) mode = newFilters.mode; }
    setScales(); draw(); drawHighlight();
  }
  update(allRows, filters);
  return { update, setMode: (m) => { mode = m; setScales(); draw(); drawHighlight(); } };
}

// Small static version for the protein page: all proteins in grey, this one marked.
export function renderMini(container, allRows, uni) {
  container.innerHTML = "";
  const W = 200, H = 160, M = { top: 8, right: 8, bottom: 26, left: 34 };
  const iw = W - M.left - M.right, ih = H - M.top - M.bottom;
  const x = d3.scaleLinear().domain([0, 1.6]).range([0, iw]), y = d3.scaleLinear().domain([0, 1.6]).range([ih, 0]);
  const canvas = d3.select(container).append("canvas").attr("width", W * devicePixelRatio).attr("height", H * devicePixelRatio)
    .style("width", W + "px").style("height", H + "px").style("position", "absolute");
  const ctx = canvas.node().getContext("2d"); ctx.scale(devicePixelRatio, devicePixelRatio);
  ctx.translate(M.left, M.top); ctx.fillStyle = COL.ns; ctx.globalAlpha = 0.25;
  let me = null;
  for (const r of allRows) {
    if (r.u === uni) { me = r; continue; }
    ctx.beginPath(); ctx.arc(x(Math.min(r.on ?? 0, 1.6)), y(Math.min(r.oi ?? 0, 1.6)), 1.6, 0, 2 * Math.PI); ctx.fill();
  }
  const svg = d3.select(container).append("svg").attr("width", W).attr("height", H).style("position", "relative");
  const g = svg.append("g").attr("transform", `translate(${M.left},${M.top})`);
  g.append("line").attr("x1", x(0)).attr("y1", y(0)).attr("x2", x(1.6)).attr("y2", y(1.6)).attr("stroke", "var(--line)").attr("stroke-dasharray", "2,2");
  const miniAxis = (a) => { a.selectAll("path,line").attr("stroke", "var(--line-strong)"); a.selectAll("text").attr("fill", "var(--muted)").attr("font-size", 10); };
  g.append("g").attr("transform", `translate(0,${ih})`).call(d3.axisBottom(x).ticks(3).tickSize(3)).call(miniAxis);
  g.append("g").call(d3.axisLeft(y).ticks(3).tickSize(3)).call(miniAxis);
  g.append("text").attr("x", iw / 2).attr("y", ih + 22).attr("text-anchor", "middle").attr("font-size", 10.5).attr("fill", "var(--muted)").text("non-interface O/E");
  g.append("text").attr("transform", "rotate(-90)").attr("x", -ih / 2).attr("y", -24).attr("text-anchor", "middle").attr("font-size", 10.5).attr("fill", "var(--muted)").text("interface O/E");
  if (me) {
    const px = x(Math.min(me.on ?? 0, 1.6)), py = y(Math.min(me.oi ?? 0, 1.6));
    g.append("circle").attr("cx", px).attr("cy", py).attr("r", 4.5).attr("fill", COL.sig).attr("stroke", "#fff").attr("stroke-width", 1.2);
    g.append("circle").attr("cx", px).attr("cy", py).attr("r", 8).attr("fill", "none").attr("stroke", COL.sig).attr("stroke-width", 1).attr("opacity", .6);
  }
}
