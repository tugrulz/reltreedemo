# Interactive theory→advice decision-tree viewer

Self-contained web viewer that walks the depth-5 EXIT/REPAIR decision
tree from the GAIL project report (see
`../../Final Project Report/CanLLMsGiveRelationshipAdvice__GAIL_Project_Report.pdf`).

Two views:

1. **Guided walk** — asks one human-readable question at a time (e.g.
   *"Are you committed to this relationship?"*), keeps a running
   EXIT/REPAIR score in the right panel, and — once you reach a leaf —
   shows the full 8-class advice-type distribution for posts routed
   there.
2. **Full tree** — the complete decision tree as SVG, with mouse-wheel
   zoom, drag pan, `+` / `−` / Fit / 100% toolbar controls, and
   double-click to fit.

## How to run

Browsers block `fetch()` on `file://` URLs, so serve the folder over
HTTP:

```bash
cd presentation/tree_viewer
python3 -m http.server 8000
# then open http://127.0.0.1:8000/
```

## Files

| File               | Purpose |
|--------------------|---------|
| `index.html`       | Layout with two tabs (Guided walk / Full tree). |
| `style.css`        | Colour palette matches `fig20_decision_tree_natural.png` (EXIT `#c0392b`, REPAIR `#27ae60`). |
| `viewer.js`        | Walk state, question rendering, running score, 8-class chart, SVG pan/zoom. |
| `tree.json`        | Serialized tree — 49 nodes (24 internal + 25 leaves); humanized questions; per-node EXIT/REPAIR + per-leaf 8-class counts. |
| `full_tree.svg`    | Full SVG of the humanized tree (from `outputs/annotation_analysis/figures/fig20_decision_tree_natural.svg`). |
| `README.md`        | This file. |

## Regenerating `tree.json`

The JSON is produced by `notebooks/63_tree_to_json.py`, which re-trains
the same depth-5 tree (identical hyperparameters to
`notebooks/59_tree_natural_labels.py`), walks the tree, and dumps
humanized labels + per-leaf 8-class distributions.

```bash
python3 notebooks/63_tree_to_json.py
```

The 8-class distribution at each leaf is computed by routing training
samples through `dt.apply(X)` and counting each of the 8 canonical
advice labels (4 EXIT + 4 REPAIR) among the posts that landed there.

## Notes on the walk

- Questions are phrased in the **second person** ("Are you committed…?")
  and negations are reversed (the tree's "commitment absent" test is
  asked as "committed?", with the YES/NO branches swapped to match).
  Stats, counts and leaf predictions are unchanged. Caveat: the tree's
  original NO branch also contained posts where the field was *not
  stated*, so after reversal those posts sit in the YES branch of
  reversed "is X present?" questions and the NO branch of reversed
  "is it unclear?" questions.
- At the **root**, all 1,337 posts are represented; the binary bar
  starts near 50/50 (EXIT 49.4% / REPAIR 50.6%, matching the training
  distribution).
- Every YES/NO choice narrows the sample. The right-panel bar updates
  in real time to show the EXIT/REPAIR ratio among *posts still
  matching your answers*.
- Once you reach a leaf, the 8-class panel activates and shows how the
  4 EXIT and 4 REPAIR canonical advice categories are distributed
  within that leaf.
- `Undo last` and `Reset` let you back-track without reloading.

## Notes on the full-tree view

- Mouse wheel = zoom (centered on cursor).
- Drag = pan.
- Double-click = fit to screen.
- `100%` button = native SVG resolution (useful for reading leaf
  labels on very small screens).
