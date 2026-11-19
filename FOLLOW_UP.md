# Follow-up

## ClinVar allele stacking (2026-11-13; data re-exported the same day)

The residue browser now draws one ClinVar lollipop per residue, with one stacked dot per distinct
amino-acid substitution there (up to 3, then a "×n" label). The tooltip lists the substitutions,
and the ClinVar headline adds an allele-level count when it differs from the residue count.

Example: PSTPIP1 has 4 P/LP missense alleles at 3 residues (A230T, E250Q, E250K, E257K). Before
this change the browser showed 3 dots, which read as "2 of 3 P/LP at the interface" while the
analysis counts "3 of 4 alleles".

**Still to do:**

- [x] Re-export `data/` with the updated `export_web.py` from the analysis repo. Until then, the
      protein JSON has the old `[residueId, 'P'|'B']` markers and the browser draws one dot per
      residue as before. The JS accepts both formats.
  - New marker format: `[residueId, 'P'|'B', n_alleles, 'E250K;E250Q']`.
  - New per-category fields: `alleles_interface`, `alleles_total`.
- [x] Diff the new export against the current `data/` before replacing it. Only the ClinVar fields
      should change. Anything else that moves comes from upstream analysis changes and needs a look.
      Done: all 5,650 files identical apart from the new allele fields; 9,128 of 78,006 markers
      have more than one allele. ClinVar's `Xaa` alleles (ambiguous IUPAC base, e.g. ATP1A3
      p.Ile601Xaa) are kept as `I601X` so residue counts are unchanged.
- [x] After the swap, check PSTPIP1 (O43586) residue 250 shows two stacked P/LP dots and the
      headline reads "By allele: 3 of 4". Done (headless Chrome); TP53 S127/C135/P151 show the
      ×n label.
- [ ] Decide whether the overview/table "ClinVar P/LP" column (currently residues) should also
      show alleles.

## ClinVar section should follow the selected partner (2026-11-13)

Clicking a partner (track row, network node, forest row, partner table) sets `S.partner`. The
residue track, headline and 3D view follow that selection, but the ClinVar section does not.
`renderClinvar` (`js/clinvarPanel.js`) always reports the protein-wide `cv.p_lp` /
`cv.enrichment` from the export.

**To do:**

- [x] With a partner selected, the P/LP missense count should be "N of M P/LP missense residues
      contact <partner>". The set to use is that partner's `contacts_self`, not all G2P
      interface residues. Done (2026-11-19) as a block under the ClinVar headline; counts are
      residue-level ("N of M P/LP missense residues"), as in the headline.
- [x] Rerun the enrichment test for that partner. Use the one-sided binomial with the expected
      fraction = that partner's contact residues / protein length. Label it with the partner
      name. Show the protein-wide result as a secondary line so the change is visible. Done; the
      comparison line is the same allele-level test over all G2P interface residues. Also shows
      Fisher's exact P/LP vs B/LB at the contacts vs the rest of the protein.
- [ ] In the ClinVar lane and its tooltips, mark a variant as "interface" only if it is at a
      contact residue of the selected partner. Variants at other partners' interfaces could be
      shown dimmed or as "interface (other partner)" rather than dropped.
- [x] Clear the partner selection to go back to the current protein-wide view.
- [x] Decide whether to compute this in the browser from `clinvar.positions` and
      `partners[].contacts_self`, or to export per-partner counts and p values from
      `export_web.py`. Per-partner export values would stay in sync with
      `partner_constraint_plp_test.py` in the analysis repo. Whichever route, the per-partner
      numbers must match that script's per-partner counts. Done in the browser (`js/stats.js`).
      Checked against `partner_constraint_plp.all_residues.tsv.gz`, 400 sampled protein × partner
      rows: the partner's P/LP allele count and contact-residue count match in all 400; the
      protein's P/LP total differs in 2 (O14746 43 vs 42; P41235 71 vs 10), because the
      script only counts residues present in the G2P residue table.
- [ ] Check which partners to allow: homomer, non-human and antibody partner types. At minimum,
      label them so a P/LP count against an antibody contact isn't read as a disease interface.

