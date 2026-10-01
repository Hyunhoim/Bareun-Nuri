"""Package the frozen research candidate; never retrains or downloads weights."""
import hashlib
import json
import shutil
from pathlib import Path

root = Path(__file__).resolve().parents[2]
source = root / '.runtime/dual-technique-v1/kc-density-role/model'
selection = json.loads((root / '.runtime/dual-technique-v1/calibrated-selection.json').read_text())
sha = lambda p: hashlib.sha256(p.read_bytes()).hexdigest()
assert sha(source / 'model.safetensors') == selection['sha256']
dest = root / 'agent/models/kcelectra-antispoof-v1'
dest.mkdir(parents=True, exist_ok=True)
for name in ['config.json', 'model.safetensors', 'tokenizer.json', 'tokenizer_config.json', 'special_tokens_map.json', 'vocab.txt']:
    target = dest / name
    if target.exists():
        assert sha(target) == sha(source / name), 'Refusing to replace different model assets'
    else:
        shutil.copyfile(source / name, target)
table = root / '.runtime/canine-technique-v1/confusables.txt'
assert sha(table) == json.loads((table.parent / 'sources.json').read_text())['unicode_sha256']
shutil.copyfile(table, dest / 'confusables.txt')
manifest = {'name': 'KcElectra-AntiSpoof', 'version': '1.0', 'threshold_h': 0.20,
            'heads': ['JAMO', 'HOMOGLYPH'], 'states': ['present', 'absent', 'uncertain'],
            'max_tokens': 512, 'device': 'cpu', 'threads': 8, 'batch_size': 8,
            'files': {p.name: sha(p) for p in sorted(dest.iterdir()) if p.name != 'manifest.json'}}
(dest / 'manifest.json').write_text(json.dumps(manifest, indent=2), encoding='utf-8')
print(dest)
