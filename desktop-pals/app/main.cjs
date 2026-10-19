const { app, BrowserWindow, ipcMain, dialog, screen, globalShortcut, Tray, Menu, nativeImage } = require('electron');
const fs = require('node:fs/promises');
const path = require('node:path');
const { importSprite, exportSprite, validateSprite } = require('./sprites.cjs');
let win, tray;
const defaults = {shimeji:true,startHidden:true,name:'My pet',dual:false,fullness:70,bond:50,energy:80,expression:'neutral',skin:'cream',size:128,speed:42,volume:0.25,muted:false,relay:'',sprite:null,x:0.55,y:0.78};
let settings = {...defaults};
const settingsFile = () => path.join(app.getPath('userData'),'settings.json');
function cleanSettings(value) {
  const next = {...settings};
  if(['neutral','happy','sad','surprised','sleepy','angry'].includes(value.expression)) next.expression=value.expression;
  if (typeof value.name === 'string') next.name = value.name.trim().slice(0,24) || 'My pet';
  if (['cream','fox','cat','wolf'].includes(value.skin)) next.skin=value.skin;
  for (const [key,min,max] of [['size',64,240],['speed',0,120],['volume',0,1],['fullness',0,100],['bond',0,100],['energy',0,100],['x',0,1],['y',0,1]]) if(Number.isFinite(value[key])) next[key]=Math.max(min,Math.min(max,value[key]));
  for (const key of ['muted','dual','shimeji','startHidden']) if(typeof value[key]==='boolean') next[key]=value[key];
  if(typeof value.relay==='string') next.relay=value.relay.slice(0,512);
  if(value.sprite===null) next.sprite=null;
  else if(value.sprite) next.sprite=validateSprite(value.sprite);
  return next;
}
async function save() { await fs.mkdir(app.getPath('userData'),{recursive:true}); await fs.writeFile(settingsFile()+'.tmp',JSON.stringify(settings)); await fs.rename(settingsFile()+'.tmp',settingsFile()); }
function showControls(){if(win&&!win.isDestroyed()){win.show();win.setIgnoreMouseEvents(false);win.focus();win.webContents.send('show-controls');}}
app.whenReady().then(async()=>{
  try {settings=cleanSettings(JSON.parse(await fs.readFile(settingsFile(),'utf8')));} catch {}
  const area=screen.getPrimaryDisplay().workArea;
  win=new BrowserWindow({...area,frame:false,transparent:true,resizable:false,hasShadow:false,alwaysOnTop:true,backgroundColor:'#00000000',webPreferences:{preload:path.join(__dirname,'preload.cjs'),contextIsolation:true,nodeIntegration:false,sandbox:true}});
  win.setAlwaysOnTop(true,'floating');
  win.webContents.setWindowOpenHandler(()=>({action:'deny'}));
  win.webContents.on('will-navigate',e=>e.preventDefault());
  win.loadFile(path.join(__dirname,'index.html'));
  win.on('closed',()=>{win=null;});
  ipcMain.handle('settings:load',()=>settings);
  ipcMain.handle('settings:save',async(_,value)=>{settings=cleanSettings(value||{});await save();return settings;});
  ipcMain.handle('sprite:import',async()=>{
    const result=await dialog.showOpenDialog(win,{title:'Import pet PNG or sprite pack',properties:['openFile'],filters:[{name:'Pet sprite',extensions:['png','json']}]});
    if(result.canceled)return null;
    try{return {sprite:await importSprite(result.filePaths[0])};}catch(e){return {error:e.message};}
  });
  ipcMain.handle('sprite:export',async(_,sprite)=>{
    try{const valid=validateSprite(sprite);const result=await dialog.showSaveDialog(win,{title:'Export editable sprite pack',defaultPath:'my-pet.json',filters:[{name:'Pet JSON',extensions:['json']}]});if(result.canceled)return null;return {path:await exportSprite(valid,result.filePath)};}catch(e){return {error:e.message};}
  });
  ipcMain.on('window:passthrough',(_,ignore)=>{if(win)win.setIgnoreMouseEvents(Boolean(ignore),{forward:true});});
  ipcMain.on('app:quit',()=>app.quit());
  globalShortcut.register('CommandOrControl+Shift+P',showControls);
  // Native tray image is an embedded original 16px PNG, generated with the project.
  const icon=nativeImage.createFromPath(path.join(__dirname,'tray.png'));
  tray=new Tray(icon);tray.setToolTip('DeskFur · Ctrl+Shift+P');
  tray.setContextMenu(Menu.buildFromTemplate([{label:'Show pet controls',click:showControls},{label:'Quit DeskFur',click:()=>app.quit()}]));
  tray.on('click',showControls);
  screen.on('display-metrics-changed',()=>{if(win)win.setBounds(screen.getPrimaryDisplay().workArea);});
}).catch(e=>{console.error(e);app.quit();});
app.on('window-all-closed',()=>app.quit());
app.on('will-quit',()=>globalShortcut.unregisterAll());
