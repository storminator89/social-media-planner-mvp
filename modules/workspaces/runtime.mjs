import {EditorWorkspaceRepository} from './workspace-repository.mjs';
import {createEditorWorkspaceApi} from './workspace-api.mjs';
const PREFIX='/api/planner/workspaces';
/** Called only inside the authenticated Sites Dispatch entry. A service bearer is
 * not visitor identity. Each Site must own its physical DB; no request-header
 * value is used as the Site ID or configured origin. */
export async function handleHostedWorkspaces(request,env,{clock=Date.now}={}){
 const path=new URL(request.url).pathname;
 if(path!==PREFIX&&!path.startsWith(PREFIX+'/'))return null;
 try{
  const siteId=env.TAKT_SITE_ID,siteOrigin=env.TAKT_SITE_ORIGIN;
  if(typeof siteId!=='string'||!siteId.trim()||typeof siteOrigin!=='string')throw Error();
  const origin=new URL(siteOrigin);
  if(origin.protocol!=='https:'||origin.origin!==siteOrigin||origin.username||origin.password)throw Error();
  const repository=new EditorWorkspaceRepository(env.DB,{siteId,clock});
  const handler=createEditorWorkspaceApi({repository,siteOrigin,authenticateRequest:r=>r.headers.get('oai-authenticated-user-id')});
  return await handler(request);
 }catch{return new Response(JSON.stringify({error:{code:'WORKSPACE_UNAVAILABLE'}}),{status:503,headers:{'Content-Type':'application/json; charset=utf-8','Cache-Control':'private, no-store','Vary':'oai-authenticated-user-id'}});}
}
