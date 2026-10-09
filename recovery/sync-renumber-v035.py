import base64, hashlib, json, os, pathlib, subprocess, sys, tempfile, urllib.error, urllib.request
REPO='justamowei/chatgpt-toc-firefox'
OP='refs/heads/chore/top-v035-sync'
def main():
    if sys.platform!='linux' or os.environ.get('GITHUB_ACTIONS')!='true': raise SystemExit('Cloud Linux job only; no local execution')
    assert os.environ.get('GITHUB_REPOSITORY')==REPO and os.environ.get('GITHUB_REF')==OP
    token=os.environ['GITHUB_TOKEN']
    def api(path,method='GET',data=None,missing=False):
        body=None if data is None else json.dumps(data).encode()
        req=urllib.request.Request(('https://api.github.com/repos/'+REPO+'/'+path).rstrip('/'),data=body,method=method,headers={'Authorization':'Bearer '+token,'Accept':'application/vnd.github+json','Content-Type':'application/json','User-Agent':'toc-v035-sync'})
        try:
            with urllib.request.urlopen(req,timeout=30) as r: return None if r.status==204 else json.load(r)
        except urllib.error.HTTPError as e:
            if missing and e.code==404:return None
            raise RuntimeError('GitHub HTTP '+str(e.code)) from None
    cfg=json.loads(base64.b64decode(api('contents/recovery/top-v035.json?ref='+os.environ['GITHUB_SHA'])['content']))
    assert cfg['parent']=='90bdf6044ec45379e20d4146dc737f86129f5877'
    assert cfg['runtime']=='f3cc43662f91bf3c156661bc524f64a8377605ce'
    assert api('')['private'] is True
    assert api('git/ref/heads/release/v0.3')['object']['sha']==cfg['parent']
    assert api('git/ref/heads/main')['object']['sha']==cfg['main']
    assert api('git/ref/heads/fix/top-boundary-v035',missing=True) is None
    assert api('git/ref/tags/v0.3.5',missing=True) is None
    for item in cfg['preservedTags']: assert api('git/ref/'+item['ref'][5:])['object']['sha']==item['sha']
    for tag in ['v0.3.6','snapshot/v0.3.5/2026-10-08-rebuild','snapshot/v0.3.6/2026-10-08-r2']:assert api('git/ref/tags/'+tag,missing=True) is None
    assert api('git/ref/tags/v0.3.7')['object']['sha']=='40325dcdf03e60f07b05ef9eb49822aa41e36db5'
    assert api('git/ref/heads/fix/top-boundary-v037')['object']['sha']==cfg['parent']
    with tempfile.TemporaryDirectory() as folder:
        root=pathlib.Path(folder);bundle=base64.b64decode(cfg['bundle']);assert hashlib.sha256(bundle).hexdigest()==cfg['bundleHash']
        path=root/'source.bundle';path.write_bytes(bundle);work=root/'git'
        env=dict(os.environ);env.update(GIT_CONFIG_COUNT='2',GIT_CONFIG_KEY_0='http.https://github.com/.extraheader',GIT_CONFIG_VALUE_0='AUTHORIZATION: basic '+base64.b64encode(('x-access-token:'+token).encode()).decode(),GIT_CONFIG_KEY_1='credential.helper',GIT_CONFIG_VALUE_1='')
        def git(*args):
            p=subprocess.run(['git',*args],cwd=work if work.exists() else root,env=env,capture_output=True)
            if p.returncode:raise RuntimeError('Cloud Git failed: '+args[0])
            return p.stdout.decode().strip()
        url='https://github.com/'+REPO+'.git'
        git('init','--bare',str(work));git('fetch','--no-tags',url,'refs/heads/release/v0.3:refs/heads/base')
        assert git('rev-parse','refs/heads/base')==cfg['parent']
        git('bundle','verify',str(path));git('fetch',str(path),'refs/heads/fix/top-boundary-v035:refs/heads/restored','refs/tags/v0.3.5:refs/tags/v0.3.5')
        assert git('rev-parse','refs/heads/restored')==cfg['source']
        assert git('rev-parse',cfg['source']+'^{tree}')==cfg['tree']
        assert git('rev-parse','refs/tags/v0.3.5')==cfg['tagObject'] and git('rev-parse','refs/tags/v0.3.5^{}')==cfg['delivery']
        git('merge-base','--is-ancestor',cfg['parent'],cfg['source']);git('merge-base','--is-ancestor',cfg['runtime'],cfg['delivery'])
        assert not git('diff','--name-only',cfg['runtime'],cfg['source'],'--','src','scripts','manifests','package.json','package-lock.json','tsconfig.json')
        for p in ['package.json','package-lock.json','manifests/firefox.json']:assert json.loads(git('show',cfg['source']+':'+p))['version']=='0.3.5'
        catalog=json.loads(git('show',cfg['source']+':docs/version-catalog.json'));assert catalog['currentVersion']=='0.3.5' and len(catalog['versions'])==9 and 'pendingDelivery' not in catalog
        assert api('git/ref/heads/release/v0.3')['object']['sha']==cfg['parent']
        git('push','--atomic',url,cfg['source']+':refs/heads/fix/top-boundary-v035',cfg['source']+':refs/heads/release/v0.3','refs/tags/v0.3.5:refs/tags/v0.3.5',':refs/tags/v0.3.7',':refs/heads/fix/top-boundary-v037')
        for name in ['fix/top-boundary-v035','release/v0.3']:assert api('git/ref/heads/'+name)['object']['sha']==cfg['source']
        assert api('git/ref/tags/v0.3.7',missing=True) is None
        assert api('git/ref/heads/fix/top-boundary-v037',missing=True) is None
        mapping={'docs/main-readme.md':'README.md','docs/main-development-plan.md':'docs/development-plan.md','docs/version-policy.md':'docs/version-policy.md','docs/version-catalog.json':'docs/version-catalog.json','docs/versions.md':'docs/versions.md','docs/release-v0.3.5.md':'docs/release-v0.3.5.md','docs/acceptance-v0.3.5.md':'docs/acceptance-v0.3.5.md','docs/install-firefox.md':'docs/install-firefox.md','docs/release-v0.3.7.md':'docs/release-v0.3.7.md','docs/acceptance-v0.3.7.md':'docs/acceptance-v0.3.7.md'}
        elems=[{'path':target,'mode':'100644','type':'blob','sha':git('rev-parse',cfg['source']+':'+source)} for source,target in mapping.items()]
        tree=api('git/trees','POST',{'base_tree':cfg['mainTree'],'tree':elems})
        commit=api('git/commits','POST',{'message':'docs: index v0.3.5 head-only collection fix and verified acceptance','tree':tree['sha'],'parents':[cfg['main']]})
        assert api('git/ref/heads/main')['object']['sha']==cfg['main']
        api('git/refs/heads/main','PATCH',{'sha':commit['sha'],'force':False});print('MAIN_DOCS '+commit['sha'])
    for item in cfg['preservedTags']:assert api('git/ref/'+item['ref'][5:])['object']['sha']==item['sha']
    assert api('git/ref/tags/v0.3.5')['object']['sha']==cfg['tagObject']
    assert api('')['private'] is True
    print('SYNC_VERIFIED '+cfg['source'])
if __name__=='__main__':main()
