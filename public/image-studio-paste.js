import {classifyMedia} from './image-studio-model.js';

// Only inspect files supplied by this paste event. String representations are
// deliberately ignored, including HTML, image URLs and accompanying plain text.
export function clipboardImage(data){
 if(!data)return null;
 const items=Array.from(data.items||[]).filter(item=>item.kind==='file');
 const files=Array.from(data.files||[]);
 if(!items.length&&!files.length)return null;
 if(items.length>1||files.length>1)throw Error('Bitte füge genau ein Bild ein.');
 let file;
 try{file=items.length?items[0].getAsFile():files[0];}catch{throw Error('Das Bild aus der Zwischenablage kann nicht gelesen werden.');}
 if(!file)throw Error('Das Bild aus der Zwischenablage kann nicht gelesen werden.');
 classifyMedia(file);
 if(items[0]?.type&&items[0].type!==file.type)throw Error('Unterstützt werden JPG, PNG und WebP.');
 return file;
}

export function isPasteTextTarget(target){
 return !!(target?.isContentEditable||target?.closest?.('input,textarea,select,[contenteditable]'));
}
