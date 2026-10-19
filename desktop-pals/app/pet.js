/* Original procedural kemono artwork; imported PNGs use the same animation API. */
window.PetArt = (()=>{
 const palettes={cream:['#f5eee5','#24272c','#98c9f3'],fox:['#d88449','#47352f','#e8a779'],cat:['#9b91ac','#373142','#d1b0d9'],wolf:['#b4c7cd','#3c4d5b','#9bd1e7']};
 function ellipse(c,x,y,rx,ry,color){c.fillStyle=color;c.beginPath();c.ellipse(x,y,rx,ry,0,0,Math.PI*2);c.fill();}
 function poly(c,points,color){c.fillStyle=color;c.beginPath();points.forEach((p,i)=>i?c.lineTo(...p):c.moveTo(...p));c.closePath();c.fill();}
 function draw(c,pet,x,y,size,time,image){
  const behavior=pet.behavior||'idle', walking=behavior==='walk',sleep=behavior==='sleep',play=behavior==='play';
  const bob=walking?Math.abs(Math.sin(time*10))*4:Math.sin(time*2)*1.5;
  c.save();c.translate(x,y);c.scale(size/128,size/128);
  ellipse(c,0,1,38,6,'#25392e22');
  c.scale(pet.facing||1,1);
  if(image&&image.complete&&image.naturalWidth){
   const s=pet.sprite, sequence=s.animations[pet.action]||s.animations[pet.expression]||s.animations[behavior]||s.animations.idle, index=sequence[Math.floor(time*s.fps)%sequence.length];
   const columns=Math.floor(image.naturalWidth/s.frameWidth),fw=s.frameWidth,fh=s.frameHeight;
   const fit=Math.min(112/fw,125/fh),w=fw*fit,h=fh*fit;
   c.imageSmoothingEnabled=false;c.drawImage(image,(index%columns)*fw,Math.floor(index/columns)*fh,fw,fh,-w/2,-h-bob,w,h);c.restore();return;
  }
  const [fur,dark,blue]=palettes[pet.skin]||palettes.cream;
  const stride=walking?Math.sin(time*10)*5:0;
  c.translate(0,-bob+(sleep?16:0));
  // Fluffy tail sways behind the character.
  c.save();c.translate(21,-29);c.rotate(Math.sin(time*2.2)*.15+(sleep?.7:0));ellipse(c,17,-15,18,35,fur);poly(c,[[8,-48],[22,-58],[20,-44],[33,-51],[29,-33],[37,-38],[31,-20],[9,-21]],fur);ellipse(c,18,-40,15,13,dark);c.restore();
  ellipse(c,-12,-10+stride,10,13,dark);ellipse(c,12,-10-stride,10,13,dark);
  ellipse(c,0,-38,23,29,fur);
  ellipse(c,-25,-40-stride,9,19,dark);ellipse(c,25,-42+(play?-15:stride),9,19,dark);
  if(play){ellipse(c,25,-62,7,8,'#eaa9ae');ellipse(c,20,-70,2.5,3,'#eaa9ae');ellipse(c,27,-72,2.5,3,'#eaa9ae');}
  poly(c,[[-22,-53],[0,-40],[24,-54],[11,-66],[-12,-66]],dark);
  c.fillStyle='#6695bf';c.fillRect(-20,-56,7,29);poly(c,[[-20,-27],[-13,-27],[-12,-18],[-21,-21]],'#6695bf');
  // Oversized head, furry cheek silhouette, large ears and hair fringe.
  poly(c,[[-31,-84],[-36,-125],[-8,-107],[13,-109],[34,-127],[35,-83]],dark);
  poly(c,[[-29,-94],[-29,-116],[-13,-104]],'#eda9ad');poly(c,[[20,-104],[31,-118],[29,-93]],'#eda9ad');
  ellipse(c,0,-85,34,31,fur);
  poly(c,[[-29,-101],[-43,-100],[-35,-88],[-43,-82],[-32,-75],[-39,-68],[-22,-66],[23,-65],[37,-70],[30,-79],[41,-83],[34,-93],[40,-99],[27,-102]],fur);
  poly(c,[[-31,-103],[-15,-116],[-19,-107],[-1,-119],[4,-108],[19,-115],[16,-105],[31,-101],[19,-84],[10,-90],[4,-78],[-3,-91],[-12,-80],[-16,-93]],fur);
  ellipse(c,0,-72,18,12,'#fff8ee');
  if(sleep||pet.expression==='sleepy'||pet.expression==='happy'){c.strokeStyle=dark;c.lineWidth=3;c.beginPath();c.moveTo(-22,-84);c.quadraticCurveTo(-15,-78,-8,-84);c.moveTo(8,-84);c.quadraticCurveTo(15,-78,22,-84);c.stroke();}
  else {for(const side of [-1,1]){ellipse(c,side*15,-85,7,10,dark);ellipse(c,side*15,-84,5,8,blue);ellipse(c,side*15,-84,2,7,dark);ellipse(c,side*15-2,-89,2,3,'white');}}
  if(pet.expression==='angry'){c.strokeStyle=dark;c.lineWidth=2;c.beginPath();c.moveTo(-23,-98);c.lineTo(-8,-92);c.moveTo(23,-98);c.lineTo(8,-92);c.stroke();}
  if(pet.expression==='sad'){ellipse(c,-20,-75,2,4,'#93c8ed');ellipse(c,20,-75,2,4,'#93c8ed');}
  if(pet.action==='eat'){ellipse(c,24,-48,8,8,'#de6f6c');poly(c,[[24,-57],[28,-62],[31,-58]],'#72a67a');}
  if(pet.action==='pet'){c.fillStyle='#de899f';c.font='18px sans-serif';c.fillText('♡',20,-133-Math.sin(time*6)*4);}
  poly(c,[[-4,-75],[4,-75],[0,-71]],'#72545b');if(pet.expression==='surprised')ellipse(c,0,-64,4,5,'#72545b');c.strokeStyle='#72545b';c.lineWidth=1.5;c.beginPath();c.moveTo(-7,-67);c.quadraticCurveTo(0,-61,7,-67);c.stroke();
  ellipse(c,-25,-72,5,2.4,'#edc1b7');ellipse(c,25,-72,5,2.4,'#edc1b7');
  c.restore();
 }
 return {draw};
})();
