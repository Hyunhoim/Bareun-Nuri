// Evaluator-owned fresh text contrasts; these are supplied-evidence tests, not collected DOM claims.
const crypto=require('node:crypto');
function fresh(){const candidates=[],labels=[];
 const scenarios=[
 ['지하 현금 주사위판 참가금을 받습니다.','불법 도박 유인문을 옮긴 상담 자료입니다.','이 요구를 거절하는 방법을 토론합니다.','제가 운영하는 불법 도박방의 모집 공지입니다.','참가비를 송금할 분은 연락하세요.'],
 ['촬영 동의 없는 성인 영상을 결제 후 보내 드립니다.','피해자가 제출한 판매 메시지를 교육 자료로 인용합니다.','구매를 권하지 않으며 삭제 절차를 설명합니다.','제가 판매하는 불법 촬영 성인 자료의 거래 조건입니다.','구매자는 입금 후 받을 주소를 남기세요.'],
 ['사설 현금 카드게임 신규 등록','범죄 신고서의 증거 제목입니다.','제보자가 해당 영업을 중단시켜 달라고 요청했습니다.','제가 여는 무허가 도박장의 가입 창구입니다.','판돈을 보낼 이용자를 모집합니다.'],
 ['비동의 성인 촬영물 유료 전송','기자가 피해 사례에서 발견한 항목을 보도합니다.','이 자료는 차단돼야 한다는 취지입니다.','제가 제공하는 불법 성인 자료의 판매 항목입니다.','전송 대금을 결제하면 파일을 받습니다.']
 ];
 function add(raw,before,after,expected,nearby,mode='complete'){
  const node_id='n_'+crypto.createHash('sha256').update('scope-fresh-'+candidates.length).digest('hex').slice(0,16);
  const units=[...(before?[{relation:'before',text:before}]:[]),{relation:'target'},...(after?[{relation:'after',text:after}]:[])];
  candidates.push({node_id,raw_text:raw,normalized_text:raw,page_title:'주민 소통',links:[],nearby,signals:[],context_evidence:{scope:{tag:'article',document_scope:mode==='document'},target_quoted:false,truncated:mode==='truncated',units}});
  labels.push({node_id,is_ad:expected,scenario:mode});
 }
 for(const [raw,warning,end,offer,action]of scenarios){
  add(raw,warning,end,false,{before:offer,after:action});
  add(raw,offer,action,true,{before:warning,after:end});
  add('접수 진행',offer,action,true,{before:warning});
  add('안내 담당자',offer,action,false,{after:raw});
  add('내역 확인',warning,end,false,{after:offer},'truncated');
  add(raw,offer,action,true,{before:warning},'document');
 }
 return {name:'fresh',labels,snapshot:{candidates}};
}
module.exports={fresh};
