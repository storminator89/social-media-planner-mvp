/** Local UI-only rollback artifact. It ALWAYS bundles the current guarded backend.
 * This is a build operation, never a deployment or a database migration.
 */
import {readFile,writeFile,mkdir,mkdtemp,cp,rm} from 'node:fs/promises';
import {resolve,join} from 'node:path';
import {tmpdir} from 'node:os';
import {fileURLToPath} from 'node:url';
import {createHash} from 'node:crypto';
import {spawnSync} from 'node:child_process';
const root=fileURLToPath(new URL('../',import.meta.url));
if(process.argv.length!==4||process.argv[2]!=='--output-directory')throw Error('Use --output-directory <local artifact directory>');
const destination=resolve(process.argv[3]);
const archive=join(root,'docs/workspace-recovery/rollback-v46-public.tar.gz');
const sha=bytes=>createHash('sha256').update(bytes).digest('hex');
const archiveHash='e0cb46908fc71b30c8e88a3e00a034e2c5127487589e195ca26ec2c5afa62a7f';
if(sha(await readFile(archive))!==archiveHash)throw Error('Frozen v46 UI archive changed; rollback build refused');
const temporary=await mkdtemp(join(tmpdir(),'takt-guarded-rollback-'));
try{
 for(const directory of ['modules','worker','scripts'])await cp(join(root,directory),join(temporary,directory),{recursive:true});
 await writeFile(join(temporary,'package.json'),JSON.stringify({type:'module'}));
 const unpack=spawnSync('tar',['-xzf',archive,'-C',temporary],{stdio:'inherit'});if(unpack.status!==0)throw Error('Frozen UI extraction failed');
 const build=spawnSync(process.execPath,[join(temporary,'scripts/build-worker.mjs'),'--output-directory',destination],{stdio:'inherit'});if(build.status!==0)throw Error('Compatible rollback build failed');
 // Emergency fallback suspends every workspace mutation, including cached/new
 // schema2 requests. The new guarded backend remains embedded for reads.
 const artifact=join(destination,'index.js');let builtSource=await readFile(artifact,'utf8');
 builtSource=builtSource.replace(/export default ([^\n]+);\n$/,`const guardedRollbackBackend=$1;
export default {async fetch(request,...args){const path=new URL(request.url).pathname;if((path==='/api/planner/workspaces'||path.startsWith('/api/planner/workspaces/'))&&!['GET','HEAD'].includes(request.method))return new Response(JSON.stringify({error:{code:'WORKSPACE_UNAVAILABLE'}}),{status:503,headers:{'Content-Type':'application/json; charset=utf-8','Cache-Control':'private, no-store','X-Content-Type-Options':'nosniff'}});return guardedRollbackBackend.fetch(request,...args);}};
`);
 if(!builtSource.includes('const guardedRollbackBackend='))throw Error('Rollback write suspension wrapper failed');await writeFile(artifact,builtSource);
 const backendHashes={};for(const file of ['workspace-domain.mjs','workspace-repository.mjs','workspace-api.mjs','runtime.mjs'])backendHashes[file]=sha(await readFile(join(root,'modules/workspaces',file)));
 const manifest={mode:'v46-ui-current-guarded-backend',workspaceWrites:'disabled',baseline:'eccdfb777ed413a66e6e797e5222796f88cfab04',frozenPublicArchiveSha256:archiveHash,workspaceBackendSha256:backendHashes,artifactSha256:sha(await readFile(join(destination,'index.js'))),deployed:false};
 await mkdir(destination,{recursive:true});await writeFile(join(destination,'rollback-manifest.json'),JSON.stringify(manifest,null,2)+'\n');console.log('Built local UI rollback with current workspace guards. No old backend, migrations or deployment.');
}finally{await rm(temporary,{recursive:true,force:true});}
