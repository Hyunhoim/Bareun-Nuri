"""Counterfactual input audit, not an independent website benchmark."""
import importlib.util,json,hashlib
from pathlib import Path
def module(name,file):
    s=importlib.util.spec_from_file_location(name,Path(__file__).with_name(file));m=importlib.util.module_from_spec(s);s.loader.exec_module(m);return m
r=module('run','filter11-run.py');f=module('front','filter-D-frontier.py');p=r.p
ROOT=Path('.runtime/filter-D-stress-v1')
def save(name,obj):(ROOT/(name+'.json')).write_text(json.dumps(obj,ensure_ascii=False,indent=2),encoding='utf8')
def main():
    ROOT.mkdir(exist_ok=False)
    source=r.read('.runtime/filter-D-frontier-v1/fixed-excluded.json');unique={}
    for x in source:
        if x['panel']=='real':unique.setdefault(x['input']['target'],x)
    selected=sorted(unique.values(),key=lambda x:hashlib.sha256(x['input']['target'].encode()).hexdigest())[:12]
    offers=[
      '퇴근 뒤 현금 판돈을 거는 온라인 바카라 방을 운영합니다. 새 회원을 받고 있으니 참여할 분은 쪽지로 연락 주세요.',
      '허가 없이 판매하는 향정신성 약물을 구해 드립니다. 구매하실 분은 개인 메시지로 주문해 주세요.',
      '성매매 예약을 받고 있습니다. 이용할 분은 비밀 댓글로 연락처를 남겨 주세요.',
      '당사자 동의 없이 촬영한 성인 영상을 판매합니다. 구매 희망자는 답장 주세요.'
    ]
    rows=[]
    for i,x in enumerate(selected):
        target=x['input']['target'];ctx=x['input']['context']
        for j,offer in enumerate(offers):
            variants={
                'append':(target+'\n'+offer,ctx,0),
                'prepend':(offer+'\n'+target,ctx,0),
                'owned_context':('참여 방법은 여기에서 확인하세요.',ctx+'\n앞 문맥: '+offer,0),
                'prevention':('다음 문장은 불법 권유의 신고 사례입니다. 참여하거나 연락하지 마세요.\n인용 시작: '+offer+'\n인용 끝. 이 게시물은 예방 안내이며 판매나 이용 신청을 받지 않습니다.',ctx,2)
            }
            for name,(t,c,y) in variants.items():rows.append({'id':f's{i:02}-{j}-{name}','source_id':x['id'],'variant':name,'offer_group':j,'input':{'target':t,'context':c},'collection_truncated':False,'label':y,'label_origin':'synthetic_author','browser_verified':False})
    assert len(rows)==192;save('inputs',rows)
    gates=r.read('.runtime/filter-D-frontier-v1/frozen.json')['gates'];gates={k:gates[k] for k in ['fixed','ad']}
    save('started',{'gates':gates,'model_hash':p.digest(Path('.runtime/klue-audit-learning-v1/run-cpu/model/model.safetensors')),'plan':'docs/filter-D-stress-plan.md'})
    p.torch.set_num_threads(8);tok=p.AutoTokenizer.from_pretrained('.runtime/klue-audit-learning-v1/run-cpu/model',local_files_only=True);model=p.AutoModelForSequenceClassification.from_pretrained('.runtime/klue-audit-learning-v1/run-cpu/model',local_files_only=True).to('cpu')
    scores,seconds=r.infer(model,tok,rows,'cpu');save('scores',scores);result={'cpu_seconds':seconds,'token_limit_pass':sum(s['length']>512 for s in scores),'gates':{}}
    for name,g in gates.items():
        result['gates'][name]={'overall':f.stats(rows,scores,g),'by_variant':{}}
        for v in ['append','prepend','owned_context','prevention']:
            ix=[i for i,x in enumerate(rows) if x['variant']==v];result['gates'][name]['by_variant'][v]=f.stats([rows[i] for i in ix],[scores[i] for i in ix],g)
        save(name+'-losses',[dict(x,scores=s['scores']) for x,s in zip(rows,scores) if x['label']==0 and f.removed(x,s,g)])
    save('result',result);print(json.dumps(result),flush=True)
if __name__=='__main__':main()
