/* ═════════════════════════════════════════════════════════════════════
   GAIL — Interactive decision-tree viewer
   Guided walk + full-tree pan/zoom
   ═════════════════════════════════════════════════════════════════════ */
"use strict";

const state = {
  tree:      null,    // loaded from tree.json
  currentId: null,    // current node id in the walk
  history:   [],      // [{nodeId, answer:"yes"|"no", label:"...", question:"..."}]
};

const $ = (id) => document.getElementById(id);

/* ─── Framework recognition (for the little tag next to the question) ── */
const FRAMEWORK_TAGS = [
  { match: /^commitment_present$/,                                   tag: "Gottman",     colour: "#be123c" },
  { match: /^trust_present$/,                                        tag: "Gottman",     colour: "#be123c" },
  { match: /^love_maps_present$/,                                    tag: "Gottman",     colour: "#be123c" },
  { match: /^(criticism|contempt|defensiveness|stonewalling)_present$/, tag: "Gottman (4H)", colour: "#be123c" },
  { match: /^(emotional_bids|repair_attempts|repair_attempts_successful|shared_rituals)_present?$/,
                                                                     tag: "Gottman",     colour: "#be123c" },
  { match: /^(fondness_admiration|turning_toward|positive_perspective|conflict_managed_well|life_dreams_supported|shared_meaning)_?present?/,
                                                                     tag: "Gottman SRH", colour: "#be123c" },
  { match: /^(author|partner)_attachment_(style|anxiety|avoidance)/, tag: "Attachment",  colour: "#dc2626" },
  { match: /^partner_observability$/,                                tag: "Attachment",  colour: "#dc2626" },
  { match: /^stage$|^direction$/,                                    tag: "Knapp",       colour: "#0891b2" },
  { match: /^dominant_love_type$|^(intimacy|passion)_present$/,      tag: "Sternberg",   colour: "#c026d3" },
  { match: /^(satisfied_with_relationship|alternatives_perceived_as_better|significant_investment_present|committed_to_relationship)$/,
                                                                     tag: "Investment",  colour: "#ea580c" },
  { match: /^(locus_of_control|self_blame_present|partner_blame_present|help_seeking_orientation|relationship_instability)$/,
                                                                     tag: "Cross-cutting", colour: "#7c3aed" },
];
function frameworkFor(field) {
  for (const {match, tag, colour} of FRAMEWORK_TAGS) if (match.test(field)) return {tag, colour};
  return { tag: "Field", colour: "#5b6b73" };
}

/* ─── Load JSON ─────────────────────────────────────────────────────── */
async function loadTree() {
  const resp = await fetch("tree.json");
  if (!resp.ok) throw new Error("tree.json failed to load: " + resp.status);
  state.tree = await resp.json();
  state.currentId = state.tree.root_id;
  renderGuided();
}

/* ─── VIEW 1 — Guided walk rendering ───────────────────────────────── */
function renderGuided() {
  const node = state.tree.nodes[String(state.currentId)];
  if (!node) return;

  // Progress card
  $("progress-step").textContent    = String(state.history.length + 1);
  const pct = node.samples_pct.toFixed(1);
  $("progress-samples").textContent = `${node.samples.toLocaleString()} (${pct}%)`;

  // Binary score
  const total  = node.n_exit + node.n_repair;
  const pctExit   = total ? (100 * node.n_exit   / total) : 50;
  const pctRepair = total ? (100 * node.n_repair / total) : 50;
  $("bar-exit").style.width   = `${pctExit}%`;
  $("bar-repair").style.width = `${pctRepair}%`;
  $("pct-exit").textContent   = `${pctExit.toFixed(1)}%`;
  $("pct-repair").textContent = `${pctRepair.toFixed(1)}%`;

  // 8-class breakdown
  render8Class(node);

  // Question card vs leaf card
  if (node.is_leaf) renderLeaf(node);
  else              renderQuestion(node);

  renderHistory();
}

function renderQuestion(node) {
  $("question-card").hidden = false;
  $("leaf-card").hidden     = true;

  const fw = frameworkFor(node.field);
  const fieldPretty = node.field.replace(/_present$/, "").replace(/_/g, " ");
  $("question-field").innerHTML =
    `<span class="fw-tag" style="background:${fw.colour}">${fw.tag}</span>` +
    `<span>Topic: <code>${fieldPretty}</code></span>`;
  $("question-text").textContent = node.question;

  $("btn-yes-hint").textContent = node.yes_label;
  $("btn-no-hint").textContent  = node.no_label;

  $("btn-yes").onclick = () => answer("yes");
  $("btn-no").onclick  = () => answer("no");
}

