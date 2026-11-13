# Follow-up

## ClinVar allele stacking: data re-export pending (2026-11-13)

The residue browser now draws one ClinVar lollipop per residue, with one stacked dot per distinct
amino-acid substitution there (up to 3, then a "×n" label). The tooltip lists the substitutions,
and the ClinVar headline adds an allele-level count when it differs from the residue count.

Example: PSTPIP1 has 4 P/LP missense alleles at 3 residues (A230T, E250Q, E250K, E257K). Before
this change the browser showed 3 dots, which read as "2 of 3 P/LP at the interface" while the
analysis counts "3 of 4 alleles".

**Still to do:**

- [ ] Re-export `data/` with the updated `export_web.py` from the analysis repo. Until then, the
      protein JSON has the old `[residueId, 'P'|'B']` markers and the browser draws one dot per
      residue as before. The JS accepts both formats.
  - New marker format: `[residueId, 'P'|'B', n_alleles, 'E250K;E250Q']`.
  - New per-category fields: `alleles_interface`, `alleles_total`.
- [ ] Diff the new export against the current `data/` before replacing it. Only the ClinVar fields
      should change. Anything else that moves comes from upstream analysis changes and needs a look.
- [ ] After the swap, check PSTPIP1 (O43586) residue 250 shows two stacked P/LP dots and the
      headline reads "By allele: 3 of 4".
- [ ] Decide whether the overview/table "ClinVar P/LP" column (currently residues) should also
      show alleles.
