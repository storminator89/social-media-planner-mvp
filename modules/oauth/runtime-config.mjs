import {createLinkedInOfflineConfiguration,LINKEDIN_DISCOVERY_ISSUER} from './linkedin-contract.mjs';

export const LINKEDIN_RUNTIME_ENV_KEYS=Object.freeze(['TAKT_LINKEDIN_ENABLED','TAKT_LINKEDIN_CONFIGURATION','TAKT_LINKEDIN_CLIENT_SECRET','TAKT_TOKEN_KEYRING_JSON']);
const keys=['siteId','siteOrigin','clientId','redirectUri','accountType','appConfigVersion','expectedIssuer','reviewedSiteIdentity','reviewedNonceContract','approvedPersonalAccount'];
const unavailable=()=>Object.freeze({ready:false,code:'OAUTH_NOT_CONFIGURED'});
/** Only native server runtime configuration may enter here. Never merge request
 * headers/body/cookies into env. Presence of flags is an operator assertion, not
 * proof obtained by this code. Their actual evidence is a deployment prerequisite. */
export async function readLinkedInRuntimeConfiguration(env={}){
  if(env.TAKT_LINKEDIN_ENABLED!=='true')return unavailable();
  // Capture strings before any await. Neither secret is returned in public DTOs.
  const source=env.TAKT_LINKEDIN_CONFIGURATION,clientSecret=env.TAKT_LINKEDIN_CLIENT_SECRET,keyringSource=env.TAKT_TOKEN_KEYRING_JSON;
  if(typeof source!=='string'||source.length>8192||typeof clientSecret!=='string'||clientSecret.length<1||clientSecret.length>4096||!/^[\x21-\x7e]+$/.test(clientSecret)||typeof keyringSource!=='string'||keyringSource.length<1||keyringSource.length>8192)return unavailable();
  let input;try{input=JSON.parse(source);}catch{return unavailable();}
  if(!input||typeof input!=='object'||Array.isArray(input)||Object.keys(input).length!==keys.length||!keys.every(k=>Object.hasOwn(input,k)))return unavailable();
  if(input.reviewedSiteIdentity!==true||input.reviewedNonceContract!==true||input.approvedPersonalAccount!==true||input.expectedIssuer!==LINKEDIN_DISCOVERY_ISSUER)return unavailable();
  let configuration;try{configuration=await createLinkedInOfflineConfiguration(Object.fromEntries(keys.slice(0,6).map(k=>[k,input[k]])));}catch{return unavailable();}
  const result={ready:true,configuration,operatingContract:Object.freeze({issuer:input.expectedIssuer,codeInjectionDefense:'oidc_nonce',serverConfirmedNonceContract:true})};
  Object.defineProperties(result,{clientSecret:{value:clientSecret,enumerable:false},keyringSource:{value:keyringSource,enumerable:false}});
  return Object.freeze(result);
}