## ClinVar headline test: binomial -> one-sided Fisher's exact (2026-11-19)

The residue-level P/LP interface enrichment was a one-sided binomial against the interface
fraction. P/LP residues are a subset of the protein's residues (drawn without replacement), so
the exact null is hypergeometric, i.e. one-sided Fisher's exact on interface x P/LP-or-not. The
binomial is conservative; across 1,985 proteins, 159 -> 161 reach p < 0.05 (none lost), and
dense cases move a lot (KCNQ2 2e-13 -> 1.5e-18).

- [x] Site computes the headline p in the browser from counts already in the JSON
      (`js/clinvarPanel.js`, `hypergeomSF` in `js/stats.js`), so it is right with the current data.
- [x] `export_web.py` `clinvar_block` switched to `stats.hypergeom.sf` (analysis repo, uncommitted).
- [ ] Re-export `data/`. Until then `clinvar.enrichment.log10p` in the protein JSON and `cvp` in
      `index.json` are still binomial. The site reads neither, but anyone using the JSON would.
- [x] Partner block now residue-level too (P/LP residues, not alleles), with the same one-sided
      Fisher's exact test as the headline. Its counts no longer match `partner_constraint_plp_test.py`,
      which counts alleles (TP53 x BCL2L1: 11 of 99 residues here vs 26 of 225 alleles there).
- [ ] Partner block uses the residue-share baseline (`p_plp_res`); switching to the
      expected-missense share (the script's main `p_plp`) is undecided.

## REVISIT: residues with both P/LP and B/LB are left out of P/LP vs B/LB (2026-11-19)

**Current behaviour.** The P/LP vs B/LB Fisher's exact test (partner block "Relative to benign"
line, and the selection tooltip) counts residues, and **leaves out every residue that has both a
P/LP and a B/LB missense substitution**. The page says how many were left out. Code:
`regionStats` in `js/stats.js` (`Ponly` / `Bonly` / `mixed`); Methods text in `index.html`.

**Why.** Fisher's exact test needs each unit in exactly one cell of the 2x2. A residue with both
categories would sit in the P/LP row and the B/LB row at once (always in the same column), so the
cells would not be disjoint and the hypergeometric null would not hold.

**What is not affected.** The enrichment tests (headline, and partner block main line) are
interface x (P/LP residue or not): every residue falls in exactly one cell, so mixed residues just
count as P/LP residues there. Benign variants play no part in those tests.

**Size of the issue** (current export, ClinVar 2026-04):
- 234 residues in 143 proteins have both, i.e. 0.8% of 29,589 P/LP residues and 0.5% of 48,417
  B/LB residues.
- Almost all are different substitutions at one residue (e.g. a conservative change benign, a
  drastic one pathogenic). Only one is the same substitution classified both ways: HBA1 K140E.
- It can matter for single proteins: TP53 has 13 mixed residues, and the TP53 x BCL2L1 comparison
  leaves out 13 of the 198 residues it would otherwise use.

**Options to decide between:**
1. Leave mixed residues out (current). Simple and valid, but drops information, and the dropped
   residues are not random: they are residues where several substitutions have been studied.
2. P/LP takes precedence (a mixed residue counts as P/LP). Keeps every P/LP residue, matching the
   enrichment tests, but treats a residue's benign substitutions as uninformative.
3. Count substitutions (alleles) instead of residues for this comparison. Each substitution has one
   classification, so the 2x2 is a proper partition (only HBA1 K140E conflicts). But substitutions
   at one residue are not independent, and hotspots carry many, so the effective sample size is
   overstated. Residue-level counting was chosen on 2026-11-19 partly to avoid this.
4. Keep mixed as a third class: a 2x3 Freeman-Halton exact test, or report it separately.
5. Avoid the 2x2 altogether with a permutation test that shuffles the residue set within the
   protein; then a residue may carry both labels.

Whatever is chosen, the headline enrichment test and the analysis repo should use the same rule if
a P/LP vs B/LB comparison is ever added there.
