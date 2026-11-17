import {NativeRenderer,MeshBuilder,mat4Perspective,mat4LookAt,mat4Multiply,modelMatrix} from './engine.js';
import {createTrack,buildCar,buildRoadsideVehicle,TRACKS} from './world.js';

const $=id=>document.getElementById(id);
const canvas=$('gameCanvas');
const mapCanvas=$('minimap');
const mapCtx=mapCanvas?.getContext('2d');
const ui={
  loading:$('loading'),loadingBar:$('loadingBar'),loadingText:$('loadingText'),menu:$('mainMenu'),hud:$('gameHud'),pause:$('pauseOverlay'),
  speed:$('speedValue'),gear:$('gearValue'),nitro:$('nitroFill'),wheel:$('steeringWheel'),fps:$('perfBadge'),
  selectedCar:$('selectedCarName'),trackLabel:$('trackLabel'),toast:$('hudToast'),
  qualityPanel:$('qualityPanel'),qualitySelect:$('qualitySelect'),weather:$('weatherToggle'),sound:$('soundToggle')
};

let renderer,track,playerMesh,shadowMesh,smokeMesh,boostMesh,trafficMeshes=[],state='menu',activeTrack='city',activeCar='sport',quality='balanced';
let distance=7,lane=0,speed=0,yaw=0,nitro=100,steer=0,throttle=false,brake=false,boost=false,handbrake=false;
let cameraMode=0,elapsed=0,fpsFrames=0,fpsClock=0,toastTimer=0,lastFrame=0,audioContext=null,engineOsc=null,engineGain=null;
let weatherEnabled=true,soundEnabled=true,worldReady=false,collisionCooldown=0,driftScore=0;
const keys=new Set();
const CAR_DATA={
  sport:{name:'APEX GT-R',color:[.78,.055,.035],type:'sport',top:292,accel:75},
  street:{name:'STREET RS',color:[.035,.24,.58],type:'sedan',top:248,accel:62},
  suv:{name:'RAIDER X',color:[.66,.47,.25],type:'suv',top:218,accel:48},
  taxi:{name:'CITY TAXI',color:[.84,.69,.16],type:'sedan',top:190,accel:42}
};
const skyColors={city:[.50,.65,.76],desert:[.77,.66,.46],coast:[.43,.68,.80],mountain:[.48,.61,.70],circuit:[.48,.64,.75]};

function showToast(message){ui.toast.textContent=message;ui.toast.classList.add('show');toastTimer=2.2;}
function setLoading(value,label){ui.loadingBar.style.width=`${Math.max(0,Math.min(100,value))}%`;ui.loadingText.textContent=label;}
function getPosition(d,offset=0){const p=track.sample(d),px=-p.tz,pz=p.tx;return {x:p.x+px*offset,y:p.y||0,z:p.z+pz*offset,yaw:p.yaw};}
function buildDynamic(){
  const spec=CAR_DATA[activeCar];playerMesh=buildCar(spec.color,spec.type);
  shadowMesh=new MeshBuilder();shadowMesh.sphere(0,.12,0,1.35,.10,2.45,[.035,.04,.045],16,5);shadowMesh=shadowMesh.build();
  const smoke=new MeshBuilder();smoke.sphere(0,.65,2.55,.42,.38,.48,[.22,.24,.25],10,6);smoke.sphere(-.34,.56,2.92,.34,.30,.36,[.28,.29,.29],9,5);smoke.sphere(.32,.58,3.10,.30,.26,.34,[.34,.35,.34],9,5);smokeMesh=smoke.build();
  const boost=new MeshBuilder();boost.cone(0,.66,3.06,.38,1.15,[.08,.50,.92],12);boostMesh=boost.build();
  trafficMeshes=track.traffic.map((item,i)=>({mesh:buildCar(item.color,i%4===0?'suv':'sedan'),item}));
}
function setTrack(key){
  activeTrack=key;
  track=createTrack(key);
  renderer.upload(track.world);
  for(const t of trafficMeshes){};
  buildDynamic();distance=7;lane=0;speed=0;yaw=track.sample(distance).yaw;
  renderer.fogColor=track.definition.fog||track.definition.sky;
  renderer.wetness=track.definition.wet?0.9:0.08;
  drawMiniMap(distance);
  $('trackTitle').textContent=track.definition.name;
  $('trackSub').textContent=track.definition.subtitle;
  document.querySelectorAll('.track-option').forEach(b=>b.classList.toggle('active',b.dataset.track===key));
}
function drawMiniMap(playerDistance=distance){
  if(!mapCtx||!track)return;
  const ctx=mapCtx,w=mapCanvas.width,h=mapCanvas.height,cx=w/2,cy=h/2,r=68,points=track.route.points;
  let minX=Infinity,maxX=-Infinity,minZ=Infinity,maxZ=-Infinity;for(const p of points){minX=Math.min(minX,p[0]);maxX=Math.max(maxX,p[0]);minZ=Math.min(minZ,p[1]);maxZ=Math.max(maxZ,p[1]);}
  const span=Math.max(maxX-minX,maxZ-minZ)||1,scale=(r*1.55)/span;
  ctx.clearRect(0,0,w,h);ctx.save();ctx.beginPath();ctx.arc(cx,cy,r,0,Math.PI*2);ctx.clip();ctx.fillStyle='#08141a';ctx.fillRect(0,0,w,h);
  ctx.strokeStyle='#526269';ctx.lineWidth=13;ctx.lineJoin='round';ctx.lineCap='round';ctx.beginPath();points.forEach((p,i)=>{const x=cx+(p[0]-(minX+maxX)/2)*scale,y=cy+(p[1]-(minZ+maxZ)/2)*scale;i?ctx.lineTo(x,y):ctx.moveTo(x,y);});ctx.closePath();ctx.stroke();
  ctx.strokeStyle='#e0c08c';ctx.lineWidth=1.5;ctx.setLineDash([5,5]);ctx.stroke();ctx.setLineDash([]);
  const pos=track.sample(playerDistance),px=cx+(pos.x-(minX+maxX)/2)*scale,py=cy+(pos.z-(minZ+maxZ)/2)*scale;ctx.save();ctx.translate(px,py);ctx.rotate(pos.yaw);ctx.fillStyle='#ff5e47';ctx.beginPath();ctx.moveTo(0,-8);ctx.lineTo(6,7);ctx.lineTo(-6,7);ctx.closePath();ctx.fill();ctx.restore();ctx.restore();
}

