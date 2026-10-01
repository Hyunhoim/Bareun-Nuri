"""Recount raw batch JSON independently and compare predictions by frozen IDs."""
import json,hashlib,collections
from pathlib import Path
R=Path('.runtime/exaone-ft-batches-v1')
read=lambda p:json.loads(Path(p).read_text(encoding='utf8'))
def main():
    assert read(R/'completion.json')['status']=='completed'
    gold=read('.runtime/slm-three/inputs.json');manifest=read(R/'manifest.json')
    assert manifest['input_sha']==hashlib.sha256(Path('.runtime/slm-three/inputs.json').read_bytes()).hexdigest()
    assert manifest['adapter_sha']==hashlib.sha256(Path('.runtime/exaone-ft-v1/selected-adapter/adapter_model.safetensors').read_bytes()).hexdigest()
    expected={(r['panel'],r['id']):r for r in gold};predictions={};report={}
    for order in ['original','reverse']:
        for size in [1,4,8,12]:
            name=f'{order}-{size}';data=read(R/(name+'.json'));pred={}
            for request in data['records']:
                keys=['label'] if len(request['items'])==1 else list(map(str,range(len(request['items']))))
                raw=json.loads(request['raw']);assert list(raw)==keys
                assert [raw[k] for k in keys]==request['predictions']
                assert request['output_tokens']<512
                for row,p in zip(request['items'],request['predictions'],strict=True):
                    key=(row['panel'],row['id']);assert key not in pred;pred[key]=p
            assert pred.keys()==expected.keys();predictions[name]=pred
            counts=collections.Counter((r['label']==0,pred[k]==0) for k,r in expected.items() if r['label']!=3)
            tp,fp,fn=counts[True,True],counts[False,True],counts[True,False]
            f1=2*tp/(2*tp+fp+fn)
            assert abs(data['summary']['metrics']['f1']-f1)<1e-12
            single=predictions[f'{order}-1']
            report[name]={'f1':f1,'precision':tp/(tp+fp),'recall':tp/(tp+fn),'tp':tp,'fp':fp,'fn':fn,
               'seconds':data['summary']['seconds'],'human17_fp':data['summary']['human17_fp'],
               'lost_tp':sum(r['label']==0 and single[k]==0 and pred[k]!=0 for k,r in expected.items()),
               'recovered_fn':sum(r['label']==0 and single[k]!=0 and pred[k]==0 for k,r in expected.items()),
               'max_request_sec':max(x['seconds'] for x in data['records']),
               'max_output_tokens':max(x['output_tokens'] for x in data['records'])}
    for size in [1,4,8,12]:
        a=predictions[f'original-{size}'];b=predictions[f'reverse-{size}']
        report[f'order_changes-{size}']={'four_class':sum(a[k]!=b[k] for k in expected),'ad_binary':sum((a[k]==0)!=(b[k]==0) for k in expected)}
    old=read('.runtime/exaone-ft-v1/regression-after.json')['records']
    report['same_as_prior_single']=all(predictions['original-1'][r['panel'],r['id']]==r['prediction'] for r in old)
    (R/'independent-audit.json').write_text(json.dumps(report,ensure_ascii=False,indent=2),encoding='utf8')
    lines=['# EXAONE 튜닝 모델 묶음 비교','',
      '2026-09-29. 동일 epoch3 LoRA, RTX4060 BF16, 미병합 어댑터. 221개 전체를 원래 순서/패널 내 역순 각각 단일→4→8→12 순차 실행했다. 추가 학습·유료 API·운영 변경은 없다.',
      '', '|묶음|원래 F1|역순 F1|원래 시간|역순 시간|평균 시간|', '|---|---:|---:|---:|---:|---:|']
    for size in [1,4,8,12]:
        a,b=report[f'original-{size}'],report[f'reverse-{size}']
        lines.append(f"|{size}|{a['f1']:.2%}|{b['f1']:.2%}|{a['seconds']:.2f}초|{b['seconds']:.2f}초|{(a['seconds']+b['seconds'])/2:.2f}초|")
    lines+=['','## 정탐 손실과 순서 민감성','',
       '|묶음|원래 TP/FP/FN|역순 TP/FP/FN|단일 정탐 손실 원래/역순|4분류 변경|광고 여부 변경|',
       '|---|---|---|---|---:|---:|']
    for size in [1,4,8,12]:
        a,b,c=report[f'original-{size}'],report[f'reverse-{size}'],report[f'order_changes-{size}']
        lines.append(f"|{size}|{a['tp']}/{a['fp']}/{a['fn']}|{b['tp']}/{b['fp']}/{b['fn']}|{a['lost_tp']}/{b['lost_tp']}|{c['four_class']}/221|{c['ad_binary']}/221|")
    lines+=['','## 판정', '',
      '4·8·12개 중 단일의 F1과 처리시간을 동시에 개선한 조건은 없다. EXAONE 실험 기준선은 단일을 유지하며 묶음 확대는 미채택한다. HCX 운영도 변경하지 않는다.',
      '', '## 해석과 측정 경계','',
      '- F1은 221개 중 근거 부족37개를 제외한 확정184개(광고64/정상120)의 광고 이진F1이다. 실제 정상17개도 포함한다. 이전204개 전용 점수와 혼용하지 않는다. 근거 부족의 광고 오판은 raw report의 uncertain_as_ad로 별도 보존했다.',
      '- 4종 기법/위치 점수가 아니라 의미 판정 점수다. 기존에 관찰한 회귀 자료의 비교이며 새 홀드아웃이 아니다.',
      '- 모든 조건 221개 판정 완료, 출력 잘림/형식 오류0. 입력을 자르지 않았다. 모델 입력·가중치 해시를 고정하고 원출력 JSON과 ID별 판정을 독립 재집계했다.',
      '- 단일도 현재 실행에서 새로 측정했다. 원래/역순 단일 결과는 기존 튜닝 평가와 같은 판정을 재현했다. 모델 로딩과 최초 워밍업은 시간에서 제외했다.',
      '- 묶음은 여러 대상을 하나의 user 메시지에 넣고 ID별 결과를 생성하는 논리적 묶음이다. 프롬프트의 의미 정의는 유지했지만 출력 계약을 바꿨으므로 순수 묶음 크기 효과와 형식 전환 효과를 분리하지 못한다. 단일 형식으로만 학습한 모델의 한계가 가능한 원인이며 입증된 단독 원인은 아니다.',
      '- 단일 꼬리 요청은 기존 label 형식을 사용했다. 모든 조건 출력 상한512, 동일 constrained greedy decoding, 캐시를 요청 간 재사용하지 않는다. 입력+출력 안전 상한8192 안에서 전체 입력을 보존했다.',
      '- 원래 순서에서 단일 최장 요청1.10초, 4개28.89초, 8개90.71초가 관찰됐다. 긴 문맥 결합에서 메모리 부담과 지연 증가가 동반됐다. PyTorch 논리적 최대 할당과 실제 전용 VRAM 점유를 같은 수치로 해석하지 않는다. 공유 메모리 이동/커널별 시간을 별도 프로파일링하지 않았으므로 지연 원인을 하나로 확정하지 않는다.',
      '- 두 순서 각각1회이며 실행 순서를 교차 무작위화하지 않았다. GPU 부하·메모리 캐시·긴 꼬리 지연의 영향을 완전히 통제하지 못했으므로 특정 속도 배수를 일반화하지 않는다. 역순에서는 일부 패널의 나머지 묶음 구성도 달라진다.',
      '- 다음 후보는 문맥을 합치지 않고 개별 프롬프트를 독립적으로 유지하는 GPU 텐서 배치다. 이번에는 미실험이며 정확도·메모리·속도 이득을 보장하지 않는다. CPU/Q4 배포 성능도 이번 결과로 추정하지 않는다.',
      '', '## 재현 파일','',
      '`local-benchmark/exaone-ft-batches.py`, `local-benchmark/exaone-ft-batches-audit.py`. 원본·manifest·report·조건별 JSON은 `.runtime/exaone-ft-batches-v1/`에 있다. 재집계 명령:',
      '', '```powershell', '.runtime/klue-venv/Scripts/python.exe -X utf8 local-benchmark/exaone-ft-batches-audit.py', '```']
    Path('docs/exaone-ft-batches-report.md').write_text('\n'.join(lines)+'\n',encoding='utf8')
    print(json.dumps(report,ensure_ascii=False,indent=2))
if __name__=='__main__':main()
