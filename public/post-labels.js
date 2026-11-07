/** Editorial labels only: no scheduling, transport or persistence side effects. */
import { parseIdeaTags } from './workflows/ideas.mjs';
export function postLabelOptions(posts){return [...new Set(posts.filter(p=>p.status==='draft'||p.status==='scheduled').flatMap(p=>p.tags||[]))].sort((a,b)=>a.localeCompare(b,'de'));}
export function editedPostLabels(previous,rendered,initialRendered){
 if(rendered===initialRendered)return [...(previous||[])];
 return parseIdeaTags(rendered);
}
export function imageAltIsReadOnly(media){return !!media&&(!media.dataUrl||!!media.id||!!media.url);}
