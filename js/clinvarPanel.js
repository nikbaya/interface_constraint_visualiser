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
  // Residue-level P/LP interface enrichment: the P/LP residues are a subset of the protein's
  // residues, so the exact null is hypergeometric (one-sided Fisher's exact on interface x
  // P/LP-or-not). Computed here from the counts rather than taken from the export.
  const enr = plpEnrichment(plp.interface, plp.total, prot.interfaceSet.size, prot.length);
  const pct = cv.interface_fraction != null ? Math.round(cv.interface_fraction * 100) : null;
  let html;
  if (!plp.total) html = `<span class="muted">No pathogenic / likely-pathogenic missense variants in ClinVar for this protein (${vus.total} VUS, ${blb.total} benign).</span>`;
  else {
    const obsPct = Math.round((plp.interface / plp.total) * 100);
    const sig = enr && enr.log10p != null && enr.log10p > 1.301;
    html = `<b>${plp.interface}</b> of <b>${plp.total}</b> P/LP missense residues (${obsPct}%) are <span style="color:var(--orange);font-weight:600">interface</span> residues` +
      (pct != null ? ` — which make up <b>${pct}%</b> of the protein` : "") +
      (enr && enr.ratio != null ? ` → <b style="color:${sig ? PLP : "var(--muted)"}">${fmt2(enr.ratio)}×</b> ${enr.ratio >= 1 ? "enriched" : "depleted"} at the interface <span class="tag">(${pretty_p(enr.log10p)}, one-sided Fisher's exact)</span>` : "");
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

// P/LP enrichment at one partner's contact residues: residue-level, one-sided Fisher's exact,
// the same test as the protein-wide headline (expected share = contact residues / protein length).
// Note partner_constraint_plp_test.py counts alleles instead, so its counts can be higher.
function partnerBlock(prot, uni) {
  const p = uni && prot.partnerByUni.get(uni);
  if (!p || !p.contacts_self || !p.contacts_self.length) return "";
  const L = prot.length, name = escapeHTML(p.label), dot = `<span class="pdot" style="background:${p.color}"></span>`;
  const sp = regionStats(prot, (q) => p.contactSet.has(q));
  const n = sp.in.P + sp.out.P;   // P/LP residues in the protein
  const typeNote = p.type === "heteromeric" ? "" : ` <span class="tag">(${escapeHTML(TYPE_LABEL[p.type] || p.type)}${p.type === "antibody" || p.type === "non_human" ? " — not a human disease interface" : ""})</span>`;
  let h = `<h3 class="cv-partner-title">${dot}Contacts with ${name}${typeNote}</h3>`;
  if (!n) return h + `<p class="headline-stat muted">No P/LP missense residues in this protein, so no partner-level test.</p>`;
  const e = plpEnrichment(sp.in.P, n, sp.in.n, L);
  const sig = e && e.p < 0.05;
  h += `<p class="headline-stat"><b>${sp.in.P}</b> of <b>${n}</b> P/LP missense residues are among the <b>${int(sp.in.n)}</b> residues contacting ${name}` +
    ` — which make up <b>${fmtPct(sp.in.n / L)}</b> of the protein` +
    (e ? ` → <b style="color:${sig ? PLP : "var(--muted)"}">${fmt2(e.ratio)}×</b> ${e.ratio >= 1 ? "enriched" : "depleted"} <span class="tag">(${pretty_p(e.log10p)}, one-sided Fisher's exact)</span>` : "");
  const f = sp.fisher;
  if (f && sp.in.Ponly + sp.in.Bonly > 0)
    h += `<br>Relative to benign: <span style="color:${PLP}">${sp.in.Ponly} P/LP</span> vs <span style="color:${BLB}">${sp.in.Bonly} B/LB</span> residues at these contacts, ${sp.out.Ponly} vs ${sp.out.Bonly} elsewhere` +
      (sp.mixed ? ` <span class="tag">(${sp.mixed} residue${sp.mixed === 1 ? "" : "s"} with both P/LP and B/LB substitutions left out)</span>` : "") + ` → odds ratio <b>${f.or == null ? "–" : f.or === Infinity ? "∞" : fmt2(f.or)}</b> <span class="tag">(Fisher's exact, ${pretty_p(neglog10(f.p), { ns: false })}, two-sided; benign calls are rarer where missense is constrained, so this partly tracks constraint)</span>`;
  // Protein-wide comparison: the headline's test over all G2P interface residues.
  const si = regionStats(prot, (q) => prot.interfaceSet.has(q));
  const ei = plpEnrichment(si.in.P, n, si.in.n, L);
  if (ei) h += `<br><span class="tag">For comparison, all G2P interface residues (${fmtPct(si.in.n / L)} of the protein): ${si.in.P} of ${n} → ${fmt2(ei.ratio)}× (${pretty_p(ei.log10p)}), as in the headline above. Clear the partner selection to return to the protein-wide view.</span>`;
  return h + `</p>`;
}
const fmtPct = (f) => (f > 0 && f < 0.01 ? "<1%" : `${Math.round(f * 100)}%`);
