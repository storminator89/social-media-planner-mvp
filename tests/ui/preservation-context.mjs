import {createOriginalPreservation} from '../../public/preserve-video-original.js';
// Existing composer harnesses have no pending preservation operation. Exercise
// the real controller against an empty tab receipt, rather than bypassing it.
export function preservationContext(){const flow=createOriginalPreservation({storage:{getItem:()=>null,setItem:()=>{throw Error('Unexpected preservation in unrelated harness');}},save:()=>{throw Error('Unexpected preservation save');}});return {originalPreservationController:()=>flow,isPreservedOriginalCopy:()=>false,preservedOriginalLink:()=>''};}
