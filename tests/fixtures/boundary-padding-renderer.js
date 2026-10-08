document.body.replaceChildren(document.createElement('main'));const prefix=arguments[1],edits=new Map(arguments[3]??[]),layout=arguments[4]??{},headPad=layout.headPad??0,tailPad=layout.tailPad??0;

    const m=document.querySelector('main');m.removeAttribute('data-fixture-branch');
    m.style.cssText='margin:0;padding:0;position:relative;overflow:visible;height:auto';m.replaceChildren();
    const decoy=document.createElement('div');decoy.setAttribute('data-scroll-root','');decoy.style.cssText='height:650px;overflow:auto';m.before(decoy);
    let root=document.createElement('div');root.setAttribute('data-scroll-root','');root.style.cssText='height:650px;overflow:hidden;position:relative';decoy.append(root);root.append(m);
    let count=arguments[2]??30;const windowSize=5,heights=Array.from({length:count},(_,i)=>i===11?24500:2600+(i%4)*350);
    const tops=[];let total=headPad;for(const h of heights){tops.push(total);total+=h;}m.style.height=(total+tailPad)+'px';
    let start=arguments[0],frozen=false,timer=null,mounts=[],calls=[],writes=[],events=[],serial=0,historyPending=false,historyScheduled=false,historyStarted=null,historyFinished=null,extraOlder=false,noiseTimer=null,noiseChanges=0;
    function render(){
      m.replaceChildren();const wanted=new Set([count-2,count-1]);for(let i=start;i<Math.min(count,start+windowSize);i++)wanted.add(i);
      if(extraOlder)wanted.add(-1);for(const i of [...wanted].sort((a,b)=>a-b))for(const role of ['user','assistant']){
        const shell=document.createElement('section');shell.dataset.testid='conversation-turn-'+serial++;shell.dataset.turn=role;shell.dataset.turnId=prefix+':'+role[0]+'-'+i;shell.dataset.anchorIndex=String(i);shell.dataset.anchorRole=role;
        const offset=role==='user'?0:100,height=role==='user'?100:(i===-1?headPad:heights[i])-100;
        shell.style.cssText='position:absolute;left:20px;right:20px;top:'+((i===-1?0:tops[i])+offset)+'px;height:'+height+'px;content-visibility:auto;contain-intrinsic-size:auto '+height+'px';
        const b=document.createElement('div');b.dataset.messageAuthorRole=role;b.dataset.messageId=prefix+':'+role[0]+'-'+i;b.textContent=role==='user'?(edits.get(i)??prefix+' 本機提問 '+i):'本機長回答 '+i;b.style.cssText='min-height:70px';shell.append(b);if(layout.streamingBusy&&i===count-1&&role==='assistant'){shell.setAttribute('aria-busy','true');const busy=document.createElement('div');busy.setAttribute('role','progressbar');busy.style.cssText='position:absolute;bottom:10px;left:0;width:40px;height:20px';shell.append(busy);}m.append(shell);
      }
      if(start===0&&busyTail){const loading=document.createElement("div");loading.setAttribute("role","progressbar");loading.style.cssText="position:absolute;top:"+(total-20)+"px";m.append(loading);}
      if(start===0&&layout.loaderDelay&&!historyScheduled){historyScheduled=true;historyPending=true;historyStarted=performance.now();setTimeout(()=>{historyPending=false;extraOlder=true;historyFinished=performance.now();render();},layout.loaderDelay);}
      if(layout.hiddenLoader){const hidden=document.createElement('div');hidden.setAttribute('role','progressbar');hidden.setAttribute('aria-hidden','true');hidden.style.cssText='position:absolute;top:10px;width:40px;height:30px';m.append(hidden);const invisible=hidden.cloneNode();invisible.removeAttribute('aria-hidden');invisible.style.visibility='hidden';m.append(invisible);}
      if(historyPending){const spinner=document.createElement('div');spinner.setAttribute('role','progressbar');spinner.style.cssText='position:absolute;left:20px;top:'+(layout.overlapLoader?headPad+10:10)+'px;width:40px;height:30px';m.append(spinner);}
      mounts.push({start,end:Math.min(count-1,start+windowSize-1),at:performance.now()});
    }
    function observeEdge(){
      const viewport=root.getBoundingClientRect(),end=Math.min(count-1,start+windowSize-1),liveEnd=end>=count-3?count-1:end;
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
      if(end<count-3)for(const shell of m.querySelectorAll('section[data-anchor-index="'+(count-1)+'"]')){
        const rect=shell.getBoundingClientRect();if(Math.abs(rect.bottom-viewport.bottom)<=32)calls.push({index:29,pinned:true,direction:'newer',start,end,at:performance.now(),top:root.scrollTop});
      }
    }
    const oldObserve=observeEdge;
    observeEdge=function(){
      if (!frozen && root.scrollTop+root.clientHeight>=root.scrollHeight-2 && start!==count-windowSize) {clearTimeout(timer);timer=setTimeout(()=>{start=count-windowSize;render();},130);return;}
      oldObserve();
    };
    let remountTimer=null,growTimer=null,busyTail=false;
    function attach(){root.addEventListener('scroll',()=>{events.push({top:root.scrollTop,at:performance.now()});writes.push({kind:'native-scroll-event',at:performance.now(),top:root.scrollTop});observeEdge();});}attach();
    render();root.scrollTop=tops[Math.min(29,start+2)]+20;
    window.anchorFixture={replaceRoot(){const previous=root;root=previous.cloneNode(false);const top=previous.scrollTop;previous.replaceWith(root);root.append(m);attach();root.scrollTop=top;},noiseTail(){noiseTimer=setInterval(()=>{m.style.height=(parseFloat(m.style.height)+3)+'px';const bubble=m.querySelector('section[data-anchor-index="'+(count-1)+'"][data-anchor-role="assistant"]>div');if(bubble)bubble.textContent='Streaming answer '+noiseChanges;noiseChanges++;},200);},append(text){const i=count,h=2800;heights.push(h);tops.push(total);total+=h;count++;if(text)edits.set(i,text);m.style.height=total+'px';start=Math.max(0,count-windowSize);render();root.scrollTop=total-root.clientHeight;return prefix+':u-'+i;},remountHead(){remountTimer=setInterval(()=>{if(start===0)render();},80);},growTail(){busyTail=true;growTimer=setInterval(()=>{if(start===0)m.style.height=(parseFloat(m.style.height)+3)+'px';},200);},stopNoise(){clearInterval(noiseTimer);clearInterval(remountTimer);clearInterval(growTimer);},edit(i){edits.set(i,prefix+' changed prompt '+i);render();},freeze(v=true){frozen=v;},tail(){clearTimeout(timer);start=23;render();root.scrollTop=tops[25]+20;},stats(){return {start,top:root.scrollTop,mounts:mounts.slice(),calls:calls.slice(),writes:writes.slice(),events:events.slice(),lazyShells:m.querySelectorAll('section').length,contentVisibility:getComputedStyle(m.querySelector('section')).contentVisibility,headPad,tailPad,historyPending,historyStarted,historyFinished,extraOlder,noiseChanges,rootHeight:root.scrollHeight,outerHeight:decoy.scrollHeight,outerClient:decoy.clientHeight};}};