function drawFrame(dt){
  if(!renderer||!track)return;
  const spec=CAR_DATA[activeCar],pose=getPosition(distance,lane),forward=[-Math.sin(pose.yaw),0,-Math.cos(pose.yaw)];
  yaw=pose.yaw;
  let camPos,target;
  if(cameraMode===0){camPos=[pose.x-forward[0]*11,pose.y+4.6,pose.z-forward[2]*11];target=[pose.x+forward[0]*7,pose.y+1.25,pose.z+forward[2]*7];}
  else if(cameraMode===1){camPos=[pose.x+forward[0]*.45,pose.y+1.68,pose.z+forward[2]*.45];target=[pose.x+forward[0]*30,pose.y+1.5,pose.z+forward[2]*30];}
  else {camPos=[pose.x-forward[0]*2,pose.y+15,pose.z-forward[2]*2];target=[pose.x,0,pose.z];}
  if(!drawFrame.camera){drawFrame.camera={pos:camPos.slice()};}
  const smooth=1-Math.pow(.001,dt);for(let i=0;i<3;i++)drawFrame.camera.pos[i]+=(camPos[i]-drawFrame.camera.pos[i])*smooth;
  camPos=drawFrame.camera.pos;
  const view=mat4LookAt(camPos,target),proj=mat4Perspective(65*Math.PI/180,canvas.clientWidth/Math.max(1,canvas.clientHeight),.1,850),vp=mat4Multiply(proj,view);
  renderer.begin(skyColors[activeTrack]||[.5,.65,.75]);
  renderer.draw(track.world,mat4IdentityMatrix,vp,camPos,activeTrack==='city'?500:440);
  // Traffic is placed around the loop and moves independently at gentle speed offsets.
  for(let i=0;i<trafficMeshes.length;i++){
    const {mesh,item}=trafficMeshes[i],trafficDistance=item.distance+elapsed*(8+i%3*2),p=getPosition(trafficDistance,item.lane);
    renderer.draw(mesh,modelMatrix(p.x,p.y+.04,p.z,p.yaw,1,1,1),vp,camPos,400);
  }
  renderer.draw(shadowMesh,modelMatrix(pose.x,pose.y+.02,pose.z,pose.yaw,1,1,1),vp,camPos,250);
  renderer.draw(playerMesh,modelMatrix(pose.x,pose.y+.02,pose.z,pose.yaw,1,1,1),vp,camPos,300);
  if(Math.floor(elapsed*8)%2===0)drawMiniMap(distance);
  if(handbrake&&speed>35)renderer.draw(smokeMesh,modelMatrix(pose.x,pose.y,pose.z,pose.yaw,1,1,1),vp,camPos,120);
  if((boost||keys.has('ShiftLeft')||keys.has('ShiftRight'))&&nitro>0)renderer.draw(boostMesh,modelMatrix(pose.x,pose.y,pose.z,pose.yaw,1,1,1),vp,camPos,120);
}
const mat4IdentityMatrix=new Float32Array([1,0,0,0,0,1,0,0,0,0,1,0,0,0,0,1]);

