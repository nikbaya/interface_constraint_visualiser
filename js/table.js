// Ranked, sortable protein table (landing page) and the paste-a-gene-list mode.
import { fmt2, pretty_p, pretty_q, int, oeColor, escapeHTML } from "./format.js";
import { prefetchProtein } from "./data.js";
import { downloadIndexCSV } from "./export.js";

const COLS = [
  { key: "s", label: "Gene", left: true, sort: (a, b) => a.s.localeCompare(b.s) },
  { key: "oi", label: "Interface O/E", title: "pooled missense O/E at G2P interface residues (95% CI)" },
  { key: "on", label: "Non-interface O/E" },
  { key: "gm", label: "Gene mis O/E", title: "whole-gene missense O/E, gnomAD v4.1 gene-level constraint (90% CI)" },
  { key: "p", label: "p (depletion)", title: "one-sided conditional binomial test, interface vs non-interface" },
  { key: "ni", label: "Interface res." },
  { key: "np", label: "Partners", title: "heteromeric structural partners" },
  { key: "hp", label: "Partner heterogeneity", title: "nominal p, likelihood-ratio test of a common O/E across partners (q = BH-adjusted)" },
  { key: "cv", label: "ClinVar P/LP", title: "ClinVar pathogenic / likely-pathogenic missense residues" },
  { key: "lof", label: "LOEUF", title: "gene-level pLoF O/E upper 90% bound" },
];

export function renderTable(container, rows, { page = 50, sortKey = "p", sortDir = -1, onOpen } = {}) {
  let shown = page, sk = sortKey, sd = sortDir;
  function sorted() {
    const c = COLS.find((x) => x.key === sk);
    const cmp = c && c.sort ? c.sort : (a, b) => {
      const va = a[sk], vb = b[sk];
      if (va == null && vb == null) return 0; if (va == null) return 1; if (vb == null) return -1;
      return va - vb;
    };
    return rows.slice().sort((a, b) => cmp(a, b) * sd || (b.p || 0) - (a.p || 0));
  }
  function bar(v, ci) {
    if (v == null) return "–";
    const w = Math.min(v, 1.6) / 1.6 * 100;
    return `<span class="tbar"><span class="tbar-fill" style="width:${w}%;background:${oeColor(v)}"></span></span>${fmt2(v)}${ci ? ` <span class="tag">${fmt2(ci[0])}–${fmt2(ci[1])}</span>` : ""}`;
  }
  function draw() {
    const data = sorted().slice(0, shown);
    const head = COLS.map((c) => `<th class="${c.left ? "left" : ""} ${sk === c.key ? "sorted" : ""}" data-k="${c.key}" title="${escapeHTML(c.title || "")}">${c.label}${sk === c.key ? (sd < 0 ? " ▾" : " ▴") : ""}</th>`).join("");
    const body = data.map((r) => `<tr data-u="${r.u}" tabindex="0">
      <td class="left"><b>${escapeHTML(r.s)}</b> <span class="tag">${r.u}</span>${r.hm ? ' <span class="pill pill-hm" title="forms homomers (binds copies of itself)">↻</span>' : ""}${r.om ? ' <span class="pill pill-omim" title="OMIM disease gene">OMIM</span>' : ""}</td>
      <td>${bar(r.oi, [r.il, r.ih])}</td><td>${bar(r.on)}</td><td>${bar(r.gm)}</td>
      <td class="${r.sig ? "sig" : ""}">${pretty_p(r.p)}</td>
      <td>${int(r.ni)} <span class="tag">(${Math.round((r.fi || 0) * 100)}%)</span></td>
      <td>${int(r.np)}</td>
      <td class="${r.hp != null && r.hp >= 1.301 ? "het" : ""}">${r.hp == null ? "–" : pretty_p(r.hp, { ns: false })}${r.hq != null && r.hq < 0.1 ? ` <span class="tag">${pretty_q(r.hq)}</span>` : ""}</td>
      <td>${r.cv ? int(r.cv) : "–"}</td>
      <td>${fmt2(r.lof)}</td></tr>`).join("");
    container.innerHTML = `<div class="table-wrap"><table class="ranked"><thead><tr>${head}</tr></thead><tbody>${body}</tbody></table></div>
      <div class="table-foot"><span class="panel-note">Showing ${int(data.length)} of ${int(rows.length)}.</span>
      ${shown < rows.length ? `<button class="show-more" id="tbl-more">Show ${Math.min(page, rows.length - shown)} more</button>` : ""}
      <button class="show-more" id="tbl-csv">Download CSV (${int(rows.length)} rows)</button></div>`;
    container.querySelectorAll("th").forEach((th) => th.addEventListener("click", () => {
      const k = th.dataset.k; if (sk === k) sd = -sd; else { sk = k; sd = k === "s" ? 1 : (k === "lof" || k === "oi" || k === "gm" ? 1 : -1); }
      draw();
    }));
    container.querySelectorAll("tbody tr").forEach((tr) => {
      tr.addEventListener("click", () => onOpen ? onOpen(tr.dataset.u) : (location.hash = `#/${tr.dataset.u}`));
      tr.addEventListener("keydown", (e) => { if (e.key === "Enter") tr.click(); });
      tr.addEventListener("mouseenter", () => prefetchProtein(tr.dataset.u));
    });
    container.querySelector("#tbl-more")?.addEventListener("click", () => { shown += page; draw(); });
    container.querySelector("#tbl-csv")?.addEventListener("click", () => downloadIndexCSV(sorted()));
  }
  draw();
  return { update(newRows) { rows = newRows; shown = page; draw(); } };
}

// Paste-a-list mode: resolve symbols / UniProt IDs / aliases, show their rows.
export function renderGeneList(container, index, maps) {
  container.innerHTML = `
    <p class="panel-note">Paste gene symbols or UniProt IDs (any separator) to pull their interface constraint into one table.</p>
    <textarea id="gl-input" rows="4" placeholder="TP53 BRCA1 GRIN2B P68871 …" spellcheck="false"></textarea>
    <div class="gl-actions"><button class="show-more" id="gl-go">Look up</button><span id="gl-note" class="panel-note"></span></div>
    <div id="gl-table"></div>`;
  const go = () => {
    const toks = container.querySelector("#gl-input").value.split(/[\s,;|]+/).map((t) => t.trim()).filter(Boolean);
    const seen = new Set(), rows = [], missing = [];
    for (const t of toks) {
      const k = t.toUpperCase();
      const hit = maps.byUni.get(k) || maps.bySymbol.get(k) || maps.byAlias.get(k);
      if (hit) { if (!seen.has(hit.u)) { seen.add(hit.u); rows.push(hit); } } else missing.push(t);
    }
    container.querySelector("#gl-note").innerHTML = `${rows.length} found` + (missing.length ? ` · <span style="color:var(--red)">not in the set: ${escapeHTML(missing.slice(0, 30).join(", "))}${missing.length > 30 ? "…" : ""}</span>` : "");
    renderTable(container.querySelector("#gl-table"), rows, { page: 500 });
  };
  container.querySelector("#gl-go").addEventListener("click", go);
  container.querySelector("#gl-input").addEventListener("keydown", (e) => { if (e.key === "Enter" && (e.metaKey || e.ctrlKey)) go(); });
}
