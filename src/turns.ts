// Explicit role markers only: never infer a speaker from text or turn order.
const shellSelector = '[data-testid^="conversation-turn-"], [data-turn-id][data-turn]';
const selector = '[data-message-author-role], [data-conversation-role], [data-user-message-bubble], [data-chatgpt-agent-turn-start], [data-testid^="conversation-turn-"][data-turn], [data-turn-id][data-turn]';
const userMarker = '[data-user-message-bubble], [data-message-author-role="user"], [data-conversation-role="user"], [data-turn="user"]';
type Role = 'user' | 'assistant';
export interface Turn { node: HTMLElement; role: Role; stableId: string | null; apiId: string | null; slot: string | null; text: string; }
function identity(node: Element | null, attribute: string): string | null { return node?.getAttribute(attribute)?.trim() || null; }
function textOf(node: HTMLElement): string {
  const copy = node.cloneNode(true) as HTMLElement;
  for (const control of copy.querySelectorAll('button, [role="button"], nav, script, style, svg, [aria-hidden="true"], [contenteditable="true"]')) control.remove();
  return copy.textContent?.trim() || '';
}
export function readTurns(): Turn[] {
  const turns: Turn[] = [], seen = new Set<HTMLElement>();
  const mains = [...document.querySelectorAll('main')];
  for (const root of mains.length ? mains : [document.body]) for (const candidate of root.querySelectorAll<HTMLElement>(selector)) {
    if (candidate.closest('aside, nav, form, [role="textbox"], [contenteditable="true"], #chatgpt-toc-root')) continue;
    const shell = candidate.closest<HTMLElement>(shellSelector), group = candidate.closest<HTMLElement>('[data-turn-key]');
    const explicit = candidate.getAttribute('data-message-author-role') ?? candidate.getAttribute('data-conversation-role') ?? candidate.getAttribute('data-turn');
    const bubble = candidate.hasAttribute('data-user-message-bubble');
    const sentinel = candidate.hasAttribute('data-chatgpt-agent-turn-start');
    const role: Role | null = explicit === 'user' || explicit === 'assistant' ? explicit : bubble ? 'user' : sentinel ? 'assistant' : null;
    if (!role || ((bubble || sentinel || candidate.hasAttribute('data-conversation-role')) && !group && !shell)) continue;
    if (role === 'user' && candidate.parentElement?.closest('[data-message-author-role="assistant"], [data-conversation-role="assistant"], [data-turn="assistant"]')) continue;
    let node = candidate;
    if (candidate === shell) node = candidate.querySelector<HTMLElement>(role === 'user'
      ? '[data-message-author-role="user"], [data-conversation-role="user"], [data-user-message-bubble]'
      : '[data-message-author-role="assistant"], [data-conversation-role="assistant"]') ?? candidate;
    if (role === 'user') node = node.querySelector<HTMLElement>('[data-user-message-bubble]') ?? node;
    if (role === 'user' && node.parentElement?.closest('[data-message-author-role="assistant"], [data-conversation-role="assistant"], [data-turn="assistant"]')) continue;
    if (sentinel) {
      const content = candidate.closest<HTMLElement>('[data-conversation-role="assistant"], [data-message-author-role="assistant"]') ?? candidate.parentElement;
      // Empty sentinels and a shared user/assistant group are not return anchors.
      if (!content || content === group || !textOf(content) || content.matches(userMarker) || content.querySelector(userMarker)) continue;
      node = content;
    }
    if (seen.has(node)) continue;
    const text = textOf(node);
    if (role === 'assistant' && !text) continue;
    // Empty hydrated user bubbles are not evidence of an attachment prompt.
    if (role === 'user' && !text && !node.querySelector('img, video, audio, [data-attachment-id], [data-file-id], a[download]')) continue;
    seen.add(node);
    const message = node.closest('[data-message-id]'), messageId = identity(message, 'data-message-id');
    const messageRole = message?.getAttribute('data-message-author-role') ?? message?.getAttribute('data-conversation-role') ?? message?.getAttribute('data-turn');
    const ownedMessage = message === node || messageRole === role || (role === 'user' && !!message?.hasAttribute('data-user-message-bubble'));
    const turnKey = identity(group, 'data-turn-key'), turnId = identity(shell, 'data-turn-id');
    const stableId = messageId && ownedMessage ? messageId : turnKey ? `turn-key:${role}:${turnKey}` : turnId ? `turn:${role}:${turnId}` : messageId ? `message:${role}:${messageId}` : null;
    turns.push({ node, role, stableId, apiId: ownedMessage ? messageId : null, slot: identity(shell, 'data-testid'), text: text || '〔附件或非文字提問〕' });
  }
  return turns;
}
