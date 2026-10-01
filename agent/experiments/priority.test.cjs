const assert=require('node:assert/strict');
const {priority,replay}=require('./priority.cjs');
const base='http://localhost/check/',u=p=>new URL(p,base).href;
const link=(p,text='',content_scope=false)=>({url:u(p),text,content_scope});
const page=(p,links=[])=>({url:u(p),links});
const graph=pages=>({entry_url:base,scope:'/check/',pages});
const paths=order=>order.map(p=>new URL(p.url).pathname);

assert.equal(priority(link('board/list','시민 게시판',true)),4);
assert.equal(priority(link('guide','카지노 이벤트')),0,'Ad words must not raise priority');
assert.equal(priority(link('x?label=ad&case_id=42')),0);
assert.equal(priority(link('x','Questions')),0);
assert.equal(priority(link('x','의견')),2,'Opaque URLs can still be prioritized');
const tied=graph([page('',[link('a'),link('b')]),page('a'),page('b')]);
assert.deepEqual(paths(replay(tied,'fifo')),paths(replay(tied,'priority')));
// A low-priority page remains reachable even while a forum keeps supplying more links.
const starvation=graph([page('',[link('guide'),link('board/1')]),page('guide'),
  ...Array.from({length:12},(_,i)=>page('board/'+(i+1),i<11?[link('board/'+(i+2))]:[]))]);
const before=JSON.stringify(starvation),scheduled=replay(starvation,'priority');
assert.equal(scheduled[3].url,u('guide'));assert.equal(new Set(scheduled.map(p=>p.url)).size,14);
assert.equal(JSON.stringify(starvation),before);
// Hidden descendants are not globally sorted using the fully recorded graph.
const hidden=graph([page('',[link('plain'),link('board')]),page('plain',[link('deep','게시판',true)]),page('board'),page('deep')]);
assert.deepEqual(paths(replay(hidden,'priority')),['/check','/check/board','/check/plain','/check/deep']);
// Same normalized URL is visited once; cross-origin and out-of-scope links are ignored.
const cycles=graph([page('',[link('x?b=2&a=1#first'),link('x?a=1&b=2#second'),link('../outside'),
  {url:'https://example.com/check/x'}, {url:'javascript:void(0)'},{url:'http://user:pass@localhost/check/secret'}]),
  page('x?a=1&b=2',[link('')])]);
assert.equal(replay(cycles,'priority').length,2);
assert.throws(()=>replay(graph([page('',[link('missing')])]),'fifo'),/Missing reachable/);
assert.throws(()=>replay(graph([page(''),page('')]),'fifo'),/Duplicate/);
assert.throws(()=>replay(tied,'unknown'));
// Incoming evidence may upgrade a queued URL without duplicating it or resetting its age.
const upgrade=graph([page('',[link('a'),link('b'),link('a','게시판')]),page('a'),page('b')]);
assert.equal(replay(upgrade,'priority')[1].url,u('a'));
// Counterexamples are deliberate diagnostic graphs, NOT held-out performance estimates.
const scenarios=[
  {name:'ad in board',ad:u('board/1'),g:starvation},
  {name:'ad in ordinary guide, benign boards',ad:u('guide'),g:starvation},
  {name:'opaque uninformative links',ad:u('b'),g:tied}
].map(s=>({name:s.name,fifo_ad_page:replay(s.g,'fifo').findIndex(p=>p.url===s.ad)+1,
  priority_ad_page:replay(s.g,'priority').findIndex(p=>p.url===s.ad)+1}));
assert(scenarios[0].priority_ad_page<scenarios[0].fifo_ad_page);
assert(scenarios[1].priority_ad_page>scenarios[1].fifo_ad_page);
assert.equal(scenarios[2].priority_ad_page,scenarios[2].fifo_ad_page);
console.log('Priority safety checks passed; counterexamples: '+JSON.stringify(scenarios));
