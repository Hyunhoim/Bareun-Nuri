"""Real CPU prefix/resume check plus fail-open contract; no production changes."""
import json,subprocess,sys,hashlib
from pathlib import Path
root=Path('.runtime/safe-filter-stage-check-v2');root.mkdir(exist_ok=False)
read=lambda p:json.loads(Path(p).read_text(encoding='utf8'))
rows=read('.runtime/nuri10-filter-collected-v1/inputs.json');scores={x['id']:x for x in read('.runtime/nuri10-filter-collected-v1/D-collected-scores.json')};selected=[];counts={True:0,False:0}
flags={}
for src in read('.runtime/nuri10-filter-collected-v1/sources.json'):
    for c in read(src['path'])['candidates']:flags[(c['url'],c['selector'])]=bool(c.get('context_evidence',{}).get('truncated',False))
for x in rows:
    s=scores[x['id']];cut=flags[(x['url'],x['selector'])];ex=not cut and s['length']<=512 and s['prediction']==2 and s['scores'][0]<.0001 and s['scores'][2]>=.9
    if counts[ex]<20:selected.append({**x,'collection_truncated':cut});counts[ex]+=1
    if all(n==20 for n in counts.values()):break
# Force incomplete metadata only in separate functional probes, not performance evidence.
selected += [{'id':'probe-missing','input':{'target':'정보','context':'설명'}},{'id':'probe-cut','input':{'target':'정보','context':'설명'},'collection_truncated':True}]
inp=root/'inputs.json';inp.write_text(json.dumps(selected,ensure_ascii=False),encoding='utf8');out=root/'run'
cmd=[sys.executable,'-X','utf8','local-benchmark/safe-filter-stage.py','--input',str(inp),'--out',str(out)]
subprocess.run(cmd+['--max-items','13'],check=True);first=read(out/'routes.json');assert len(first['routes'])==13 and not first['routing_complete']
subprocess.run(cmd,check=True);full=read(out/'routes.json');assert full['routes'][:13]==first['routes'];assert len(full['routes'])==42 and full['routing_complete'];assert all(x['route']=='HCX' for x in full['routes'][-2:])
for x in full['routes'][:40]:
    s=scores[x['id']];assert (x['route']=='EXCLUDE')==(not x['evidence']['collection_truncated'] and s['length']<=512 and s['prediction']==2 and s['scores'][0]<.0001 and s['scores'][2]>=.9)
before=(out/'routes.json').read_bytes();bad=root/'changed.json';bad.write_text(json.dumps(selected+[{'id':'changed'}]),encoding='utf8')
res=subprocess.run([sys.executable,'-X','utf8','local-benchmark/safe-filter-stage.py','--input',str(bad),'--out',str(out)],capture_output=True,text=True);assert res.returncode!=0 and (out/'routes.json').read_bytes()==before
(root/'result.json').write_text(json.dumps({'passed':True,'real_cpu_rows':40,'fail_open_probes':2,'prefix_preserved':13,'changed_input_rejected_without_mutation':True,'scope':'isolated routing; not backend integration'},indent=2),encoding='utf8');print('PASS real CPU routes, resume preservation, changed-input rejection')
