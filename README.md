# Interface Constraint Visualiser

A static site exploring **missense constraint at protein–protein interface
residues**. Search a protein to see how depleted of missense variation its
interface residues are (gnomAD v4.1 missense O/E, "misOEUF" — lower = more
constrained) compared with its non-interface residues, plus the interface
constraint of its structural interacting partners.

🔗 **https://nikbaya.github.io/interface_constraint_visualiser/**

## What it shows

- **Interface vs. non-interface constraint** — pooled missense O/E with 95% CIs.
- **Per-residue track** — every residue coloured by missense O/E (coolwarm:
  red = constrained, blue = tolerant); orange ticks mark inter-chain interface
  residues.
- **Partner network** — structural partners from inter-chain contacts; node
  colour = the partner's interface misOEUF, edge width = number of shared
  contact residues. Hover a partner to highlight where it contacts the protein;
  click an in-set partner to open it.

Proteins are ranked by the **significance of their interface missense
depletion** (one-sided Poisson test); the pilot set mixes data-driven top hits
(chromatin/transcription complexes, many neurodevelopmental genes) with curated
disease examples (hemoglobin α/β, NMDA-receptor subunits, TP53, …).

## Stack

Plain HTML/CSS + vanilla JS with [D3 v7](https://d3js.org/) from a CDN. No build
step — GitHub Pages serves this repo root directly (`.nojekyll`).

```
index.html        # page shell, loads D3 + js/main.js
css/              # theme (Broad palette) + layout
js/               # main (routing) · residueTrack · headline · network · format · tooltip
data/             # index.json + one <UNIPROT>.json per protein (generated, aggregated)
```

## Data

The per-protein JSON is **precomputed** in the (private) `complex_constraint`
analysis repo and contains only aggregated, derived numbers — never raw gnomAD
or structural data. Built from gnomAD v4.1 per-residue constraint × Genomics2
Proteins (G2P) inter-chain interface structures.

## Run locally

```sh
python -m http.server 8000   # then open http://localhost:8000
```
