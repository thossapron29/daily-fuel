import {readFile} from 'node:fs/promises';
import ts from 'typescript';
const urls=new Map();
export async function moduleUrl(file){
 const url=new URL(file,import.meta.url);
 if(urls.has(url.href))return urls.get(url.href);
 let code=ts.transpileModule(await readFile(url,'utf8'),{compilerOptions:{module:ts.ModuleKind.ESNext,target:ts.ScriptTarget.ES2022}}).outputText;
 for(const match of [...code.matchAll(/from\s+(['"])(\.\.?\/[^'"]+)\1/g)]){
  const dependency=new URL(match[2]+(match[2].endsWith('.ts')?'':'.ts'),url);
  code=code.replace(match[0],`from ${JSON.stringify(await moduleUrl(dependency.href))}`);
 }
 const encoded=`data:text/javascript;base64,${Buffer.from(code).toString('base64')}`;
 urls.set(url.href,encoded);return encoded;
}
