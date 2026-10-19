// Assemble a self-contained app.asar usable with the verified Windows runtime.
const fs=require('node:fs/promises');
const path=require('node:path');
const asar=require('@electron/asar');
(async()=>{
 const root=path.resolve(__dirname,'..'),output=path.join(root,'build');
 const staging=path.join(output,'app-source');await fs.mkdir(staging,{recursive:true});
 await fs.cp(path.join(root,'app'),staging,{recursive:true});
 await fs.writeFile(path.join(staging,'package.json'),JSON.stringify({name:'deskfur',version:'0.1.0',main:'main.cjs',license:'MIT'}));
 await asar.createPackage(staging,path.join(output,'app.asar'));
 console.log('Created build/app.asar. Put this beside the files in windows/ for the Windows launcher.');
})().catch(e=>{console.error(e);process.exitCode=1;});
