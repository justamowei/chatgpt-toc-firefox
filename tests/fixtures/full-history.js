// Isolated synthetic virtual renderer: 200 persistent shells, seven mounted prompts.
const main = document.querySelector('main');
main.removeAttribute('data-fixture-branch'); main.style.padding = '0';
function prompt(i) { return i === 3 ? '<img src=x onerror=alert(1)> 合成字串' : `完整目錄 第${i}則提問 Firefox`; }
const shells = [];
for (let i=0;i<200;i++) {
  const shell=document.createElement('section');shell.dataset.turnKey='u-'+i;
  shell.style.cssText='height:320px;padding:25px;overflow:hidden;border-bottom:1px solid #eee';
  main.append(shell);shells.push(shell);
}
let start=193, mountedStart=null, revision=0, enabled=true;
function mount(next, force=false) {
  start=Math.max(0,Math.min(193,next));
  if(!force&&mountedStart===start)return;
  mountedStart=start;
  for(let i=0;i<200;i++) {
    shells[i].replaceChildren();
    if(i<start||i>=start+7)continue;
    const user=document.createElement('div');user.dataset.userMessageBubble='';user.textContent=prompt(i)+(revision&&i===start?' 已編輯':'');user.style.minHeight='100px';
    const assistant=document.createElement('div');assistant.dataset.conversationRole='assistant';assistant.textContent='合成回答 '+i;assistant.style.minHeight='100px';
    shells[i].append(user,assistant);
  }
}
main.scrollTop=193*320;mount(193);
main.addEventListener('scroll',()=>{if(enabled)mount(Math.floor(main.scrollTop/320));});
window.fullFixture={mount,edit(){revision++;mount(start,true);},append(){const n=document.createElement('section');n.dataset.turnKey='u-new';n.innerHTML='<div data-user-message-bubble>新增提問</div>';main.append(n);},freeze(value){enabled=!value;},drop(){for(const n of shells)n.replaceChildren();mountedStart=null;}};
