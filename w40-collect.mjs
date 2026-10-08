import fs from 'fs';
const UA = { 'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/126.0 Safari/537.36', 'Accept-Language': 'zh-CN,zh;q=0.9' };
async function get(url, ms=15000){
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
const out=[];
// cbbr article dates
for(const id of ['114075','114073','114071','114070','114069','114068']){
  try{ const {status,text}=await get(`https://www.cbbr.com.cn/contents/533/${id}.html`);
    const dm=text.match(/2026-\d{2}-\d{2}/);
    out.push(`CBBR ${id} | ${dm?dm[0]:'?'} | https://www.cbbr.com.cn/contents/533/${id}.html`);
  }catch(e){out.push(`CBBR ${id} FAILED`);}
}
// chinaxwcb article dates
for(const id of ['99885154','99885162','99885160','99885159']){
  try{ const {status,text}=await get(`https://www.chinaxwcb.com/2026/09/28/${id}.html`);
    const dm=text.match(/2026-\d{2}-\d{2}/);
    const tm=text.match(/<title>([^<]+)<\/title>/);
    out.push(`XWCB ${id} | ${dm?dm[0]:'?'} | ${tm?decodeEnt(tm[1]).slice(0,50):''} | https://www.chinaxwcb.com/2026/09/28/${id}.html`);
  }catch(e){out.push(`XWCB ${id} FAILED`);}
}
// moe recent list
try{ const {status,text}=await get('https://www.moe.gov.cn/jyb_xwfb/gzdt_gzdt/');
  const seen=new Set();
  for(const a of anchors(text,'https://www.moe.gov.cn/jyb_xwfb/gzdt_gzdt/')){
    if(seen.has(a.href))continue; seen.add(a.href);
    const around=text.slice(Math.max(0,a.i-150), a.i+a.txt.length+300);
    const dm=around.match(/2026-\d{2}-\d{2}/);
    if(dm && dm[0]>='2026-09-28'){ out.push(`MOE ${dm[0]} | ${a.txt} | ${a.href}`); }
  }
}catch(e){out.push(`MOE FAILED ${e.message}`);}
// sdpress + ppm recent
for(const [name,u] of [['SDPRESS','https://www.sdpress.com.cn/'],['PPM','https://www.ppm.cn/']]){
  try{ const {status,text}=await get(u);
    const seen=new Set();
    for(const a of anchors(text,u)){
      if(seen.has(a.href))continue; seen.add(a.href);
      const around=text.slice(Math.max(0,a.i-200), a.i+a.txt.length+300);
      const dm=around.match(/2026[.\-/?]\s?\d{1,2}[.\-/?]\s?\d{1,2}/);
      if(dm){ const n=dm[0].replace(/[??]/g,'-').replace(/\.(?=\d)/g,'-');
        if(n.includes('09-2[89]')||n.includes('09-30')||n.includes('10-')) out.push(`${name} ${dm[0]} | ${a.txt} | ${a.href}`);
      }
    }
  }catch(e){out.push(`${name} FAILED ${e.message}`);}
}
fs.writeFileSync('w40-pool.txt', out.join('\n'), 'utf8');
console.log('done');
