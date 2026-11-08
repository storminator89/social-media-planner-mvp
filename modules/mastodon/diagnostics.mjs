// Fixed, non-sensitive categories only. Never serialize exception text or metadata.
const metadataCodes=new Set(['REQUEST_CONSTRUCTION_FAILED','TRANSPORT_OUTCOME_UNKNOWN','DEADLINE_EXCEEDED','RESPONSE_ORIGIN_INVALID','REDIRECT_REJECTED','RESPONSE_TYPE_INVALID','RESPONSE_TOO_LARGE','RESPONSE_LENGTH_INVALID','RESPONSE_MALFORMED','PROVIDER_REJECTED','REQUIRED_CAPABILITY_UNAVAILABLE','KANOA_METADATA_UNCONFIRMED']);
export class MastodonPreflightError extends Error {
 constructor(stage,cause){super('MASTODON_PREFLIGHT_FAILED');this.stage=stage;this.reason=stage==='metadata'&&metadataCodes.has(cause?.code||cause?.message)?(cause.code||cause.message):'UNCONFIRMED';}
}
export function preflightFailure(error){return error instanceof MastodonPreflightError?{error:{code:'MASTODON_PREFLIGHT_FAILED',stage:error.stage,reason:error.reason,registrationAttempted:false,message:'Vorprüfung fehlgeschlagen. Bei dieser Anfrage wurde keine App-Registrierung gestartet. Diagnose prüfen; nicht automatisch wiederholen.'}}:null;}
