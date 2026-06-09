// Linear per-residue missense-constraint track.
// One bar per residue coloured by O/E; ticks above mark interface residues.
// Returns { highlight(positions), clear() } so the partner network can light up
// the residues where a given partner makes contact.
import { oeColor, fmt2, fmt3 } from "./format.js";
import { showTip, moveTip, hideTip } from "./tooltip.js";

export function renderTrack(container, protein) {
  container.innerHTML = "";
  const data = protein.residues;
  const L = protein.length;
  const byPos = new Map(data.map((d) => [d.pos, d]));

  const M = { top: 22, right: 12, bottom: 26, left: 12 };
  const W = Math.max(container.clientWidth || 920, 320);
  const trackH = 64;
  const H = M.top + trackH + M.bottom;
  const innerW = W - M.left - M.right;
  const x = d3.scaleLinear().domain([0.5, L + 0.5]).range([0, innerW]);
  const bw = innerW / L;

  const svg = d3.select(container).append("svg")
    .attr("width", W).attr("height", H).attr("viewBox", `0 0 ${W} ${H}`);
  const g = svg.append("g").attr("transform", `translate(${M.left},${M.top})`);

  // Residue bars.
  g.append("g").selectAll("rect").data(data).join("rect")
    .attr("x", (d) => x(d.pos) - bw / 2)
    .attr("y", 0)
    .attr("width", Math.max(bw, 0.6))
    .attr("height", trackH)
    .attr("fill", (d) => oeColor(d.oe))
    .attr("shape-rendering", "crispEdges");

  // Interface ticks (above the track).
  g.append("g").selectAll("rect").data(data.filter((d) => d.is_interface)).join("rect")
    .attr("x", (d) => x(d.pos) - Math.max(bw, 1) / 2)
    .attr("y", -7)
    .attr("width", Math.max(bw, 1))
    .attr("height", 5)
    .attr("fill", "var(--orange)");

  // Axis.
  const axis = d3.axisBottom(x).ticks(Math.min(10, Math.floor(W / 90))).tickFormat(d3.format("d"));
  g.append("g").attr("transform", `translate(0,${trackH})`).call(axis)
    .call((sel) => sel.select(".domain").attr("stroke", "var(--line)"))
    .call((sel) => sel.selectAll("text").attr("fill", "var(--muted)").attr("font-size", 10));

  // Highlight layer (partner contact markers) + hover cursor.
  const hi = g.append("g");
  const cursor = g.append("line").attr("y1", -7).attr("y2", trackH)
    .attr("stroke", "#1b1f23").attr("stroke-width", 1).attr("opacity", 0);

  // Hover overlay.
  g.append("rect").attr("x", 0).attr("y", -9).attr("width", innerW).attr("height", trackH + 9)
    .attr("fill", "transparent")
    .on("mousemove", (evt) => {
      const mx = d3.pointer(evt)[0];
      const pos = Math.round(x.invert(mx));
      const d = byPos.get(pos);
      cursor.attr("x1", x(pos)).attr("x2", x(pos)).attr("opacity", 1);
      if (!d) { hideTip(); return; }
      const oe = d.oe == null ? "no data" : fmt3(d.oe);
      showTip(
        `<b>${d.aa ?? "?"}${d.pos}</b> ${d.is_interface ? '<span class="muted">· interface</span>' : ""}<br>` +
        `<span class="muted">missense O/E</span> <b>${oe}</b><br>` +
        `<span class="muted">obs ${d.obs_mis ?? 0} · exp ${fmt2(d.exp_mis)}</span>`, evt);
    })
    .on("mouseleave", () => { cursor.attr("opacity", 0); hideTip(); });

  function highlight(positions) {
    const pts = (positions || []).filter((p) => p >= 1 && p <= L);
    hi.selectAll("path").data(pts).join("path")
      .attr("d", (p) => {
        const cx = x(p);
        return `M${cx},${-9} l4,-7 l-8,0 Z`;  // down-pointing marker above interface ticks
      })
      .attr("fill", "#1b1f23").attr("stroke", "#fff").attr("stroke-width", 0.5);
  }
  function clear() { hi.selectAll("path").remove(); }

  return { highlight, clear };
}
