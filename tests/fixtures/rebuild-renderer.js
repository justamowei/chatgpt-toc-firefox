document.body.replaceChildren(document.createElement('main'));const prefix=arguments[1],edits=new Map();

    const m=document.querySelector('main');m.removeAttribute('data-fixture-branch');
    m.style.cssText='margin:0;padding:0;position:relative;overflow:visible;height:auto';m.replaceChildren();
    const decoy=document.createElement('div');decoy.setAttribute('data-scroll-root','');decoy.style.cssText='height:650px;overflow:auto';m.before(decoy);
    const root=document.createElement('div');root.setAttribute('data-scroll-root','');root.style.cssText='height:650px;overflow:hidden;position:relative';decoy.append(root);root.append(m);
    const count=arguments[2]??30,windowSize=5,heights=Array.from({length:count},(_,i)=>i===11?24500:2600+(i%4)*350);
    const tops=[];let total=0;for(const h of heights){tops.push(total);total+=h;}m.style.height=total+'px';
    let start=arguments[0],frozen=false,timer=null,mounts=[],calls=[],writes=[],events=[],serial=0;
    function render(){
      m.replaceChildren();const wanted=new Set([count-2,count-1]);for(let i=start;i<Math.min(count,start+windowSize);i++)wanted.add(i);
      for(const i of [...wanted].sort((a,b)=>a-b))for(const role of ['user','assistant']){
        const shell=document.createElement('section');shell.dataset.testid='conversation-turn-'+serial++;shell.dataset.turn=role;shell.dataset.turnId=prefix+':'+role[0]+'-'+i;shell.dataset.anchorIndex=String(i);shell.dataset.anchorRole=role;
        const offset=role==='user'?0:100,height=role==='user'?100:heights[i]-100;
        shell.style.cssText='position:absolute;left:20px;right:20px;top:'+(tops[i]+offset)+'px;height:'+height+'px;content-visibility:auto;contain-intrinsic-size:auto '+height+'px';
        const b=document.createElement('div');b.dataset.messageAuthorRole=role;b.dataset.messageId=prefix+':'+role[0]+'-'+i;b.textContent=role==='user'?(edits.get(i)??prefix+' 本機提問 '+i):'本機長回答 '+i;b.style.cssText='min-height:70px';shell.append(b);m.append(shell);
      }
      if(start===0&&busyTail){const loading=document.createElement("div");loading.setAttribute("role","progressbar");loading.style.cssText="position:absolute;top:"+(total-20)+"px";m.append(loading);}
      mounts.push({start,end:Math.min(count-1,start+windowSize-1),at:performance.now()});
    }
    function observeEdge(){
      const viewport=root.getBoundingClientRect(),end=Math.min(count-1,start+windowSize-1),liveEnd=end>=27?29:end;
      for(const direction of ['older','newer']){
        const index=direction==='older'?start:liveEnd,role=direction==='older'?'user':'assistant';
        const shell=m.querySelector('section[data-anchor-index="'+index+'"][data-anchor-role="'+role+'"]');
        const rect=shell.getBoundingClientRect(),edge=direction==='older'?rect.top:rect.bottom,boundary=direction==='older'?viewport.top:viewport.bottom;
        if(Math.abs(edge-boundary)>32)continue;
        calls.push({index,role,outer:true,pinned:false,direction,start,end,at:performance.now(),top:root.scrollTop,edgeError:edge-boundary});
        if(!frozen){const next=direction==='older'?Math.max(0,start-windowSize+1):Math.min(count-windowSize,start+windowSize-1);
          if(next!==start){clearTimeout(timer);timer=setTimeout(()=>{start=next;render();},130);}}
      }
      // Observe disjoint tail arrivals too. They never advance the renderer and
      // are failures even if every message later happens to be collected.
      if(end<27)for(const shell of m.querySelectorAll('section[data-anchor-index="29"]')){
        const rect=shell.getBoundingClientRect();if(Math.abs(rect.bottom-viewport.bottom)<=32)calls.push({index:29,pinned:true,direction:'newer',start,end,at:performance.now(),top:root.scrollTop});
      }
    }
    const oldObserve=observeEdge;
    observeEdge=function(){
      if (!frozen && root.scrollTop+root.clientHeight>=root.scrollHeight-2 && start!==count-windowSize) {clearTimeout(timer);timer=setTimeout(()=>{start=count-windowSize;render();},130);return;}
      oldObserve();
    };
    let remountTimer=null,growTimer=null,busyTail=false;
    root.addEventListener('scroll',()=>{events.push({top:root.scrollTop,at:performance.now()});writes.push({kind:'native-scroll-event',at:performance.now(),top:root.scrollTop});observeEdge();});
    render();root.scrollTop=tops[Math.min(29,start+2)]+20;
    window.anchorFixture={remountHead(){remountTimer=setInterval(()=>{if(start===0)render();},80);},growTail(){busyTail=true;growTimer=setInterval(()=>{if(start===0)m.style.height=(parseFloat(m.style.height)+3)+'px';},200);},stopNoise(){clearInterval(remountTimer);clearInterval(growTimer);},edit(i){edits.set(i,prefix+' changed prompt '+i);render();},freeze(v=true){frozen=v;},tail(){clearTimeout(timer);start=23;render();root.scrollTop=tops[25]+20;},stats(){return {start,top:root.scrollTop,mounts:mounts.slice(),calls:calls.slice(),writes:writes.slice(),events:events.slice(),lazyShells:m.querySelectorAll('section').length,contentVisibility:getComputedStyle(m.querySelector('section')).contentVisibility,rootHeight:root.scrollHeight,outerHeight:decoy.scrollHeight,outerClient:decoy.clientHeight};}};
