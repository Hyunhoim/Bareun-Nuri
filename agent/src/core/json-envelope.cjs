// A leading, complete JSON object is authoritative; never guess missing JSON or merge objects.
function parseEnvelope(content){
 const text=content.trim().replace(/^```(?:json)?\s*\n([\s\S]*?)\n```$/, '$1');
 if(!text.startsWith('{'))return JSON.parse(text);
 const stack=[];let end=-1;
 for(let i=0;i<text.length;i++){
  const ch=text[i];
  if(ch==='"'){
   const start=i;let closed=false;
   for(i++;i<text.length;i++){if(text[i]==='\\'){i++;continue;}if(text[i]==='"'){closed=true;break;}}
   if(!closed)throw Error('Unterminated JSON string');
   let next=i+1;while(/\s/.test(text[next]||'')&&next<text.length)next++;
   if(text[next]===':'&&stack.at(-1)?.kind==='{'){
    const key=JSON.parse(text.slice(start,i+1)),keys=stack.at(-1).keys;
    if(keys.has(key))throw Error('Duplicate JSON key');keys.add(key);
   }
  }else if(ch==='{'||ch==='[')stack.push({kind:ch,keys:new Set()});
  else if(ch==='}'||ch===']'){
   const item=stack.pop();if(!item||item.kind!==(ch==='}'?'{':'['))throw Error('Unbalanced JSON');
   if(!stack.length){end=i+1;break;}
  }
 }
 if(end<0)throw Error('Incomplete JSON object');
 const tail=text.slice(end).trim();
 if(tail&&(/[{}\[\]`]/.test(tail)||/^(?:true|false|null|-?\d|"|,)/.test(tail)))throw Error('Ambiguous content after JSON');
 return JSON.parse(text.slice(0,end));
}
module.exports={parseEnvelope};
if(require.main===module){
 const assert=require('node:assert/strict'),x={decisions:{a:{publication_act:'일반정보'}}},s=JSON.stringify(x);
 for(const t of [s,s+'\n\n판정 이유를 설명합니다.','```json\n'+s+'\n```'])assert.deepEqual(parseEnvelope(t),x);
 for(const t of ['설명\n'+s,s+s,s+'\n[]',s+'\n```json\n{}\n```',s+'\nnull',s.slice(0,-1),'{"x":1,"x":2}','{"a":{"x":1,"\\u0078":2}}'])assert.throws(()=>parseEnvelope(t));
 assert.deepEqual(parseEnvelope('{"s":"brace } and escaped \\" quote","a":[1,2]}'),{s:'brace } and escaped " quote',a:[1,2]});
 console.log('PASS complete object, fences, prose suffix, ambiguity, duplicates, escaping and truncation; API0');
}
