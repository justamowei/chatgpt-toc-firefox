const main = document.querySelector('main');
const prompts = Array.from({ length: 20 }, (_, i) => i === 3 ? '<img src=x onerror=alert(1)> 字串安全測試' : i === 4 || i === 5 ? '相同提問文字' : `提問 ${i}：Firefox 導航測試與閱讀位置`);
let mode = 'mounted', start = 0, branch = 'branch-A', pending = null;
function render() {
  main.replaceChildren(); main.dataset.fixtureBranch = branch;
  const end = mode === 'mounted' ? 20 : start + 10;
  for (let i = start; i < end; i++) {
    const article = document.createElement('article'); article.dataset.testid = `conversation-turn-${i * 2}`;
    const user = document.createElement('div'); user.dataset.messageAuthorRole = 'user'; user.dataset.messageId = `${branch}:u-${i}`; user.textContent = prompts[i];
    const answer = document.createElement('div'); answer.dataset.messageAuthorRole = 'assistant'; answer.dataset.messageId = `${branch}:a-${i}`; answer.textContent = `合成回答 ${i}。這個頁面沒有真實聊天、帳號或網路歷史 API。`;
    article.append(user, answer); main.append(article);
  }
}
main.addEventListener('scroll', () => {
  if (mode !== 'virtual' || pending) return;
  const next = main.scrollTop < 2 ? 0 : main.scrollTop + main.clientHeight >= main.scrollHeight - 2 ? 10 : start;
  if (next === start) return;
  pending = setTimeout(() => { pending = null; if (mode !== 'virtual') return; start = next; render(); main.scrollTop = next === 0 ? 40 : 150; }, 220);
});
window.fixture = {
  mode(value) { clearTimeout(pending); pending = null; mode = value; start = value === 'virtual' ? 10 : 0; render(); main.scrollTop = 150; },
  branch(value) { branch = value; render(); },
  route(value) { history.pushState({}, '', value); branch = value; start = 0; mode = 'mounted'; render(); },
  theme(dark) { document.documentElement.className = dark ? 'dark' : 'light'; },
  append() { const node = document.createElement('div'); node.dataset.messageAuthorRole = 'user'; node.dataset.messageId = branch + ':u-new'; node.textContent = '新提問'; main.append(node); },
};
render();
