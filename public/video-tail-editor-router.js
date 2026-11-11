import {createVideoTailEditor as createWebMTailEditor} from './video-tail-editor.js';
import {createMP4TailEditor,createMP4StartEditor} from './mp4-tail-editor.js';
/** Keep both format-specific editors isolated; only one session may be open. */
export function createVideoTailEditor(options){
 const webm=createWebMTailEditor(options),mp4=createMP4TailEditor(options),start=createMP4StartEditor(options);
 return{close(){webm.close();mp4.close();start.close();},get isOpen(){return webm.isOpen||mp4.isOpen||start.isOpen;},openStart(media,context){webm.close();mp4.close();return start.open(media,context);},open(media,context){start.close();if(media?.type==='video/mp4'){webm.close();return mp4.open(media,context);}mp4.close();return webm.open(media,context);}};
}
