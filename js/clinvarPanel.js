// ClinVar headline + legend. The lollipops themselves are a lane in the residue
// browser (shared x-axis / zoom); this panel reports the interface-enrichment stat,
// and, while one partner is selected, the same question for that partner's contacts.
import { fmt2, int, pretty_p, escapeHTML, TYPE_LABEL } from "./format.js";
import { regionStats, plpEnrichment, neglog10 } from "./stats.js";
import * as S from "./state.js";

export const PLP = "#b40426", BLB = "#3b4cc0";

export function renderClinvar(prot) {
  const section = document.getElementById("clinvar-section");
  const cv = prot.clinvar;
  const hasData = cv && ((cv.p_lp?.total || 0) + (cv.b_lb?.total || 0) + (cv.vus?.total || 0)) > 0;
  if (!hasData) { section.hidden = true; return { destroy() {} }; }
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

  const pc = document.getElementById("clinvar-partner");
  const draw = () => { pc.innerHTML = partnerBlock(prot, S.get().partner); };
  draw();
  const unsub = S.subscribe((st, ch) => { if (ch.includes("partner")) draw(); });
  return { destroy: () => { unsub(); pc.innerHTML = ""; } };
}

// P/LP enrichment at one partner's contact residues. Allele-level (distinct missense
// substitutions), so the counts match partner_constraint_plp_test.py in the analysis repo;
// expected share = the partner's contact residues / protein length (that script's p_plp_res).
// The same allele-level test over all G2P interface residues is shown for comparison.
function partnerBlock(prot, uni) {
  const p = uni && prot.partnerByUni.get(uni);
  if (!p || !p.contacts_self || !p.contacts_self.length) return "";
  const L = prot.length, name = escapeHTML(p.label), dot = `<span class="pdot" style="background:${p.color}"></span>`;
  const sp = regionStats(prot, (q) => p.contactSet.has(q));
  const n = sp.in.P + sp.out.P;
  const typeNote = p.type === "heteromeric" ? "" : ` <span class="tag">(${escapeHTML(TYPE_LABEL[p.type] || p.type)}${p.type === "antibody" || p.type === "non_human" ? " — not a human disease interface" : ""})</span>`;
  let h = `<h3 class="cv-partner-title">${dot}Contacts with ${name}${typeNote}</h3>`;
  if (!n) return h + `<p class="headline-stat muted">No P/LP missense alleles in this protein, so no partner-level test.</p>`;
  const e = plpEnrichment(sp.in.P, n, sp.in.n / L);
  const sig = e && e.p < 0.05;
  h += `<p class="headline-stat"><b>${sp.in.P}</b> of <b>${n}</b> P/LP missense alleles (at ${sp.in.plpRes} residue${sp.in.plpRes === 1 ? "" : "s"}) are at the <b>${int(sp.in.n)}</b> residues contacting ${name}` +
    ` — which make up <b>${fmtPct(sp.in.n / L)}</b> of the protein` +
    (e ? ` → <b style="color:${sig ? PLP : "var(--muted)"}">${fmt2(e.ratio)}×</b> ${e.ratio >= 1 ? "enriched" : "depleted"} <span class="tag">(${pretty_p(e.log10p)}, one-sided binomial)</span>` : "");
  const f = sp.fisher;
  if (f && sp.in.P + sp.in.B > 0)
    h += `<br>Relative to benign: <span style="color:${PLP}">${sp.in.P} P/LP</span> vs <span style="color:${BLB}">${sp.in.B} B/LB</span> alleles at these contacts, ${sp.out.P} vs ${sp.out.B} elsewhere → odds ratio <b>${f.or == null ? "–" : f.or === Infinity ? "∞" : fmt2(f.or)}</b> <span class="tag">(Fisher's exact, ${pretty_p(neglog10(f.p), { ns: false })}, two-sided)</span>`;
  // Protein-wide comparison on the same (allele-level) footing.
  const si = regionStats(prot, (q) => prot.interfaceSet.has(q));
  const ei = plpEnrichment(si.in.P, n, si.in.n / L);
  if (ei) h += `<br><span class="tag">For comparison, all G2P interface residues (${fmtPct(si.in.n / L)} of the protein): ${si.in.P} of ${n} P/LP alleles → ${fmt2(ei.ratio)}× (${pretty_p(ei.log10p)}). Allele-level counts, so they can differ from the residue-level line above. Clear the partner selection to return to the protein-wide view.</span>`;
  return h + `</p>`;
}
const fmtPct = (f) => (f > 0 && f < 0.01 ? "<1%" : `${Math.round(f * 100)}%`);
