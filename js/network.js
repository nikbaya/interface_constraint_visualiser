// Partner network: focal protein in the centre, partners around it; a homomeric
// interface (another copy of the same protein) is a self-loop on the centre node. Node colour
// = that partner's O/E at its interface with this protein (partner-resolved),
// edge width = number of contact residues. Hover = preview on the track; click
// = select the partner (headline / track / 3D follow); double-click = open it.
import { oeColor, fmt2, escapeHTML, TYPE_LABEL, EXOGENOUS } from "./format.js";
import { showTip, hideTip } from "./tooltip.js";
import * as S from "./state.js";

export function renderNetwork(container, prot) {
  container.innerHTML = "";
  const homomer = (prot.partners || []).find((p) => p.type === "homomeric");
  const partners = (prot.partners || []).filter((p) => p.type !== "processed_chain" && p.type !== "homomeric");
  if (!partners.length && !homomer) { container.innerHTML = '<p class="panel-note">No structural interface partners resolved for this protein.</p>'; return { destroy() {} }; }
  const W = Math.max(container.clientWidth || 920, 300), H = Math.min(420, Math.max(300, 240 + partners.length * 4));

  const nodes = [{ id: prot.uniprot_id, gene: prot.gene_symbol, self: true, oe: prot.summary.interface?.oe }];
  const links = [];
  for (const p of partners) {
    nodes.push({ id: p.uniprot_id, gene: p.label, self: false, p, oe: p.oe ? p.oe.oe : null, n: p.contacts_self.length });
    links.push({ source: prot.uniprot_id, target: p.uniprot_id, n: p.contacts_self.length });
  }
  const maxN = d3.max([...partners, ...(homomer ? [homomer] : [])], (p) => p.contacts_self.length) || 1;
  const rScale = d3.scaleSqrt().domain([1, maxN]).range([8, 20]);
  const eScale = d3.scaleSqrt().domain([1, maxN]).range([1, 7]);
  const radius = (d) => (d.self ? 26 : rScale(d.n || 1));

  const svg = d3.select(container).append("svg").attr("width", W).attr("height", H).attr("viewBox", `0 0 ${W} ${H}`);
  const R0 = 26, cx0 = W / 2, cy0 = H / 2;
  const loopPath = `M${cx0 - R0 * 0.55},${cy0 - R0 * 0.83} C${cx0 - R0 * 2.4},${cy0 - R0 * 3.3} ${cx0 + R0 * 2.4},${cy0 - R0 * 3.3} ${cx0 + R0 * 0.55},${cy0 - R0 * 0.83}`;
  if (homomer) nodes.push({ id: "__loop", ghost: true, fx: cx0, fy: cy0 - R0 * 2.2, r: R0 * 1.3 });
  const loop = homomer ? svg.append("g").attr("class", "self-loop").style("cursor", "pointer") : null;
  if (loop) {
    loop.append("path").attr("class", "hit").attr("d", loopPath).attr("fill", "none").attr("stroke", "transparent").attr("stroke-width", 16);
    loop.append("path").attr("class", "halo").attr("d", loopPath).attr("fill", "none").attr("stroke", "var(--purple)").attr("stroke-width", eScale(homomer.contacts_self.length) + 6).attr("opacity", 0);
    // outline first, so a near-white (O/E ≈ 1) loop still reads against the background
    loop.append("path").attr("d", loopPath).attr("fill", "none").attr("stroke", "var(--muted)").attr("stroke-opacity", 0.55)
      .attr("stroke-width", Math.max(3, eScale(homomer.contacts_self.length)) + 2).attr("stroke-linecap", "round");
    loop.append("path").attr("class", "arc").attr("d", loopPath).attr("fill", "none")
      .attr("stroke", oeColor(homomer.oe ? homomer.oe.oe : null)).attr("stroke-width", Math.max(3, eScale(homomer.contacts_self.length))).attr("stroke-linecap", "round");
    loop.append("text").attr("x", cx0).attr("y", cy0 - R0 * 2.75).attr("text-anchor", "middle").attr("font-size", 12.5).attr("font-weight", 600)
      .attr("fill", "var(--purple)").attr("paint-order", "stroke").attr("stroke", "var(--bg)").attr("stroke-width", 3).text("= homomer");
    loop.on("mouseenter", (evt) => { hoverPartner = homomer.uniprot_id; paint(); showTip(loopTip(), evt); })
      .on("mousemove", (evt) => showTip(loopTip(), evt))
      .on("mouseleave", () => { hoverPartner = null; paint(); hideTip(); })
      .on("click", () => S.set({ partner: S.get().partner === homomer.uniprot_id ? null : homomer.uniprot_id }));
  }
  function loopTip() {
    const p = homomer;
    return `<b>${escapeHTML(prot.gene_symbol)} = ${escapeHTML(prot.gene_symbol)}</b> <span class="muted">homomer (another copy of itself)</span><br>` +
      `<span class="muted">${p.contacts_self.length} contact residues</span><br>` +
      `<span class="swatch" style="background:${oeColor(p.oe ? p.oe.oe : null)}"></span><span class="muted">O/E at the homomeric interface</span> <b>${fmt2(p.oe ? p.oe.oe : null)}</b>` +
      `<br><span class="muted">click to select</span>`;
  }
  const exo = (d) => !!(d.p && EXOGENOUS.has(d.p.type));  // non-human / antibody: dotted, not counted as partners
  const link = svg.append("g").selectAll("line").data(links).join("line").attr("stroke", "var(--line-strong)").attr("stroke-width", (d) => eScale(d.n || 1)).attr("stroke-opacity", .7)
    .attr("stroke-dasharray", (d) => (exo(nodes.find((x) => x.id === d.target)) ? "4,3" : null));
  const node = svg.append("g").selectAll("g").data(nodes.filter((d) => !d.ghost)).join("g").style("cursor", (d) => (d.self ? "default" : "pointer"));
  node.append("circle").attr("class", "halo").attr("r", (d) => radius(d) + 5).attr("fill", "none").attr("stroke", (d) => (d.p ? d.p.color : "none")).attr("stroke-width", 3).attr("opacity", 0);
  node.append("circle").attr("class", "body").attr("r", radius).attr("fill", (d) => oeColor(d.oe))
    .attr("stroke", (d) => (exo(d) ? "var(--muted)" : d.self ? "var(--fg)" : d.p && d.p.has_page ? "var(--fg)" : "var(--bg)"))
    .attr("stroke-width", (d) => (d.self ? 2.5 : d.p && d.p.has_page ? 1.8 : 1.2))
    .attr("stroke-dasharray", (d) => (d.p && d.p.type === "unidentified" ? "3,2" : exo(d) ? "1.5,2" : null));
  node.append("circle").attr("r", 4).attr("cx", (d) => radius(d) * 0.75).attr("cy", (d) => -radius(d) * 0.75).attr("fill", (d) => (d.p ? d.p.color : "none")).attr("stroke", "var(--bg)").attr("stroke-width", 1).style("display", (d) => (d.self ? "none" : null));
  node.append("text").text((d) => d.gene).attr("text-anchor", "middle").attr("dy", (d) => radius(d) + 14)
    .attr("font-size", (d) => (d.self ? 15 : 12.5)).attr("font-weight", (d) => (d.self ? 700 : 500)).attr("fill", "var(--fg)").style("pointer-events", "none");

  node.filter((d) => !d.self)
    .on("mouseenter", (evt, d) => { S.set({ hover: null }); hoverPartner = d.id; paint(); showTip(tip(d), evt); })
    .on("mousemove", (evt, d) => showTip(tip(d), evt))
    .on("mouseleave", () => { hoverPartner = null; paint(); hideTip(); })
    .on("click", (evt, d) => S.set({ partner: S.get().partner === d.id ? null : d.id }))
    .on("dblclick", (evt, d) => { if (d.p.has_page) location.hash = `#/${d.id}`; });

  function tip(d) {
    const p = d.p;
    return `<b>${escapeHTML(d.gene)}</b> <span class="muted">${d.id} · ${TYPE_LABEL[p.type] || p.type}</span><br>` +
      `<span class="muted">${p.contacts_self.length} contact residues on ${escapeHTML(prot.gene_symbol)}</span><br>` +
      `<span class="swatch" style="background:${oeColor(d.oe)}"></span><span class="muted">O/E at this interface</span> <b>${fmt2(d.oe)}</b>` +
      (p.partner_side && p.partner_side.oe != null ? `<br><span class="muted">${escapeHTML(d.gene)}'s side</span> O/E ${fmt2(p.partner_side.oe)}` : "") +
      `<br><span class="muted">click to select${p.has_page ? " · double-click to open" : ""}</span>`;
  }

  let hoverPartner = null;
  function paint() {
    const sel = S.get().partner;
    node.select(".halo").attr("opacity", (d) => (d.id === sel ? 1 : d.id === hoverPartner ? 0.5 : 0));
    node.attr("opacity", (d) => (sel && !d.self && d.id !== sel ? 0.45 : 1));
    link.attr("stroke-opacity", (d) => (sel && d.target.id !== sel ? 0.25 : 0.7)).attr("stroke", (d) => (d.target.id === sel ? d.target.p.color : "var(--line-strong)"));
    if (loop) {
      const on = homomer.uniprot_id === sel, hov = homomer.uniprot_id === hoverPartner;
      loop.select(".halo").attr("opacity", on ? 0.35 : hov ? 0.18 : 0);
      loop.attr("opacity", sel && !on ? 0.45 : 1);
    }
  }

  const self = nodes[0]; self.x = self.fx = W / 2; self.y = self.fy = H / 2;
  const m = partners.length, seedR = Math.min(W, H) * 0.34;
  const gap = homomer ? Math.PI / 3 : 0;   // leave the top of the ring free for the self-loop
  partners.forEach((_, k) => {
    const a = homomer ? -Math.PI / 2 + gap + ((2 * Math.PI - 2 * gap) * (k + 0.5)) / m : -Math.PI / 2 + (m === 1 ? Math.PI / 4 : (2 * Math.PI * k) / m);
    nodes[k + 1].x = W / 2 + seedR * Math.cos(a); nodes[k + 1].y = H / 2 + seedR * Math.sin(a);
  });
  const sim = d3.forceSimulation(nodes)
    .force("link", d3.forceLink(links).id((d) => d.id).distance(Math.max(90, Math.min(150, 900 / Math.sqrt(m)))).strength(.4))
    .force("charge", d3.forceManyBody().strength(-200)).force("collide", d3.forceCollide((d) => (d.ghost ? d.r : radius(d) + 14))).on("tick", ticked);
  function ticked() {
    nodes.forEach((d) => { if (d.ghost) return; const half = Math.max(radius(d) + 2, (d.gene || "").length * 3.9 + 4); d.x = Math.max(half, Math.min(W - half, d.x)); d.y = Math.max(radius(d) + 10, Math.min(H - radius(d) - 14, d.y)); });
    link.attr("x1", (d) => d.source.x).attr("y1", (d) => d.source.y).attr("x2", (d) => d.target.x).attr("y2", (d) => d.target.y);
    node.attr("transform", (d) => `translate(${d.x},${d.y})`);
  }
  node.call(d3.drag().on("start", (evt, d) => { if (!evt.active) sim.alphaTarget(.3).restart(); d.fx = d.x; d.fy = d.y; })
    .on("drag", (evt, d) => { d.fx = evt.x; d.fy = evt.y; }).on("end", (evt, d) => { if (!evt.active) sim.alphaTarget(0); if (!d.self) { d.fx = null; d.fy = null; } }));
  paint();
  const unsub = S.subscribe((st, ch) => { if (ch.includes("partner")) paint(); });
  return { destroy: () => { unsub(); sim.stop(); } };
}
