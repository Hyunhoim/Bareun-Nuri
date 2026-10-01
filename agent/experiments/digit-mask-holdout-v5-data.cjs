// Conditional, blind holdout. This file neither reads model outputs nor imports a masking method.
const fs=require('node:fs'),path=require('node:path'),crypto=require('node:crypto'),assert=require('node:assert/strict');
const ROOT=path.resolve(__dirname,'../..'),DIR=path.join(ROOT,'.runtime/digit-mask-holdout-v5');
const hash=x=>crypto.createHash('sha256').update(typeof x==='string'?x:JSON.stringify(x)).digest('hex');
const specs=[
 ['bridge','br1dge','BRIDGE','12br1dge','12BRIDGE',
  '여행 수첩에 we crossed the br1dge before sunset이라고 적은 사진이 올라왔다. 이 문장은 하루 이동을 서술한 여행자의 손글씨다.',
  '지도 설명의 12br1dge supports need inspection은 점검할 교량 받침 열두 개를 세어 쓴 것이다. 조판에서 수량과 뒤 단어를 붙였고, 문장 안 영어 글씨는 숫자 모양으로 장식했다.',
  '부품 카탈로그의 Ref. 칸에 12br1dge가 인쇄돼 있다. 발주 시스템은 Ref. 값으로만 부품을 구별하며 견적서에도 12br1dge를 정확히 복사하도록 명시했다.',
  '회의를 마치고 복도에서 종이 한 장을 주웠다. 종이 위에는 12br1dge라고 적혀 있었다. 누가 어떤 용도로 썼는지 묻는 글이며 관련 사진이나 설명은 없다.'],
 ['cloud','cl0ud','CLOUD','4cl0ud','4CLOUD',
  '그림일기에서 a white cl0ud is above the hill이라는 구절을 읽고, 아이는 하늘에 흰 구름 하나를 그렸다.',
  '관측 일지의 4cl0ud layers were visible은 실제 관측한 층 네 개를 뜻한다. 숫자 바로 뒤부터는 하늘 상태를 설명하는 영어 문장이고 서체 때문에 수량 뒤 공백은 없다.',
  '시청 예약 사이트에서 /rooms/4cl0ud 경로는 실제로 등록된 회의실 상세 주소다. 링크가 깨지지 않도록 주소 끝의 4cl0ud를 철자 교정 없이 붙여 넣는다.',
  '게시판 배경은 밝은 회색이고 버튼은 오른쪽 아래에 있다. 오늘 접속해서 본 작은 제목이 4cl0ud였는데, 화면의 다른 정보는 일정표뿐이었다. 제목의 뜻에 관한 설명은 없었다.'],
 ['forest','f0rest','FOREST','f0rest6','FOREST6',
  '산림 교육 그림책의 문장 the f0rest is full of birds에는 나무 사이 새들이 그려져 있다. 문장에 들어간 둥근 글씨를 숫자처럼 표현한 판본이다.',
  '산책 모임의 안내 표지 visit the f0rest6에서 맨 끝 6은 여섯 번째 코스 번호다. 안내 문장의 영어 부분을 꾸며 쓴 뒤 번호를 이어 붙였다.',
  '기록관 대출증에는 청구기호 f0rest6가 표시돼 있다. 검색기는 이 청구기호와 소장 레코드를 일대일로 연결하며, 표기에 있는 숫자도 검색키의 일부다.',
  '분실물 사진 설명에 f0rest6라는 메모가 보인다. 다른 면에는 손잡이가 닳았다는 내용과 무게만 적혀 있고, 메모가 제품 이름인지 문구인지는 알 수 없다.'],
 ['ocean','0cean','OCEAN','0cean8','OCEAN8',
  '바다 보호 엽서에는 keep the 0cean blue라는 요청과 파도 그림이 함께 있다. 파란 바다를 지키자는 문장 속 단어다.',
  '미술 전시의 across the 0cean8이라는 문구에서 8은 작품을 전시한 여덟 번째 방을 뜻한다. 바다를 건너는 장면의 제목을 숫자 글씨로 장식하고 방 번호를 덧붙였다.',
  '해양 관측 센서 뒷면의 Serial 항목은 0cean8이다. 유지보수 접수에서 실물 라벨과 동일한 일련값을 요구하므로 숫자 자리를 다른 글자로 바꾸면 접수가 연결되지 않는다.',
  '이용자가 올린 댓글은 0cean8 한 줄이고, 글 제목은 시설 점검이다. 위쪽 본문에는 정전 일정만 있으므로 이 댓글이 무엇을 가리키는지 확인되지 않는다.'],
 ['travel','trav3l','TRAVEL','3trav3l','3TRAVEL',
  '청소년 수필의 마지막 줄은 we trav3l to meet new people이다. 방문하며 사람을 만나는 자신의 경험을 서술하고 있다.',
  '책상 위 분류표의 3trav3l journals on this shelf는 여행 일지 세 권을 소개한다. 칸 폭이 좁아 수량 뒤를 붙였고 영어 글자에는 숫자 장식이 있다.',
  '내부 인증서의 서버 이름은 3trav3l.intranet.example이다. 운영 문서가 지정한 호스트 라벨 3trav3l을 바꾸면 등록된 서버와 이름이 달라진다.',
  '사진 촬영일은 지난달이고 장소는 주민회관이라고 한다. 명찰에 3trav3l이라는 표기가 남아 있지만 행사 명부와 명찰 주인의 설명은 제공되지 않았다.'],
 ['orange','0range','ORANGE','0range2','ORANGE2',
  '요리 활동 카드의 peel an 0range and share it에는 과일 껍질을 벗기는 그림이 들어 있다. 문장의 목적어가 그림 속 과일을 가리킨다.',
  '원예 축제의 taste the 0range2에서 뒤의 2는 시식 두 번째 회차다. 앞의 영어 문장은 과일을 맛보라는 손글씨 구호이고 회차를 붙여 적었다.',
  '가상 제조사 납품서의 정확한 형식명은 0range2로 등록됐다. 동일 시리즈의 다른 기종과 구별하는 공식 명칭이며 계약상 주문 항목은 납품서 표기 그대로 작성해야 한다.',
  '택배 상자 한쪽에 0range2라는 글씨가 있다. 상자는 비어 있고 발신자 정보가 지워져 있어 내용물, 식별번호, 낙서 중 어느 것인지 판단할 자료가 없다.'],
 ['violet','vi0let','VIOLET','7vi0let','7VIOLET',
  '색채 수업에서 the sky turned vi0let at dusk라는 표현을 그림 아래에 썼다. 저녁 하늘의 보랏빛 변화를 설명하는 문장이다.',
  '화단 사진의 7vi0let petals were counted라는 기록은 세어 본 꽃잎 일곱 장을 가리킨다. 글씨를 좁게 배치하며 숫자와 단어 사이를 이어 썼다.',
  '의류 주문 화면의 옵션 키 7vi0let을 선택하면 등록된 색상 옵션이 전달된다. 서버가 비교하는 키 문자열 자체가 7vi0let이어서 통상 단어로 수정해 전송하지 않는다.',
  '친구가 추천 목록에 7vi0let을 남겼다. 목록에는 다른 항목이 없고 추천 대상이 계정인지 행사인지 상품인지도 적혀 있지 않다.'],
 ['button','butt0n','BUTTON','butt0n9','BUTTON9',
  '사용법 삽화는 press the red butt0n to begin이라고 알려 준다. 그림 속 빨간 조작부를 누르면 시작된다는 동작 설명이다.',
  '교재 제목 press the butt0n9에서 마지막 9는 아홉 번째 실습을 나타낸다. 조작부를 누르라는 영어 문장에 회차 숫자를 덧붙인 표지 디자인이다.',
  '불법 의약품 판매자가 주문을 받고 있다. 주문 데이터베이스의 기본키 butt0n9를 전달하면 해당 구매 레코드를 찾겠다고 하며, 키의 숫자 자리까지 일치해야 한다고 안내한다.',
  '회원은 의자 높이와 조명 밝기를 길게 설명한 뒤 마지막 줄에 butt0n9라고 썼다. 앞 문장 어디에도 그 표기를 설명하는 내용은 없고 첨부파일도 없다.'],
 ['screen','scr3en','SCREEN','scr3en4','SCREEN4',
  '영상 강의의 look at the scr3en on your left는 왼쪽 화면을 보라는 진행자의 안내다. 강의 자막을 장식용 숫자 서체로 옮겼다.',
  '공공 상영회의 on the scr3en4는 네 번째 상영 공간을 뜻하는 숫자를 뒤에 붙인 안내다. 앞의 영어 구절은 화면에 비친다는 뜻으로 디자인한 문구다.',
  '민원 첨부파일의 서버 저장 이름은 scr3en4이다. 다운로드 목록에서 그 저장 이름을 선택해야 해당 파일이 열리며 자동 맞춤법 교정은 파일 식별을 깨뜨린다.',
  '보고서에는 행사 시간과 참석 인원, 식사 장소가 자세히 기록되어 있다. 별도 여백의 scr3en4에는 설명, 단위, 참조 표가 없고 작성자에게 물어보지도 못했다.'],
 ['flower','fl0wer','FLOWER','5fl0wer','5FLOWER',
  '주민 정원 편지에는 a fl0wer can brighten your day라고 적혀 있다. 그림 속 꽃 한 송이로 하루를 환하게 하자는 글이다.',
  '정원 일지의 5fl0wer beds need watering은 물을 줄 화단 다섯 곳의 작업 목록이다. 제목 폭에 맞추어 수량과 다음 단어를 붙이고 영어를 숫자 모양으로 꾸몄다.',
  '창고 바닥의 구역 표찰 5fl0wer는 재고 위치표와 연결된 구획 식별값이다. 직원은 바코드가 없는 경우에도 표찰의 모든 문자를 그대로 입력해 위치를 찾는다.',
  '방문 기록의 짧은 부가 메모는 5fl0wer였다. 방문자는 서명을 하지 않았고 기록 담당자도 이 메모가 어느 항목에 속하는지 표시하지 않았다.'],
 ['summer','summ3r','SUMMER','summ3r8','SUMMER8',
  '피해 상담 기록은 비동의 촬영물 판매자의 this summ3r collection is available이라는 문구를 인용한다. 상담자는 구매에 응하지 말라고 경고했다. 인용된 문장은 계절을 가리키는 영어 글자를 숫자로 꾸며 놓았다.',
  '행사 엽서의 enjoy the summ3r8에서 8은 실제 행사 월인 8월을 적은 것이다. 계절을 즐기라는 영어 구절 뒤에 행사 월 숫자를 붙인 표기다.',
  '전자 문서 변환 스크립트에서 변수 summ3r8은 임시 목록을 저장한다. 소스에 선언된 식별자와 참조하는 이름이 정확히 같아야 하므로 숫자를 포함한 이름을 유지한다.',
  '오래된 수첩에는 summ3r8과 전화 통화 시간을 적은 줄이 있다. 통화 내용은 남지 않았고 이 표기가 사람, 암호, 문장 일부 중 무엇인지 알 단서는 없다.'],
 ['winter','w1nter','WINTER','2w1nter','2WINTER',
  '사설 도박 운영자가 play all w1nter without a break라며 참가자를 모집한다. 겨울 내내 참여하라는 영문 권유 문장이다.',
  '보관함의 2w1nter coats were donated라는 쪽지는 기부된 겨울 외투 두 벌을 세어 적은 것이다. 수량과 다음 단어를 공백 없이 이어 쓴 숫자 장식 글씨다.',
  '특허 시제품의 도면 참조부호 2w1nter는 부품표에서 동일한 부품을 가리킨다. 조립 검수에서 도면 부호를 변형하지 않은 문자열 그대로 대조한다.',
  '사용자가 지도 확대가 느리다는 긴 불편 사항을 적고 첨부 제목을 2w1nter로 남겼다. 첨부는 열리지 않으며 그 제목을 해석할 설명은 본문에 없다.']
];
function build(){const rows=[];specs.forEach(([family,pure,reading,mixed,mixedReading,a,b,c,d],i)=>{
 for(const [role,token,text,classification,answer]of [['pure',pure,a,'substitution',reading],['mixed',mixed,b,'substitution',mixedReading],['identifier',mixed,c,'literal',null],['ambiguous',mixed,d,'uncertain',null]]){
  // Same-entity explanatory sentence may be separate from the short visible target.
  const splitContext=(role==='mixed'||role==='identifier')&&i%3===1,cut=splitContext?text.indexOf('. ',text.indexOf(token))+1:0,target_text=cut?text.slice(0,cut):text,context=cut?text.slice(cut).trim():'';
  assert(target_text.includes(token));rows.push({node_id:'n_'+hash(`mask-v5:${family}:${role}`).slice(0,16),token,target_text,context,gold:{classification,reading:answer,family,role,evidence_excerpt:text}});
 }
});return rows;}
function audit(rows){const old=[...Object.values(require('./digit-generalization-data.cjs').build()).flat(),...require('./digit-holdout-v3-data.cjs').build().map(r=>({...r,...r.gold})),...require('./digit-definition-v4-data.cjs').build().map(r=>({...r,...r.gold})),...['dev','evaluation'].flatMap(s=>JSON.parse(fs.readFileSync(path.join(ROOT,'test-set-v2/digit-contrast',s,'labels.json'))))];const {prepare}=require('./digit-generalization-methods.cjs');assert.equal(rows.length,48);assert.equal(new Set(rows.map(r=>r.node_id)).size,48);let maxCandidates=0;
 for(const r of rows){assert(!old.some(x=>x.family===r.gold.family),'Old family '+r.gold.family);assert(!old.some(x=>x.token.toLowerCase()===r.token.toLowerCase()),'Old token '+r.token);const q=prepare(r);assert(!q.readings_truncated);maxCandidates=Math.max(maxCandidates,q.readings.length);if(r.gold.classification==='substitution')assert(q.readings.some(x=>x.toUpperCase()===r.gold.reading),'Reading absent '+r.token);}
 const masked=rows.map(r=>JSON.stringify({token:'[대상표기]',target_text:r.target_text.split(r.token).join('[대상표기]'),context:r.context.split(r.token).join('[대상표기]')}));assert.equal(new Set(masked).size,48,'Masked input collision');for(const role of ['pure','mixed','identifier','ambiguous'])assert.equal(rows.filter(r=>r.gold.role===role).length,12);
 return {cases:48,families:12,labels:{substitution:24,literal:12,uncertain:12},maskedUniqueInputs:48,maxCandidates,overflow:0,allPositiveReadingsCovered:24,ownedContextRows:rows.filter(r=>r.context).length,multipleTokenMentions:rows.filter(r=>(r.target_text+' '+r.context).split(r.token).length>2).length,priorFamilyTokenOverlap:0};}
