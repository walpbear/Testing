const {contextBridge,ipcRenderer}=require('electron');
contextBridge.exposeInMainWorld('desktop',{
 load:()=>ipcRenderer.invoke('settings:load'),
 save:value=>ipcRenderer.invoke('settings:save',value),
 importSprite:()=>ipcRenderer.invoke('sprite:import'),
 exportSprite:sprite=>ipcRenderer.invoke('sprite:export',sprite),
 passthrough:ignore=>ipcRenderer.send('window:passthrough',ignore),
 quit:()=>ipcRenderer.send('app:quit'),
 onShow:callback=>ipcRenderer.on('show-controls',callback)
});