function renderLeaf(node) {
  $("question-card").hidden = true;
  $("leaf-card").hidden     = false;
  const card = $("leaf-card");
  card.classList.toggle("is-exit", node.pred_class === "EXIT");

  const total = node.n_exit + node.n_repair;
  const conf  = (100 * (node.pred_class === "EXIT" ? node.n_exit : node.n_repair) / total).toFixed(0);
  card.querySelector(".leaf-title").innerHTML =
    `You reached a leaf &nbsp;&mdash;&nbsp; the tree predicts ` +
    `<strong style="color:${node.pred_class==='EXIT'?'var(--exit)':'var(--repair)'}">` +
    `${node.pred_class}</strong> at <strong>${conf}%</strong> confidence ` +
    `(from ${total.toLocaleString()} similar posts).`;
  card.querySelector(".leaf-explainer").innerHTML =
    `The 8-class breakdown to the right shows which specific advice categories ` +
    `Reddit top comments actually gave for posts routed to this leaf.`;
}

function render8Class(node) {
  const list = $("eight-list");
  const EXIT   = state.tree.advice_labels.EXIT;
  const REPAIR = state.tree.advice_labels.REPAIR;

  if (!node.is_leaf) {
    list.innerHTML = '<div class="eight-empty">Answer questions on the left to walk to a leaf. The 8-class distribution shows once you arrive.</div>';
    return;
  }

  const cls = node.eight_class;
  const pct = node.eight_class_pct;
  let html = "";
  for (const lbl of EXIT) {
    const p = pct[lbl] ?? 0;
    html += rowHtml(lbl, cls[lbl] ?? 0, p, "exit");
  }
  for (const lbl of REPAIR) {
    const p = pct[lbl] ?? 0;
    html += rowHtml(lbl, cls[lbl] ?? 0, p, "repair");
  }
  list.innerHTML = html;
}
function rowHtml(label, n, pct, side) {
  const width = Math.max(0, Math.min(100, pct));
  return `
    <div class="eight-row ${side}">
      <div class="eight-label" title="${label}">${label}</div>
      <div class="eight-pct">${pct.toFixed(1)}% <span style="color:var(--grey);font-weight:500">· n=${n}</span></div>
      <div class="eight-bar"><div class="eight-bar-inner" style="width:${width}%"></div></div>
    </div>`;
}

function renderHistory() {
  const ol = $("history-list");
  if (!state.history.length) {
    ol.innerHTML = '<li class="history-empty">No answers yet. Answer the question above to begin.</li>';
    return;
  }
  ol.innerHTML = state.history.map(h => `
    <li class="${h.answer === 'yes' ? 'hist-yes' : 'hist-no'}">
      <span class="hist-question">${h.question}</span>
      &nbsp;&rarr;&nbsp;
      <span class="hist-answer">${h.answer.toUpperCase()}</span>
      <span style="color:var(--grey);font-size:12px"> &middot; ${h.label}</span>
    </li>
  `).join("");
}

/* ─── Walk actions ─────────────────────────────────────────────────── */
function answer(which /* "yes" | "no" */) {
  const node = state.tree.nodes[String(state.currentId)];
  if (!node || node.is_leaf) return;
  const nextId = which === "yes" ? node.yes_child : node.no_child;
  state.history.push({
    nodeId: state.currentId,
    answer: which,
    question: node.question,
    label:    which === "yes" ? node.yes_label : node.no_label,
  });
  state.currentId = nextId;
  renderGuided();
}
function undoLast() {
  if (!state.history.length) return;
  const last = state.history.pop();
  state.currentId = last.nodeId;
  renderGuided();
}
function reset() {
  state.currentId = state.tree.root_id;
  state.history = [];
  renderGuided();
}
$("btn-back").onclick  = undoLast;
$("btn-reset").onclick = reset;

/* ─── Tabs ─────────────────────────────────────────────────────────── */
$("tab-guided").onclick = () => switchTab("guided");
$("tab-full").onclick   = () => { switchTab("full"); ensureFullTreeLoaded(); };

function switchTab(name) {
  document.querySelectorAll(".tab").forEach(t => t.classList.remove("active"));
  document.querySelectorAll(".view").forEach(v => v.classList.remove("active"));
  $(`tab-${name}`).classList.add("active");
  $(`view-${name}`).classList.add("active");
}

/* ─── VIEW 2 — Full tree with pan / zoom ───────────────────────────── */
const fullTree = {
  loaded: false, svg: null,
  scale: 1, x: 0, y: 0,
  dragging: false, sx: 0, sy: 0,
  minScale: 0.1, maxScale: 8,
};

