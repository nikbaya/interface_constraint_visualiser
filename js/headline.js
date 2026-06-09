// Headline: interface vs non-interface pooled missense O/E with 95% CI whiskers.
import { fmt2 } from "./format.js";
import { showTip, moveTip, hideTip } from "./tooltip.js";

export function renderHeadline(container, summary) {
  container.innerHTML = "";
  const rows = [
    { key: "interface", label: "Interface", color: "var(--interface)", d: summary.interface },
    { key: "noninterface", label: "Non-interface", color: "var(--noninterface)", d: summary.noninterface },
  ].filter((r) => r.d && r.d.oe != null);
  if (!rows.length) { container.innerHTML = '<p class="panel-note">No pooled constraint available.</p>'; return; }

  const M = { top: 16, right: 70, bottom: 34, left: 110 };
  const W = Math.max(container.clientWidth || 920, 360);
  const rowH = 46;
  const H = M.top + rows.length * rowH + M.bottom;
  const innerW = W - M.left - M.right;

  const maxX = Math.max(1.05, d3.max(rows, (r) => r.d.ci_high ?? r.d.oe) * 1.08);
  const x = d3.scaleLinear().domain([0, maxX]).range([0, innerW]).nice();

  const svg = d3.select(container).append("svg")
    .attr("width", W).attr("height", H).attr("viewBox", `0 0 ${W} ${H}`);
  const g = svg.append("g").attr("transform", `translate(${M.left},${M.top})`);

  // O/E = 1 reference.
  g.append("line").attr("x1", x(1)).attr("x2", x(1)).attr("y1", -4).attr("y2", rows.length * rowH - 8)
    .attr("stroke", "var(--muted)").attr("stroke-dasharray", "3,3").attr("stroke-width", 1).attr("opacity", .6);
  g.append("text").attr("x", x(1)).attr("y", -6).attr("text-anchor", "middle")
    .attr("font-size", 10).attr("fill", "var(--muted)").text("O/E = 1");

  // Axis.
  g.append("g").attr("transform", `translate(0,${rows.length * rowH - 8})`)
    .call(d3.axisBottom(x).ticks(6))
    .call((s) => s.select(".domain").attr("stroke", "var(--line)"))
    .call((s) => s.selectAll("text").attr("fill", "var(--muted)").attr("font-size", 10));
  g.append("text").attr("x", innerW / 2).attr("y", rows.length * rowH + 22)
    .attr("text-anchor", "middle").attr("font-size", 11).attr("fill", "var(--muted)")
    .text("missense observed / expected");

  rows.forEach((r, i) => {
    const cy = i * rowH + rowH / 2 - 6;
    const row = g.append("g")
      .style("cursor", "default")
      .on("mousemove", (evt) => showTip(
        `<b>${r.label}</b><br><span class="muted">O/E</span> ${fmt2(r.d.oe)} ` +
        `<span class="muted">(95% CI ${fmt2(r.d.ci_low)}–${fmt2(r.d.ci_high)})</span><br>` +
        `<span class="muted">misOEUF</span> <b>${fmt2(r.d.ci_high)}</b> · ` +
        `<span class="muted">obs ${r.d.obs} / exp ${fmt2(r.d.exp)}</span>`, evt))
      .on("mouseleave", hideTip);

    row.append("text").attr("x", -12).attr("y", cy + 4).attr("text-anchor", "end")
      .attr("font-size", 12).attr("fill", "var(--fg)").attr("font-weight", 600).text(r.label);
    // CI whisker.
    if (r.d.ci_low != null) {
      row.append("line").attr("x1", x(r.d.ci_low)).attr("x2", x(r.d.ci_high)).attr("y1", cy).attr("y2", cy)
        .attr("stroke", r.color).attr("stroke-width", 2).attr("opacity", .5);
      [r.d.ci_low, r.d.ci_high].forEach((v) =>
        row.append("line").attr("x1", x(v)).attr("x2", x(v)).attr("y1", cy - 4).attr("y2", cy + 4)
          .attr("stroke", r.color).attr("stroke-width", 1.5).attr("opacity", .5));
    }
    // Point.
    row.append("circle").attr("cx", x(r.d.oe)).attr("cy", cy).attr("r", 6)
      .attr("fill", r.color).attr("stroke", "#fff").attr("stroke-width", 1.5);
    // Value label.
    row.append("text").attr("x", x(r.d.ci_high) + 8).attr("y", cy + 4)
      .attr("font-size", 12).attr("fill", "var(--muted)").attr("font-variant-numeric", "tabular-nums")
      .text(fmt2(r.d.oe));
  });
}
