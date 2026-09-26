import { build } from 'vite';
import { spawnSync } from 'node:child_process';
await build({ configFile:false, logLevel:'error', build:{ssr:'tests/model.test.ts',outDir:'.cache/tests',emptyOutDir:true,minify:false} });
const result=spawnSync(process.execPath,['--test','.cache/tests/model.test.js'],{stdio:'inherit'});
process.exit(result.status??1);
