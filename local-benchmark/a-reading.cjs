// Experimental input only: preserve original evidence and all production normalizers.
const {normalizeText}=require('../agent/src/core/jamo.cjs');
function reading(text){
 if(typeof text!=='string')throw new TypeError('text must be a string');
 return text.replace(/[\u1100-\u1112\u1161-\u1175\u11a8-\u11c2\u3131-\u3163]+(?: [\u1100-\u1112\u1161-\u1175\u11a8-\u11c2\u3131-\u3163]+)+/gu,run=>{
  const joined=normalizeText(run.replaceAll(' ',''));
  return /^[가-힣]{2,}$/u.test(joined)?joined:run;
 });
}
module.exports={reading};
if(require.main===module){
 const a=require('node:assert/strict');
 for(const word of ['도서관','박물관','현금','법률상담','접수','시민의견']){
  const letters=[...word.normalize('NFD')];
  for(let stride=1;stride<=3;stride++){
   const chunks=[];for(let i=0;i<letters.length;i+=stride)chunks.push(letters.slice(i,i+stride).join(''));
   a.equal(reading(chunks.join(' ')),word);
  }
 }
 for(const x of ['ㄱ ㄴ ㄷ','ㄱ ㅏ','한글 수업 ㄱ + ㅏ = 가','ㅋㅋ ㅎㅎ','ㅇ ㅏ\nㄴ ㄴ ㅐ','A14 2026','안녕하세요'])a.equal(reading(x),x);
 a.equal(reading('ㅎ ㅕ ㄴㄱ ㅡ ㅁ'),'현금');console.log('PASS: 18 neutral-word splits and 8 preservation/recovery checks');
}
