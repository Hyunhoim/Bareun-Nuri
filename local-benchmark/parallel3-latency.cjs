// Read-only analysis of historical timing intervals; overlapping time is not added.
const fs=require('node:fs'),path=require('node:path');
const dir=path.resolve(process.argv[2]||'.runtime/phase1-parallel25-1790789676712'),scan=path.join(dir,'scan');
const read=f=>JSON.parse(fs.readFileSync(path.join(scan,f))),lines=f=>fs.readFileSync(path.join(scan,f),'utf8').trim().split('\n').map(JSON.parse);
const state=read('checkpoint.json').state,calls=state.call_records,segments=read('segments.json'),start=Date.parse(segments[0].started_at),end=start+1500000;
const timing=lines('collection-timing.jsonl');
const service=calls.map(c=>[c.sent_at_ms,c.finished_at_ms]),queue=calls.map(c=>[Date.parse(c.started_at),c.sent_at_ms]);
const collect=timing.map(t=>[Date.parse(t.at)-t.total_ms,Date.parse(t.at)]);
const points=[start,end,...[...service,...queue,...collect].flat()].filter(t=>t>=start&&t<=end).sort((a,b)=>a-b);
const wall={api_active:0,queue_active:0,collection_active:0,queue_only:0,unclassified:0};
for(let i=1;i<points.length;i++){const a=points[i-1],b=points[i],mid=(a+b)/2,has=xs=>xs.some(([s,e])=>s<=mid&&mid<e),api=has(service),q=has(queue),c=has(collect),sec=(b-a)/1000;
 if(api)wall.api_active+=sec;if(q)wall.queue_active+=sec;if(c)wall.collection_active+=sec;if(q&&!api&&!c)wall.queue_only+=sec;if(!api&&!q&&!c)wall.unclassified+=sec;
}
function stats(xs){xs=xs.slice().sort((a,b)=>a-b);return{n:xs.length,sum:xs.reduce((a,b)=>a+b,0),median:xs[Math.floor(xs.length*.5)],p95:xs[Math.ceil(xs.length*.95)-1],max:xs.at(-1)};}
const phases={};for(const t of timing)for(const[k,v]of Object.entries(t.phases_ms||{}))phases[k]=(phases[k]||0)+v/1000;
const result={scope:'first1500s wall intervals; per-request and page sums overlap and are not wall attribution',wall_seconds:wall,
 service_seconds:stats(calls.map(c=>c.service_sec)),queue_seconds:stats(calls.map(c=>c.queue_wait_sec)),page_phase_sum_seconds:phases,
 prompt_tokens:stats(calls.map(c=>c.usage.prompt_tokens)),output_tokens:stats(calls.map(c=>c.usage.completion_tokens)),
 longest:calls.slice().sort((a,b)=>b.service_sec-a.service_sec).slice(0,5).map(c=>({number:c.number,service:c.service_sec,queue:c.queue_wait_sec,tokens:c.usage.total_tokens})),
 storage:read('storage-metrics.json'),http429:calls.filter(c=>c.http_status===429).length,
 limitation:'No separate CPU AntiSpoof or persistence timing in this run; unclassified includes these plus orchestration. Queue combines local pacing, TPM reservations and shared gate.'};
const out=path.resolve('.runtime/parallel3-latency-analysis.json');fs.writeFileSync(out,JSON.stringify(result,null,2));console.log(JSON.stringify(result,null,2));
