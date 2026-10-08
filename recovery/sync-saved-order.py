"""Guarded GitHub Linux sync of original local checkpoint/delivery objects."""
import base64, hashlib, json, os, re, subprocess, sys, tempfile, urllib.error, urllib.request
from pathlib import Path
REPO='justamowei/chatgpt-toc-firefox'
OP='refs/heads/chore/saved-order-sync'
FIX='refs/heads/fix/saved-directory-order'
RELEASE='refs/heads/release/v0.3'
def sha(value):
    if not isinstance(value,str) or not re.fullmatch('[0-9a-f]{40}',value): raise ValueError('Invalid SHA')
    return value
def main():
    if sys.platform!='linux' or os.environ.get('GITHUB_ACTIONS')!='true': raise SystemExit('Cloud-only sync; local execution refused')
    if os.environ.get('GITHUB_REPOSITORY')!=REPO or os.environ.get('GITHUB_REF')!=OP: raise SystemExit('Wrong repository/ref')
    bootstrap=sha(os.environ['GITHUB_SHA']); token=os.environ['GITHUB_TOKEN']
    def api(path,missing=False):
        req=urllib.request.Request('https://api.github.com/repos/'+REPO+'/'+path,headers={'Authorization':'Bearer '+token,'Accept':'application/vnd.github+json','User-Agent':'toc-saved-order-sync'})
        try:
            with urllib.request.urlopen(req,timeout=45) as r: return json.load(r)
        except urllib.error.HTTPError as e:
            if missing and e.code==404: return None
            raise RuntimeError('API HTTP '+str(e.code)) from None
    def content(path):
        r=api('contents/'+path+'?ref='+bootstrap)
        if r.get('encoding')!='base64': raise ValueError('Expected base64 content')
        return base64.b64decode(r['content'])
    meta=json.loads(content('recovery/saved-order.json')); source=sha(meta['source']); bundle=content('recovery/saved-order.bundle')
    if hashlib.sha256(bundle).hexdigest()!=meta['bundleSha256']: raise ValueError('Bundle hash mismatch')
    mode=meta['mode']; refs=meta['expectedRefs']; tag=meta.get('tag')
    if mode=='checkpoint':
        if set(refs)!={FIX} or tag is not None: raise ValueError('Invalid checkpoint scope')
    elif mode=='delivery':
        if set(refs)!={FIX,RELEASE} or not tag or tag['name']!='v0.3.4': raise ValueError('Invalid delivery scope')
        sha(tag['object']);sha(tag['commit'])
    else: raise ValueError('Unexpected mode')
    for v in refs.values():
        if v is not None: sha(v)
    def remote(ref):
        r=api('git/ref/'+ref.removeprefix('refs/'),True);return r['object']['sha'] if r else None
    with tempfile.TemporaryDirectory(prefix='toc-sync-') as tmp:
        root=Path(tmp);repo=root/'repo.git';file=root/'original.bundle';file.write_bytes(bundle)
        env=dict(os.environ)
        for k in list(env):
            if k.startswith('GIT_TRACE') or k.startswith('GIT_CONFIG_') or k in ['GIT_ASKPASS','SSH_ASKPASS']:env.pop(k)
        auth=base64.b64encode(('x-access-token:'+token).encode()).decode()
        env.update({'GIT_TERMINAL_PROMPT':'0','GIT_CONFIG_COUNT':'1','GIT_CONFIG_KEY_0':'http.https://github.com/.extraheader','GIT_CONFIG_VALUE_0':'AUTHORIZATION: basic '+auth})
        def git(*args,check=True):
            result=subprocess.run(['git','-c','credential.helper=','-c','core.askpass=','--git-dir',str(repo),*args],env=env,capture_output=True,text=True)
            if check and result.returncode:raise RuntimeError('Git '+args[0]+' failed: '+result.stderr.replace(token,'[masked]').replace(auth,'[masked]'))
            return result.stdout.strip() if check else result.returncode
        git('init','--bare',str(repo));git('remote','add','origin','https://github.com/'+REPO+'.git')
        git('fetch','--no-tags','origin','+refs/heads/*:refs/remotes/origin/*','refs/tags/*:refs/tags/*')
        git('bundle','verify',str(file));git('fetch',str(file),'HEAD:refs/heads/recovered',*(['refs/tags/v0.3.4:refs/tags/v0.3.4'] if tag else []))
        if git('rev-parse','recovered')!=source:raise ValueError('Original HEAD mismatch')
        for p in ['package.json','package-lock.json','manifests/firefox.json']:
            data=json.loads(git('show',source+':'+p))
            if data['version']!='0.3.4' or p=='package-lock.json' and data['packages']['']['version']!='0.3.4':raise ValueError('Product version mismatch')
        specs=[];wanted={}
        for ref,expected in refs.items():
            current=remote(ref)
            if current not in [expected,source]:raise ValueError('Remote changed: '+ref)
            if current and git('merge-base','--is-ancestor',current,source,check=False)!=0:raise ValueError('Non-fast-forward rejected')
            specs.append(source+':'+ref);wanted[ref]=source
        if tag:
            ref='refs/tags/'+tag['name'];current=remote(ref)
            if current not in [None,tag['object']]:raise ValueError('Existing tag replacement rejected')
            if git('cat-file','-t',ref)!='tag' or git('rev-parse',ref)!=tag['object'] or git('rev-parse',ref+'^{}')!=tag['commit']:raise ValueError('Original annotated tag mismatch')
            if git('merge-base','--is-ancestor',tag['commit'],source,check=False)!=0:raise ValueError('Delivery is not source ancestor')
            if git('diff','--name-only',tag['commit'],source,'--','src','manifests','package.json','package-lock.json','scripts/build.mjs'):raise ValueError('Runtime changed after delivery')
            specs.append(ref+':'+ref);wanted[ref]=tag['object']
        git('push','--atomic','origin',*specs)
        for ref,expected in wanted.items():
            if remote(ref)!=expected:raise ValueError('Remote verification failed '+ref)
        if tag:
            actual=api('git/tags/'+tag['object'])
            if actual['object']!={'type':'commit','sha':tag['commit'],'url':'https://api.github.com/repos/'+REPO+'/git/commits/'+tag['commit']}:
                if actual['object'].get('type')!='commit' or actual['object'].get('sha')!=tag['commit']:raise ValueError('Remote tag target mismatch')
        proof={'status':'SYNC_VERIFIED','mode':mode,'source':source,'refs':wanted,'forcePush':False,'localGcmUsed':False}
        print(json.dumps(proof,indent=2));Path(os.environ['GITHUB_STEP_SUMMARY']).write_text('## Saved directory sync\n\n```json\n'+json.dumps(proof,indent=2)+'\n```\n')
if __name__=='__main__':main()
