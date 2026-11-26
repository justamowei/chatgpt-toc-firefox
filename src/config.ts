declare const __FIXTURE__: boolean;
declare const __REVISION__: string;
export const FIXTURE = __FIXTURE__;
export const BUILD_REVISION = __REVISION__;
export const HOSTS = FIXTURE ? ['http://127.0.0.1/*'] : ['https://chatgpt.com/*'];
export function supported(url?: string): boolean {
  try {
    const parsed = new URL(url!);
    return FIXTURE ? parsed.protocol === 'http:' && parsed.hostname === '127.0.0.1' : parsed.origin === 'https://chatgpt.com';
  } catch { return false; }
}
