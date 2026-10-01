"""Persistent CPU-only JSON-lines service. No imports from experiment code."""
import hashlib
import json
import sys
import unicodedata
from pathlib import Path
import torch
import transformers
from transformers import AutoModelForSequenceClassification, AutoTokenizer


def evidence(token, mapping):
    skeleton = unicodedata.normalize('NFD', ''.join(mapping.get(c, c) for c in unicodedata.normalize('NFD', token)))
    pairs = [f'{i}:U+{ord(c):04X}->{" ".join(f"U+{ord(z):04X}" for z in mapping[c])}' for i, c in enumerate(token) if c in mapping]
    return '\nUnicode 문자 대응(위장 확정 아님): ' + json.dumps({'원문': token, 'skeleton': skeleton, '대응': pairs}, ensure_ascii=False, separators=(',', ':'))


def main():
    assert torch.__version__.split('+')[0] == '2.6.0' and transformers.__version__ == '4.57.3', 'AntiSpoof runtime version mismatch'
    root = Path(sys.argv[1])
    manifest = json.loads((root / 'manifest.json').read_text())
    for name, digest in manifest['files'].items():
        assert hashlib.sha256((root / name).read_bytes()).hexdigest() == digest, name
    mapping = {}
    for line in (root / 'confusables.txt').read_text(encoding='utf-8-sig').splitlines():
        clean = line.split('#')[0].strip()
        if clean:
            a, b, *_ = clean.split(';')
            mapping[''.join(chr(int(x, 16)) for x in a.split())] = ''.join(chr(int(x, 16)) for x in b.split())
    torch.set_num_threads(manifest['threads'])
    tok = AutoTokenizer.from_pretrained(root, local_files_only=True)
    model = AutoModelForSequenceClassification.from_pretrained(root, local_files_only=True).to('cpu').eval()
    for line in sys.stdin:
        request = json.loads(line)
        out = []
        for offset in range(0, len(request['rows']), manifest['batch_size']):
            rows = request['rows'][offset:offset + manifest['batch_size']]
            texts = ['판정대상: ' + r['input']['target'] + '\n문맥: ' + r['input']['context'] + evidence(r['token'], mapping) for r in rows]
            encoded = tok(texts, truncation=False, return_token_type_ids=False)
            valid = [i for i, ids in enumerate(encoded['input_ids']) if len(ids) <= manifest['max_tokens'] and not rows[i].get('collection_truncated')]
            probabilities = {}
            if valid:
                batch = tok.pad([{k: v[i] for k, v in encoded.items()} for i in valid], padding=True, return_tensors='pt')
                with torch.inference_mode():
                    probs = model(**batch).logits.reshape(-1, 2, 3).softmax(-1).tolist()
                probabilities = dict(zip(valid, probs, strict=True))
            for i, row in enumerate(rows):
                probs = probabilities.get(i)
                labels = [max(range(3), key=lambda j: p[j]) for p in probs] if probs else [2, 2]
                if probs and probs[1][0] >= manifest['threshold_h']:
                    labels[1] = 0
                out.append({'id': row['id'], 'labels': labels, 'probabilities': probs,
                            'protected': 'input_truncated' if row.get('collection_truncated') else 'token_limit' if not probs else None})
        print(json.dumps({'id': request['id'], 'rows': out}), flush=True)


if __name__ == '__main__':
    main()
