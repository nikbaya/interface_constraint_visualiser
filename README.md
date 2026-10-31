# Interface Constraint Visualiser

A static site exploring **missense constraint at protein–protein interface
residues** across every human protein with a PDB-derived interface. For each
protein: interface vs non-interface missense O/E (gnomAD v4.1), the same split
**resolved by interaction partner**, a zoomable annotated residue browser,
ClinVar variants, and the protein's structure with each partner.

🔗 **https://nikbaya.github.io/interface_constraint_visualiser/**

## What it shows

- **Overview** — every protein on one scatter (interface vs non-interface O/E, or
  a volcano of effect vs significance), with filters, a sortable ranked table, and a
  paste-a-gene-list mode.
- **Interface vs non-interface constraint** — pooled missense O/E with 95%
  intervals and a one-sided conditional binomial depletion test; expand the
  interface row into one row per structural partner, with a partner-heterogeneity
  test.
- **Residue browser** — genome-browser-style lanes on a shared, zoomable axis:
  per-residue O/E, G2P interface residues (orange), one lane
  per partner, ClinVar lollipops, UniProt domains / regions / motifs, DSSP
  secondary structure, AlphaFold pLDDT, sites and PTMs.
- **Structure with partner** — 3D view (3Dmol.js) of this protein coloured by
  per-residue O/E with the partner chain and contact residues; a *partner mosaic*
  mode paints every partner's footprint on one chain; a *whole complex* mode loads
  the PDB entry containing the most known partners. Coordinates are fetched at view
  time from the RCSB / PDBe model servers.
- **Partner network + table** — partners from inter-chain contacts; selecting a
  partner anywhere highlights it in every view. Every view state is in the URL.

## Stack

Plain HTML/CSS + vanilla JS (ES modules) with [D3 v7](https://d3js.org/) and
[3Dmol.js](https://3dmol.csb.pitt.edu/) from a CDN. No build step — GitHub Pages
serves this repo root directly (`.nojekyll`).

```
index.html        # page shell (landing, protein page, methods)
css/              # theme (Broad palette, light/dark) + layout
js/               # main (routing) · state · data · search · overview · table ·
                  # headline · residueTrack · partnerStructure · network ·
                  # clinvarPanel · export · structure3d (landing hero) · format · tooltip
data/             # index.json + variant_index.json + one <UNIPROT>.json per protein
```

## Data

The per-protein JSON is **precomputed** in the (private) `complex_constraint`
analysis repo by `python -m complex_constraint.export_web` and contains only
aggregated, derived numbers — never raw gnomAD or structural data. Headline
numbers come straight from the analysis' `proteins_w_constrained_interface`
table (gnomAD v4.1 per-residue constraint × Genomics2Proteins inter-chain
interface residues; one-sided conditional binomial test). Partner-resolved
constraint uses G2P's PDB chain assignments to identify the partner protein of
each contact, de-duplicates binding modes across PDB entries, and compares each
partner interface with the rest of the protein. See the site's Methods page.

## Run locally

```sh
python -m http.server 8000   # then open http://localhost:8000
```
