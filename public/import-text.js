import {IMPORT_MAX_BYTES} from './planner-import.js';
/** Only CSV accepts BOM-labelled UTF-16. Unlabelled input stays strict UTF-8. */
export function decodeImportText(buffer,{format='json'}={}){
 const bytes=new Uint8Array(buffer);
 if(bytes.byteLength>IMPORT_MAX_BYTES)throw Error('Datei ist größer als 1 MB.');
 let encoding='utf-8';
 if(format==='csv'){
  if(bytes.length>=4&&((bytes[0]===0xff&&bytes[1]===0xfe&&bytes[2]===0&&bytes[3]===0)||(bytes[0]===0&&bytes[1]===0&&bytes[2]===0xfe&&bytes[3]===0xff)))throw Error('CSV als UTF-8 oder UTF-16 mit BOM speichern.');
  if(bytes[0]===0xff&&bytes[1]===0xfe)encoding='utf-16le';
  else if(bytes[0]===0xfe&&bytes[1]===0xff)encoding='utf-16be';
 }
 try{
  const text=new TextDecoder(encoding,{fatal:true}).decode(bytes);
  if(text.includes('\0'))throw Error('NUL');
  return text;
 }catch{throw Error(format==='csv'?'CSV als UTF-8 oder UTF-16 mit BOM speichern.':'JSON als UTF-8 speichern.');}
}
