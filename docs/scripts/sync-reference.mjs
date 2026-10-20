import { readFile, mkdir, writeFile } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import path from 'node:path';
const root = fileURLToPath(new URL('../../', import.meta.url));
const out = path.join(root, 'docs/src/content/docs/reference');
await mkdir(out, { recursive: true });
const pages = [
  ['fal', 'fal generation connector', 'tools/fal/README.md'],
  ['editor', 'Transcript editor', 'apps/editor/README.md'],
  ['browser', 'Component browser', 'tools/component_browser/README.md'],
  ['components', 'Component catalog', 'components/CATALOG.md'],
  ['contracts', 'Artifact contracts', 'docs/contracts.md'],
  ['development', 'Development', 'docs/DEVELOPMENT.md'],
];
for (const [slug, title, source] of pages) {
  let body = (await readFile(path.join(root, source), 'utf8')).replace(/^# .*\n/, '');
  body = body.replace(/\]\((?!https?:|mailto:|#)([^)]+)\)/g, (_, target) => {
    const resolved = path.posix.normalize(path.posix.join(path.posix.dirname(source), target));
    return `](https://github.com/ChrisMarxDev/cmrx-video-toolkit/blob/main/${resolved})`;
  });
  await writeFile(path.join(out, `${slug}.md`), `---\ntitle: ${JSON.stringify(title)}\ndescription: ${JSON.stringify(title + ' reference for CMRX Video Toolkit.')}\n---\n\nGenerated from [${source}](https://github.com/ChrisMarxDev/cmrx-video-toolkit/blob/main/${source}). Edit that source to update this page.\n${body}`);
}
