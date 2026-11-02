// Headline forest plot: interface vs non-interface pooled missense O/E (90/95% CI),
// with the interface row expandable into one row per structural partner
// (partner-resolved constraint). Clicking a partner row selects that partner
// everywhere (track lanes, network, 3D view).
import { fmt2, pretty_p, pretty_q, escapeHTML, TYPE_LABEL, bondList, oeCI } from "./format.js";
import { showTip, hideTip } from "./tooltip.js";
import * as S from "./state.js";

// View options; module-level so they survive redraws and resizes.
let showGene = false;   // whole-gene (gnomAD) missense O/E reference row
let ciLevel = 95;       // 90 or 95

// Interval at the chosen level: precomputed 95% CIs, 90% recomputed from obs/exp.
// The gnomAD gene-level row only has a 90% CI, so it always shows that (lvl says which).
function ciOf(d) {
  if (!d || d.ci_low == null) return null;
  if (d.ci90) return { lo: d.ci_low, hi: d.ci_high, lvl: 90 };
  if (ciLevel === 90 && d.obs != null && d.exp > 0) { const [lo, hi] = oeCI(d.obs, d.exp, 0.9); return { lo, hi, lvl: 90 }; }
  return { lo: d.ci_low, hi: d.ci_high, lvl: 95 };
}

