import type {Job,Finding} from './api';
// Opt-in demo only: no network calls and no measured-performance claims.
const samples:Finding[]=[
{id:'demo-1',technique:'HOMOGLYPH',evidence_text:'[가상 예시] CΑSΙNΟ 신규 가입 및 충전 혜택 안내',url:'https://public.example/board/108',location:'게시글 본문 · article > p:nth-child(2)'},
{id:'demo-2',technique:'JAMO',evidence_text:'[가상 예시] ㅋㅏㅈㅣㄴㅗ 가입 상담, 현금 충전 안내',url:'https://public.example/board/112',location:'댓글 · #comments > li:nth-child(3)'},
{id:'demo-3',technique:'TRANSPARENT',evidence_text:'[가상 예시] 사설 도박방 가입 및 입금 상담',url:'https://public.example/community/36',location:'본문 · .post-body > span'},
{id:'demo-4',technique:'OFFSCREEN',evidence_text:'[가상 예시] 현금 배팅 입장, 신규 회원 모집',url:'https://public.example/notice/24',location:'댓글 · iframe[0] > .comment'},
{id:'demo-5',technique:'HOMOGLYPH',evidence_text:'[가상 예시] ВΟNUS 첫 충전 적용, 가입창 문의',url:'https://public.example/board/116',location:'게시글 제목 · h2'},
{id:'demo-6',technique:'JAMO',evidence_text:'[가상 예시] ㅌㅗㅌㅗ 현금방 신규 가입 안내',url:'https://public.example/board/128',location:'게시글 본문 · article > p'}];
export const demoJob:Job={id:'design-demo',url:'https://public.example',provider:'mock',maxPages:200,maxNodes:0,maxCalls:600,timeoutSeconds:1500,status:'running',phase:'scanning',pages:32,candidates:864,processed:612,calls:51,elapsedSec:426,segmentElapsedSec:426,startedAt:'2026-10-01T09:00:00+09:00',updatedAt:'2026-10-01T09:07:06+09:00',result:{meta:{demo:true},findings:samples.slice(0,4)}};
export const demoSeries=[0,28,54,103,164,199,272,301,392,438,501,562,612].map((processed,i)=>({time:`${Math.floor(i*35/60).toString().padStart(2,'0')}:${(i*35%60).toString().padStart(2,'0')}`,processed}));
export function advanceDemo(job:Job):Job{const processed=Math.min(job.candidates,job.processed+12),elapsed=(job.elapsedSec??0)+1;return {...job,processed,elapsedSec:elapsed,segmentElapsedSec:elapsed,calls:job.calls+1,pages:Math.min(44,32+Math.floor((processed-612)/24)),status:processed===job.candidates?'completed':'running',result:{meta:{demo:true},findings:samples.slice(0,processed>=816?6:processed>=708?5:4)}};}