function update(dt){
  if(state!=='drive')return;
  elapsed+=dt;
  const kSteer=(keys.has('ArrowLeft')||keys.has('KeyA')?-1:0)+(keys.has('ArrowRight')||keys.has('KeyD')?1:0);
  const steerValue=Math.abs(steer)>0.02?steer:kSteer;
  const isGas=throttle||keys.has('ArrowUp')||keys.has('KeyW');
  const isBrake=brake||keys.has('ArrowDown')||keys.has('KeyS');
  const isBoost=boost||keys.has('ShiftLeft')||keys.has('ShiftRight');
  handbrake=keys.has('Space');
  const spec=CAR_DATA[activeCar];
  if(isGas)speed+=spec.accel*dt;
  else speed-=10*dt;
  if(isBrake)speed-=spec.accel*1.65*dt;
  if(isBoost&&nitro>0&&speed>30){speed+=spec.accel*1.4*dt;nitro=Math.max(0,nitro-23*dt);}else nitro=Math.min(100,nitro+5.5*dt);
  if(handbrake)speed-=28*dt;
  speed=Math.max(0,Math.min(spec.top+(isBoost?42:0),speed));
  lane+=steerValue*dt*(2.5+speed*.011);
  lane*=Math.max(0,1-dt*.18);
  lane=Math.max(-track.definition.width*.62,Math.min(track.definition.width*.62,lane));
  const offRoad=Math.abs(lane)>track.definition.width*.43;
  if(offRoad)speed=Math.max(0,speed-37*dt);
  distance+=(speed/3.6)*dt;
  const current=getPosition(distance,lane);
  if(collisionCooldown>0)collisionCooldown-=dt;
  if(collisionCooldown<=0){for(const item of track.traffic){const other=item.distance+elapsed*(8+item.type%3*2);let relative=((other-distance+track.route.total/2)%track.route.total)-track.route.total/2;if(Math.abs(relative)<4.0&&Math.abs(item.lane-lane)<2.0&&speed>35){speed*=.48;collisionCooldown=2.1;showToast('اصطدام مروري — استعد سرعتك');break;}}}
  if(handbrake&&Math.abs(steerValue)>.25&&speed>40){driftScore+=dt*speed*.7;if(Math.floor(driftScore)%60===0)showToastOnce('انجراف — '+Math.round(driftScore)+' نقطة');}
  if(Math.abs(lane)>track.definition.width*.5&&speed>16){lane*=.985;showToastOnce('عد إلى سطح الطريق');}
  ui.speed.textContent=String(Math.round(speed)).padStart(3,'0');
  ui.gear.textContent=String(Math.max(1,Math.min(7,Math.floor(speed/43)+1)));
  ui.nitro.style.width=`${nitro}%`;
  ui.wheel.style.setProperty('--wheel-angle',`${steerValue*95}deg`);
  $('weatherFX').classList.toggle('active',weatherEnabled&&track.definition.wet&&state==='drive');
  updateAudio();
}
let lastOffroadToast=0;
function showToastOnce(text){if(elapsed-lastOffroadToast>3){showToast(text);lastOffroadToast=elapsed;}}

function initAudio(){
  if(!soundEnabled||audioContext)return;
  try{audioContext=new (window.AudioContext||window.webkitAudioContext)();engineOsc=audioContext.createOscillator();engineGain=audioContext.createGain();engineOsc.type='sawtooth';engineOsc.frequency.value=55;engineGain.gain.value=.0001;engineOsc.connect(engineGain).connect(audioContext.destination);engineOsc.start();}catch(e){soundEnabled=false;}
}
function updateAudio(){if(!audioContext||!engineOsc||!engineGain)return;const t=audioContext.currentTime;engineOsc.frequency.setTargetAtTime(45+speed*1.25,t,.08);engineGain.gain.setTargetAtTime(soundEnabled&&state==='drive'?.018+speed/9000:0.0001,t,.12);}

function frame(now){
  requestAnimationFrame(frame);
  const dt=Math.min(.04,(now-lastFrame)/1000||0);lastFrame=now;
  update(dt);if(track)drawFrame(dt);
  fpsFrames++;fpsClock+=dt;if(fpsClock>=1){ui.fps.textContent=`FPS ${Math.round(fpsFrames/fpsClock)}`;fpsFrames=0;fpsClock=0;}
  if(toastTimer>0){toastTimer-=dt;if(toastTimer<=0)ui.toast.classList.remove('show');}
}

function beginDrive(){
  state='drive';ui.menu.classList.add('hidden');ui.hud.classList.remove('hidden');ui.pause.classList.add('hidden');initAudio();showToast('انطلق — الطريق أمامك');}
