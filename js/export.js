// Downloads: CSV of a protein's residues / partners, SVG snapshots, index CSV.
import { fmt3 } from "./format.js";

function download(name, text, type = "text/plain") {
  const a = document.createElement("a");
  a.href = URL.createObjectURL(new Blob([text], { type }));
  a.download = name; a.click();
  setTimeout(() => URL.revokeObjectURL(a.href), 1000);
}
const csvCell = (v) => {
  if (v == null) return "";
  const s = String(v);
  return /[",\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
};
export function toCSV(rows, cols) {
  return [cols.join(","), ...rows.map((r) => cols.map((c) => csvCell(r[c])).join(","))].join("\n");
}

export function downloadResiduesCSV(prot) {
  const rows = prot.residueRows.map((r) => ({
    uniprot_id: prot.uniprot_id, gene_symbol: prot.gene_symbol, pos: r.pos, aa: r.aa,
    obs_mis: r.obs, exp_mis: r.exp, oe_mis: r.oe == null ? "" : fmt3(r.oe),
    g2p_interface: r.is_interface ? 1 : 0,
    partners: prot.partnersAt(r.pos).map((p) => p.label).join(";"),
  }));
  download(`${prot.gene_symbol}_${prot.uniprot_id}_residues.csv`, toCSV(rows, Object.keys(rows[0])), "text/csv");
}

export function downloadPartnersCSV(prot) {
  const rows = (prot.partners || []).map((p) => ({
    uniprot_id: prot.uniprot_id, gene_symbol: prot.gene_symbol,
    partner_uniprot: p.uniprot_id, partner_symbol: p.label, type: p.type,
    n_contact_residues: (p.contacts_self || []).length, bond_types: (p.bond_types || []).join(";"),
    n_pdbs: p.n_pdbs, obs: p.oe?.obs, exp: p.oe?.exp, oe: p.oe?.oe, ci_low: p.oe?.ci_low, ci_high: p.oe?.ci_high,
    oe_rest_of_protein: p.oe?.oe_rest, log10p_vs_rest: p.oe?.log10p, z_vs_rest: p.oe?.z,
    oe_exclusive: p.oe_exclusive?.oe, partner_side_oe: p.partner_side?.oe,
    representative_pdb: p.structures?.[0]?.[0], chain: p.structures?.[0]?.[1], partner_chain: p.structures?.[0]?.[2],
    contact_residues: (p.contacts_self || []).join(";"),
  }));
  if (!rows.length) return;
  download(`${prot.gene_symbol}_${prot.uniprot_id}_partners.csv`, toCSV(rows, Object.keys(rows[0])), "text/csv");
}

export function downloadIndexCSV(rows, name = "interface_constraint.csv") {
  const cols = { s: "gene_symbol", u: "uniprot_id", L: "length", ni: "n_interface_residues", fi: "interface_fraction",
    oi: "oe_interface", il: "oe_interface_ci_low", ih: "oe_interface_ci_high", on: "oe_noninterface", nl: "oe_noninterface_ci_low",
    nh: "oe_noninterface_ci_high", gm: "gene_mis_oe_gnomad", gml: "gene_mis_oe_ci90_low", gmh: "gene_mis_oe_ci90_high", p: "neg_log10_p", z: "z", sig: "is_sig", np: "n_heteromeric_partners", hm: "is_homomer",
    hp: "heterogeneity_neg_log10_p", hq: "heterogeneity_q", cv: "clinvar_plp_missense", om: "omim_disease_gene", lof: "loeuf" };
  const out = rows.map((r) => Object.fromEntries(Object.entries(cols).map(([k, n]) => [n, r[k]])));
  download(name, toCSV(out, Object.values(cols)), "text/csv");
}

// Serialise an <svg> (inlining the CSS variables it uses) for download.
export function downloadSVG(svgEl, name) {
  const clone = svgEl.cloneNode(true);
  const cs = getComputedStyle(document.documentElement);
  const vars = ["--fg", "--muted", "--line", "--bg", "--bg-soft", "--orange", "--purple", "--interface", "--noninterface", "--red", "--broad-blue", "--nodata"];
  let s = new XMLSerializer().serializeToString(clone);
  for (const v of vars) s = s.split(`var(${v})`).join(cs.getPropertyValue(v).trim() || "#000");
  s = s.replace(/var\(--[a-z-]+,\s*([^)]+)\)/g, "$1");
  download(name, `<?xml version="1.0" encoding="UTF-8"?>\n` + s, "image/svg+xml");
}
