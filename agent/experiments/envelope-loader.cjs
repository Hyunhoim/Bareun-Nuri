const fs=require('node:fs'),path=require('node:path'),assert=require('node:assert/strict');
function load(){
 const archived=path.resolve('.runtime/scale-large-live-v1/source-archive/agent/src/core/llm.cjs');
 const original=fs.existsSync(archived)?archived:require.resolve('../src/core/llm.cjs'),helper=require.resolve('./json-envelope.cjs');
 const source=fs.readFileSync(original,'utf8'),needle='const value = JSON.parse(content);';assert.equal(source.split(needle).length,2);
 const modified="const {parseEnvelope}=require("+JSON.stringify(helper)+");\n"+source.replace(needle,'const value = (reasoning || contract?.promptJson === true) ? parseEnvelope(content) : JSON.parse(content);');
 const dir=path.resolve('.runtime/envelope-clone-v1'),file=path.join(dir,'llm.cjs');fs.mkdirSync(dir,{recursive:true});
 if(fs.existsSync(file))assert.equal(fs.readFileSync(file,'utf8'),modified,'Frozen clone changed');else fs.writeFileSync(file,modified);
 return {llm:require(file),sourceFiles:[__filename,helper,file]};
}
module.exports={load};
