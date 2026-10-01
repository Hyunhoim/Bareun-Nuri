# HCX-005 untuned baseline

Before execution: compare current HCX-007 versus untuned HCX-005 using the existing 137-candidate stored input, forward and reverse, max 12 per request. These are observed diagnostic data, not a fresh holdout. No training or production changes.

48 requests maximum, estimated reservations <=300,000 tokens, 1 hour safety deadline, shared 58,000 tokens per 61 seconds, sequential with 1 second minimum spacing. No automatic retry. Save intent before sending and raw response before parsing. Unknown transport requests stop the experiment. Output512, temperature0, seed42. Identical messages; HCX005 uses maxTokens and omits unsupported thinking; HCX007 uses maxCompletionTokens and thinking none.

Report strict output validity, precision/recall/F1, uncertainty, prior TP loss/gain, scenario errors, order sensitivity, measured tokens and latency. Invalid outputs count as unjudged, ads as FN. No parser accommodation or prompt tuning after seeing results.

Pilot value: both orders >=95% valid, average F1 within 5 percentage points of HCX007, time <=1.5x, and errors concentrated in learnable intent/context distinctions => limited PEFT pilot worthwhile, not production adoption. If below these conditions, report which deficits would need resolving and do not infer fine-tuning will fix them. This threshold is a bounded investment heuristic, not proof of trainability. Production adoption requires independent held-out data and 25-minute end-to-end validation.
