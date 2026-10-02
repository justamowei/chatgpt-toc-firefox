import { FIXTURE } from './config';

// Private website protocols, independently implemented from the public author's
// source. This verifies a server snapshot, not the branch displayed by the UI.
// https://github.com/sguzman/script-monkey/tree/main/userscripts/chatgpt.com/chatgpt-copy-entire-chat
export interface HistoryEntry { id: string; text: string; stable: true; screenText: string; }
export interface HistorySnapshot {
  conversation: string;
  branch: string;
  source: 'paginated-api' | 'legacy-api';
  entries: HistoryEntry[];
  messageIds: string[];
  messages: { id: string; role: 'user' | 'assistant' }[];
  pages: number;
  exhausted: true;
  screenVerified: false;
  revisionVerified: boolean;
}
export interface HistoryLimits {
  totalMs: number; pageMs: number; maxPages: number; maxMessages: number;
  pageBytes: number; totalBytes: number; textChars: number;
  maxRetries: number; retryDelayMs: number; maxDepth: number;
}
export const HISTORY_LIMITS: Readonly<HistoryLimits> = Object.freeze({
  totalMs: 60_000, pageMs: 8_000, maxPages: 100, maxMessages: 10_000,
  pageBytes: 2 * 1024 * 1024, totalBytes: 16 * 1024 * 1024, textChars: 262_144,
  maxRetries: 2, retryDelayMs: 10_000, maxDepth: 32,
});
export interface HistoryDependencies { fetch?: typeof fetch; limits?: Partial<HistoryLimits>; origin?: string; }
export type HistoryErrorCode = 'unsupported-url' | 'aborted' | 'timeout' | 'access-denied' | 'http' | 'rate-limit' | 'schema' | 'limit' | 'changed';
export type HistoryLimitKind = 'configuration' | 'session-bytes' | 'page-bytes' | 'total-bytes' | 'text-chars' | 'depth' | 'nodes' | 'messages' | 'pages';
export interface HistoryLimitFailure {
  kind: HistoryLimitKind; observed: number; maximum: number;
  measurement: 'decoded-bytes' | 'declared-bytes' | 'count';
  stage?: 'session' | 'head' | 'older' | 'recheck' | 'legacy' | 'legacy-recheck';
  pageTurns?: number; completedPages?: number; consumedBytes?: number; requests?: number;
}
export class HistoryError extends Error {
  constructor(public readonly code: HistoryErrorCode, public readonly limit?: HistoryLimitFailure) { super(`History ${code}`); this.name = 'HistoryError'; }
}
type JsonRecord = Record<string, unknown>;
interface ApiMessage { id: string; role: string; visible: boolean; text: string; screenText: string; signature: string; parent?: string | null; }
interface Page { messages: ApiMessage[]; previous: boolean; next?: boolean; cursor: string | null; revision: string; hasRevision: boolean; }
const uuid = '[0-9a-fA-F]{8}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{12}';
const path = new RegExp(`^/(?:g/[A-Za-z0-9_-]+/)?c/(${uuid})/?$`);
const internalTypes = new Set(['thoughts', 'reasoning', 'reasoning_recap', 'model_editable_context', 'user_editable_context', 'tether_browsing_display', 'tether_quote']);
const assets = new Set(['image_asset_pointer', 'file_asset_pointer', 'file', 'audio_asset_pointer', 'video_asset_pointer']);
function fail(code: HistoryErrorCode): never { throw new HistoryError(code); }
function failLimit(kind: HistoryLimitKind, observed: number, maximum: number, measurement: HistoryLimitFailure['measurement'] = 'count'): never {
  throw new HistoryError('limit', { kind, observed, maximum, measurement });
}
function record(value: unknown): JsonRecord { if (!value || typeof value !== 'object' || Array.isArray(value)) fail('schema'); return value as JsonRecord; }
function identifier(value: unknown): string {
  if (typeof value !== 'string' || !value || value.length > 200 || /[\s\u0000-\u001f\u007f]/u.test(value)) fail('schema');
  return value;
}
function active(signal: AbortSignal): void {
  if (signal.aborted) throw signal.reason instanceof HistoryError ? signal.reason : new HistoryError('aborted');
}
function abortable<T>(operation: () => Promise<T>, signal: AbortSignal): Promise<T> {
  active(signal);
  return new Promise<T>((resolve, reject) => {
    const aborted = () => reject(signal.reason instanceof HistoryError ? signal.reason : new HistoryError('aborted'));
    signal.addEventListener('abort', aborted, { once: true });
    Promise.resolve().then(() => { active(signal); return operation(); }).then(value => {
      signal.removeEventListener('abort', aborted);
      if (signal.aborted) aborted(); else resolve(value);
    }, () => { signal.removeEventListener('abort', aborted); if (signal.aborted) aborted(); else reject(new HistoryError('http')); });
  });
}
function canonical(value: unknown): string {
  if (Array.isArray(value)) return `[${value.map(canonical).join(',')}]`;
  if (value && typeof value === 'object') return `{${Object.entries(value).sort(([a], [b]) => a < b ? -1 : a > b ? 1 : 0).map(([key, item]) => `${JSON.stringify(key)}:${canonical(item)}`).join(',')}}`;
  return JSON.stringify(value);
}
function boundedShape(value: unknown, limits: HistoryLimits, depth = 0, counter = { nodes: 0 }): void {
  if (depth > limits.maxDepth) failLimit('depth', depth, limits.maxDepth);
  if (++counter.nodes > limits.maxMessages * 128) failLimit('nodes', counter.nodes, limits.maxMessages * 128);
  if (value && typeof value === 'object') for (const child of Object.values(value)) boundedShape(child, limits, depth + 1, counter);
}
function message(value: unknown, limits: HistoryLimits): ApiMessage {
  const m = record(value), id = identifier(m.id), role = record(m.author).role;
  if (typeof role !== 'string' || !['user', 'assistant', 'system', 'tool', 'developer'].includes(role)) fail('schema');
  const metadata = m.metadata === undefined || m.metadata === null ? {} : record(m.metadata);
  for (const key of ['is_visually_hidden_from_conversation', 'is_visually_hidden']) if (metadata[key] !== undefined && typeof metadata[key] !== 'boolean') fail('schema');
  if (m.weight !== undefined && (typeof m.weight !== 'number' || !Number.isFinite(m.weight) || m.weight < 0)) fail('schema');
  if (m.recipient !== undefined && m.recipient !== null && typeof m.recipient !== 'string') fail('schema');
  if (m.channel !== undefined && m.channel !== null && typeof m.channel !== 'string') fail('schema');
  const content = record(m.content);
  const kind = content.content_type;
  if (typeof kind !== 'string' || !kind) fail('schema');
  const visible = (role === 'user' || role === 'assistant') && !metadata.is_visually_hidden_from_conversation && !metadata.is_visually_hidden &&
    m.weight !== 0 && (m.recipient === undefined || m.recipient === null || m.recipient === 'all') && m.channel !== 'analysis' && !internalTypes.has(kind);
  let text = '', screenText = '';
  if (visible && role === 'user') {
    const pieces: string[] = []; let attachment = assets.has(kind);
    if (kind === 'text' || kind === 'multimodal_text') {
      if (!Array.isArray(content.parts)) fail('schema');
      for (const part of content.parts) {
        if (typeof part === 'string') pieces.push(part);
        else {
          if (kind === 'text') fail('schema');
          const p = record(part), type = p.content_type ?? p.type;
          if (typeof type !== 'string' || !assets.has(type)) fail('schema');
          attachment = true;
        }
      }
    } else if (!attachment) fail('schema');
    screenText = pieces.join('\n\n').replace(/\r\n/g, '\n').trim() || '〔附件或非文字提問〕';
    if (metadata.attachments !== undefined) {
      if (!Array.isArray(metadata.attachments)) fail('schema');
      for (const item of metadata.attachments) {
        const a = record(item), name = a.name ?? a.file_name ?? a.filename ?? a.display_name;
        if (name !== undefined && (typeof name !== 'string' || name.length > 1024)) fail('schema');
        if (typeof name === 'string' && name) pieces.push(`〔附件：${name}〕`);
        attachment = true;
      }
    }
    text = pieces.join('\n\n').replace(/\r\n/g, '\n').trim();
    if (!text && attachment) text = '〔附件或非文字提問〕';
    if (!text) fail('schema'); // An unknown/empty visible prompt is not silently dropped.
    if (text.length > limits.textChars) failLimit('text-chars', text.length, limits.textChars);
  }
  let parent: string | null | undefined;
  if (Object.hasOwn(m, 'parent') || Object.hasOwn(m, 'parent_id')) {
    const p = Object.hasOwn(m, 'parent_id') ? m.parent_id : m.parent;
    parent = p === null ? null : identifier(p);
    if (Object.hasOwn(m, 'parent') && Object.hasOwn(m, 'parent_id') && m.parent !== m.parent_id) fail('schema');
  }
  return { id, role: role as string, visible, text, screenText, signature: canonical(m), ...(parent !== undefined ? { parent } : {}) };
}
function revision(payload: JsonRecord, conversation: string): { revision: string; hasRevision: boolean } {
  for (const key of ['conversation_id', 'id']) if (payload[key] !== undefined && (typeof payload[key] !== 'string' || payload[key].toLowerCase() !== conversation.toLowerCase())) fail('changed');
  if (payload.current_node !== undefined && payload.current_node !== null) identifier(payload.current_node);
  if (payload.update_time !== undefined && (typeof payload.update_time !== 'number' || !Number.isFinite(payload.update_time))) fail('schema');
  return { revision: canonical([payload.current_node ?? null, payload.update_time ?? null, Object.hasOwn(payload, 'current_node'), Object.hasOwn(payload, 'update_time')]), hasRevision: typeof payload.current_node === 'string' || typeof payload.update_time === 'number' };
}
function page(value: unknown, conversation: string, limits: HistoryLimits): Page {
  const p = record(value), info = record(p.page_info);
  if (!Array.isArray(p.messages) || !p.messages.length || typeof info.has_previous_page !== 'boolean') fail('schema');
  if (p.messages.length > limits.maxMessages) failLimit('messages', p.messages.length, limits.maxMessages);
  if (Object.hasOwn(info, 'has_next_page') && typeof info.has_next_page !== 'boolean') fail('schema');
  const cursor = info.start_cursor === null || info.start_cursor === undefined ? null : identifier(info.start_cursor);
  if (info.has_previous_page && !cursor) fail('schema');
  const messages = p.messages.map(item => message(item, limits));
  if (new Set(messages.map(m => m.id)).size !== messages.length) fail('schema');
  return { messages, previous: info.has_previous_page, ...(Object.hasOwn(info, 'has_next_page') ? { next: info.has_next_page as boolean } : {}), cursor, ...revision(p, conversation) };
}
function legacy(value: unknown, conversation: string, limits: HistoryLimits): { messages: ApiMessage[]; revision: string; hasRevision: boolean } {
  const p = record(value), mapping = record(p.mapping);
  if (Object.keys(mapping).length > limits.maxMessages) failLimit('messages', Object.keys(mapping).length, limits.maxMessages);
  const nodes: ApiMessage[] = [], seen = new Set<string>(); let id: string | null = identifier(p.current_node);
  while (id !== null) {
    if (seen.has(id)) fail('schema'); seen.add(id);
    if (seen.size > limits.maxMessages) failLimit('messages', seen.size, limits.maxMessages);
    if (!Object.hasOwn(mapping, id)) fail('schema');
    const node = record(mapping[id]);
    if (node.id !== undefined && node.id !== id) fail('schema');
    if (!Object.hasOwn(node, 'parent') || !Object.hasOwn(node, 'message')) fail('schema');
    if (node.message !== null) nodes.push(message(node.message, limits));
    id = node.parent === null ? null : identifier(node.parent);
  }
  nodes.reverse();
  if (!nodes.length || new Set(nodes.map(m => m.id)).size !== nodes.length) fail('schema');
  return { messages: nodes, ...revision(p, conversation) };
}
function checkParents(messages: ApiMessage[]): void {
  const ids = new Set(messages.map(m => m.id));
  for (let i = 0; i < messages.length; i++) {
    const parent = messages[i].parent;
    if (parent === undefined) continue;
    if (i === 0) { if (parent !== null && ids.has(parent)) fail('schema'); }
    else if (parent !== messages[i - 1].id) fail('schema');
  }
}
function prepend(older: ApiMessage[], current: ApiMessage[]): ApiMessage[] {
  const known = new Map(current.map(m => [m.id, m]));
  const firstOverlap = older.findIndex(m => known.has(m.id));
  const additions = firstOverlap < 0 ? older : older.slice(0, firstOverlap);
  if (!additions.length) fail('schema');
  if (firstOverlap >= 0) {
    const overlap = older.slice(firstOverlap);
    if (overlap.length > current.length || overlap.some((m, i) => m.id !== current[i].id)) fail('schema');
    if (overlap.some((m, i) => m.signature !== current[i].signature)) fail('changed');
  }
  return [...additions, ...current];
}
function endpointOrigin(value: string | undefined): string {
  if (value === undefined || value === 'https://chatgpt.com') return 'https://chatgpt.com';
  if (FIXTURE) {
    try { const p = new URL(value); if (p.origin === value && p.protocol === 'http:' && p.hostname === '127.0.0.1' && !p.username && !p.password) return p.origin; } catch { /* fail closed */ }
  }
  return fail('unsupported-url');
}
async function fingerprint(messages: ApiMessage[], source: string, signal: AbortSignal): Promise<string> {
  const bytes = new TextEncoder().encode(canonical([source, messages.map(m => m.signature)]));
  const digest = await abortable(() => crypto.subtle.digest('SHA-256', bytes), signal);
  return `server:${Array.from(new Uint8Array(digest), byte => byte.toString(16).padStart(2, '0')).join('')}`;
}

