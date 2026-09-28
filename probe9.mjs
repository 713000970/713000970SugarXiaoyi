const UA = { 'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/126.0 Safari/537.36' };
async function get(url, ms=12000){
  const ac=new AbortController(); const t=setTimeout(()=>ac.abort(),ms);
  try{ const r=await fetch(url,{headers:UA,signal:ac.signal,redirect:'follow'});
    const buf=Buffer.from(await r.arrayBuffer());
    let text=buf.toString('utf8');
    if(/charset=["']?(gb2312|gbk)/i.test(text.slice(0,1000)) || /charset=["']?gb/i.test(r.headers.get('content-type')||'')) text=new TextDecoder('gbk').decode(buf);
    return {status:r.status,text};
  } finally{clearTimeout(t);}
}
function decodeEnt(s){return s.replace(/&#x([0-9a-f]+);/gi,(_,h)=>String.fromCodePoint(parseInt(h,16))).replace(/&#(\d+);/g,(_,d)=>String.fromCodePoint(Number(d)));}
function anchors(html, base){
  const out=[]; const re=/<a[^>]+href=["']([^"'#]+)["'][^>]*>([\s\S]*?)<\/a>/gi; let m;
  while((m=re.exec(html))){
    const txt=decodeEnt(m[2].replace(/<[^>]+>/g,' ').replace(/\s+/g,' ').trim());
    if(!txt||txt.length<8)continue;
    let href=m[1]; try{href=new URL(href,base).href;}catch{continue;}
    out.push({txt:txt.slice(0,80),href,i:m.index});
  }
  return out;
}
// find pagination links on the channel page
const {status,text}=await get('https://www.sdpress.com.cn/News/1/104/');
console.log('HTTP',status);
const as=anchors(text,'https://www.sdpress.com.cn/News/1/104/');
for(const a of as){ if(/index|list|News\/1\/104|next/i.test(a.href+a.txt)) console.log('PG', a.txt, '|', a.href); }
// try common pagination forms
for(const u of ['https://www.sdpress.com.cn/News/1/104/index_1.html','https://www.sdpress.com.cn/News/1/104/index_2.html','https://www.sdpress.com.cn/News/1/104/2']){
  try{ const {status:st,text:tx}=await get(u);
    const arts=anchors(tx,u).filter(a=>/NewsDetail_/.test(a.href));
    const dates=[...new Set([...tx.matchAll(/2026\d{6}/g)].map(m=>m[0]))].slice(0,6);
    console.log(`\nTRY ${u} HTTP ${st} arts=${arts.length} dates=${dates.join(',')}`);
    for(const a of arts.slice(0,6)) console.log(`- ${a.txt} | ${a.href}`);
  }catch(e){console.log(`\nTRY ${u} FAILED ${e.message}`);}
}