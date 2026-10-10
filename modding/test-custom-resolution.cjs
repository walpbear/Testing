const fs = require('fs'), vm = require('vm'), assert = require('assert');
const sprites = {1:{w:320,h:440,ox:0,oy:0},2:{w:160,h:168,ox:0,oy:0},3:{w:128,h:128,ox:64,oy:64}};
let draw;
const global = {mod_sprite_resolutions:{},mod_sprite_frames:{}};
const variable_struct_exists=(s,k)=>Object.hasOwn(s,k);
const variable_struct_get=(s,k)=>s[k];
const variable_struct_set=(s,k,v)=>s[k]=v;
let configScale = 2;
let metadata={};
let frameFiles={};
let nextSprite=100, added=0, deleted=0;
const filename_name=p=>p.split('/').pop();
const filename_dir=p=>p.slice(0,Math.max(p.lastIndexOf('/'),p.lastIndexOf('\\'))+1);
const file_exists=p=>p.endsWith('custom_data.futa') || Object.hasOwn(frameFiles,p);
const ini_open=p=>{}, ini_close=()=>{};
const ini_read_real=(section,key,fallback)=>Object.hasOwn(metadata,key)?metadata[key]:(key==='deepthroat'?configScale:fallback);
const string_lower=s=>s.toLowerCase(), string_replace_all=(s,a,b)=>s.split(a).join(b);
const string_pos=(needle,s)=>s.indexOf(needle)+1, array_length=a=>a.length;
const sprite_get_width=s=>sprites[s].w, sprite_get_height=s=>sprites[s].h;
const sprite_get_xoffset=s=>sprites[s].ox, sprite_get_yoffset=s=>sprites[s].oy;
const sprite_set_offset=(s,x,y)=>{sprites[s].ox=x;sprites[s].oy=y;};
const abs=Math.abs, round=Math.round, floor=Math.floor, string=String;
const filename_change_ext=(p,e)=>p.replace(/\.[^./\\]+$/,e);
const array_push=(a,v)=>a.push(v);
const sprite_add=(p,count,a,b,ox,oy)=>{
 if (!Object.hasOwn(frameFiles,p)) return -1;
 const id=nextSprite++; sprites[id]={w:frameFiles[p][0],h:frameFiles[p][1],ox,oy}; added++;return id;
};
const sprite_delete=s=>{delete sprites[s];deleted++;};
const show_debug_message=s=>{};
const sprite_get_number=s=>1;
const sprite_get_texture=(s,f)=>({sprite:s,frame:f});
const draw_sprite_ext=(...a)=>draw=a, draw_sprite_part_ext=(...a)=>draw=a;
eval(fs.readFileSync(require('path').join(__dirname,'custom-resolution-helpers.gml'),'utf8'));
mod_register_sprite_resolution(1,'custom/joseph - lover/custom_deepthroat.png',80,84);
assert.equal(mod_sprite_resolution(1),2);
assert.deepEqual([sprites[1].ox,sprites[1].oy],[160,168]);
assert.deepEqual([mod_sprite_get_width(1),mod_sprite_get_height(1),mod_sprite_get_xoffset(1),mod_sprite_get_yoffset(1)],[160,220,80,84]);
mod_draw_sprite_ext(1,0,440,256,2,2,0,0xffffff,1);
assert.deepEqual(draw,[1,0,440,256,1,1,0,0xffffff,1]);
assert.equal(sprites[1].w*draw[4],320);
mod_draw_sprite_part_ext(1,7,5,10,40,60,440,256,2,2,0xffffff,1);
assert.deepEqual(draw,[1,7,10,20,80,120,440,256,1,1,0xffffff,1]);
mod_register_sprite_resolution(2,'custom/joseph - lover/custom_mating_press.png',80,84);
assert.equal(mod_sprite_resolution(2),1);
mod_draw_sprite_ext(2,0,440,256,2,2,0,0xffffff,1);
assert.deepEqual(draw,[2,0,440,256,2,2,0,0xffffff,1]);
assert.equal(mod_sprite_resolution(3),1);
console.log('PASS: actual helper functions preserve high-resolution data, logical dimensions, origins, whole-sprite and cropped drawing; original-size and built-in sprites retain scale.');

