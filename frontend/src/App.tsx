import { useEffect, useState } from 'react';
import { api, terminal, type Job, type ScanRequest } from './api';
const statuses:Record<string,string>={queued:'준비 중',running:'검사 중',completed:'완료',completed_with_warnings:'완료 · 확인 필요',failed:'실패',cancelled:'중단됨',interrupted:'실행 중단'};
const phases:Record<string,string>={queued:'작업 준비',collecting:'페이지 수집',judging:'광고 판정',finished:'처리 종료'};
const techniques:Record<string,string>={HOMOGLYPH:'닮은꼴 문자',JAMO:'자모 분해',TRANSPARENT:'투명 텍스트',OFFSCREEN:'화면 밖 은닉'};
const safeUrl=(url:string)=>/^https?:\/\//i.test(url)?url:undefined;
export default function App(){
  const [request,setRequest]=useState<ScanRequest>({url:'http://127.0.0.1:8765/dev/',provider:'mock',maxPages:40,maxNodes:1000,maxCalls:220,timeoutSeconds:1800});
  const [jobs,setJobs]=useState<Job[]>([]),[selected,setSelected]=useState(''),[job,setJob]=useState<Job|null>(null);
  const [error,setError]=useState(''),[connected,setConnected]=useState(false),[busy,setBusy]=useState(false);
  useEffect(()=>{
    const controller=new AbortController();let timer:ReturnType<typeof setTimeout>;
    async function poll(){try{
      await api('/health',undefined,controller.signal);const list=await api<Job[]>('/jobs',undefined,controller.signal);
      setConnected(true);setJobs(list);
      const id=selected||list[0]?.id;
      if(id)setJob(await api<Job>('/jobs/'+id,undefined,controller.signal));else setJob(null);
    }catch(e){if(!controller.signal.aborted){setConnected(false);setError((e as Error).message);}}
    finally{if(!controller.signal.aborted)timer=setTimeout(poll,1000);}}
    void poll();return()=>{controller.abort();clearTimeout(timer);};
  },[selected]);
  const active=jobs.some(j=>!terminal(j.status));
  async function start(e:React.FormEvent){e.preventDefault();setError('');setBusy(true);
    try{const created=await api<Job>('/jobs',request);setJobs(old=>[created,...old]);setSelected(created.id);setJob(created);}
    catch(e){setError((e as Error).message);}finally{setBusy(false);}}
  async function cancel(){if(!job)return;setError('');try{setJob(await api<Job>(`/jobs/${job.id}/cancel`,{}));}catch(e){setError((e as Error).message);}}
  return <><header><div className="brand">PUBLIC WEB INSPECTOR <span>개발 베이스라인</span></div><span className={connected?'online':'offline'}>{connected?'● 백엔드 연결됨':'○ 연결 확인 중'}</span></header>
  <main><section className="intro"><p className="eyebrow">공공 웹사이트 점검</p><h1>광고를 찾고, 근거를 확인하세요.</h1><p>시작 URL에서 하위 페이지와 댓글·iframe을 탐색합니다.</p></section>
  {error&&<div role="alert" className="error">{error}</div>}
  <div className="layout"><aside><section className="card"><h2>새 검사</h2><form onSubmit={start}>
    <label htmlFor="url">시작 URL</label><input id="url" type="url" required maxLength={2048} value={request.url} onChange={e=>setRequest({...request,url:e.target.value})}/>
    <label htmlFor="provider">판정 모드</label><select id="provider" value={request.provider} onChange={e=>setRequest({...request,provider:e.target.value as 'hcx'|'mock'})}><option value="mock">연결 확인 (Mock · API 비용 없음)</option><option value="hcx">실제 검사 (HCX-007 · API 사용)</option></select>
    <p className="hint">{request.provider==='mock'?'Mock은 화면과 실행 흐름 확인용입니다. 실제 탐지 성능을 나타내지 않습니다.':'서버의 .env에 등록된 키로 호출합니다. 호출에 따른 API 비용이 발생합니다.'}</p>
    <details><summary>실행 한도</summary><div className="limits">
    {([['maxPages','최대 페이지',200],['maxNodes','최대 텍스트 후보',10000],['maxCalls','최대 API 호출',300],['timeoutSeconds','제한 시간 (초)',1800]] as const).map(([field,label,max])=><label key={field}>{label}<input type="number" min={1} max={max} required value={request[field]} onChange={e=>setRequest({...request,[field]:Number(e.target.value)})}/></label>)}
    </div><p className="hint">현재는 한도 초과 시 실패로 종료합니다. 중단 지점에서 이어서 검사는 아직 지원하지 않습니다.</p></details>
    <button className="primary" disabled={busy||active||!connected}>{busy?'시작 중…':active?'진행 중인 검사 있음':'검사 시작'}</button>
  </form></section><section className="card"><h2>검사 이력 <small>{jobs.length}</small></h2><div className="history">{jobs.length?jobs.map(item=><button key={item.id} className={job?.id===item.id?'history-item selected':'history-item'} onClick={()=>{setSelected(item.id);setError('');}}><strong>{statuses[item.status]||item.status}</strong><span>{item.provider==='hcx'?'HCX-007':'Mock'} · {new Date(item.startedAt).toLocaleString('ko-KR')}</span><span className="truncate">{item.url}</span></button>):<p className="hint">아직 검사 이력이 없습니다.</p>}</div></section></aside>
  <section className="card result-panel"><div className="section-title"><h2>검사 결과</h2>{job&&<span className="badge" data-testid="job-status">{statuses[job.status]||job.status}</span>}</div>
  {!job?<div className="empty"><div className="empty-icon">◎</div><h3>첫 검사를 시작하세요</h3><p>페이지 탐색 현황과 탐지 근거를 이곳에서 확인할 수 있습니다.</p></div>:<>
    <p className="job-url">{job.url}</p><p className="mode-note">{job.provider==='mock'?'MOCK · 연결 검증 결과이며 실제 정확도 평가에 사용할 수 없습니다.':'HCX-007 · 실제 API 판정'}</p>
    <div className="metrics">{[['수집 페이지',job.pages],['텍스트 후보',job.candidates],['판정 완료',job.processed],['모델 호출',job.calls]].map(([label,value])=><div key={label}><span>{label}</span><strong>{value}</strong></div>)}</div>
    <div className="progress-row" role="status"><span>{phases[job.phase]||job.phase}{job.cancelRequested&&!terminal(job.status)?' · 중단 요청 중':''}</span>{job.elapsedSec!=null&&<span>{job.elapsedSec.toFixed(1)}초 · {job.totalTokens?.toLocaleString()??'—'} 토큰</span>}</div>
    {job.phase==='judging'&&<progress aria-label="판정 진행률" value={job.processed} max={job.candidates||1}/>}
    {!terminal(job.status)&&<button className="secondary" disabled={job.cancelRequested} onClick={cancel}>검사 중단</button>}
    {job.error&&<div role="alert" className="error">{job.error}</div>}
    {job.status==='completed_with_warnings'&&<p className="warning">확인 필요 {job.needsReview||0}건 · 차단된 외부/범위 밖 요청 {job.blockedRequests||0}건. 보류 항목을 정상 판정으로 간주하지 마세요.</p>}
    {job.result&&<><div className="section-title findings-title"><h3>확정 탐지 <span>{job.result.findings.length}건</span></h3><a className="download" href={`/api/jobs/${job.id}/result`}>result.json 내려받기</a></div>
    {job.result.findings.length?<div className="table-wrap"><table><thead><tr><th>기법</th><th>원문·위치</th></tr></thead><tbody>{job.result.findings.map(f=><tr key={f.id}><td><span className="technique">{techniques[f.technique]||f.technique}</span></td><td><p>{f.evidence_text}</p><a href={safeUrl(f.url)} target="_blank" rel="noreferrer">대상 페이지 열기 ↗</a><code>{f.location}</code></td></tr>)}</tbody></table></div>:<p className="hint">확정 탐지가 없습니다. 보류 항목과 실행 모드를 함께 확인하세요.</p>}
    {!!job.diagnostics?.length&&<details className="diagnostics"><summary>검토가 필요한 요소 {job.diagnostics.length}건</summary>{job.diagnostics.map(d=><article key={d.node_id}><p>{d.reason||'판정 근거가 비어 있습니다.'}</p><code>{d.location}</code><a href={safeUrl(d.url)} target="_blank" rel="noreferrer">대상 페이지 열기 ↗</a></article>)}</details>}</>}
  </>}
  </section></div><footer>로컬 실행 · Pipeline baseline · 판정 결과는 원문과 함께 검토하세요.</footer></main></>;
}
