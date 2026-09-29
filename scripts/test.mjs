import { build } from 'vite';
import { spawnSync } from 'node:child_process';
const suites=['tests/model.test.ts','tests/hero.test.ts'];
await build({ configFile:false, logLevel:'error', build:{ssr:true,outDir:'.cache/tests',emptyOutDir:true,minify:false,rollupOptions:{input:suites}} });
const result=spawnSync(process.execPath,['--test',...suites.map(s=>s.replace(/^tests\/(.*)\.ts$/,'.cache/tests/$1.js'))],{stdio:'inherit'});
process.exit(result.status??1);