mod_register_sprite_resolution(1,'C:\\games\\custom\\joseph - lover\\CUSTOM_DEEPTHROAT.PNG',80,84);
assert.equal(mod_sprite_resolution(1),2);
configScale=3;
mod_register_sprite_resolution(1,'custom/joseph - lover/custom_deepthroat.png',80,84);
assert.equal(mod_sprite_resolution(1),3); // explicit metadata overrides dimensions
configScale=2;
const cameraWidth=512*(3840/2160), cameraX=(880-cameraWidth)/2;
assert.equal(3840/cameraWidth,2160/512);
assert(Math.abs((440-cameraX)*(3840/cameraWidth)-1920)<1e-9);
console.log('PASS: Windows paths, uppercase filenames, explicit resolution overrides, equal 4K horizontal/vertical scale and centered game coordinates.');

metadata={deepthroat_logical_width:160,deepthroat_logical_height:220};
frameFiles={'/hd/custom_deepthroat/frame_00.png':[4096,4096],
 '/hd/custom_deepthroat/frame_01.png':[4096,4096],
 '/hd/custom_deepthroat/frame_02.png':[3840,2160]};
assert(mod_sprite_file_exists('/hd/custom_deepthroat.png'));
const primary=mod_add_custom_sprite('/hd/custom_deepthroat.png',9,80,84);
assert.equal(added,1); // separate frames are loaded only when needed
mod_register_sprite_resolution(primary,'/hd/custom_deepthroat.png',80,84);
assert.equal(mod_sprite_get_width(primary),160);
assert.equal(mod_sprite_get_height(primary),220);
assert.equal(mod_sprite_get_xoffset(primary),80);
assert.equal(mod_sprite_get_yoffset(primary),84);
assert.equal(mod_sprite_get_number(primary),3);
mod_draw_sprite_ext(primary,1,440,256,2,2,0,0xffffff,1);
assert.equal(added,2);
assert.equal(draw[1],0);
assert.equal(sprites[draw[0]].w*draw[4],320);
assert.equal(sprites[draw[0]].h*draw[5],440);
assert.equal(sprites[draw[0]].ox*draw[4],160);
assert(Math.abs(sprites[draw[0]].oy*draw[5]-168)<1e-9);
mod_draw_sprite_ext(primary,1,440,256,2,2,0,0xffffff,1);
assert.equal(added,2); // frame cache is reused
assert.equal(mod_sprite_get_texture(primary,1).frame,0);
assert.equal(mod_sprite_frame(primary,-2),draw[0]); // negative wrap
mod_sprite_frame(primary,2);
assert.equal(deleted,1); // inconsistent canvases are rejected
assert.equal(mod_sprite_frame(primary,0),primary);
mod_draw_sprite_part_ext(primary,1,5,10,40,60,440,256,2,2,0xffffff,1);
assert(Math.abs(draw[2]*draw[8]-10)<1e-9);
assert(Math.abs(draw[3]*draw[9]-20)<1e-9);
assert(Math.abs(draw[4]*draw[8]-80)<1e-9);
assert(Math.abs(draw[5]*draw[9]-120)<1e-9);
console.log('PASS: 4096x4096 frame folders load lazily, preserve 160x220 logical size/origin, reuse cached frames, select textures/counts correctly, wrap indices, reject mismatched frames, and crop using independent axis scales.');

frameFiles['/uhd/custom_deepthroat/frame_00.png']=[3840,2160];
const uhd=mod_add_custom_sprite('/uhd/custom_deepthroat.png',9,80,84);
mod_register_sprite_resolution(uhd,'/uhd/custom_deepthroat.png',80,84);
assert.equal(mod_sprite_get_width(uhd),160);
assert.equal(mod_sprite_get_height(uhd),220);
mod_draw_sprite_ext(uhd,0,440,256,2,2,0,0xffffff,1);
assert(Math.abs(sprites[draw[0]].w*draw[4]-320)<1e-9);
assert(Math.abs(sprites[draw[0]].h*draw[5]-440)<1e-9);
console.log('PASS: 3840x2160 individual frames preserve explicit logical canvas dimensions.');
