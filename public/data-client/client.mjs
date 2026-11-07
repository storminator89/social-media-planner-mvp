/** Browser-side adapter; only the server decides who owns records. */
export class PlannerClientError extends Error{constructor(message,status,code,details){super(message);this.status=status;this.code=code;this.details=details;}}
export function createPlannerClient({fetcher=globalThis.fetch.bind(globalThis),base='/api/planner'}={}){
  async function call(path,options={}){const response=await fetcher(base+path,{credentials:'same-origin',cache:'no-store',...options,headers:{'X-Planner-Request':'1',...options.headers}});let result;try{result=await response.json();}catch{throw new PlannerClientError('Ungültige Serverantwort.',response.status,'INVALID_RESPONSE');}if(!response.ok)throw new PlannerClientError(result.error?.message??'Anfrage fehlgeschlagen.',response.status,result.error?.code,result.error?.details);return result;}
  return{
    load:()=>call('/state'),
    save:state=>call('/state',{method:'PUT',headers:{'Content-Type':'application/json'},body:JSON.stringify(state)}),
    resolveTime:(local,timezone,disambiguation='reject')=>call('/resolve-time',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({local,timezone,disambiguation})}),
    uploadMedia:(file,altText='')=>call('/media',{method:'POST',headers:{'Content-Type':file.type,'X-Planner-File-Name':encodeURIComponent(file.name??'Medium'),'X-Planner-Alt-Text':encodeURIComponent(altText)},body:file})
  };
}
