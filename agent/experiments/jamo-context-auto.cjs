// Experiment-only C contract: auxiliary reading changes, raw evidence stays intact.
const {contract:baseContract}=require('../src/core/judgment.cjs');
const {transform}=require('./jamo-context-normalize.cjs');
function contract(){const base=baseContract();return {...base,initialEvidence:c=>({...base.initialEvidence(c),normalized_text:transform(c.raw_text)})};}
const sourceFiles=[__filename,require.resolve('./jamo-context-normalize.cjs'),require.resolve('../src/core/jamo.cjs'),require.resolve('../src/core/judgment.cjs')];
const comparison='Experimental C: normalized_text only is recomputed by general jamo restoration. Raw target, owned context, output schema, FIFO, scheduler, sequential batch4, none and output512 remain unchanged. Compare against a separate 25-minute baseline; the 300-call prefix is not an independent comparison.';
module.exports={contract,sourceFiles,comparison};
if(require.main===module){
 const assert=require('node:assert/strict'),base=baseContract(),candidate={node_id:'sample',raw_text:'ㅎ ㅏ ㄱ ㄱ ㅛ  ㅇ ㅏ ㄴ ㄴ ㅐ',normalized_text:'ㅎ ㅏ ㄱ ㄱ ㅛ  ㅇ ㅏ ㄴ ㄴ ㅐ',links:[],nearby:{},context_evidence:{units:[{relation:'target'}],scope:{tag:'article'},target_quoted:false,truncated:false}};
 const before=structuredClone(candidate),original=base.initialEvidence(candidate),changed=contract().initialEvidence(candidate);
 assert.equal(changed.normalized_text,'학교  안내');changed.normalized_text=original.normalized_text;
 assert.deepEqual(changed,original);assert.deepEqual(candidate,before);
 assert.equal(contract().SYSTEM,base.SYSTEM);assert.deepEqual(contract().modelItemSchema(),base.modelItemSchema());
 console.log('PASS automatic reading contract: one-field change and no candidate mutation');
}
