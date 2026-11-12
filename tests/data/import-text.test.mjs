import test from 'node:test';import assert from 'node:assert/strict';
import {decodeImportText} from '../../public/import-text.js';
import {parseDraftCSV} from '../../public/planner-csv.js';
const encode=(s,kind)=>kind==='utf8'?new TextEncoder().encode(s):kind==='utf8bom'?new TextEncoder().encode('\uFEFF'+s):new Uint8Array(Buffer.from('\uFEFF'+s,'utf16le')[kind==='be'?'swap16':'subarray']());
for(const delimiter of [',',';'])for(const encoding of ['utf8','utf8bom','le','be'])test(`${encoding} ${delimiter}: umlauts emoji quoted multiline and escaped quotes`,()=>{
 const source=`Text${delimiter}Tags\r\n"Grüße 🌍\nZeile ""zwei"""${delimiter}Test\r\n`;
 const bytes=encode(source,encoding);if(['le','be'].includes(encoding))assert.throws(()=>new TextDecoder('utf-8',{fatal:true}).decode(bytes));
 const text=decodeImportText(bytes,{format:'csv'});assert.equal(text,source);const rows=parseDraftCSV(text);assert.equal(rows[0].text,'Grüße 🌍\nZeile "zwei"');assert.deepEqual(rows[0].tags,['Test']);
});
for(const bytes of [[0xc3,0x28],[0xff,0xfe,0x41],[0xfe,0xff,0],[0xff,0xfe,0,0xd8],[0xfe,0xff,0xdc,0],[0xff,0xfe,0,0,65,0,0,0],[0,0,0xfe,0xff,0,0,0,65],[84,0,101,0],[0x54,0x65,0xe4,0x74],[65,0,66]])test(`reject malformed/unlabelled/unsupported ${bytes.join('-')}`,()=>assert.throws(()=>decodeImportText(new Uint8Array(bytes),{format:'csv'}),/UTF-8 oder UTF-16 mit BOM/));
test('JSON remains UTF-8 only',()=>{assert.equal(decodeImportText(new TextEncoder().encode('{"ä":"🌍"}')),'{"ä":"🌍"}');for(const kind of ['le','be'])assert.throws(()=>decodeImportText(encode('{}',kind)),/JSON als UTF-8/);});
test('empty UTF-16 decodes but CSV parser rejects empty input',()=>{assert.equal(decodeImportText(new Uint8Array([255,254]),{format:'csv'}),'');assert.throws(()=>parseDraftCSV(''));});
test('actual byte budget enforced independently of file metadata',()=>assert.throws(()=>decodeImportText(new Uint8Array(1024*1024+1),{format:'csv'}),/1 MB/));
test('UTF-16 TSV is still not CSV support',()=>assert.throws(()=>parseDraftCSV(decodeImportText(encode('Text\tTags\r\nGrüße\tTest','le'),{format:'csv'})),/Spalten ungültig/));
