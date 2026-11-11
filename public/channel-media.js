import {normalizeChannelMediaItems,effectiveMediaItems} from './workflows/media-items.mjs';
import {isSavedImage} from './saved-images.js';
const clone=v=>structuredClone(v);
export function channelMediaEligible({state,postId,revision,savedRevision,editor,initialEditor,busy=false,restored=false,open=false}={}){
 const post=state?.posts?.find(p=>p.id===postId);
 return !!post&&open&&!busy&&!restored&&editor===initialEditor&&typeof editor==='string'&&Number.isSafeInteger(revision)&&revision===state.revision&&revision===savedRevision&&post.status==='draft'&&post.scheduledAt===null&&post.scheduledInstant===null&&post.scheduleBinding===null&&post.channels.length>=2&&post.channels.every(id=>effectiveMediaItems(post,id).every(isSavedImage));
}
export function prepareChannelMedia(context){
 if(!channelMediaEligible(context))throw Error('Gespeicherten Entwurf mit mindestens zwei Kanälen erneut öffnen.');
 const post=context.state.posts.find(p=>p.id===context.postId);
 const channelMediaItems=Object.fromEntries(post.channels.map(id=>[id,clone(effectiveMediaItems(post,id))]));
 normalizeChannelMediaItems(channelMediaItems,post.channels,channelMediaItems[post.channels[0]]);
 return {postId:post.id,revision:context.revision,editor:context.editor,generation:context.generation,state:JSON.stringify(context.state),post:clone(post),channelMediaItems};
}
export function channelMediaMatches(preview,context){return !!preview&&channelMediaEligible(context)&&preview.postId===context.postId&&preview.revision===context.revision&&preview.editor===context.editor&&preview.generation===context.generation&&preview.state===JSON.stringify(context.state);}
export function validateChannelMediaSelection(preview,selection){return normalizeChannelMediaItems(selection,preview.post.channels,selection?.[preview.post.channels[0]]);}
export function channelMediaRecovery(preview,selection){const map=validateChannelMediaSelection(preview,selection);return {...clone(preview.post),mediaItems:clone(map[preview.post.channels[0]]),channelMediaItems:clone(map)};}
