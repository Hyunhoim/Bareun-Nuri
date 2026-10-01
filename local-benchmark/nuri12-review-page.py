"""Reuse the existing blind review UI; source labels remain empty."""
import json,re,hashlib,unicodedata
from pathlib import Path
from transformers import AutoTokenizer
R=Path('.runtime/nuri-1.2-human-review-v1')
def main():
 rows=json.loads((R/'review-items.json').read_text(encoding='utf8'));manifest=json.loads((R/'manifest.json').read_text(encoding='utf8'));tok=AutoTokenizer.from_pretrained('.runtime/klue-base',local_files_only=True);views={}
 for r in rows:
  text=unicodedata.normalize('NFC','판정대상: '+r['input']['target']+'\n문맥: '+r['input']['context']);ids=tok(text,truncation=False)['input_ids'];short=tok(text,truncation=True,max_length=512)['input_ids'];views[r['id']]={'tokens':len(ids),'truncated':len(ids)>512,'text':tok.decode(short,skip_special_tokens=True)}
 (R/'tokenizer-review.json').write_text(json.dumps(views,ensure_ascii=False,indent=2),encoding='utf8');manifest['tokenizer_view_sha256']=hashlib.sha256((R/'tokenizer-review.json').read_bytes()).hexdigest();(R/'manifest.json').write_text(json.dumps(manifest,ensure_ascii=False,indent=2),encoding='utf8')
 html=Path('.runtime/real-context-review-v1/review.html').read_text(encoding='utf8');payload=json.dumps({'manifest':manifest,'rows':rows,'tokenized':views},ensure_ascii=False).replace('<','\\u003c');html,count=re.subn(r'(<script id="data" type="application/json">).*?(</script>)',lambda m:m[1]+payload+m[2],html,flags=re.S);assert count==1
 html=html.replace('real-context-review-v1-answers.json','nuri-1.2-human-review-v1-answers.json').replace('<h1>실제 문맥 독립 검수</h1>','<h1>Nuri 1.2 · 새 실문맥 17개 검수</h1><p>사람 정답은 아직 없습니다. 피해 문의는 2, 예방·교육 인용은 1입니다. 불법 권유가 없을 수도 있으며 수량을 맞추기 위해 0을 선택하지 마세요.</p>')
 (R/'review.html').write_text(html,encoding='utf8');assert all(r['decision'] is None and not r['reviewed'] for r in rows);print(json.dumps({'items':len(rows),'truncated':sum(v['truncated'] for v in views.values()),'human_labels':0}))
if __name__=='__main__':main()
