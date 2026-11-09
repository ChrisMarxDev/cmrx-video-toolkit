// Archive committed public source only; no filesystem walk of user workspaces.
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { execFileSync } from 'node:child_process';
import { gzipSync } from 'node:zlib';
import { createHash } from 'node:crypto';
const root = fileURLToPath(new URL('../../../', import.meta.url));
const pkg = JSON.parse(fs.readFileSync(path.join(root, 'apps/desktop/package.json')));
const tag = process.argv[2];
if (tag !== `desktop-v${pkg.version}` || !/^desktop-v\d+\.\d+\.\d+$/.test(tag || ''))
  throw new Error('Use desktop-vX.Y.Z matching apps/desktop/package.json');
const lock = JSON.parse(fs.readFileSync(path.join(root, 'apps/desktop/package-lock.json')));
if (lock.version !== pkg.version || lock.packages[''].version !== pkg.version)
  throw new Error('Desktop lockfile version does not match package.json');
const sha = execFileSync('git', ['rev-parse', `${tag}^{commit}`], {cwd: root, encoding:'utf8'}).trim();
const head = execFileSync('git', ['rev-parse', 'HEAD'], {cwd: root, encoding:'utf8'}).trim();
if (sha !== head) throw new Error('Check out the exact release tag before archiving');
if (execFileSync('git', ['status', '--porcelain', '--untracked-files=normal'], {cwd:root,encoding:'utf8'}).trim())
  throw new Error('Release requires a clean public checkout');
const name = `cmrx-desktop-${pkg.version}-source`;
const tar = execFileSync('git', ['archive', '--format=tar', `--prefix=${name}/`, sha], {cwd:root,maxBuffer:256*1024*1024});
const output = process.env.DESKTOP_RELEASE_DIR;
if (!output || !path.isAbsolute(output)) throw new Error('Set DESKTOP_RELEASE_DIR to an absolute output folder outside the checkout');
const rel=path.relative(root,output);
if (!rel.startsWith(`..${path.sep}`)) throw new Error('Release output must be outside the checkout');
fs.mkdirSync(output,{recursive:true});
const blob=gzipSync(tar,{level:9});
fs.writeFileSync(path.join(output,`${name}.tar.gz`),blob,{flag:'wx'});
fs.writeFileSync(path.join(output,`${name}.sha256`),`${createHash('sha256').update(blob).digest('hex')}  ${name}.tar.gz\n`,{flag:'wx'});
console.log(`Prepared ${name}.tar.gz from ${sha}`);
