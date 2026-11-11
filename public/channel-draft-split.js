/** Explicit saved-draft operation. This model never copies lossy UI variants. */
export function splitDraftEligible({state,postId,revision,savedRevision,editor,initialEditor,busy=false,restored=false,localWorkspace=false,pendingMedia=false,open=false}={}) {
  if(!open||busy||restored||localWorkspace||pendingMedia||typeof editor!=='string'||editor!==initialEditor)return false;
  if(!Number.isSafeInteger(revision)||revision!==state?.revision||savedRevision!==revision||!Array.isArray(state.posts))return false;
  const post=state.posts.find(p=>p.id===postId);
  return !!post&&post.status==='draft'&&post.scheduledAt===null&&post.scheduledInstant===null&&post.scheduleBinding===null&&Array.isArray(post.channels)&&post.channels.length>=2&&new Set(post.channels).size===post.channels.length&&state.posts.length+post.channels.length-1<=100&&state.posts.reduce((n,p)=>n+p.channels.length,0)<=300;
}
export function prepareDraftSplit(context,{generation,token}={}) {
  if(!splitDraftEligible(context))return null;
  const post=context.state.posts.find(p=>p.id===context.postId);
  return {postId:post.id,channels:[...post.channels],revision:context.revision,state:JSON.stringify(context.state),editor:context.editor,generation,token};
}
export function draftSplitMatches(preview,context,{generation,token}={}) {
  return !!preview&&preview.generation===generation&&preview.token===token&&preview.postId===context.postId&&preview.revision===context.revision&&preview.editor===context.editor&&preview.state===JSON.stringify(context.state)&&splitDraftEligible(context);
}
