// Used by the local backend. Only masked status leaves this process.
const fs=require('node:fs');const path=require('node:path');const {parseEnv}=require('node:util');const {randomUUID}=require('node:crypto');
function manage(file,action,key,name='CLOVASTUDIO_API_KEY'){
 if(!['CLOVASTUDIO_API_KEY','OPENAI_API_KEY'].includes(name))throw Error('invalid key store');
 const original=fs.existsSync(file)?fs.readFileSync(file,'utf8'):'';
 const values=parseEnv(original);
 if(action==='save'||action==='delete'){
  if(action==='save'&&(typeof key!=='string'||!/^[A-Za-z0-9._~+\/=:-]{8,4096}$/.test(key)))throw Error('invalid key');
  const value=action==='delete'?'':key;
  // Match complete quoted assignments too; keep unrelated settings and comments.
  const entry=new RegExp('^[\\t ]*(?:export[\\t ]+)?'+name+'[\\t ]*=[\\t ]*(?:"[^"]*"|\'[^\']*\'|`[^`]*`|[^\\r\\n]*)[^\\r\\n]*','gm');
  let updated=original.replace(/^\uFEFF/,'').replace(entry,'');
  updated+=(updated&&!updated.endsWith('\n')?'\n':'')+name+'='+value+'\n';
  const parsed=parseEnv(updated);
  for(const [k,v] of Object.entries(values))if(k!==name&&parsed[k]!==v)throw Error('unsafe env format');
  if(parsed[name]!==value)throw Error('unsafe env format');
  fs.mkdirSync(path.dirname(file),{recursive:true});const tmp=file+'.'+randomUUID()+'.tmp';
  try{fs.writeFileSync(tmp,updated,{mode:0o600,flag:'wx'});fs.renameSync(tmp,file);}finally{if(fs.existsSync(tmp))fs.unlinkSync(tmp);}
  values[name]=value;
 }else if(action!=='status')throw Error('invalid action');
 const value=(values[name]??process.env[name]??'').trim();
 return {configured:!!value,masked:value?(value.length>8?value.slice(0,4):'')+'********':'',source:Object.hasOwn(values,name)?'agent/.env':value?'process environment':'agent/.env'};
}
module.exports={manage};
if(require.main===module){let data='';process.stdin.setEncoding('utf8');process.stdin.on('data',s=>{data+=s;if(data.length>20000)process.exit(1);});process.stdin.on('end',()=>{try{const req=JSON.parse(data);process.stdout.write(JSON.stringify(manage(process.argv[2],req.action,req.key,process.argv[3])));}catch{process.stdout.write('{"error":"key storage failed"}');process.exitCode=1;}});}
