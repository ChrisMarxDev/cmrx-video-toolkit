import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { execFileSync } from 'node:child_process';
import { gunzipSync } from 'node:zlib';

test('release source is committed public content with exact version/tag and clean tree', () => {
  const cache = process.env.XDG_CACHE_HOME || path.join(os.homedir(), '.cache');
  const task = fs.mkdtempSync(path.join(cache, 'cmrx-release-source-test-'));
  const root = path.join(task, 'repo');
  const desktop = path.join(root, 'apps/desktop');
  fs.mkdirSync(path.join(desktop, 'scripts'), {recursive:true});
  fs.copyFileSync(new URL('../scripts/release-source.mjs',import.meta.url), path.join(desktop,'scripts/release-source.mjs'));
  const git = (...args) => execFileSync('git',args,{cwd:root,stdio:'pipe'}).toString();
  const release = (tag='desktop-v0.1.0', output=path.join(task,'release')) => execFileSync(process.execPath,
    [path.join(desktop,'scripts/release-source.mjs'),tag],
    {cwd:root,env:{...process.env,DESKTOP_RELEASE_DIR:output},stdio:'pipe'});
  try {
    fs.writeFileSync(path.join(desktop,'package.json'),JSON.stringify({version:'0.1.0',type:'module'}));
    fs.writeFileSync(path.join(desktop,'package-lock.json'),JSON.stringify({version:'0.1.0',packages:{'':{version:'0.1.0'}}}));
    fs.writeFileSync(path.join(root,'.gitignore'),'profile/\n');
    fs.mkdirSync(path.join(root,'profile'));
    fs.writeFileSync(path.join(root,'profile','credentials'),'synthetic-private-fixture');
    fs.writeFileSync(path.join(root,'README.md'),'public toolkit\n');
    git('init','--initial-branch=main');
    git('config','user.name','Release fixture');git('config','user.email','fixture@example.test');
    git('add','.');git('commit','-m','Public fixture');git('tag','desktop-v0.1.0');
    assert.throws(()=>release('v0.1.0'), /matching/);
    fs.writeFileSync(path.join(root,'untracked'),'unpublished');
    assert.throws(()=>release(), /clean public checkout/);
    fs.unlinkSync(path.join(root,'untracked'));
    assert.throws(()=>release('desktop-v0.1.0',path.join(root,'output')), /outside/);
    release();
    const archive=fs.readFileSync(path.join(task,'release/cmrx-desktop-0.1.0-source.tar.gz'));
    const content=gunzipSync(archive).toString();
    assert(content.includes('public toolkit'));
    assert(!content.includes('synthetic-private-fixture'));
    assert(!content.includes('credentials'));
    const {createHash}=process.getBuiltinModule('crypto');
    assert(fs.readFileSync(path.join(task,'release/cmrx-desktop-0.1.0-source.sha256'),'utf8').startsWith(createHash('sha256').update(archive).digest('hex')));
    fs.appendFileSync(path.join(root,'README.md'),'next');git('add','.');git('commit','-m','Next');
    assert.throws(()=>release(), /exact release tag/);
  } finally { fs.rmSync(task,{recursive:true,force:true}); }
});
