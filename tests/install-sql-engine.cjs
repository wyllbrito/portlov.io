const fs=require('node:fs'),path=require('node:path'),zlib=require('node:zlib');
const root=path.resolve('.checks/sql-engine'),tar=zlib.gunzipSync(fs.readFileSync(path.join(root,'pglite.tgz')));
for(let at=0;at+512<=tar.length;){const header=tar.subarray(at,at+512),name=header.subarray(0,100).toString().split('\0')[0],size=parseInt(header.subarray(124,136).toString().replace(/\0/g,'').trim()||'0',8);if(!name)break;const type=String.fromCharCode(header[156]);
 if((name.startsWith('package/dist/')||name==='package/package.json')&&(type==='0'||type==='\0')){const target=path.resolve(root,name);if(!target.startsWith(root+path.sep))throw Error('Unsafe archive path');fs.mkdirSync(path.dirname(target),{recursive:true});fs.writeFileSync(target,tar.subarray(at+512,at+512+size))}
 at+=512+Math.ceil(size/512)*512;
}
console.log('Motor SQL extraído apenas em .checks/sql-engine.');
