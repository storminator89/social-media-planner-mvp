/** Read-only view of already-filtered drafts. Stored label spelling is identity. */
const esc=value=>String(value??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
const exactOrder=(a,b)=>a<b?-1:a>b?1:0;

export function groupDraftsByLabel(posts){
  const labels=new Map(),unlabelled=[],seen=new Set();
  for(const post of posts){
    if(post.status!=='draft'||seen.has(post.id))continue;
    seen.add(post.id);
    const tags=new Set(post.tags||[]);
    if(!tags.size)unlabelled.push(post);
    for(const tag of tags){
      if(!labels.has(tag))labels.set(tag,[]);
      labels.get(tag).push(post);
    }
  }
  const groups=[...labels].sort(([a],[b])=>a.localeCompare(b,'de')||exactOrder(a,b)).map(([label,posts])=>({label,posts}));
  if(unlabelled.length)groups.push({label:null,posts:unlabelled});
  return groups;
}

export function renderDraftGroups(posts,renderCard){
  return `<div class="draft-groups">${groupDraftsByLabel(posts).map(group=>{
    const name=group.label===null?'Ohne Label':`Label: ${group.label}`;
    return `<section class="draft-group" aria-label="${esc(name)}"><h2 class="draft-group-heading"><span>${esc(name)}</span><small>${group.posts.length} ${group.posts.length===1?'Entwurf':'Entwürfe'}</small></h2><div class="draft-grid">${group.posts.map(post=>renderCard(post,JSON.stringify([group.label,post.id]))).join('')}</div></section>`;
  }).join('')}</div>`;
}

/** Find the same displayed membership after a save rerenders the cards. */
export function restoreDraftCardFocus(previous,root){
  if(!previous?.dataset?.draftOccurrence||!root)return false;
  const cards=[...root.querySelectorAll('[data-draft-occurrence]')];
  const target=cards.find(card=>card.dataset.draftOccurrence===previous.dataset.draftOccurrence)
    ||cards.find(card=>card.dataset.postId===previous.dataset.postId);
  if(!target)return false;
  target.focus();return true;
}
