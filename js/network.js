// Interactive partner network. Node colour = partner interface misOEUF,
// edge width = number of shared contact residues. Hovering a partner highlights
// its contact residues on the track; clicking an in-pilot partner opens it.
import { oeColor, fmt2 } from "./format.js";
import { showTip, hideTip } from "./tooltip.js";

export function renderNetwork(container, protein, track) {
  container.innerHTML = "";
  const partners = protein.partners || [];
  if (!partners.length) {
    container.innerHTML = '<p class="panel-note">No structural interface partners resolved for this protein.</p>';
    return;
  }

  const W = Math.max(container.clientWidth || 920, 320);
  const H = 380;
  const selfOEUF = protein.summary.interface ? protein.summary.interface.ci_high : null;

  const nodes = [{ id: protein.uniprot_id, gene: protein.gene_symbol, self: true, oeuf: selfOEUF }];
  const links = [];
  partners.forEach((p) => {
    const oeuf = p.partner_summary ? p.partner_summary.interface_oeuf : null;
    nodes.push({ id: p.uniprot_id, gene: p.gene_symbol, self: false, oeuf,
      inPilot: p.in_pilot, contacts: p.contact_positions_self, n: p.n_shared_contacts,
      bonds: p.bond_types, sharedOE: p.shared_contact_oe_on_partner });
    links.push({ source: protein.uniprot_id, target: p.uniprot_id, n: p.n_shared_contacts });
  });

  const rSelf = 26;
  const rScale = d3.scaleSqrt().domain([1, d3.max(partners, (p) => p.n_shared_contacts) || 1]).range([9, 20]);
  const eScale = d3.scaleSqrt().domain([1, d3.max(partners, (p) => p.n_shared_contacts) || 1]).range([1, 7]);
  const radius = (d) => (d.self ? rSelf : rScale(d.n || 1));

  const svg = d3.select(container).append("svg")
    .attr("width", W).attr("height", H).attr("viewBox", `0 0 ${W} ${H}`);

  const link = svg.append("g").attr("stroke", "#c8cdd3").selectAll("line").data(links).join("line")
    .attr("stroke-width", (d) => eScale(d.n || 1)).attr("stroke-opacity", .65);

  const node = svg.append("g").selectAll("g").data(nodes).join("g")
    .style("cursor", (d) => (d.self ? "default" : d.inPilot ? "pointer" : "default"));

  node.append("circle")
    .attr("r", radius)
    .attr("fill", (d) => oeColor(d.oeuf))
    .attr("stroke", (d) => (d.self ? "#1b1f23" : d.inPilot ? "var(--broad-blue)" : "#fff"))
    .attr("stroke-width", (d) => (d.self ? 2.5 : d.inPilot ? 2 : 1.2));

  node.append("text").text((d) => d.gene)
    .attr("text-anchor", "middle").attr("dy", (d) => radius(d) + 12)
    .attr("font-size", (d) => (d.self ? 13 : 11)).attr("font-weight", (d) => (d.self ? 700 : 500))
    .attr("fill", "var(--fg)").style("pointer-events", "none");

  node.filter((d) => !d.self)
    .on("mouseenter", (evt, d) => {
      track && track.highlight(d.contacts);
      const so = d.sharedOE;
      showTip(
        `<b>${d.gene}</b> <span class="muted">${d.id}</span>${d.inPilot ? ' <span class="muted">· click to open</span>' : ""}<br>` +
        `<span class="muted">contacts this protein at</span> <b>${d.n}</b> <span class="muted">residues</span><br>` +
        `<span class="muted">bonds:</span> ${(d.bonds || []).join(", ") || "–"}<br>` +
        `<span class="swatch" style="background:${oeColor(d.oeuf)}"></span><span class="muted">partner interface misOEUF</span> <b>${fmt2(d.oeuf)}</b>` +
        (so && so.oe != null ? `<br><span class="muted">${d.gene} O/E at these contacts</span> <b>${fmt2(so.oe)}</b>` : ""),
        evt);
    })
    .on("mousemove", (evt, d) => showTip(document.getElementById("tooltip").innerHTML, evt))
    .on("mouseleave", () => { track && track.clear(); hideTip(); })
    .on("click", (evt, d) => { if (d.inPilot) location.hash = `#/${d.id}`; });

  const sim = d3.forceSimulation(nodes)
    .force("link", d3.forceLink(links).id((d) => d.id).distance(110).strength(.4))
    .force("charge", d3.forceManyBody().strength(-260))
    .force("center", d3.forceCenter(W / 2, H / 2))
    .force("collide", d3.forceCollide((d) => radius(d) + 16))
    .on("tick", ticked);

  // Pin the focal protein near the centre.
  const self = nodes[0];
  self.fx = W / 2; self.fy = H / 2;

  function ticked() {
    nodes.forEach((d) => {
      d.x = Math.max(radius(d) + 2, Math.min(W - radius(d) - 2, d.x));
      d.y = Math.max(radius(d) + 10, Math.min(H - radius(d) - 14, d.y));
    });
    link.attr("x1", (d) => d.source.x).attr("y1", (d) => d.source.y)
        .attr("x2", (d) => d.target.x).attr("y2", (d) => d.target.y);
    node.attr("transform", (d) => `translate(${d.x},${d.y})`);
  }

  node.call(d3.drag()
    .on("start", (evt, d) => { if (!evt.active) sim.alphaTarget(.3).restart(); d.fx = d.x; d.fy = d.y; })
    .on("drag", (evt, d) => { d.fx = evt.x; d.fy = evt.y; })
    .on("end", (evt, d) => { if (!evt.active) sim.alphaTarget(0); if (!d.self) { d.fx = null; d.fy = null; } }));
}
