import {YOUTUBE_PRIVATE_LIMITS,YouTubeUploadError} from './private-upload.mjs';
function fail(code){throw new YouTubeUploadError(code);}
function validSize(n){return Number.isSafeInteger(n)&&n>0&&n<=YOUTUBE_PRIVATE_LIMITS.mediaBytes;}
/** Bounded whole-object reads are intentional at the explicit 8 MiB product cap.
 * No unbounded video buffering or claimed 256 GB Sites support. */
export async function readYouTubeBytes(body,budget,expectedSize=null){
 if(!body?.getReader)fail('MEDIA_BODY_REQUIRED');const reader=body.getReader(),parts=[];let size=0;
 try{while(true){const {done,value}=await budget.run(()=>reader.read());if(done)break;if(!(value instanceof Uint8Array))fail('MEDIA_INVALID');size+=value.byteLength;if(size>YOUTUBE_PRIVATE_LIMITS.mediaBytes)fail('MEDIA_TOO_LARGE');parts.push(new Uint8Array(value));}}
 catch(e){try{void reader.cancel().catch(()=>{});}catch{}throw e;}finally{try{reader.releaseLock();}catch{}}
 if(!validSize(size)||expectedSize!==null&&size!==expectedSize)fail('MEDIA_SIZE_MISMATCH');const bytes=new Uint8Array(size);let offset=0;for(const p of parts){bytes.set(p,offset);offset+=p.byteLength;}budget.check();return bytes;
}
function signature(b,mime){return mime==='video/mp4'?b.length>=12&&b[4]===102&&b[5]===116&&b[6]===121&&b[7]===112:mime==='video/webm'&&b.length>=4&&b[0]===26&&b[1]===69&&b[2]===223&&b[3]===163;}
async function hash(b){return [...new Uint8Array(await crypto.subtle.digest('SHA-256',b))].map(n=>n.toString(16).padStart(2,'0')).join('');}
export async function storeYouTubeMedia({request,bucket,repository,owner,siteId,budget}){
 if(typeof bucket?.put!=='function')fail('MEDIA_UNAVAILABLE');const mimeType=request.headers.get('Content-Type');if(!['video/mp4','video/webm'].includes(mimeType))fail('MEDIA_TYPE_UNSUPPORTED');
 const declared=request.headers.get('Content-Length');if(declared!==null&&(!/^[1-9][0-9]*$/.test(declared)||!validSize(Number(declared))))fail('MEDIA_TOO_LARGE');
 let filename;try{filename=decodeURIComponent(request.headers.get('X-Planner-File-Name')??'Video');}catch{fail('MEDIA_FILENAME_INVALID');}if(!filename||filename.length>255||!filename.isWellFormed()||/[\u0000-\u001f\u007f]/.test(filename))fail('MEDIA_FILENAME_INVALID');
 const content=await readYouTubeBytes(request.body,budget,declared===null?null:Number(declared));if(!signature(content,mimeType))fail('MEDIA_SIGNATURE_INVALID');const sha256=await budget.run(()=>hash(content));
 const mediaId=crypto.randomUUID(),objectKey=`youtube-media/${encodeURIComponent(siteId)}/${encodeURIComponent(owner)}/${mediaId}`;
 await budget.run(()=>repository.reserveMedia(owner,{mediaId,objectKey,sha256,byteSize:content.byteLength,mimeType,filename}));
 if(await budget.run(()=>repository.assertMediaReservation(owner,mediaId))!==true)fail('MEDIA_RESERVATION_INVALID');
 const stored=await budget.run(()=>bucket.put(objectKey,content,{httpMetadata:{contentType:mimeType}}));
 if(!stored||stored.key!==objectKey||stored.size!==content.byteLength||typeof stored.etag!=='string'||!stored.etag||stored.etag.length>128||/[\u0000-\u001f\u007f]/.test(stored.etag))fail('MEDIA_PUT_UNCONFIRMED');
 // Never delete blindly after an uncertain metadata commit: it may have succeeded.
 // Unreferenced private objects require separate authorized retention maintenance.
 return budget.run(()=>repository.commitMedia(owner,mediaId));
}
/** The mediaId comes from the persisted operation, not from an upload-step body.
 * Read and hash the bounded immutable object on every step, then return an owned
 * copy of precisely the approved interval. Changed R2 bytes cannot be uploaded. */
export async function readVerifiedYouTubeChunk({bucket,repository,owner,mediaId,operation,budget,sha256,offset,length}){
 const media=await budget.run(()=>repository.getMedia(owner,mediaId));
 if(media.sha256!==sha256||sha256!==operation.media.sha256||media.byteSize!==operation.media.size||media.mimeType!==operation.media.mimeType||!validSize(media.byteSize)||!Number.isSafeInteger(offset)||offset<0||!Number.isSafeInteger(length)||length<1||offset+length>media.byteSize)fail('MEDIA_BINDING_CHANGED');
 const object=await budget.run(()=>bucket.get(media.objectKey));if(!object?.body)fail('MEDIA_NOT_FOUND');const bytes=await readYouTubeBytes(object.body,budget,media.byteSize);
 if(!signature(bytes,media.mimeType)||await budget.run(()=>hash(bytes))!==sha256)fail('MEDIA_BYTES_CHANGED');budget.check();return bytes.slice(offset,offset+length);
}
