import {isVideoMedia,createVideoPreviewURLs} from '../../public/composer-video.js';
/** Real video helpers and initial app state for extracted-function VM harnesses. */
export const videoContext=()=>({isPreservedOriginalCopy:()=>false,preservedOriginalLink:()=>'',videoTailEditor:{close(){}},videoTailTarget:null,isVideoMedia,videoPreviewURLs:createVideoPreviewURLs(),videoSelectionController:null,videoWorkspaceVersion:2});
