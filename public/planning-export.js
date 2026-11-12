import {parsePlanningExport,previewPlanningImport} from './planner-import.js';
/** Check the exact download bytes, without editing or filtering the export.
 * This checks import compatibility, not backup completeness or future conflicts. */
export function preparePlanningExport(state,exportedAt=new Date().toISOString()){
 const text=JSON.stringify({...state,exportedAt},null,2);
 try{const imported=parsePlanningExport(text);previewPlanningImport({...imported,posts:[]},imported);return {text,importable:true,reason:null};}
 catch(error){return {text,importable:false,reason:error instanceof Error?error.message:'JSON-Import nicht möglich.'};}
}
