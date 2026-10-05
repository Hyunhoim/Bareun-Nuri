export type ScanRequest={url:string;provider:'hcx'|'luna'|'mock';maxPages:number;maxNodes:number;maxCalls:number;timeoutSeconds:number};
export type Finding={id:string;url:string;location:string;evidence_text:string;technique:string};
export type Diagnostic={node_id:string;url:string;location:string;reason:string};
export type Job=ScanRequest & {id:string;status:string;phase:string;pages:number;candidates:number;processed:number;calls:number;
  startedAt:string;segmentStartedAt?:string;updatedAt:string;error?:string;cancelRequested?:boolean;pauseRequested?:boolean;segmentBudgetSeconds?:number;remainingSeconds?:number;elapsedSec?:number;totalTokens?:number|null;
  findingLocations?:number;quarantined?:number;canResume?:boolean;closed?:boolean;segmentNumber?:number;segmentElapsedSec?:number;activeElapsedSec?:number;
  reason?:string;pendingPages?:number;excludedLinks?:number;collectionIssues?:number;coverage?:{inflight?:unknown;status:string;reason:string|null;pending:{url:string}[];excluded:{url:string;reason:string}[];issues:{url:string;reason:string;resolved?:boolean}[];unjudged:{node_id:string;url:string;location:string}[]};needsReview?:number;blockedRequests?:number;unstablePages?:number;exceeded30Minutes?:boolean;result?:{meta:Record<string,unknown>;findings:Finding[]};diagnostics?:Diagnostic[]};
export const terminal=(status:string)=>['completed','completed_with_warnings','failed','cancelled','interrupted','partial'].includes(status);
export async function api<T>(path:string,body?:unknown,signal?:AbortSignal):Promise<T>{
  const response=await fetch('/api'+path,{method:body===undefined?'GET':'POST',signal,
    headers:body===undefined?{}:{'Content-Type':'application/json','X-Local-Client':'public-ad-ui'},
    body:body===undefined?undefined:JSON.stringify(body)});
  const data=await response.json();if(!response.ok)throw Error(data.error||'요청 처리에 실패했습니다.');return data as T;
}
