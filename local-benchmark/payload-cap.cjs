// Research-only: alter one API setting, preserve the full semantic request.
const assert=require('node:assert/strict');
function cap384(body){assert.equal(body.maxCompletionTokens,512);assert.equal(body.thinking?.effort,'none');const result=structuredClone(body);result.maxCompletionTokens=384;const restored=structuredClone(result);restored.maxCompletionTokens=512;assert.deepEqual(restored,body);return result;}
if(require.main===module){const fs=require('node:fs');let count=0;for(const line of fs.readFileSync('.runtime/phase1-full-1790774023853/scan/trace.jsonl','utf8').trim().split('\n')){const e=JSON.parse(line);if(e.event!=='llm_request')continue;cap384(e.body);count++;}assert.equal(count,516);console.log(`Only maxCompletionTokens changes for ${count} stored requests; API 0`);}
module.exports={cap384};
