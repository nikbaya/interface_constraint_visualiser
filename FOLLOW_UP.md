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

- [ ] With a partner selected, the P/LP missense count should be "N of M P/LP missense residues
      contact <partner>". The set to use is that partner's `contacts_self`, not all G2P
      interface residues.
- [ ] Rerun the enrichment test for that partner. Use the one-sided binomial with the expected
      fraction = that partner's contact residues / protein length. Label it with the partner
      name. Show the protein-wide result as a secondary line so the change is visible.
- [ ] In the ClinVar lane and its tooltips, mark a variant as "interface" only if it is at a
      contact residue of the selected partner. Variants at other partners' interfaces could be
      shown dimmed or as "interface (other partner)" rather than dropped.
- [ ] Clear the partner selection to go back to the current protein-wide view.
- [ ] Decide whether to compute this in the browser from `clinvar.positions` and
      `partners[].contacts_self`, or to export per-partner counts and p values from
      `export_web.py`. Per-partner export values would stay in sync with
      `partner_constraint_plp_test.py` in the analysis repo. Whichever route, the per-partner
      numbers must match that script's per-partner counts.
- [ ] Check which partners to allow: homomer, non-human and antibody partner types. At minimum,
      label them so a P/LP count against an antibody contact isn't read as a disease interface.
