const dns=require('node:dns/promises'),net=require('node:net');
const loopback=h=>h==='localhost'||h==='::1'||h==='[::1]'||/^127\./.test(h);
function publicAddress(ip){
 if(net.isIP(ip)===4){const [a,b]=ip.split('.').map(Number);return !(a===0||a===10||a===127||a>=224||a===169&&b===254||a===172&&b>=16&&b<=31||a===192&&b===168||a===100&&b>=64&&b<=127||a===198&&(b===18||b===19));}
 return net.isIP(ip)===6&&/^[23]/i.test(ip)&&!ip.toLowerCase().startsWith('2001:db8:');
}
function frameAccess(entry){
 const cache=new Map();
 return async value=>{
  let u;try{u=new URL(value);}catch{return false;}
  if(!['http:','https:'].includes(u.protocol)||u.username||u.password)return false;
  if(u.origin===entry.origin)return true;
  const host=u.hostname.replace(/^\[|\]$/g,'');
  if(loopback(host))return loopback(entry.hostname);
  if(!cache.has(host))cache.set(host,dns.lookup(host,{all:true}).then(xs=>xs.length>0&&xs.every(x=>publicAddress(x.address))).catch(()=>false));
  return cache.get(host);
 };
}
module.exports={frameAccess,publicAddress};