function pauseDrive(){if(state==='drive'){state='pause';ui.pause.classList.remove('hidden');}else if(state==='pause'){state='drive';ui.pause.classList.add('hidden');}}
function leaveDrive(){state='menu';speed=0;ui.pause.classList.add('hidden');ui.hud.classList.add('hidden');ui.menu.classList.remove('hidden');}
function setupInputs(){
  window.addEventListener('keydown',e=>{keys.add(e.code);if(['ArrowUp','ArrowDown','ArrowLeft','ArrowRight','Space'].includes(e.code))e.preventDefault();if(e.code==='Escape')pauseDrive();});
  window.addEventListener('keyup',e=>keys.delete(e.code));window.addEventListener('blur',()=>{keys.clear();throttle=false;brake=false;boost=false;steer=0;});
  const hold=(id,down,up)=>{const el=$(id);if(!el)return;el.addEventListener('pointerdown',e=>{e.preventDefault();el.setPointerCapture?.(e.pointerId);down();});for(const name of ['pointerup','pointercancel','lostpointercapture'])el.addEventListener(name,e=>{e.preventDefault?.();up();});};
  hold('gasButton',()=>throttle=true,()=>throttle=false);hold('brakeButton',()=>brake=true,()=>brake=false);hold('nitroButton',()=>boost=true,()=>boost=false);
  const wheel=ui.wheel;let wheelStart=null;wheel.addEventListener('pointerdown',e=>{e.preventDefault();wheel.setPointerCapture(e.pointerId);wheelStart=e.clientX;});wheel.addEventListener('pointermove',e=>{if(wheelStart===null)return;steer=Math.max(-1,Math.min(1,(e.clientX-wheelStart)/68));});const stopWheel=()=>{wheelStart=null;steer=0;};wheel.addEventListener('pointerup',stopWheel);wheel.addEventListener('pointercancel',stopWheel);wheel.addEventListener('lostpointercapture',stopWheel);
  $('startButton').addEventListener('click',beginDrive);$('pauseButton').addEventListener('click',pauseDrive);$('resumeButton').addEventListener('click',pauseDrive);$('exitButton').addEventListener('click',leaveDrive);$('backButton').addEventListener('click',leaveDrive);
  $('cameraButton').addEventListener('click',()=>{cameraMode=(cameraMode+1)%3;showToast(['كاميرا المطاردة','كاميرا المقدمة','كاميرا علوية'][cameraMode]);});
  $('qualityButton').addEventListener('click',()=>ui.qualityPanel.classList.toggle('hidden'));$('closeSettings').addEventListener('click',()=>ui.qualityPanel.classList.add('hidden'));
  ui.qualitySelect.addEventListener('change',e=>{quality=e.target.value;renderer.setQuality(quality);});ui.weather.addEventListener('change',e=>{weatherEnabled=e.target.checked;renderer.wetness=(weatherEnabled&&track.definition.wet)?0.9:0.06;});ui.sound.addEventListener('change',e=>{soundEnabled=e.target.checked;if(soundEnabled)initAudio();updateAudio();});
  document.querySelectorAll('.track-option').forEach(button=>button.addEventListener('click',()=>{setTrack(button.dataset.track);showToast(`تم اختيار ${track.definition.name}`);}));
  document.querySelectorAll('.car-option').forEach(button=>button.addEventListener('click',()=>{activeCar=button.dataset.car;buildDynamic();ui.selectedCar.textContent=CAR_DATA[activeCar].name;document.querySelectorAll('.car-option').forEach(b=>b.classList.toggle('active',b===button));showToast(`السيارة: ${CAR_DATA[activeCar].name}`);}));
  $('garageButton').addEventListener('click',()=>{$('garagePanel').scrollIntoView({behavior:'smooth',block:'center'});});
}

async function boot(){
  try{
    setLoading(12,'تهيئة محرك WebGL الأصلي...');
    renderer=new NativeRenderer(canvas);setLoading(30,'تجهيز المجسمات ثلاثية الأبعاد...');
    setTrack(activeTrack);setLoading(82,'بناء الطرق والمدينة والعناصر...');
    renderer.setQuality('balanced');setupInputs();setLoading(100,'اكتمل تحميل العالم المحلي');
    setTimeout(()=>{ui.loading.classList.add('fade');setTimeout(()=>ui.loading.remove(),450);},350);
    worldReady=true;requestAnimationFrame(frame);
    if('serviceWorker' in navigator&&location.protocol!=='file:'){navigator.serviceWorker.register('./sw.js').catch(()=>{});}
  }catch(error){
    console.error(error);ui.loadingText.textContent='تعذّر تشغيل محرك الرسوم: '+error.message;ui.loadingBar.style.background='#d65a42';
  }
}
boot();
