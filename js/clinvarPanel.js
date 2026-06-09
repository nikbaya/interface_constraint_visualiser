// ClinVar pathogenic-variant lollipop panel.
// Shows where ClinVar P/LP (red, above) and Benign/LB (blue, below) variants
// fall along the protein, with interface residues marked in orange on the
// baseline — making the clustering of pathogenic variants at the interface
// visible. A headline reports the P/LP interface-enrichment stat.
// Hidden entirely when a protein has no categorized ClinVar variants.
import { fmt2, pretty_p } from "./format.js";
import { showTip, moveTip, hideTip } from "./tooltip.js";

const PLP = "#b40426";          // pathogenic — coolwarm deep red
const BLB = "#3b4cc0";          // benign — coolwarm deep blue
const IFACE = "var(--orange)";  // interface residues / contacts

const CAT_LABEL = { p_lp: "Pathogenic / likely pathogenic", b_lb: "Benign / likely benign" };

export function renderClinvar(protein) {
  const section = document.getElementById("clinvar-section");
  const cv = protein.clinvar;
  // Need at least one categorized variant to say anything.
  const hasData = cv && ((cv.p_lp?.total || 0) + (cv.b_lb?.total || 0) + (cv.vus?.total || 0)) > 0;
  if (!hasData) { section.hidden = true; return; }
  section.hidden = false;

  renderHeadline(cv);
  renderLollipops(protein, cv);
  renderLegend(cv);
}

function renderHeadline(cv) {
  const c = document.getElementById("clinvar-headline");
  const plp = cv.p_lp || { total: 0, interface: 0 };
  const enr = cv.enrichment;
  if (!plp.total) { c.innerHTML = `<span class="muted">No P/LP variants in ClinVar for this protein.</span>`; return; }
  const pct = (cv.interface_fraction != null) ? Math.round(cv.interface_fraction * 100) : null;
  const obsPct = Math.round((plp.interface / plp.total) * 100);
  // Colour the ratio red only when the enrichment is significant (p < 0.05,
  // i.e. -log10p > 1.30); otherwise keep it muted grey.
  const sig = enr && enr.log10p != null && enr.log10p > 1.301;
  const lead = enr && enr.ratio != null
    ? `<b style="color:${sig ? PLP : "var(--muted)"}">${fmt2(enr.ratio)}×</b> enriched at interface residues`
    : `at interface residues`;
  c.innerHTML =
    `<b>${plp.interface}</b> of <b>${plp.total}</b> P/LP variants (${obsPct}%) fall on
     <span style="color:var(--orange);font-weight:600">interface</span> residues` +
    (pct != null ? ` — which are only <b>${pct}%</b> of the protein` : "") +
    ` → ${lead}` +
    (enr ? ` <span class="tag">(${pretty_p(enr.log10p)})</span>` : "");
}

function renderLollipops(protein, cv) {
  const container = document.getElementById("clinvar");
  container.innerHTML = "";
  const L = protein.length;
  const positions = cv.positions || [];

  const M = { top: 54, right: 12, bottom: 26, left: 12 };
  const W = Math.max(container.clientWidth || 920, 320);
  const baseY = M.top;                 // baseline (interface ticks live here)
  const stem = 40;                     // lollipop stem length
  const H = M.top + stem + M.bottom;
  const innerW = W - M.left - M.right;
  const x = d3.scaleLinear().domain([0.5, L + 0.5]).range([0, innerW]);

  const svg = d3.select(container).append("svg")
    .attr("width", W).attr("height", H).attr("viewBox", `0 0 ${W} ${H}`);
  const g = svg.append("g").attr("transform", `translate(${M.left},${M.top})`);

  // Interface residues as faint orange ticks straddling the baseline.
  const iface = protein.residues.filter((d) => d.is_interface);
  g.append("g").selectAll("rect").data(iface).join("rect")
    .attr("x", (d) => x(d.pos) - 0.6).attr("y", -4)
    .attr("width", 1.2).attr("height", 8)
    .attr("fill", "var(--orange)").attr("opacity", 0.5);

  // Baseline.
  g.append("line").attr("x1", 0).attr("x2", innerW).attr("y1", 0).attr("y2", 0)
    .attr("stroke", "var(--line)");

  // Lollipops: P/LP above, B/LB below. Interface markers get an orange ring.
  const lolly = g.append("g");
  const draw = (cat, dir) => {
    const pts = positions.filter((p) => p.category === cat);
    const grp = lolly.append("g");
    grp.selectAll("line").data(pts).join("line")
      .attr("x1", (p) => x(p.pos)).attr("x2", (p) => x(p.pos))
      .attr("y1", 0).attr("y2", (p) => dir * (stem - 6))
      .attr("stroke", cat === "p_lp" ? PLP : BLB).attr("stroke-width", 1).attr("opacity", 0.35);
    grp.selectAll("circle").data(pts).join("circle")
      .attr("cx", (p) => x(p.pos)).attr("cy", (p) => dir * (stem - 6))
      .attr("r", 3.4)
      .attr("fill", cat === "p_lp" ? PLP : BLB)
      .attr("stroke", (p) => (p.is_interface ? "var(--orange)" : "#fff"))
      .attr("stroke-width", (p) => (p.is_interface ? 1.6 : 0.6))
      .style("cursor", "default")
      .on("mousemove", (evt, p) => {
        showTip(
          `<b>residue ${p.pos}</b><br>` +
          `<span class="muted">${CAT_LABEL[cat]}</span>` +
          (p.is_interface ? `<br><span style="color:var(--orange)">· interface residue</span>` : ""),
          evt);
      })
      .on("mouseleave", hideTip);
  };
  draw("p_lp", -1);   // above
  draw("b_lb", +1);   // below

  // Axis.
  const axis = d3.axisBottom(x).ticks(Math.min(10, Math.floor(W / 90))).tickFormat(d3.format("d"));
  g.append("g").attr("transform", `translate(0,${stem})`).call(axis)
    .call((sel) => sel.select(".domain").attr("stroke", "var(--line)"))
    .call((sel) => sel.selectAll("text").attr("fill", "var(--muted)").attr("font-size", 10));
}

function renderLegend(cv) {
  const c = document.getElementById("clinvar-legend");
  const plp = cv.p_lp || { total: 0, interface: 0, noninterface: 0 };
  const blb = cv.b_lb || { total: 0, interface: 0, noninterface: 0 };
  const dot = (col, ring) =>
    `<span class="tick" style="background:${col};border-radius:50%;` +
    (ring ? `box-shadow:0 0 0 1.5px var(--orange);` : "") + `"></span>`;
  c.innerHTML =
    `<span class="key">${dot(PLP)} P/LP (${plp.interface}/${plp.total} interface)</span>` +
    `<span class="key">${dot(BLB)} Benign/LB (${blb.interface}/${blb.total} interface)</span>` +
    `<span class="key">${dot("#fff", true)} ring = at interface</span>`;
}
