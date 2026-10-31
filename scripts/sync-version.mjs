/**
 * 构建前把 package.json 的 version 写入 public/manifest.json（P2-10）。
 * npm 生态对外版本在 package.json，扩展对外版本在 manifest.json，
 * 此前两处手工维护，漏改即"发布版本 ≠ 仓库版本"；package-lock.json 由 npm 自行维护。
 * 幂等：一致时不做任何写入。
 */
import { readFileSync, writeFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');
const version = JSON.parse(readFileSync(join(root, 'package.json'), 'utf8')).version;
const manifestPath = join(root, 'public', 'manifest.json');
const manifest = JSON.parse(readFileSync(manifestPath, 'utf8'));

if (manifest.version !== version) {
  manifest.version = version;
  writeFileSync(manifestPath, `${JSON.stringify(manifest, null, 2)}\n`, 'utf8');
  console.log(`[sync-version] public/manifest.json version -> ${version}`);
} else {
  console.log(`[sync-version] version 已一致（${version}）`);
}
