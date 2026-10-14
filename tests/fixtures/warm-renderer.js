document.body.replaceChildren(document.createElement('main'));
const main=document.querySelector('main'), prefix=arguments[1],count=48;
main.style.cssText='position:relative;margin:0;padding:0';
let root=document.createElement('div');root.setAttribute('data-scroll-root','');root.style.cssText='height:650px;width:1100px;overflow:auto;position:relative';main.before(root);root.append(main);
const heights=Array.from({length:count},(_,i)=>i===24?55000:600+(i%3)*90),tops=[];
let total=0,gap=0,loadedHead=count-6,pending=null,fetchPending=false,delay=80,renderGeneration=0;
const commands=[],fetches=[],mounts=[];
function layout(){total=0;tops.length=0;for(let i=0;i<count;i++){if(i===40)total+=gap;tops.push(total);total+=heights[i];}main.style.height=total+'px';}
function indexAt(y){let index=0;for(let i=0;i<count;i++)if(tops[i]<=y)index=i;return index;}
function render(){
 const index=indexAt(root.scrollTop),start=Math.max(loadedHead,Math.min(count-6,index-2)),wanted=new Set([46,47]);
 for(let i=start;i<Math.min(count,start+6);i++)wanted.add(i);
 main.replaceChildren();for(const i of [...wanted].sort((a,b)=>a-b))for(const role of ['user','assistant']){
  const shell=document.createElement('section');shell.dataset.testid='conversation-turn-'+(i*2+(role==='user'?0:1));shell.dataset.turnId=prefix+':'+role[0]+'-'+i;shell.dataset.turn=role;
  const offset=role==='user'?0:90,height=role==='user'?90:heights[i]-90;
  shell.style.cssText='position:absolute;left:20px;right:20px;top:'+(tops[i]+offset)+'px;height:'+height+'px';
  const body=document.createElement('div');body.dataset.messageAuthorRole=role;body.dataset.messageId=prefix+':'+role[0]+'-'+i;body.textContent=role==='user'?'Local question '+i:'Local answer '+i;body.style.minHeight='70px';shell.append(body);main.append(shell);
 }
 mounts.push({start,loadedHead,top:root.scrollTop,at:performance.now()});
}
async function maybeFetch(){
 const index=indexAt(root.scrollTop);
 if(fetchPending||loadedHead===0||index>loadedHead+1)return;
 fetchPending=true;main.setAttribute('aria-busy','true');const next=Math.max(0,loadedHead-6);fetches.push({head:next,at:performance.now()});
 try{const response=await fetch('/history?before='+next);if(!response.ok)throw Error('fixture fetch');await response.json();loadedHead=next;render();}
 finally{fetchPending=false;main.removeAttribute('aria-busy');}
}
let previous=0;
function scroll(){commands.push({from:previous,to:root.scrollTop,at:performance.now()});previous=root.scrollTop;const token=++renderGeneration;clearTimeout(pending);pending=setTimeout(()=>{if(token!==renderGeneration)return;render();void maybeFetch();},delay);}
function connect(){root.addEventListener('scroll',scroll);}
layout();connect();root.scrollTop=tops[44]+15;previous=root.scrollTop;render();
window.warmFixture={
 tail(){clearTimeout(pending);renderGeneration++;root.scrollTop=tops[44]+15;previous=root.scrollTop;render();},
 at(i){clearTimeout(pending);root.scrollTop=tops[i]+15;previous=root.scrollTop;render();},
 delay(ms){delay=ms;},
 resize(width){root.style.width=width+'px';render();},
 shift(){gap=18000;layout();this.tail();},
 replaceRoot(){const next=document.createElement('div');next.setAttribute('data-scroll-root','');next.style.cssText=root.style.cssText;const top=root.scrollTop;root.replaceWith(next);next.append(main);root=next;connect();root.scrollTop=top;previous=top;render();},
 reset(){commands.length=0;mounts.length=0;},
 stats(){return {loadedHead,fetches:fetches.slice(),commands:commands.slice(),mounts:mounts.slice(),top:root.scrollTop,width:root.clientWidth,height:root.scrollHeight};}
};