export function renderHeadline(container, prot) {
  container.innerHTML = "";
  const s = prot.summary, gc = prot.gene_constraint;
  // gnomAD publishes gene-level missense O/E with a 90% CI only (no counts in the export)
  const gene = gc && gc.mis_oe != null ? { oe: gc.mis_oe, ci_low: gc.mis_ci[0], ci_high: gc.mis_ci[1], ci90: true } : null;
  const partners = (prot.partners || []).filter((p) => p.oe && p.oe.oe != null);
  let expanded = !!S.get().partner || partners.length <= 6;
  let unsub = null;

  function rowsForDraw() {
    // Pooled interface and non-interface side by side; partner rows open underneath.
    const base = [
      { key: "interface", label: "All interfaces", color: "var(--interface)", d: s.interface, main: true, n: s.n_interface_residues },
      { key: "noninterface", label: "Non-interface", color: "var(--noninterface)", d: s.noninterface, main: true },
      ...(showGene && gene ? [{ key: "gene", label: "Whole gene", color: "var(--muted)", d: gene, main: true }] : []),
    ].filter((r) => r.d && r.d.oe != null);
    if (partners.length) {
      base.push({ key: "partners", header: true });
      if (expanded) {
        const sorted = partners.slice().sort((a, b) => (a.oe.oe - b.oe.oe) || (b.contacts_self.length - a.contacts_self.length));
        for (const p of sorted) base.push({ key: p.uniprot_id, label: p.label, color: p.color, d: p.oe, partner: p, sub: true });
      }
    }
    return base;
  }

  function draw() {
    container.innerHTML = "";
    const rows = rowsForDraw();
    if (!rows.length) { container.innerHTML = '<p class="panel-note">No pooled constraint available.</p>'; return; }
    container.insertAdjacentHTML("beforeend", `<div class="forest-opts">
      ${gene ? `<label class="chip" title="gnomAD v4.1 gene-level missense O/E over all residues; gnomAD reports a 90% CI only">
        <input type="checkbox" ${showGene ? "checked" : ""}> whole-gene missense O/E <span class="tag">(gnomAD)</span></label>` : ""}
      <span class="seg" role="group" aria-label="confidence interval">${[90, 95].map((l) => `<button type="button" data-ci="${l}" class="${l === ciLevel ? "on" : ""}">${l}% CI</button>`).join("")}</span></div>`);
    const opts = container.querySelector(".forest-opts");
    opts.querySelector("input")?.addEventListener("change", (e) => { showGene = e.target.checked; draw(); });
    opts.querySelectorAll("[data-ci]").forEach((b) => b.addEventListener("click", () => { ciLevel = +b.dataset.ci; draw(); }));
    const sel = S.get().partner;
    const W = Math.max(container.clientWidth || 920, 300);
    const narrow = W < 600;
    // Right-hand table columns (x offsets from the plot's right edge): O/E · CI · residues · p vs rest.
    // The p column gets room for its widest form, "p = 0.0054" at the pooled-row font size.
    const COL = { oe: 10, ci: 48, n: 160, p: 172 };
    const M = { top: 22, right: narrow ? 64 : COL.p + 86, bottom: 42, left: narrow ? 112 : 160 };
    const rowH = (r) => (r.header ? 32 : r.sub ? 25 : 44);
    const totalH = d3.sum(rows, rowH);
    const H = M.top + totalH + M.bottom;
    const innerW = W - M.left - M.right;
    // x range from the (wider) 95% intervals so the axis doesn't jump when toggling 90/95
    const maxX = Math.max(1.25, d3.min([2.5, d3.max(rows.filter((r) => r.d), (r) => Math.max(r.d.ci_high ?? r.d.oe, r.d.rest?.ci_high ?? 0)) * 1.05]));
    const x = d3.scaleLinear().domain([0, maxX]).range([0, innerW]);

    const svg = d3.select(container).append("svg").attr("width", W).attr("height", H).attr("viewBox", `0 0 ${W} ${H}`).attr("class", "forest");
    const g = svg.append("g").attr("transform", `translate(${M.left},${M.top})`);
    g.append("line").attr("x1", x(1)).attr("x2", x(1)).attr("y1", -6).attr("y2", totalH).attr("stroke", "var(--muted)").attr("stroke-dasharray", "3,3").attr("opacity", .6);
    g.append("text").attr("x", x(1)).attr("y", -8).attr("text-anchor", "middle").attr("font-size", 12).attr("fill", "var(--muted)").text("O/E = 1");
    const colHead = [["oe", "O/E", "start"], ...(narrow ? [] : [["ci", `${ciLevel}% CI`, "start"], ["n", "residues", "end"], ["p", "p vs rest", "start"]])];
    colHead.forEach(([k, t, anchor]) => g.append("text").attr("x", innerW + COL[k]).attr("y", -8).attr("text-anchor", anchor)
      .attr("font-size", 11.5).attr("font-weight", 600).attr("fill", "var(--muted)").text(t));
    // Reference band: the rest-of-protein / non-interface O/E for context behind the partner rows.
    g.append("g").attr("transform", `translate(0,${totalH})`).call(d3.axisBottom(x).ticks(6))
      .call((a) => a.select(".domain").attr("stroke", "var(--line)")).call((a) => a.selectAll("text").attr("fill", "var(--muted)").attr("font-size", 12));
    g.append("text").attr("x", innerW / 2).attr("y", totalH + 34).attr("text-anchor", "middle").attr("font-size", 13).attr("fill", "var(--muted)").text(`missense observed / expected (${ciLevel}% CI)`);

    let yCur = 0;
    rows.forEach((r) => {
      const h = rowH(r), cy = yCur + h / 2; yCur += h;
      if (r.header) {   // "By partner" toggle: opens the partner-resolved rows below the pooled pair
        const hdr = g.append("g").attr("class", "forest-row").style("cursor", "pointer").on("click", () => { expanded = !expanded; draw(); });
        hdr.append("rect").attr("x", -M.left + 4).attr("y", cy - h / 2).attr("width", W - 8).attr("height", h).attr("fill", "transparent");
        hdr.append("line").attr("x1", -M.left + 8).attr("x2", innerW + M.right - 8).attr("y1", cy - h / 2 + 2).attr("y2", cy - h / 2 + 2).attr("stroke", "var(--line)");
        hdr.append("text").attr("x", -12).attr("y", cy + 6).attr("text-anchor", "end").attr("font-size", 13.5).attr("font-weight", 600).attr("fill", "var(--broad-blue)")
          .text(`${expanded ? "▾" : "▸"} By partner (${partners.length})`);
        hdr.append("text").attr("x", innerW + 10).attr("y", cy + 6).attr("font-size", 12).attr("fill", "var(--muted)")
          .text(narrow ? "" : expanded ? "click to collapse" : "click to show each partner");
        return;
      }
      const isSel = r.partner && r.partner.uniprot_id === sel;
      const row = g.append("g").attr("class", "forest-row" + (r.sub ? " sub" : "") + (isSel ? " selected" : ""))
        .style("cursor", r.partner ? "pointer" : "default");
      if (r.sub) row.append("rect").attr("x", -M.left + 4).attr("y", cy - h / 2).attr("width", W - 8).attr("height", h).attr("fill", isSel ? "var(--sel-bg)" : "transparent").attr("rx", 4);
      const rest = r.sub ? ciOf(r.d.rest) : null, ci = ciOf(r.d);
      if (rest)   // rest-of-protein CI: grey band behind the partner row
        row.append("rect").attr("x", x(Math.min(rest.lo, maxX))).attr("y", cy - 6)
          .attr("width", Math.max(1, x(Math.min(rest.hi, maxX)) - x(Math.min(rest.lo, maxX)))).attr("height", 12)
          .attr("fill", "var(--muted)").attr("opacity", .16).attr("rx", 2);
      if (r.sub && r.d.oe_rest != null)   // rest-of-protein reference tick for partner rows
        row.append("line").attr("x1", x(r.d.oe_rest)).attr("x2", x(r.d.oe_rest)).attr("y1", cy - 7).attr("y2", cy + 7).attr("stroke", "var(--muted)").attr("stroke-width", 1).attr("opacity", .5);
      if (ci) {
        row.append("line").attr("x1", x(Math.min(ci.lo, maxX))).attr("x2", x(Math.min(ci.hi, maxX))).attr("y1", cy).attr("y2", cy)
          .attr("stroke", r.color).attr("stroke-width", r.sub ? 1.5 : 2.2).attr("opacity", .55);
        if (ci.hi > maxX) row.append("path").attr("d", `M${x(maxX)},${cy} l-5,-3 l0,6 Z`).attr("fill", r.color).attr("opacity", .55);
        else [ci.lo, ci.hi].forEach((v) => row.append("line").attr("x1", x(v)).attr("x2", x(v)).attr("y1", cy - (r.sub ? 3 : 4)).attr("y2", cy + (r.sub ? 3 : 4)).attr("stroke", r.color).attr("stroke-width", 1.5).attr("opacity", .55));
      }
      row.append("circle").attr("cx", x(Math.min(r.d.oe, maxX))).attr("cy", cy).attr("r", r.sub ? 4 : 6.5).attr("fill", r.color).attr("stroke", "var(--bg)").attr("stroke-width", 1.5);
      // Left label
      row.append("text").attr("x", -12).attr("y", cy + 4).attr("text-anchor", "end").attr("font-size", r.sub ? 12.5 : 14)
        .attr("fill", "var(--fg)").attr("font-weight", r.sub ? (isSel ? 700 : 500) : 600).text(r.sub && narrow && r.label.length > 11 ? r.label.slice(0, 10) + "…" : r.label);
      // Right-hand columns: O/E · CI · residues · p vs rest (pooled interface row: vs non-interface)
      const fs = r.sub ? 12 : 13.5;
      const cell = (k, t, { anchor = "start", fg = false } = {}) => t != null && t !== "" && row.append("text").attr("x", innerW + COL[k]).attr("y", cy + 4)
        .attr("text-anchor", anchor).attr("font-size", fs).attr("font-weight", fg && !r.sub ? 600 : 400).attr("fill", fg ? "var(--fg)" : "var(--muted)")
        .attr("font-variant-numeric", "tabular-nums").text(t);
      cell("oe", fmt2(r.d.oe), { fg: true });
      if (!narrow) {
        if (ci) cell("ci", `${fmt2(ci.lo)}–${fmt2(ci.hi)}${ci.lvl !== ciLevel ? ` (${ci.lvl}%)` : ""}`);
        cell("n", r.sub ? r.d.n : r.n != null ? r.n.toLocaleString() : "", { anchor: "end" });
        cell("p", r.sub ? pretty_p(r.d.log10p) : r.key === "interface" ? pretty_p(s.log10p, { ns: false }) : "");
      }
      row.on("mousemove", (evt) => showTip(tipHTML(r), evt)).on("mouseleave", hideTip)
        .on("click", () => {
          if (r.partner) S.set({ partner: isSel ? null : r.partner.uniprot_id });
        });
    });

    // Heterogeneity badge + footnotes under the plot
    const notes = [];
    if (expanded && prot.heterogeneity) {
      const h = prot.heterogeneity;
      const sig = h.q != null && h.q < 0.1;
      notes.push(`<span class="het-badge ${sig ? "sig" : ""}">Partner heterogeneity: ${pretty_p(h.log10p, { ns: false })} · ${pretty_q(h.q)} <span class="tag">(G = ${h.G}, df = ${h.df}, over ${h.n_partners} partners with partner-exclusive residues)</span></span>`);
    } else if (expanded && partners.length >= 2) {
      notes.push(`<span class="tag">Partner heterogeneity not testable (needs ≥ 2 partners with ≥ 2 expected missense on partner-exclusive residues).</span>`);
    }
    if (expanded && partners.length) notes.push(`<span class="tag">Each partner row: this protein's residues contacting that partner; tick and grey band = O/E (${ciLevel}% CI) of the rest of the protein (everything except that partner's contacts); p = one-sided test vs the rest. Click a row to select the partner.</span>`);
    if (notes.length) container.insertAdjacentHTML("beforeend", `<p class="panel-note forest-notes">${notes.join("<br>")}</p>`);
  }

  function tipHTML(r) {
    let h = `<b>${escapeHTML(r.label)}</b>`;
    if (r.partner) h += ` <span class="muted">${r.partner.uniprot_id} · ${TYPE_LABEL[r.partner.type] || r.partner.type}</span>`;
    const ciTxt = (d) => { const c = ciOf(d); return c ? `${c.lvl}% CI ${fmt2(c.lo)}–${fmt2(c.hi)}` : ""; };
    if (r.d.ci90) return h + `<br><span class="muted">missense O/E</span> ${fmt2(r.d.oe)} <span class="muted">(${ciTxt(r.d)})</span>` +
      `<br><span class="muted">gnomAD v4.1 gene-level, all residues (gnomAD reports a 90% CI only)</span>`;
    h += `<br><span class="muted">O/E</span> ${fmt2(r.d.oe)} <span class="muted">(${ciTxt(r.d)})</span>` +
      `<br><span class="muted">obs ${r.d.obs} / exp ${fmt2(r.d.exp)}</span>`;
    if (r.partner) {
      const p = r.partner;
      h += `<br><span class="muted">${p.contacts_self.length} contact residues · ${bondList(p.bond_types)} · ${p.n_pdbs} PDB entries</span>`;
      const rest = r.d.rest;
      h += `<br><span class="muted">rest of protein:</span> O/E ${fmt2(r.d.oe_rest)}${rest ? ` <span class="muted">(${ciTxt(rest)}; obs ${rest.obs} / exp ${fmt2(rest.exp)})</span>` : ""}`;
      h += `<br><span class="muted">vs rest of protein:</span> ${pretty_p(r.d.log10p, { ns: false })}`;
      if (p.partner_side && p.partner_side.oe != null) h += `<br><span class="muted">${escapeHTML(p.label)}'s side of this interface:</span> O/E ${fmt2(p.partner_side.oe)}`;
      h += `<br><span class="muted">click to ${S.get().partner === p.uniprot_id ? "deselect" : "select"}</span>`;
    }
    return h;
  }

  draw();
  unsub = S.subscribe((st, changed) => { if (changed.includes("partner")) { if (st.partner) expanded = true; draw(); } });
  return { destroy: () => unsub && unsub(), redraw: draw };
}
