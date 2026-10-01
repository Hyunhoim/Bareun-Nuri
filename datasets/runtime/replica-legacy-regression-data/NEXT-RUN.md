# Prepared future commands (not executed)

## Holdout: offline collection after candidate freeze

The frozen site requires `holdout-authorized.json` before `prepareEvidence(data, 'holdout')`. Its collector writes evidence/labels/full-evidence/checks but not the four freshness fields. `prepare-holdout.cjs` checks the separate frozen selection, writes authorization with `wx`, collects once, verifies seals, adds manifest/evidence/labels/generator hashes to checks, then calls the existing `verifyEvidence`. It refuses prior authorization or collection outputs rather than silently retrying or overwriting.

Future authorized invocation:

```
node .runtime/replica-legacy-regression-data/prepare-holdout.cjs --authorize-collect PATH_TO_FROZEN_SELECTION.json
```

Selection shape matches the round2 CLI: `status: frozen`, ISO `frozen_at`, `modes`, `rounds`, `dataset_manifest_sha256`, and `hashes` with repository-relative paths. Seal the round2/methods/site and all selected dependencies before this invocation; reading4 additionally seals both staged jamo files. The collector uses port19161 and headless Edge. Existing labels are never rewritten to match observations. Collector failures may leave authorization/partial files and require manual diagnosis, not automatic rerun.

## Existing615 regression: selected candidate only

`run-selected.cjs` exports `runSelected`; importing does not execute. It verifies the selection source hashes and regression panel hashes, preserves the original615 order, passes one chosen method to `runComparison`, then checks unchanged files. It requires explicit limits. Freeze this wrapper too when issuing the selection record.

Future model-call invocation, only after selecting the method and authorizing its budget:

```js
await require('./.runtime/replica-legacy-regression-data/run-selected.cjs').runSelected({
  selectionFile: 'PATH_TO_FROZEN_SELECTION.json',
  mode: 'SELECTED_MODE',
  out: '.runtime/legacy615-selected-NEW_RUN',
  limits: {calls: PREDECLARED_CALL_LIMIT, tokens: PREDECLARED_TOKEN_LIMIT, seconds: 3600}
});
```

A single original-order run requires154 calls at batch4,77 at batch8,39 at batch16. Do not use round2 CLI's64-call ceiling for a batch4 legacy615 run; this wrapper calls the common `runComparison` directly. `runComparison` archives code and exact input, sets temperature0/seed42/HCX none, uses each selected method's frozen output budget, and never automatically retries unconfirmed calls. Check all conditions are completed before treating the score as a full-panel result. Comparing this saved baseline to a new call has a time/repeat confound; it is a regression diagnostic, not a new randomized paired experiment.

Baseline38TP/14FP/5FN gives80% F1 on604 certain positions. All615 include43ads/561normal/11ambiguous but only218unique raw strings. Technique gold exists for primary80 only; extra535 must not be interpreted as empty-technique truth. `independent-reaudit.json` confirms53hashes,615IDs/order and the same score using the current common `measured` function. No new holdout text was opened during this preparation.
