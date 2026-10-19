const fs=require('node:fs/promises');
const path=require('node:path');
const {spawn}=require('node:child_process');
const builder=require('electron-builder');
const {getMakeNsisPath}=require('app-builder-lib/out/toolsets/windows');
function run(exe,args,env){return new Promise((resolve,reject)=>{const p=spawn(exe,args,{stdio:'inherit',env});p.on('error',reject);p.on('exit',code=>code===0?resolve():reject(new Error(`${path.basename(exe)} exited ${code}`)));});}
(async()=>{
 const root=path.resolve(__dirname,'..'),meta=JSON.parse(await fs.readFile(path.join(root,'package.json'),'utf8'));
 const output=path.resolve(process.env.DESKFUR_BUILD_DIR||path.join(root,'build','windows'));
 const config={directories:{output}};
 if(process.env.DESKFUR_ELECTRON_DIST)config.electronDist=path.resolve(process.env.DESKFUR_ELECTRON_DIST);
 await builder.build({targets:builder.Platform.WINDOWS.createTarget('dir',builder.Arch.x64),config});
 const nsis=await getMakeNsisPath();
 const installer=path.join(output,`DeskFur-Setup-${meta.version}.exe`);
 await run(nsis.path,[`-DOUTPUT_FILE=${installer}`,`-DAPP_SOURCE=${path.join(output,'win-unpacked')}`,`-DAPP_VERSION=${meta.version}`,`-DAPP_ICON=${path.join(root,'build-resources','icon.ico')}`,path.join(root,'installer','deskfur.nsi')],{...process.env,...nsis.env});
 console.log(`Created self-contained installer: ${installer}`);
})().catch(error=>{console.error(error);process.exitCode=1;});
