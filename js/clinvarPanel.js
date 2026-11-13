// ClinVar headline + legend. The lollipops themselves are a lane in the residue
// browser (shared x-axis / zoom); this panel reports the interface-enrichment stat.
import { fmt2, pretty_p } from "./format.js";

export const PLP = "#b40426", BLB = "#3b4cc0";

export function renderClinvar(prot) {
  const section = document.getElementById("clinvar-section");
  const cv = prot.clinvar;
  const hasData = cv && ((cv.p_lp?.total || 0) + (cv.b_lb?.total || 0) + (cv.vus?.total || 0)) > 0;
  if (!hasData) { section.hidden = true; return; }
  section.hidden = false;
  const c = document.getElementById("clinvar-headline");
  const plp = cv.p_lp || { total: 0, interface: 0 }, blb = cv.b_lb || { total: 0, interface: 0 }, vus = cv.vus || { total: 0, interface: 0 };
  const enr = cv.enrichment;
  const pct = cv.interface_fraction != null ? Math.round(cv.interface_fraction * 100) : null;
  let html;
  if (!plp.total) html = `<span class="muted">No pathogenic / likely-pathogenic missense variants in ClinVar for this protein (${vus.total} VUS, ${blb.total} benign).</span>`;
  else {
    const obsPct = Math.round((plp.interface / plp.total) * 100);
    const sig = enr && enr.log10p != null && enr.log10p > 1.301;
    html = `<b>${plp.interface}</b> of <b>${plp.total}</b> P/LP missense residues (${obsPct}%) are <span style="color:var(--orange);font-weight:600">interface</span> residues` +
      (pct != null ? ` — which make up <b>${pct}%</b> of the protein` : "") +
      (enr && enr.ratio != null ? ` → <b style="color:${sig ? PLP : "var(--muted)"}">${fmt2(enr.ratio)}×</b> ${enr.ratio >= 1 ? "enriched" : "depleted"} at the interface <span class="tag">(${pretty_p(enr.log10p)}, one-sided binomial)</span>` : "");
    // Allele-level counts (distinct amino-acid substitutions) when the export has them and they differ.
    const alleles = (b) => (b.alleles_total != null && b.alleles_total !== b.total ? ` (${b.alleles_interface}/${b.alleles_total} alleles)` : "");
    if (plp.alleles_total != null && plp.alleles_total !== plp.total)
      html += `<br>By allele: <b>${plp.alleles_interface}</b> of <b>${plp.alleles_total}</b> P/LP missense substitutions are at interface residues.`;
    html += `<br><span class="tag">Benign/LB: ${blb.interface}/${blb.total} residues at interface${alleles(blb)} · VUS: ${vus.interface}/${vus.total} residues at interface${alleles(vus)}. Missense substitutions only. The enrichment test is residue-level (a residue counts once per category); residues with several substitutions show stacked dots in the residue browser.</span>`;
  }
  c.innerHTML = html;
}
