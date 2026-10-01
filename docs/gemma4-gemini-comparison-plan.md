# Gemma 4 E2B / Gemini 3.5 Flash-Lite comparison

2026-10-01. Isolated, inference-only experiment; operating code and Phase 2 remain unchanged.

- Reuse the 221 saved target/context inputs in `.runtime/slm-three/inputs.json`, the common four-label prompt, and historical HCX single/batch12 results. These are observed regression data, not an independent holdout.
- Gemma: official Google QAT Q4_0 instruction checkpoint, CPU only, 8 threads, no reasoning, temperature 0, single and per-panel batches up to 12. Preserve raw requests/responses, invalid outputs, truncation and latency. No multimedia projector is needed for text.
- Gemini: exact stable model `gemini-3.5-flash-lite`, once a key is available. Same semantic instructions/input/output labels; record unavoidable API differences. No fine-tuning or automatic retry of uncertain API requests.
- Budgets: Gemma download up to 30 minutes; inference up to 60 minutes total, 120 seconds/request. Gemini up to 241 evaluation calls plus one smoke call, bounded at 30 minutes and 500,000 input/output tokens; stop on authentication/quota errors. No billing activation.
- Metrics: advertisement precision/recall/F1 on determinate labels; four-label accuracy, uncertain handling, per-panel results, invalid output count, total and per-item latency. Preserve already-correct HCX detections and report new false positives/losses.
- Full score requires every planned item; partial runs are explicitly partial. Historical HCX latency is not a concurrent controlled hardware/network comparison.
- Promotion is not part of this experiment. A replacement candidate must show a meaningful accuracy/latency tradeoff without concentrated context regressions, followed by a separate 25-minute operating validation.

## Observed quota amendment (before continuation)

Gemini returned an explicit HTTP 429 RPM rejection on request 48 after 47 successful responses (20 batches and 27 single items). The response identifies 15 requests/minute and a 17-second retry delay. The original run is stopped and preserved. A separate continuation directory retries only this confirmed rejected request and the unsent remainder, at a 4.6-second minimum interval. No unknown-response request is retried; no prompt/model change, repeat of successful calls, or additional evaluation inputs. Continuation has a 30-minute safety cap and shares the 500,000-token cap with the original run; report the interruption gap separately from API response and pacing time. This is a quota-handling change, not accuracy tuning.

## Current HCX reference

Add one current run of the exact 20 batch12 requests, at most 60,000 tokens / 5 minutes. Purpose: distinguish historical latency from the current comparison and observe repeat variance. Retain original HCX results alongside the new run; do not select the better result or change prompts. No automatic retry, no operating change.

## Gemma harness contract correction

The first run used `response_format: {type: 'json_schema', schema: ...}`, following the llama.cpp README example. Source inspection of b11284 `tools/server/server-common.cpp` shows that this type reads `response_format.json_schema.schema`; the flat field is ignored and only generic JSON is enforced. This produced numeric strings in batch output. Preserve comparison-v1 as an invalid schema-control diagnostic, not evidence of Gemma's inability to obey an enforced schema. Rerun both single and batch conditions in comparison-v2 with the correct nested wrapper, the same prompts/order/inputs, and a separate adversarial schema probe before evaluation. This is an inference-harness repair, no model/prompt tuning. Total local inference remains within the original one-hour budget.
