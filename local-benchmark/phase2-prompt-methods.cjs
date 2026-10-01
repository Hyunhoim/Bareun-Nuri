const {contract}=require('../agent/src/core/judgment.cjs');
// Experimental definitions: no case text, identifiers, or gold-derived exceptions.
const SCOPE='이용권유=현재 게시자가 불법 거래나 서비스의 구매·판매·이용·가입·입금·연락을 실제로 권하거나 연결함(예: 사설 도박, 불법촬영물·비동의 성적 영상 유통, 마약류 불법 거래, 성매매 알선, 통장·계좌 불법 거래)';
const RELATION='\n혼합된 글의 판단: 경고·피해 경험을 언급하는 서두가 있더라도 현재 게시자가 뒤에서 실제 거래를 제안하거나 참여 방법을 안내하면 그 권유를 평가한다. 반대로 과거에 받은 판매 문구·거래 절차를 설명하며 도움을 요청하는 것은 현재의 판매 제안이 아니다. 짧은 제목·링크는 그 대상이 가리키는 자기 글의 목적과 함께 판단하되, 주변에 광고가 있다는 이유만으로 무관한 인사·메뉴·다른 작성자의 댓글에 광고 의도를 이전하지 않는다. 합법적 판매·성인이라는 표현·위험 단어의 존재만으로 불법 이용권유를 확정하지 않는다.';
function method(mode){const b=contract();if(mode==='A')return b;const old='이용권유=현재 게시자가 도박·불법 성인물 서비스의 실제 이용·가입·입금을 유도함';if(!b.SYSTEM.includes(old))throw Error('Baseline definition drift');const SYSTEM=b.SYSTEM.replace(old,SCOPE);if(!['S','R'].includes(mode))throw Error('Unknown method');return {...b,SYSTEM:SYSTEM+(mode==='R'?RELATION:'')};}
module.exports={method};
