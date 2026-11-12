import {effectiveMediaItems} from './workflows/media-items.mjs';
/** Narrow local editorial permission, not provider readiness or publication.
 * Mastodon documents status text as optional with media_ids. The current
 * publisher remains text-only; do not infer capabilities for other networks. */
export function imageOnlyPlanningAllowed(post,channelId){
 if(channelId!=='mastodon'||!post.channels?.includes(channelId))return false;
 try{const media=effectiveMediaItems(post,channelId);return media.length>0&&media.every(item=>item.type.startsWith('image/')&&item.alt.trim());}catch{return false;}
}