export async function loadHistory(url: string, signal: AbortSignal, progress?: (pages: number) => void, deps: HistoryDependencies = {}): Promise<HistorySnapshot> {
  const origin = endpointOrigin(deps.origin);
  let parsed: URL; try { parsed = new URL(url); } catch { return fail('unsupported-url'); }
  const match = parsed.pathname.match(path);
  if (parsed.origin !== origin || parsed.username || parsed.password || !match) fail('unsupported-url');
  const conversation = match[1].toLowerCase();
  const limits: HistoryLimits = { ...HISTORY_LIMITS, ...deps.limits };
  for (const [key, value] of Object.entries(limits)) if (!Number.isSafeInteger(value) || value < (key === 'maxRetries' ? 0 : 1)) failLimit('configuration', Number.isSafeInteger(value) ? value : 0, key === 'maxRetries' ? 0 : 1);
  const controller = new AbortController();
  const aborted = () => controller.abort(new HistoryError('aborted'));
  signal.addEventListener('abort', aborted, { once: true });
  if (signal.aborted) aborted();
  const totalTimer = setTimeout(() => controller.abort(new HistoryError('timeout')), limits.totalMs);
  const fetcher = deps.fetch ?? globalThis.fetch.bind(globalThis);
  let consumed = 0, completedPages = 0, requests = 0, currentTurns = 0;
  let stage: NonNullable<HistoryLimitFailure['stage']> = 'session';
  async function read(response: Response, own: AbortSignal, maximum: number, session: boolean): Promise<unknown> {
    if (!/^application\/(?:json|[\w.+-]+\+json)(?:\s*;|$)/i.test(response.headers.get('content-type') ?? '')) fail('schema');
    const length = response.headers.get('content-length');
    if (length !== null && (!/^\d+$/.test(length) || !Number.isSafeInteger(Number(length)))) { void response.body?.cancel().catch(() => {}); fail('schema'); }
    if (length !== null && Number(length) > maximum) {
      void response.body?.cancel().catch(() => {});
      failLimit(session ? 'session-bytes' : 'page-bytes', Number(length), maximum, 'declared-bytes');
    }
    if (!response.body) fail('schema');
    const reader = response.body.getReader(); const chunks: Uint8Array[] = []; let size = 0;
    try {
      for (;;) {
        const result = await abortable(() => reader.read(), own);
        active(own);
        if (result.done) break;
        size += result.value.byteLength; consumed += result.value.byteLength;
        // Total budget takes precedence: shrinking a page cannot restore bytes already read.
        if (consumed > limits.totalBytes) failLimit('total-bytes', consumed, limits.totalBytes, 'decoded-bytes');
        if (size > maximum) failLimit(session ? 'session-bytes' : 'page-bytes', size, maximum, 'decoded-bytes');
        chunks.push(result.value);
      }
      const data = new Uint8Array(size); let offset = 0;
      for (const chunk of chunks) { data.set(chunk, offset); offset += chunk.byteLength; }
      let value: unknown;
      try { value = JSON.parse(new TextDecoder('utf-8', { fatal: true }).decode(data)); } catch { return fail('schema'); }
      boundedShape(value, limits); return value;
    } finally { void reader.cancel().catch(() => {}); }
  }
  async function request(route: string, token?: string, allow404 = false, session = false): Promise<unknown | null> {
    const target = origin + route;
    for (let attempt = 0; ; attempt++) {
      active(controller.signal);
      const own = new AbortController(), stop = () => own.abort(controller.signal.reason);
      controller.signal.addEventListener('abort', stop, { once: true });
      if (controller.signal.aborted) stop();
      const timer = setTimeout(() => own.abort(new HistoryError('timeout')), limits.pageMs);
      let retry = 0;
      try {
        requests++;
        const response = await abortable(() => fetcher(target, { method: 'GET', credentials: 'same-origin', mode: 'same-origin', redirect: 'error', cache: 'no-store', signal: own.signal,
          headers: { Accept: 'application/json', ...(token ? { Authorization: `Bearer ${token}` } : {}) } }), own.signal);
        active(own.signal);
        if (response.redirected || (response.url && response.url !== target)) fail('http');
        if (response.status === 401 || response.status === 403) fail('access-denied');
        if (response.status === 404 && allow404) { void response.body?.cancel().catch(() => {}); return null; }
        if (response.status === 429) {
          void response.body?.cancel().catch(() => {});
          if (attempt >= limits.maxRetries) fail('rate-limit');
          const raw = response.headers.get('retry-after');
          retry = raw && /^\d+$/.test(raw) ? Number(raw) * 1000 : raw && Number.isFinite(Date.parse(raw)) ? Math.max(0, Date.parse(raw) - Date.now()) : 500 * 2 ** attempt;
          if (!Number.isFinite(retry) || retry > limits.retryDelayMs) fail('rate-limit');
        } else {
          if (!response.ok) fail('http');
          const value = await read(response, own.signal, session ? Math.min(limits.pageBytes, 256 * 1024) : limits.pageBytes, session);
          active(own.signal); return value;
        }
      } finally { clearTimeout(timer); controller.signal.removeEventListener('abort', stop); own.abort(new HistoryError('aborted')); }
      await new Promise<void>((resolve, reject) => {
        active(controller.signal);
        const stopped = () => { clearTimeout(wait); reject(controller.signal.reason); };
        const wait = setTimeout(() => { controller.signal.removeEventListener('abort', stopped); resolve(); }, retry);
        controller.signal.addEventListener('abort', stopped, { once: true });
      });
    }
  }
  async function paginated(before: string | null, turns: number, shrink: boolean): Promise<{ value: unknown | null; turns: number }> {
    for (;;) {
      active(controller.signal); currentTurns = turns;
      const route = `/backend-api/conversations/${conversation}?include_has_versions=true&num_turns=${turns}${before === null ? '' : `&before=${encodeURIComponent(before)}`}`;
      try { return { value: await request(route, token, stage === 'head' && turns === 100), turns }; }
      catch (error) {
        // A smaller batch only addresses a page-byte failure. Keep the same cursor,
        // total deadline and consumed-byte budget; never install a partial result.
        if (!shrink || !(error instanceof HistoryError) || error.limit?.kind !== 'page-bytes' || turns === 1) throw error;
        active(controller.signal); turns = Math.max(1, Math.floor(turns / 2));
      }
    }
  }
  let token = '';
  try {
    active(controller.signal);
    const session = record(await request('/api/auth/session', undefined, false, true));
    const sessionToken = session.accessToken ?? session.access_token;
    if (typeof sessionToken !== 'string' || !/^[A-Za-z0-9._~+/=-]{1,8192}$/.test(sessionToken) || (session.accessToken && session.access_token && session.accessToken !== session.access_token)) fail('access-denied');
    token = sessionToken;
    stage = 'head';
    const firstRead = await paginated(null, 100, true), first = firstRead.value;
    let source: HistorySnapshot['source'], messages: ApiMessage[], pages: number, hasRevision: boolean;
    if (first === null) {
      source = 'legacy-api'; const route = `/backend-api/conversation/${conversation}`; stage = 'legacy'; currentTurns = 0;
      const snapshot = legacy(await request(route, token), conversation, limits);
      messages = snapshot.messages; hasRevision = snapshot.hasRevision; pages = 1;
      completedPages = pages; active(controller.signal); progress?.(pages); active(controller.signal);
      stage = 'legacy-recheck';
      const checked = legacy(await request(route, token), conversation, limits);
      if (snapshot.revision !== checked.revision || canonical(messages.map(m => m.signature)) !== canonical(checked.messages.map(m => m.signature))) fail('changed');
    } else {
      source = 'paginated-api'; let current = page(first, conversation, limits);
      if (current.next === true) fail('schema'); // A newest request cannot leave a known newer page unread.
      const head = current, headTurns = firstRead.turns; let batchTurns = headTurns;
      messages = current.messages; hasRevision = current.hasRevision; pages = 1;
      const seenCursors = new Set<string>();
      completedPages = pages; active(controller.signal); progress?.(pages); active(controller.signal);
      while (current.previous) {
        if (pages >= limits.maxPages) failLimit('pages', pages + 1, limits.maxPages);
        if (!current.cursor || seenCursors.has(current.cursor)) fail('schema');
        seenCursors.add(current.cursor);
        stage = 'older'; const olderRead = await paginated(current.cursor, batchTurns, true); batchTurns = olderRead.turns;
        current = page(olderRead.value, conversation, limits);
        if (current.revision !== head.revision) fail('changed');
        messages = prepend(current.messages, messages);
        if (messages.length > limits.maxMessages) failLimit('messages', messages.length, limits.maxMessages);
        pages++; completedPages = pages; active(controller.signal); progress?.(pages); active(controller.signal);
      }
      checkParents(messages);
      stage = 'recheck';
      // Recheck precisely the original head boundary. Shrinking it here would
      // compare a different subset and cannot establish the original snapshot.
      const checked = page((await paginated(null, headTurns, false)).value, conversation, limits);
      if (checked.next === true || checked.next !== head.next || checked.revision !== head.revision || checked.previous !== head.previous || checked.cursor !== head.cursor || canonical(head.messages.map(m => m.signature)) !== canonical(checked.messages.map(m => m.signature))) fail('changed');
    }
    active(controller.signal);
    const visible = messages.filter(m => m.visible);
    const entries: HistoryEntry[] = visible.filter(m => m.role === 'user').map(m => ({ id: m.id, text: m.text, screenText: m.screenText, stable: true }));
    if (!entries.length) fail('schema');
    const branch = await fingerprint(messages, source, controller.signal); active(controller.signal);
    return { conversation, branch, source, entries, messageIds: visible.map(m => m.id), messages: visible.map(m => ({ id: m.id, role: m.role as 'user' | 'assistant' })), pages, exhausted: true, screenVerified: false, revisionVerified: hasRevision };
  } catch (error) {
    if (controller.signal.aborted) active(controller.signal);
    if (error instanceof HistoryError && error.limit) throw new HistoryError(error.code, { ...error.limit, stage, pageTurns: currentTurns, completedPages, consumedBytes: consumed, requests });
    throw error instanceof HistoryError ? error : new HistoryError('schema');
  } finally { clearTimeout(totalTimer); signal.removeEventListener('abort', aborted); controller.abort(new HistoryError('aborted')); }
}
