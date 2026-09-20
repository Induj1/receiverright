import { build } from 'esbuild';
import { mkdir, stat, cp } from 'node:fs/promises';
import { createWriteStream } from 'node:fs';
import { ZipArchive } from 'archiver';

await mkdir('.artifacts/lambda', { recursive: true });
await cp('dist', '.artifacts/lambda/dist', { recursive: true });
await build({ entryPoints: ['server/lambda.ts'], outfile: '.artifacts/lambda/index.cjs', bundle: true, platform: 'node', target: 'node22', format: 'cjs', minify: true, sourcemap: false });
await new Promise((resolve, reject) => {
  const output = createWriteStream('.artifacts/lambda.zip');
  const archive = new ZipArchive({ zlib: { level: 9 } });
  output.on('close', resolve); output.on('error', reject); archive.on('error', reject);
  archive.pipe(output); archive.directory('.artifacts/lambda/', false); archive.finalize();
});
console.log(`Lambda package: ${((await stat('.artifacts/lambda.zip')).size / 1024 / 1024).toFixed(2)} MB`);
