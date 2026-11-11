/** Read-compatible emergency artifact. No deployment or migration. */
import {readFile,writeFile,mkdir,mkdtemp,cp,rm} from 'node:fs/promises';
import {resolve,join} from 'node:path';
import {tmpdir} from 'node:os';
import {fileURLToPath} from 'node:url';
import {createHash} from 'node:crypto';
import {spawnSync} from 'node:child_process';
const root=fileURLToPath(new URL('../',import.meta.url));
if(process.argv.length!==4||process.argv[2]!=='--output-directory')throw Error('Use --output-directory <local artifact directory>');
const destination=resolve(process.argv[3]);
const temporary=await mkdtemp(join(tmpdir(),'takt-archive-fallback-'));
const hash=bytes=>createHash('sha256').update(bytes).digest('hex');
try{
 for(const directory of ['modules','worker','scripts','public'])await cp(join(root,directory),join(temporary,directory),{recursive:true});
 await writeFile(join(temporary,'package.json'),JSON.stringify({type:'module'}));
 const htmlPath=join(temporary,'public/index.html'),html=await readFile(htmlPath,'utf8');
 const archiveButton='<button type="button" class="button subtle" data-action="archive-post">Archivieren</button>';
 if(!html.includes(archiveButton))throw Error('Archive button boundary changed');const channelMediaButton='<button type="button" id="edit-channel-media" class="button subtle" data-action="edit-channel-media" hidden>Bilder je Kanal</button>';
 await writeFile(htmlPath,html.replace(archiveButton,'').replace(channelMediaButton,''));
 const appPath=join(temporary,'public/app.js');let app=await readFile(appPath,'utf8');
 const copyButton='class="button subtle" data-action="copy-archive"';if(!app.includes(copyButton))throw Error('Archive copy boundary changed');
 const batchButton='<button type="button" class="button subtle" data-action="archive-drafts">Entwürfe archivieren</button>';
 if(!app.includes(batchButton))throw Error('Batch archive boundary changed');app=app.replace(batchButton,'');
 app=app.replace(copyButton,'class="button subtle" disabled data-action="archive-copy-paused"');
 const reuseButton='data-reuse-idea="${esc(idea.id)}"';if(!app.includes(reuseButton))throw Error('Idea reuse boundary changed');
 app=app.replace(reuseButton,'disabled data-idea-reuse-paused="${esc(idea.id)}"');
 app=app.replace('async function archivePostAction(action,id=editingId){','async function archivePostAction(action,id=editingId){\n notify(\'Bearbeitung pausiert.\');return;');
 await writeFile(appPath,app);
 // Keep original authentication, origin, storage and security-response boundaries.
 const handlerPath=join(temporary,'worker/handler.mjs');let handler=await readFile(handlerPath,'utf8');
 const gate="      try{\n        if(url.pathname==='/api/providers/status'){";
 if(!handler.includes(gate))throw Error('Handler gate boundary changed');
 handler=handler.replace(gate,`      const archiveWorkspace=url.pathname==='/api/planner/workspaces'||url.pathname.startsWith('/api/planner/workspaces/');
      const archiveMutation=(url.pathname==='/api/planner'||url.pathname.startsWith('/api/planner/'))&&!['GET','HEAD'].includes(request.method);
      if(archiveMutation&&request.headers.get('X-Planner-Request')!=='1')return error(403,'CROSS_ORIGIN_REQUEST','Diese Anfrage ist nicht erlaubt.');
      if(archiveWorkspace||archiveMutation)return error(503,'PLANNER_WRITES_PAUSED','Bearbeitung und Arbeitsfassungen pausiert. Gespeicherte Beiträge bleiben verfügbar.');
`+gate);
 await writeFile(handlerPath,handler);
 const build=spawnSync(process.execPath,[join(temporary,'scripts/build-worker.mjs'),'--output-directory',destination],{stdio:'inherit'});if(build.status!==0)throw Error('Fallback build failed');
 const artifact=join(destination,'index.js');const source=await readFile(artifact,'utf8');
 await writeFile(artifact,source);await mkdir(destination,{recursive:true});
 await writeFile(join(destination,'fallback-manifest.json'),JSON.stringify({mode:'current-archive-readable-ui-planner-writes-paused',plannerWrites:'disabled-including-cached-clients-and-media',workspaceReads:'paused-to-prevent-expiry-writes',archiveReadable:true,channelMediaReadable:true,workspaceProtocol:4,batchArchiveWrites:'paused',ideaReuseWrites:'paused',artifactSha256:hash(source),deployed:false},null,2)+'\n');
 console.log('Archive-readable local fallback built; planner mutations paused. No deployment.');
}finally{await rm(temporary,{recursive:true,force:true});}
