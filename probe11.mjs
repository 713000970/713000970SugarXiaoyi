const UA = { 'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/126.0 Safari/537.36', 'Accept-Language': 'zh-CN,zh;q=0.9' };
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
const tests=[
  ['bnup','https://www.bnup.com.cn/'],
  ['bnup-news','https://www.bnup.com.cn/xwzx/'],
  ['hdsdbs','https://www.hdsdbs.com/'],
  ['hdsdbs-news','https://www.hdsdbs.com/ecnuir/news/list'],
];
for(const [name,u] of tests){
  try{
    const {status,text}=await get(u);
    const as=anchors(text,u);
    console.log(`\n## ${name} HTTP ${status} anchors=${as.length}`);
    const seen=new Set(); let n=0;
    for(const a of as){
      if(seen.has(a.href))continue; seen.add(a.href);
      const around=text.slice(Math.max(0,a.i-250), a.i+a.txt.length+350);
      const dm=around.match(/2026\s?[./-?]\s?\d{1,2}\s?[./-?]\s?\d{1,2}/);
      if(dm){ console.log(`- ${a.txt} | ${dm[0]} | ${a.href}`); if(++n>=12)break; }
    }
  }catch(e){console.log(`\n## ${name} FAILED ${e.message}`);}
}
