import {readFile,readdir,mkdir,writeFile,lstat,realpath} from 'node:fs/promises';
import {resolve,dirname,relative,extname,sep} from 'node:path';
import {fileURLToPath} from 'node:url';

const root=fileURLToPath(new URL('../',import.meta.url));
const types={'.html':'text/html; charset=utf-8','.js':'text/javascript; charset=utf-8','.mjs':'text/javascript; charset=utf-8','.css':'text/css; charset=utf-8','.svg':'image/svg+xml'};
const assets={};
async function walk(directory){for(const name of (await readdir(directory)).sort()){const path=resolve(directory,name),stat=await lstat(path);if(stat.isSymbolicLink())throw new Error('Symlink not allowed in public inventory');if(stat.isDirectory())await walk(path);else{const type=types[extname(path)];if(!type)throw new Error('Unsupported public asset');const key='/'+relative(resolve(root,'public'),path).split(sep).join('/');assets[key]={type,body:await readFile(path,'utf8')};}}}
await walk(resolve(root,'public'));
assets['/bootstrap.mjs'].body=await readFile(resolve(root,'worker/bootstrap.mjs'),'utf8');
// Restricted named-ESM bundler for this dependency-free source graph. Unsupported
// syntax fails the build rather than silently altering arbitrary package code.
const ids=new Map(),pending=new Set();let output='// Generated local Worker artifact. No Site identity, provisioning or deployment.\n';
async function bundle(path){path=resolve(path);if(!path.startsWith(root)||path.includes('/public/')||await realpath(path)!==path)throw new Error('Unexpected server dependency');if(pending.has(path))throw new Error('Circular server dependency');if(ids.has(path))return ids.get(path);pending.add(path);let source=await readFile(path,'utf8');let imports='';
  const matches=[...source.matchAll(/^import\s*\{([^}]+)\}\s*from\s*['"]([^'"]+)['"];?\s*$/gm)];
  for(const match of matches){if(!match[2].startsWith('.'))throw new Error('Only relative server imports supported');const id=await bundle(resolve(dirname(path),match[2]));const bindings=match[1].split(',').map(s=>s.trim().replace(/\s+as\s+/,':')).join(',');imports+=`const {${bindings}}=${id};\n`;source=source.replace(match[0],'');}
  const names=[...source.matchAll(/^export\s+(?:async\s+)?(?:function|class|const|let)\s+(\w+)/gm)].map(m=>m[1]);source=source.replace(/^export\s+/gm,'');if(/^\s*(?:import|export)\s/m.test(source))throw new Error('Unsupported module syntax');const id='serverModule'+ids.size;ids.set(path,id);pending.delete(path);output+=`\nconst ${id}=(()=>{\n${imports}${source}\nreturn {${names.join(',')}};\n})();\n`;return id;
}
const entry=await bundle(resolve(root,'worker/handler.mjs'));
output+=`\nconst assets=${JSON.stringify(assets)};\nexport default ${entry}.createSitesHandler({assets,oauthTransport:request=>globalThis.fetch(request)});\n`;
const outputArg=process.argv.indexOf('--output-directory');
if(process.argv.length>2&&(outputArg!==2||process.argv.length!==4))throw new Error('Use --output-directory <path> or no arguments');
const destination=outputArg>=0?resolve(process.argv[outputArg+1]):resolve(root,'dist/server');await mkdir(destination,{recursive:true});await writeFile(resolve(destination,'index.js'),output);
console.log(`Built dependency-free Worker with ${Object.keys(assets).length} assets (${Buffer.byteLength(output)} bytes). Not registered or deployed.`);