async function ensureFullTreeLoaded() {
  if (fullTree.loaded) return;
  const canvas = $("svg-canvas");
  try {
    const resp = await fetch("full_tree.svg");
    if (!resp.ok) throw new Error("full_tree.svg failed to load: " + resp.status);
    const svgText = await resp.text();
    canvas.innerHTML = svgText;
    const svg = canvas.querySelector("svg");
    if (!svg) throw new Error("no <svg> in full_tree.svg");
    // Ensure the SVG has explicit width/height reset so transforms behave
    if (!svg.hasAttribute("width"))  svg.setAttribute("width",  svg.viewBox.baseVal.width  || 3000);
    if (!svg.hasAttribute("height")) svg.setAttribute("height", svg.viewBox.baseVal.height || 1400);
    fullTree.svg = svg;
    fitToScreen();
    hookPanZoom(canvas, svg);
    fullTree.loaded = true;
  } catch (err) {
    canvas.innerHTML = `<div class="svg-loading" style="color:var(--exit)">
      Could not load full_tree.svg: ${err.message}<br>
      If you're viewing this from the file system, some browsers block
      <code>fetch()</code> on <code>file://</code> URLs. Serve the folder over
      HTTP instead:<br>
      <code>cd presentation/tree_viewer &amp;&amp; python3 -m http.server 8000</code>
    </div>`;
  }
}

function applyTransform() {
  fullTree.svg.style.transform =
    `translate(${fullTree.x}px, ${fullTree.y}px) scale(${fullTree.scale})`;
}
function fitToScreen() {
  const c = $("svg-canvas");
  const bbox = fullTree.svg.getBBox
    ? fullTree.svg.getBBox()
    : { width: +fullTree.svg.getAttribute("width"), height: +fullTree.svg.getAttribute("height") };
  const w = fullTree.svg.viewBox.baseVal.width  || bbox.width;
  const h = fullTree.svg.viewBox.baseVal.height || bbox.height;
  const rect = c.getBoundingClientRect();
  const s = Math.min(rect.width / w, rect.height / h) * 0.95;
  fullTree.scale = s;
  fullTree.x = (rect.width  - w * s) / 2;
  fullTree.y = (rect.height - h * s) / 2;
  applyTransform();
}
function zoomAt(mx, my, delta) {
  const c = $("svg-canvas");
  const rect = c.getBoundingClientRect();
  const cx = mx - rect.left;
  const cy = my - rect.top;
  // Point on the SVG under the cursor before zoom:
  const svgX = (cx - fullTree.x) / fullTree.scale;
  const svgY = (cy - fullTree.y) / fullTree.scale;
  const s2 = Math.max(fullTree.minScale, Math.min(fullTree.maxScale, fullTree.scale * delta));
  fullTree.scale = s2;
  fullTree.x = cx - svgX * s2;
  fullTree.y = cy - svgY * s2;
  applyTransform();
}
function hookPanZoom(canvas, svg) {
  canvas.addEventListener("wheel", (e) => {
    e.preventDefault();
    const delta = e.deltaY > 0 ? 0.90 : 1.10;
    zoomAt(e.clientX, e.clientY, delta);
  }, { passive: false });

  canvas.addEventListener("mousedown", (e) => {
    fullTree.dragging = true; fullTree.sx = e.clientX; fullTree.sy = e.clientY;
    canvas.style.cursor = "grabbing";
  });
  window.addEventListener("mousemove", (e) => {
    if (!fullTree.dragging) return;
    fullTree.x += e.clientX - fullTree.sx;
    fullTree.y += e.clientY - fullTree.sy;
    fullTree.sx = e.clientX; fullTree.sy = e.clientY;
    applyTransform();
  });
  window.addEventListener("mouseup",   () => { fullTree.dragging = false; canvas.style.cursor = "grab"; });
  canvas.addEventListener("dblclick", () => fitToScreen());

  $("zoom-in").onclick    = () => {
    const r = canvas.getBoundingClientRect();
    zoomAt(r.left + r.width/2, r.top + r.height/2, 1.25);
  };
  $("zoom-out").onclick   = () => {
    const r = canvas.getBoundingClientRect();
    zoomAt(r.left + r.width/2, r.top + r.height/2, 0.80);
  };
  $("zoom-reset").onclick = fitToScreen;
  $("zoom-100").onclick   = () => {
    const r = canvas.getBoundingClientRect();
    fullTree.scale = 1;
    const w = fullTree.svg.viewBox.baseVal.width;
    const h = fullTree.svg.viewBox.baseVal.height;
    fullTree.x = (r.width  - w) / 2;
    fullTree.y = (r.height - h) / 2;
    applyTransform();
  };
  window.addEventListener("resize", () => {
    if (fullTree.loaded) fitToScreen();
  });
}

/* ─── Boot ─────────────────────────────────────────────────────────── */
loadTree().catch(err => {
  document.body.innerHTML = `
    <div style="padding:32px; color:#c0392b; font-family:sans-serif">
      <h2>Could not load tree.json</h2>
      <p>${err.message}</p>
      <p style="color:#5b6b73">Some browsers block <code>fetch()</code> on <code>file://</code> URLs.
      Serve the folder over HTTP:<br>
      <code>cd presentation/tree_viewer &amp;&amp; python3 -m http.server 8000</code></p>
    </div>`;
});