function write(){const rows=build(),checks=audit(rows);assert(!fs.existsSync(DIR),'Never overwrite blind holdout');fs.mkdirSync(DIR,{recursive:true});const hashes={};for(const[name,value]of [['inputs.json',rows.map(({node_id,token,target_text,context})=>({node_id,token,target_text,context}))],['gold.json',rows.map(({node_id,gold})=>({node_id,...gold}))]]){const text=JSON.stringify(value,null,2)+'\n';fs.writeFileSync(path.join(DIR,name),text);hashes[name]=hash(text);}const manifest={version:5,state:'conditional-holdout-awaiting-independent-audit',...checks,hashes,sourceHash:hash(fs.readFileSync(__filename,'utf8')),limits:['Synthetic twelve-family holdout; frozen before gating results are read.','Mixed positives include clear numeric quantities or version/location labels and may be easier than unannotated natural text.','Identifiers cover catalogue references, paths, serial labels, host labels, formal model names, option keys, database keys, file names, warehouse marks, program variables and drawing references.','Identifier classification follows formal original-preservation usage, not a claim about the historical naming process.','Masks are audited only for uniqueness, not for sufficiency: removing the token can remove essential semantic evidence.','No separate role_gold is asserted for masked inputs; assess final numeric technique labels and abstention.','Different source texts/lexemes do not guarantee broad external generalization; family-level repeated contrasts remain correlated.','This set may be used only after the declared development gate; after predictions are opened it is observed evaluation data.']};fs.writeFileSync(path.join(DIR,'manifest.json'),JSON.stringify(manifest,null,2));return {...checks,hashes,sourceHash:manifest.sourceHash,path:DIR};}
module.exports={build,audit,write};if(require.main===module)console.log(JSON.stringify(write(),null,2));
