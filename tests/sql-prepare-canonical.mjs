import assert from 'node:assert/strict';
import {readFile,readdir} from 'node:fs/promises';
import {PGlite} from '@electric-sql/pglite';

// All SQL template tags in the live API/lib source are compiled against an
// isolated PostgreSQL engine bootstrapped exclusively from scripts/schema.sql.
// No production connection and no neon_auth reads or mutations.
async function files(dir){
 const entries=await readdir(new URL('../'+dir+'/',import.meta.url),{withFileTypes:true});
 const result=[];
 for(const entry of entries){
  const name=dir+'/'+entry.name;
  if(entry.isDirectory())result.push(...await files(name));
  else if(entry.isFile()&&entry.name.endsWith('.js'))result.push(name);
 }
 return result;
}
function sqlTags(source,path){
 const queries=[];
 const tag=/\bsql\s*`/g;
 let match;
 while((match=tag.exec(source))){
  let i=tag.lastIndex,sql='',parameters=0,closed=false;
  while(i<source.length){
   const ch=source[i];
   if(ch==='`'){i++;closed=true;break;}
   if(ch==='\\'){sql+=source.slice(i,i+2);i+=2;continue;}
   if(ch==='$'&&source[i+1]==='{'){
    let depth=1,quote='',escaped=false;i+=2;
    while(i<source.length&&depth){
     const c=source[i++];
     if(escaped){escaped=false;continue;}
     if(quote){
      if(c==='\\'){escaped=true;continue;}
      if(c===quote)quote='';
      continue;
     }
     if(c==="'"||c==='"'||c==='`'){quote=c;continue;}
     if(c==='{')depth++;
     if(c==='}')depth--;
    }
    assert.equal(depth,0,path+': unterminated parameter expression');
    sql+='$'+(++parameters);
   }else{sql+=ch;i++;}
  }
  assert.equal(closed,true,path+': unterminated SQL template');
  tag.lastIndex=i;
  queries.push({sql,parameters});
 }
 return queries;
}
const canonical=await readFile(new URL('../scripts/schema.sql',import.meta.url),'utf8');
const db=new PGlite();
try{
 await db.exec(canonical);
 const application=[...await files('api'),...await files('lib')];
 let count=0,ignored=0;
 for(const path of application){
  const source=await readFile(new URL('../'+path,import.meta.url),'utf8');
  for(const item of sqlTags(source,path)){
   const sql=item.sql.trim();
   if(/^\s*(?:CREATE\s+TABLE|CREATE\s+(?:UNIQUE\s+)?INDEX|ALTER\s+TABLE)\b/i.test(sql)){
    // Migration/bootstrap test helpers are retained but MUST NOT run on requests.
    ignored++;continue;
   }
   if(/\bneon_auth\b/i.test(sql)){ignored++;continue;}
   assert.match(sql,/^(SELECT|INSERT|UPDATE|DELETE|WITH)\b/i,path+': unsupported unprepared SQL statement');
   const name='s'+count++;
   try{
    await db.exec('PREPARE '+name+' AS '+sql);
    await db.exec('DEALLOCATE '+name);
   }catch(error){
    throw new Error(path+' SQL #'+count+' failed PREPARE: '+error.message+'; query: '+sql.slice(0,360),{cause:error});
   }
  }
 }
 assert.ok(count>=50,'too few statements checked: '+count);
 console.log('PASS: '+count+' live API/lib SQL template statements PREPARE against canonical 18-table schema; '+ignored+' DDL/Neon Auth helpers excluded. Synthetic only.');
}finally{await db.close();}
