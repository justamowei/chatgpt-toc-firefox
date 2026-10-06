// Browser-engine fallback when native Firefox cannot launch. This serves the
// exact fixture content bundle with a minimal runtime shim, NOT a real addon.
import {createServer} from 'node:http';
import {readFile,mkdir,writeFile} from 'node:fs/promises';
import {resolve} from 'node:path';
const folder=resolve('artifacts/iab-mounted-ui-r5');await mkdir(folder,{recursive:true});
const script=`
const noop={addListener(){},removeListener(){}};
window.browser={extension:{inIncognitoContext:false},runtime:{id:'local-iab-shim',getManifest:()=>({version:'0.3.1'}),onMessage:noop,
 connect:()=>({onMessage:noop,onDisconnect:noop,disconnect(){}}),sendMessage:async m=>m.kind==='settings:get'?{auto:false,expanded:false}:undefined}};
function mount(ids){const m=document.querySelector('main');m.replaceChildren();m.scrollTop=0;for(const i of ids){const a=document.createElement('article');a.dataset.testid='conversation-turn-'+i*2;for(const role of ['user','assistant']){const b=document.createElement('div');b.dataset.messageAuthorRole=role;b.dataset.messageId='iab:'+role[0]+'-'+i;b.textContent=(role==='user'?'Local prompt ':'Local reply ')+i;a.append(b);}m.append(a);}}
mount(Array.from({length:120},(_,i)=>i));
document.getElementById('six').onclick=()=>mount([111,112,113,114,115,116]);
document.getElementById('empty').onclick=()=>mount([]);
document.getElementById('new').onclick=()=>mount([20,21,22,23,24]);
const frames=[],keys=[];
document.addEventListener('keydown',e=>{if(e.key.toLowerCase()==='o')keys.push({trusted:e.isTrusted,shift:e.shiftKey,editing:!!e.target.closest?.('input,textarea,[contenteditable]'),prevented:e.defaultPrevented});},true);
document.getElementById('save').onclick=async()=>{await fetch('/evidence',{method:'POST',headers:{'content-type':'application/json'},body:JSON.stringify({source:'Codex IAB localhost exact fixture bundle + runtime shim; not Firefox addon or ChatGPT LIVE',frames,keys})});document.getElementById('saved').textContent='Evidence saved';};
setInterval(()=>{const h=document.getElementById('chatgpt-toc-root'),s=h?.shadowRoot;if(!s)return;const row={expanded:s.querySelector('.toggle').getAttribute('aria-expanded'),cache:s.querySelectorAll('#toc-list button').length,marks:[...s.querySelectorAll('.mark')].map(n=>n.dataset.entryId),navigation:h.dataset.navigation,highlight:document.querySelector('[data-chatgpt-toc-highlight]')?.dataset.messageId??null,searchFocused:s.activeElement?.id==='toc-search'};const last=frames.at(-1);if(JSON.stringify(last)!==JSON.stringify(row))frames.push(row);document.getElementById('observed').textContent=JSON.stringify(row);},150);
`;
const html=`<!doctype html><meta charset="utf-8"><title>r5 本機介面檢查（IAB runtime shim）</title><style>body{font:14px system-ui;margin:20px;background:#f4f4f5;color:#27272a}aside{padding:12px;background:white;margin-right:400px}button{padding:6px;margin:4px}main{height:420px;overflow:auto;margin:12px 400px 12px 0}article{padding:18px;margin:12px;background:white;border-radius:10px}[data-message-author-role=user]{padding:12px;background:#f4f4f5}pre{white-space:pre-wrap;overflow-wrap:anywhere}footer{display:flex;gap:14px;align-items:center}input{font:inherit;padding:10px}</style><aside><h1>r5 本機介面檢查</h1><p>內建瀏覽器＋runtime shim；不是 Firefox addon／ChatGPT LIVE。</p><button id="six">掛載 6 筆</button><button id="empty">清空掛載</button><button id="new">切換掛載 5 筆</button><button id="save">儲存檢查紀錄</button><span id="saved"></span><pre id="observed"></pre></aside><main></main><footer><label>一般輸入框 <input aria-label="一般輸入框"></label><div id="editor" contenteditable="true" role="textbox" aria-label="編輯區">Type here</div></footer><script src="/setup.js"></script><script src="/content.js"></script>`;
const server=createServer(async(req,res)=>{try{
 if(req.url==='/evidence'&&req.method==='POST'){let body='';for await(const chunk of req)body+=chunk;if(body.length>100000)throw Error('Oversize evidence');const data=JSON.parse(body);await writeFile(resolve(folder,'results.json'),JSON.stringify({...data,build:JSON.parse(await readFile('dist/fixture/build-info.json','utf8'))},null,2));res.end('saved');return;}
 res.setHeader('content-type',req.url==='/setup.js'||req.url==='/content.js'?'application/javascript':req.url==='/host.css'?'text/css':'text/html; charset=utf-8');
 res.end(req.url==='/setup.js'?script:req.url==='/content.js'?await readFile('dist/fixture/content.js'):req.url==='/host.css'?await readFile('dist/fixture/host.css'):html.replace('<main>','<link rel="stylesheet" href="/host.css"><main>'));
}catch(e){res.statusCode=500;res.end(e.message);}});
await new Promise(r=>server.listen(0,'127.0.0.1',r));console.log('http://127.0.0.1:'+server.address().port+'/c/iab-ui-r5');
