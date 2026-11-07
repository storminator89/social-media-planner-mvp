/** Pure text-variant helpers. Missing key means inheritance; explicit empty text is an override. */
const own=(obj,key)=>Object.prototype.hasOwnProperty.call(obj||{},key);
export function hasTextVariant(post,channelId){return own(post.variantTexts,channelId)}
export function effectiveText(post,channelId){return hasTextVariant(post,channelId)?post.variantTexts[channelId]:post.text}
export function selectedVariantTexts(variantTexts,channels){
  if(variantTexts==null)return {};
  if(typeof variantTexts!=='object'||Array.isArray(variantTexts))throw new Error('Ungültige Kanaltexte.');
  const result=Object.create(null);
  for(const id of channels){if(own(variantTexts,id)){if(typeof variantTexts[id]!=='string'||variantTexts[id].length>20000)throw new Error('Ungültiger Kanaltext.');result[id]=variantTexts[id]}}
  return {...result};
}
export function variantCount(post){return (post.channels||[]).filter(id=>hasTextVariant(post,id)).length}
export function channelTextChecks(post,definitions){return(post.channels||[]).map(id=>{const channel=definitions.find(c=>c.id===id);if(!channel)return{channelId:id,name:id,unknown:true,valid:false};const text=effectiveText(post,id)||'',count=Array.from(text).length;return{channelId:id,name:channel.name,count,limit:channel.limit,custom:hasTextVariant(post,id),empty:!text.trim(),overLimit:count>channel.limit,valid:!!text.trim()&&count<=channel.limit}})}
export function inheritedChannels(post){return(post.channels||[]).filter(id=>!hasTextVariant(post,id))}
export function searchableText(post){return[post.text,...(post.channels||[]).filter(id=>hasTextVariant(post,id)).map(id=>post.variantTexts[id])].join('\n')}
