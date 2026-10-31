/**
 * 构建前把 package.json 的 version 同步到 public/manifest.json，保持对外版本一致。
 * 幂等：一致时不写入。
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
