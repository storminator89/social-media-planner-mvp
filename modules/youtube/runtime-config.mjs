import {createYouTubeOfflineConfiguration,GOOGLE_ISSUER} from '../oauth/youtube-contract.mjs';
export const YOUTUBE_RUNTIME_ENV_KEYS=Object.freeze(['TAKT_YOUTUBE_ENABLED','TAKT_YOUTUBE_CONFIGURATION','TAKT_YOUTUBE_CLIENT_SECRET','TAKT_TOKEN_KEYRING_JSON','TAKT_YOUTUBE_PRIVATE_UPLOAD_ENABLED','TAKT_YOUTUBE_PUBLIC_UPLOAD_ENABLED']);
const keys=['siteId','siteOrigin','clientId','redirectUri','accountType','expectedChannelId','appConfigVersion','reviewedSiteIdentity','reviewedGoogleWebContract','approvedTargetChannel','reviewedCloudUploadContract'];
const closed=()=>Object.freeze({ready:false,code:'OAUTH_NOT_CONFIGURED'});
/** Explicit trusted runtime assertions, not proof or user grants by themselves. */
export async function readYouTubeRuntimeConfiguration(env={}){
 if(env.TAKT_YOUTUBE_ENABLED!=='true')return closed();const raw=env.TAKT_YOUTUBE_CONFIGURATION,secret=env.TAKT_YOUTUBE_CLIENT_SECRET,keyring=env.TAKT_TOKEN_KEYRING_JSON,uploadFlag=env.TAKT_YOUTUBE_PRIVATE_UPLOAD_ENABLED,publicFlag=env.TAKT_YOUTUBE_PUBLIC_UPLOAD_ENABLED;
 if(typeof raw!=='string'||raw.length>8192||typeof secret!=='string'||secret.length<1||secret.length>4096||!/^[\x21-\x7e]+$/.test(secret)||typeof keyring!=='string'||!keyring||keyring.length>8192)return closed();
 let input;try{input=JSON.parse(raw);}catch{return closed();}if(!input||typeof input!=='object'||Array.isArray(input)||Object.keys(input).length!==keys.length||!keys.every(k=>Object.hasOwn(input,k)))return closed();
 if(input.reviewedSiteIdentity!==true||input.reviewedGoogleWebContract!==true||input.approvedTargetChannel!==true||typeof input.reviewedCloudUploadContract!=='boolean')return closed();
 let configuration;try{configuration=await createYouTubeOfflineConfiguration(Object.fromEntries(keys.slice(0,7).map(k=>[k,input[k]])));}catch{return closed();}
 const result={ready:true,configuration,publicUploads:publicFlag==='true'&&uploadFlag==='true'&&input.reviewedCloudUploadContract===true,privateUploads:uploadFlag==='true'&&input.reviewedCloudUploadContract===true,operatingContract:Object.freeze({issuer:GOOGLE_ISSUER,codeInjectionDefense:'pkce_s256_and_oidc_nonce',serverConfirmedWebContract:true})};Object.defineProperties(result,{clientSecret:{value:secret,enumerable:false},keyringSource:{value:keyring,enumerable:false}});return Object.freeze(result);
}
