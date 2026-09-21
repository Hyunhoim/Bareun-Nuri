export type ScanRequest={url:string;provider:'hcx'|'mock';maxPages:number;maxNodes:number;maxCalls:number;timeoutSeconds:number};
export type Finding={id:string;url:string;location:string;evidence_text:string;technique:string};
export type Diagnostic={node_id:string;url:string;location:string;reason:string};
export type Job=ScanRequest & {id:string;status:string;phase:string;pages:number;candidates:number;processed:number;calls:number;
  startedAt:string;updatedAt:string;error?:string;cancelRequested?:boolean;elapsedSec?:number;totalTokens?:number|null;
  needsReview?:number;blockedRequests?:number;result?:{meta:Record<string,unknown>;findings:Finding[]};diagnostics?:Diagnostic[]};
export const terminal=(status:string)=>['completed','completed_with_warnings','failed','cancelled','interrupted'].includes(status);
export async function api<T>(path:string,body?:unknown,signal?:AbortSignal):Promise<T>{
  const response=await fetch('/api'+path,{method:body===undefined?'GET':'POST',signal,
    headers:body===undefined?{}:{'Content-Type':'application/json','X-Local-Client':'public-ad-ui'},
    body:body===undefined?undefined:JSON.stringify(body)});
  const data=await response.json();if(!response.ok)throw Error(data.error||'요청 처리에 실패했습니다.');return data as T;
}
