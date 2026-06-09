// Small decorative-but-meaningful 3D structure on the landing page.
// Loads one of a few clean homo-oligomers (dimers / trimers) at random and
// highlights the inter-subunit INTERFACE residues (within 4 A of a different
// chain) in orange — the same notion of "interface" the site quantifies.
// A different complex is shown on each page load.

// Light Broad tints per subunit so the distinct proteins in the complex read
// clearly; interface residues are drawn over these in orange.
const CHAIN_TINTS = ["#C1E6A0", "#D6C0E9", "#FEA2A9"];  // light green, purple, red
const INTERFACE = "#F36C3E";  // Broad orange

const STRUCTURES = [
  { file: "assets/1hti.pdb", chains: ["A", "B"], name: "Triosephosphate isomerase (TPI1) — homodimer" },
  { file: "assets/1tnf.pdb", chains: ["A", "B", "C"], name: "Tumor necrosis factor-α (TNF) — homotrimer" },
  { file: "assets/1spd.pdb", chains: ["A", "B"], name: "Superoxide dismutase (SOD1) — homodimer · ALS" },
  { file: "assets/6gss.pdb", chains: ["A", "B"], name: "Glutathione S-transferase (GSTP1) — homodimer" },
  { file: "assets/1axc.pdb", chains: ["A", "B", "C"], name: "PCNA DNA-clamp — homotrimer" },
];

export async function init3D(elId, opts = {}) {
  const el = document.getElementById(elId);
  if (!el || !window.$3Dmol) return null;
  const pick = opts.structure || STRUCTURES[Math.floor(Math.random() * STRUCTURES.length)];

  let data;
  try {
    const r = await fetch(pick.file);
    if (!r.ok) throw new Error(r.status);
    data = await r.text();
  } catch (e) {
    el.closest("figure")?.style.setProperty("display", "none");  // fail quietly
    return null;
  }

  const viewer = window.$3Dmol.createViewer(el, { backgroundColor: "white", antialias: true });
  viewer.addModel(data, "pdb");
  // Base: each subunit a light Broad tint so the different proteins are distinct.
  pick.chains.forEach((ch, i) => {
    viewer.setStyle({ chain: ch }, { cartoon: { color: CHAIN_TINTS[i % CHAIN_TINTS.length] } });
  });
  // Overlay: residues within 4 A of any other chain -> interface (orange).
  pick.chains.forEach((ch) => {
    const others = pick.chains.filter((c) => c !== ch);
    viewer.addStyle(
      { chain: ch, byres: true, within: { distance: 4.0, sel: { chain: others } } },
      { cartoon: { color: INTERFACE } });
  });
  viewer.zoomTo();
  viewer.render();
  viewer.zoom(1.2, 600);
  viewer.spin("y", 0.4);

  const cap = document.getElementById("viewer3d-cap");
  if (cap) {
    cap.innerHTML = `${pick.name}. ` +
      `<span style="color:var(--orange);font-weight:600">Orange</span> = ` +
      `inter-subunit interface residues. Drag to rotate.`;
  }

  // Pause the spin while the user interacts; resume shortly after.
  let t;
  el.addEventListener("mousedown", () => { viewer.spin(false); clearTimeout(t); });
  el.addEventListener("mouseup", () => { t = setTimeout(() => viewer.spin("y", 0.4), 2500); });
  return viewer;
}
