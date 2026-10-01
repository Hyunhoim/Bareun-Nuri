"""Frozen experiment runtime packaging; production assets are never overwritten."""
import ast,hashlib,json,shutil
from pathlib import Path
R=Path('.runtime/antispoof-typed-runtime-v1');SOURCE=Path('.runtime/antispoof-typed-v1/scope/model')
sha=lambda p:hashlib.sha256(p.read_bytes()).hexdigest()
def main():
 assert sha(SOURCE/'model.safetensors')==json.loads((SOURCE.parent/'frozen.json').read_text())['sha256']
 R.mkdir(exist_ok=False);assets=R/'assets';assets.mkdir()
 for name in ['model.safetensors','config.json','tokenizer.json','tokenizer_config.json','special_tokens_map.json','vocab.txt']:shutil.copyfile(SOURCE/name,assets/name)
 shutil.copyfile('agent/models/kcelectra-antispoof-v1/confusables.txt',assets/'confusables.txt')
 manifest=json.loads(Path('agent/models/kcelectra-antispoof-v1/manifest.json').read_text());manifest['version']='typed-research-v1';manifest['files']={p.name:sha(p) for p in sorted(assets.iterdir())};(assets/'manifest.json').write_text(json.dumps(manifest,indent=2))
 source=Path('local-benchmark/antispoof-typed.py').read_text(encoding='utf8');tree=ast.parse(source);parts=[ast.get_source_segment(source,n) for n in tree.body if isinstance(n,ast.FunctionDef) and n.name in ['jamo','evidence']];assert len(parts)==2
 runtime=Path('agent/antispoof/infer.py').read_text();lo=runtime.index('def evidence(');hi=runtime.index('\ndef main():',lo);runtime=runtime[:lo]+'\n\n'.join(parts)+'\n\n'+runtime[hi:];(R/'infer.py').write_text(runtime,encoding='utf8')
 (R/'package.json').write_text(json.dumps({'source':str(SOURCE),'weights':sha(SOURCE/'model.safetensors'),'input_source':sha(Path('local-benchmark/antispoof-typed.py')),'runtime':sha(R/'infer.py'),'production_runtime':sha(Path('agent/antispoof/infer.py'))},indent=2))
 print(R)
if __name__=='__main__':main()
