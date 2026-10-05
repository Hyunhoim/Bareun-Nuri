import {useEffect,useRef,useState} from 'react';
import {AnimatePresence,motion,useReducedMotion} from 'motion/react';
import {terminal,type Job} from './api';
export default function MonitorStatus({job,connected,demo}:{job:Job|null;connected:boolean;demo:boolean}){
 const reduced=useReducedMotion();
 const count=job?.findingLocations??new Set((job?.result?.findings??[]).map(f=>JSON.stringify([f.url,f.location]))).size;
 const previous=useRef<{id:string;segment:number;count:number;status:string}|null>(null);
 const [notice,setNotice]=useState<{count:number;at:number}|null>(null);
 useEffect(()=>{
  const old=previous.current;const next=job?{id:job.id,segment:job.segmentNumber??1,count,status:job.status}:null;
  if(!next||!old||old.id!==next.id||old.segment!==next.segment||terminal(next.status)||terminal(old.status)||!connected){setNotice(null);}
  else if(count>old.count){setNotice({count:count-old.count,at:Date.now()});}
  previous.current=next;
 },[job?.id,job?.segmentNumber,job?.status,count,connected]);
 useEffect(()=>{if(!notice)return;const timer=setTimeout(()=>setNotice(null),4500);return()=>clearTimeout(timer);},[notice]);
 const reason=job?.reason||job?.coverage?.reason||'';
 let message='검사할 웹사이트를 입력해 주세요';
 if(job){
  if(!connected)message='연결을 확인하고 있어요. 마지막 상태를 표시해요';
  else if(job.status==='completed')message='검사가 완료되었어요';
  else if(job.status==='completed_with_warnings')message='검사가 끝났어요. 확인이 필요한 결과가 있어요';
  else if(terminal(job.status)){
   if(job.closed)message='검사를 종료했어요. 저장된 결과를 확인해 주세요';
   else if(reason==='user_pause')message='검사 내용을 저장하고 일시 중지했어요';
   else if(/time_budget|time_limit|timeout/i.test(reason))message='제한 시간에 도달해 검사가 중단되었어요';
   else if(job.status==='failed')message='검사 중 오류가 발생했어요';
   else if(job.status==='cancelled'||/Cancelled by user/i.test(reason))message='요청에 따라 검사를 중단했어요';
   else if(reason==='page_budget')message='페이지 한도에 도달해 검사가 중단되었어요';
   else if(reason==='call_budget')message='API 호출 한도에 도달해 검사가 중단되었어요';
   else message='검사가 중단되었어요. 부분 결과를 확인해 주세요';
  }else if(job.pauseRequested)message='현재 작업을 저장한 뒤 일시 중지하고 있어요';
  else if(job.cancelRequested)message='중단 요청을 처리하고 있어요';
  else if(notice)message=`${demo||job.provider==='mock'?'예시 광고':'AI가 새로운 광고'} ${notice.count}건을 발견했어요`;
  else if(job.status==='queued'||job.phase==='queued')message='검사를 준비하고 있어요';
  else if(job.phase==='collecting')message='페이지를 수집하고 있어요';
  else if(job.phase==='judging')message=job.provider==='mock'?'모의 판정을 진행하고 있어요':'AI가 광고를 탐색하고 있어요';
  else message='페이지 수집과 광고 검사를 진행하고 있어요';
 }
 const discovery=!!notice&&!!job&&!terminal(job.status)&&connected&&!job.cancelRequested&&!job.pauseRequested;
 return <div className={`monitor-status ${discovery?'is-discovery':''}`} aria-live="polite" aria-atomic="true" data-testid="monitor-status"><AnimatePresence mode="wait" initial={false}><motion.h3 key={message} initial={reduced?false:{opacity:0,y:7}} animate={{opacity:1,y:0}} exit={reduced?{opacity:1}:{opacity:0,y:-5}} transition={{duration:reduced?0:.18}}>{message}</motion.h3></AnimatePresence></div>;
}
