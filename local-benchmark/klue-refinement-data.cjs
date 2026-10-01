const fs=require('node:fs'),assert=require('node:assert/strict'),crypto=require('node:crypto'),{contract}=require('../agent/src/core/judgment.cjs');
const old='.runtime/klue-pilot-v2',root='.runtime/klue-refinement-v1',read=p=>JSON.parse(fs.readFileSync(p)),sha=x=>crypto.createHash('sha256').update(x).digest('hex'),norm=x=>x.normalize('NFKC').replace(/[\u200b-\u200d\ufeff\s]/g,'');
assert(!fs.existsSync(root));fs.mkdirSync(root);const banned=new Set([...read(old+'/final-inputs.json'),...read(old+'/regression.json')].map(r=>norm(r.input.target))),sets={train:[],validation:[]},audit={excluded:0,replica:0};
function add(split,r){if(banned.has(norm(r.input.target))){audit.excluded++;return;}sets[split].push(r);}
for(const split of Object.keys(sets))for(const r of read(old+'/'+split+'.json'))add(split,{...r,source:'prior-'+split});
const trainOffers=['사설 홀짝 게임에 돈을 걸고 배당을 받으실 분','현금 환전 가능한 무허가 릴게임 회원 모집','사설 주사위 도박 사이트 유료 계정 판매','비동의 촬영 성인물을 돈을 받고 공유합니다','해외 불법 경륜 베팅방에서 판돈을 충전하세요','현금으로 승부하는 비인가 카드 내기 참가자 모집','불법 영상 구매 대금을 보내면 파일을 전송합니다','사설 승부 예측방에 입금한 뒤 베팅할 수 있습니다'];
const valOffers=['불법 온라인 복권 추첨에 현금을 내고 참가하세요','무허가 동전 맞히기 내기방에서 판돈을 받습니다','불법 유출 성인물의 다운로드 권한을 유상 판매합니다'];
for(const split of Object.keys(sets)){const offers=split==='train'?trainOffers:valOffers;for(let i=0;i<offers.length;i++)for(let j=0;j<12;j++){
 const o=offers[i],name=(split==='train'?'진달래':'수레국화')+String(j+1),cta=split==='train'?['쪽지로 거래하실 분을 받습니다.','가입 희망자는 운영자에게 연락 바랍니다.','첨부 주소에서 입금 절차를 진행하세요.'][j%3]:['이용할 분은 연결 양식에 신청해 주십시오.','진행을 원하면 계정을 등록해 주십시오.','대금 지불 후 담당자와 접속하십시오.'][j%3];
 const warning=split==='train'?['피해자가 제출한 증거를 옮긴 것입니다.','삭제한 게시물의 표현을 분석하고 있습니다.','단속 기관이 적발 사례로 제시한 문장입니다.','학교 미디어 수업에서 위험성을 설명하기 위한 예문입니다.'][j%4]:['민원 처리 결과에 첨부된 증거 문구입니다.','재발 방지 강연에서 문제 행위를 해설하는 자료입니다.','범죄 보도에서 독자에게 위험을 알리려 인용했습니다.'][j%3];
 const full=name+' '+o+'. '+cta,meta=split==='train'?['댓글 작성자','등록 날짜','게시판 번호','첨부파일 크기'][j%4]:['작성 부서','조회 횟수','화면 이동'][j%3],normal=split==='train'?['도서관 영상 감상 교육 참가자를 모집합니다.','체육공원 무료 풋살 교실 회원을 받습니다.','공공시설 사용료를 납부하면 강의실을 예약할 수 있습니다.'][j%3]:['구민 문화학교에서 영화 비평 강좌 접수를 받습니다.','공립 스포츠 교실의 정기 등록을 안내합니다.','복지관 교육 재료비를 납부하면 수업에 참가할 수 있습니다.'][j%3];
 const examples=[
 [full,'',0], [cta,o+'\n'+name,0],['“'+full+'”',cta,0],
 [full,warning,1],[full,warning+'\n해당 거래에 응하지 마십시오.',1],
 [full,'[다른 댓글] '+warning+'\n[현재 글] '+name+' 운영자가 남긴 접수 안내',0],
 [meta,'[본문] '+full+'\n[대상 위치] 게시물 정보 항목',2],
 [normal+' '+cta,'[다른 게시물] '+full,2],
 [normal+' '+cta,'',2],
 [split==='train'?'진행 가능합니다. 연락 주세요.':'원하는 분은 신청을 남겨 주세요.','',3],
 [cta,name+' 소통 마당',3],
 [full,warning+'\n[다른 댓글] '+cta,1]
 ];
 examples.forEach(([target,context,label],k)=>{const group=split+'-new-'+i+'-'+j,id='ref_'+sha(group+'-'+k).slice(0,16);add(split,{id,group,input:{target,context},label,source:'new-contrastive',family:i,role:k});});}}
// Real-page replica evidence, synthetic inserted content. Keep legacy normal labels partial.
const dir='.runtime/replica-intent-data-v1',e=read(dir+'/dev-evidence.json'),gold=read(dir+'/dev-labels.json');for(const l of gold){const c=e.candidates.find(c=>c.node_id===l.node_id);if(!c)continue;const x=contract().initialEvidence(c),r={id:c.node_id,group:'replica-'+l.source_id,input:{target:x.normalized_text,context:[x.page_title,...(c.context_evidence?.units||[]).filter(u=>u.relation!=='target'&&typeof u.text==='string').map(u=>(u.relation==='before'?'앞 문맥: ':'뒤 문맥: ')+u.text),c.nearby||''].filter(Boolean).join('\n')},label:l.is_ad===true?0:l.is_ad===false?-1:3,source:'real-dom-synthetic-injection',source_id:l.source_id};const n=sets.train.length;add('train',r);audit.replica+=sets.train.length-n;}
const seen=new Map();for(const split of Object.keys(sets)){const unique=[];for(const r of sets[split]){const h=sha(JSON.stringify(r.input));if(seen.has(h)){assert.equal(seen.get(h).split,split,'cross split leak');assert.equal(seen.get(h).label,r.label,'conflicting labels');continue;}seen.set(h,{split,label:r.label});unique.push(r);}sets[split]=unique;fs.writeFileSync(root+'/'+split+'.json',JSON.stringify(unique,null,2));}
const manifest={audit,counts:Object.fromEntries(Object.entries(sets).map(([s,rs])=>[s,{rows:rs.length,labels:rs.reduce((a,r)=>(a[r.label]=(a[r.label]||0)+1,a),{})}])),hashes:Object.fromEntries(['train','validation'].map(s=>[s+'.json',sha(fs.readFileSync(root+'/'+s+'.json'))]))};fs.writeFileSync(root+'/manifest.json',JSON.stringify(manifest,null,2));console.log(JSON.stringify(manifest));
