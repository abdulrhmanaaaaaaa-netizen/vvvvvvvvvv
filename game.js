import * as THREE from 'https://cdn.jsdelivr.net/npm/three@0.180.0/build/three.module.js';

const canvas = document.querySelector('#gameCanvas');
const root = document.querySelector('#gameRoot');
const ui = {
  loading: document.querySelector('#loadingScreen'), home: document.querySelector('#homeScreen'),
  hud: document.querySelector('#gameHud'), pause: document.querySelector('#pauseScreen'),
  how: document.querySelector('#howPanel'), start: document.querySelector('#startBtn'),
  howBtn: document.querySelector('#howBtn'), closeHow: document.querySelector('#closeHow'),
  menu: document.querySelector('#menuBtn'), resume: document.querySelector('#resumeBtn'),
  restart: document.querySelector('#restartBtn'), exit: document.querySelector('#exitBtn'),
  speed: document.querySelector('#speedValue'), speedFill: document.querySelector('#speedFill'),
  distance: document.querySelector('#distanceValue'), gear: document.querySelector('#gearValue'),
  wheel: document.querySelector('#steeringWheel'), gas: document.querySelector('#gasBtn'),
  brake: document.querySelector('#brakeBtn'), quality: document.querySelector('#qualityBtn'),
  qualityText: document.querySelector('#qualityText'), sound: document.querySelector('#soundBtn'),
  toast: document.querySelector('#toast')
};

let scene, camera, renderer, car, wheels = [], roadMarks = [], roadside = [], buildings = [], lamps = [];
let running = false, paused = false, started = false;
let speed = 0, steering = 0, steerTarget = 0, distance = 0, gasPressed = false, brakePressed = false;
let quality = 'medium', lastTime = 0, toastTimer = 0;
const clock = new THREE.Clock();
const maxSpeed = 86;
const worldLoop = 260;
const keys = new Set();
const lowPower = matchMedia('(max-width: 700px)').matches || (navigator.deviceMemory && navigator.deviceMemory <= 4);

const mats = {
  road: new THREE.MeshStandardMaterial({ color: 0x252a30, roughness: .94 }),
  asphaltEdge: new THREE.MeshStandardMaterial({ color: 0x41464b, roughness: 1 }),
  concrete: new THREE.MeshStandardMaterial({ color: 0x555b60, roughness: 1 }),
  line: new THREE.MeshBasicMaterial({ color: 0xe9e5d9 }),
  copper: new THREE.MeshStandardMaterial({ color: 0xd77743, metalness: .55, roughness: .33 }),
  dark: new THREE.MeshStandardMaterial({ color: 0x101820, metalness: .68, roughness: .28 }),
  glass: new THREE.MeshPhysicalMaterial({ color: 0x182e3d, metalness: .42, roughness: .15, transparent: true, opacity: .86 }),
  tire: new THREE.MeshStandardMaterial({ color: 0x101114, roughness: .9 }),
  rim: new THREE.MeshStandardMaterial({ color: 0x9da7ad, metalness: .82, roughness: .22 }),
  headlight: new THREE.MeshBasicMaterial({ color: 0xffe0b0 }),
  tail: new THREE.MeshBasicMaterial({ color: 0xff351e })
};

function makeBox(parent, size, pos, material, cast = false, receive = false) {
  const mesh = new THREE.Mesh(new THREE.BoxGeometry(...size), material);
  mesh.position.set(...pos); mesh.castShadow = cast; mesh.receiveShadow = receive; parent.add(mesh); return mesh;
}
function makeCar(color = 0x29343d, scale = 1) {
  const group = new THREE.Group();
  group.scale.setScalar(scale);
  const bodyMat = new THREE.MeshPhysicalMaterial({ color, metalness: .78, roughness: .23, clearcoat: .9, clearcoatRoughness: .14 });
  makeBox(group, [2.02,.58,4.15], [0,.66,0], bodyMat, true, true);
  makeBox(group, [1.9,.2,1.02], [0,.92,-1.45], bodyMat, true);
  makeBox(group, [1.9,.18,1.0], [0,.92,1.48], bodyMat, true);
  const cabin = makeBox(group, [1.48,.64,1.92], [0,1.2,-.18], mats.glass, true);
  cabin.scale.y = 1;
  makeBox(group, [1.76,.11,1.52], [0,1.52,-.2], bodyMat, true);
  makeBox(group, [1.88,.16,.18], [0,.63,-2.11], mats.dark);
  makeBox(group, [1.88,.16,.18], [0,.63,2.1], mats.dark);
  makeBox(group, [.08,.5,.22], [-.78,1.06,.05], mats.dark);
  makeBox(group, [.08,.5,.22], [.78,1.06,.05], mats.dark);
  const spoiler = new THREE.Group(); spoiler.position.set(0,1.12,1.82); group.add(spoiler);
  makeBox(spoiler, [1.9,.09,.34], [0,.35,0], mats.dark, true);
  makeBox(spoiler, [.09,.4,.09], [-.65,.15,0], mats.copper);
  makeBox(spoiler, [.09,.4,.09], [.65,.15,0], mats.copper);
  for (const x of [-.72,.72]) {
    const light = makeBox(group, [.35,.13,.06], [x,.78,-2.09], mats.headlight);
    light.rotation.z = x < 0 ? -.12 : .12;
    const rear = makeBox(group, [.42,.13,.055], [x,.8,2.1], mats.tail);
    rear.rotation.z = x < 0 ? -.06 : .06;
  }
  for (const x of [-1,1]) for (const z of [-1.35,1.35]) {
    const wheelGroup = new THREE.Group(); wheelGroup.position.set(x,.43,z); group.add(wheelGroup);
    const tire = new THREE.Mesh(new THREE.CylinderGeometry(.43,.43,.28,20), mats.tire);
    tire.rotation.z = Math.PI/2; tire.castShadow = true; wheelGroup.add(tire);
    const rim = new THREE.Mesh(new THREE.CylinderGeometry(.25,.25,.295,16), mats.rim);
    rim.rotation.z = Math.PI/2; wheelGroup.add(rim);
    const center = new THREE.Mesh(new THREE.CylinderGeometry(.09,.09,.31,12), mats.dark);
    center.rotation.z = Math.PI/2; wheelGroup.add(center);
    for (let i=0;i<5;i++) {
      const spoke = makeBox(wheelGroup,[.025,.31,.045],[0,0,0],mats.rim);
      spoke.rotation.y = (Math.PI*2*i)/5;
    }
    wheels.push(wheelGroup);
  }
  const underglow = new THREE.PointLight(0xe77e43, 1.4, 4.2, 2);
  underglow.position.set(0,.22,0); group.add(underglow);
  group.position.set(0,0,0);
  return group;
}

function createWindowTexture() {
  const c = document.createElement('canvas'); c.width = 256; c.height = 512;
  const ctx = c.getContext('2d');
  ctx.fillStyle = '#19232c'; ctx.fillRect(0,0,c.width,c.height);
  for (let y=12;y<500;y+=27) for (let x=10;x<250;x+=30) {
    const lit = Math.random() > .36;
    ctx.fillStyle = lit ? (Math.random()>.55 ? '#d18a55' : '#8eb4c3') : '#263640';
    ctx.globalAlpha = lit ? .78 : .62; ctx.fillRect(x,y,18,15);
  }
  ctx.globalAlpha = 1;
  const texture = new THREE.CanvasTexture(c); texture.colorSpace = THREE.SRGBColorSpace; return texture;
}

function initScene() {
  scene = new THREE.Scene();
  scene.background = new THREE.Color(0x8295a4);
  scene.fog = new THREE.FogExp2(0x8997a1, .0054);
  camera = new THREE.PerspectiveCamera(66, innerWidth/innerHeight, .1, 430);
  camera.position.set(0,4.8,10.8); camera.lookAt(0,1,-12);
  const isMobile = matchMedia('(max-width: 700px)').matches;
  renderer = new THREE.WebGLRenderer({ canvas, antialias: !isMobile, alpha: false, powerPreference: 'high-performance', stencil: false, depth: true });
  renderer.setPixelRatio(Math.min(devicePixelRatio, isMobile ? 1.25 : 1.65));
  renderer.setSize(innerWidth, innerHeight, false);
  renderer.outputColorSpace = THREE.SRGBColorSpace;
  renderer.toneMapping = THREE.ACESFilmicToneMapping;
  renderer.toneMappingExposure = 1.12;
  renderer.shadowMap.enabled = !lowPower;
  renderer.shadowMap.type = THREE.PCFSoftShadowMap;

  scene.add(new THREE.HemisphereLight(0xd8e7f1,0x34313a,2.0));
  const sun = new THREE.DirectionalLight(0xffc69b,2.25);
  sun.position.set(-32,48,-65); sun.castShadow = !lowPower;
  sun.shadow.mapSize.set(lowPower ? 512 : 1024, lowPower ? 512 : 1024);
  sun.shadow.camera.left = -28; sun.shadow.camera.right = 28; sun.shadow.camera.top = 28; sun.shadow.camera.bottom = -28;
  sun.shadow.bias = -.00025; scene.add(sun);

  const ground = new THREE.Mesh(new THREE.PlaneGeometry(600,600), new THREE.MeshStandardMaterial({color:0x4d5b58,roughness:1}));
  ground.rotation.x = -Math.PI/2; ground.position.y=-.09; ground.position.z=-110; ground.receiveShadow=true; scene.add(ground);
  const road = new THREE.Mesh(new THREE.PlaneGeometry(18,300), mats.road);
  road.rotation.x=-Math.PI/2; road.position.set(0,0,-118); road.receiveShadow=true; scene.add(road);
  for (const x of [-9.35,9.35]) {
    const edge = new THREE.Mesh(new THREE.BoxGeometry(.7,.15,300),mats.asphaltEdge);
    edge.position.set(x,.02,-118); edge.receiveShadow=true; scene.add(edge);
    const sidewalk = new THREE.Mesh(new THREE.BoxGeometry(3,.28,300),mats.concrete);
    sidewalk.position.set(x*1.27,.08,-118); sidewalk.receiveShadow=true; scene.add(sidewalk);
  }
  const dashGeo = new THREE.BoxGeometry(.14,.025,4.5);
  for (let x of [-3,3]) for(let z=-245;z<20;z+=10) {
    const dash = new THREE.Mesh(dashGeo,mats.line); dash.position.set(x,.025,z); scene.add(dash); roadMarks.push(dash);
  }
  // Repeating city blocks and street furniture are intentionally instanced in simple low-cost groups.
  const windowTex = createWindowTexture();
  const buildingMats = [0x45515b,0x303b46,0x59616a,0x394650,0x64615c].map(c=>new THREE.MeshStandardMaterial({color:c, map:windowTex, roughness:.8, metalness:.12}));
  for(let i=0;i<38;i++) {
    const side = i%2 ? 1 : -1;
    const w = 5 + Math.random()*8, h = 9 + Math.random()*34, d = 7 + Math.random()*13;
    const geo = new THREE.BoxGeometry(w,h,d);
    const building = new THREE.Mesh(geo,buildingMats[i%buildingMats.length]);
    building.position.set(side*(15+w*.5+Math.random()*5),h/2,-Math.random()*worldLoop);
    building.castShadow = !lowPower; building.receiveShadow = true; scene.add(building); buildings.push(building);
    const roof = new THREE.Mesh(new THREE.BoxGeometry(w*.7,.3,d*.7),mats.dark);
    roof.position.set(building.position.x,h+.15,building.position.z); scene.add(roof); roadside.push(roof);
  }
  const lampMat = new THREE.MeshStandardMaterial({color:0x343b42,metalness:.7,roughness:.45});
  const glowMat = new THREE.MeshBasicMaterial({color:0xffc17f});
  for(let i=0;i<18;i++) for(const side of [-1,1]) {
    const g = new THREE.Group(); g.position.set(side*11,0,-i*14-10); scene.add(g);
    const pole = new THREE.Mesh(new THREE.CylinderGeometry(.075,.12,6.4,8),lampMat); pole.position.y=3.2; g.add(pole);
    const arm = new THREE.Mesh(new THREE.BoxGeometry(.09,.09,2.2),lampMat); arm.position.set(-side*.85,6.1,0); g.add(arm);
    const head = new THREE.Mesh(new THREE.BoxGeometry(.42,.16,.75),glowMat); head.position.set(-side*1.85,6.05,0); g.add(head);
    const light = new THREE.PointLight(0xffb36f,.8,15,2); light.position.copy(head.position); g.add(light);
    lamps.push(g);
  }
  // Distant skyline silhouette.
  const skylineMat = new THREE.MeshBasicMaterial({color:0x394b59});
  for(let i=0;i<42;i++) {
    const h=12+Math.random()*34, w=5+Math.random()*10;
    const tower = new THREE.Mesh(new THREE.BoxGeometry(w,h,7),skylineMat);
    tower.position.set((i%2?1:-1)*(48+Math.random()*45),h/2,-140-Math.random()*160); scene.add(tower); roadside.push(tower);
  }

  car = makeCar(0x263640,1);
  car.position.set(0,0,.6); scene.add(car);
  const rearGlow = new THREE.PointLight(0xff4b2d,.6,7); rearGlow.position.set(0,.8,2.4); car.add(rearGlow);
  resize();
}

function resize() {
  if(!renderer || !camera) return;
  camera.aspect=innerWidth/innerHeight; camera.updateProjectionMatrix();
  renderer.setSize(innerWidth,innerHeight,false);
  const cap = matchMedia('(max-width: 700px)').matches ? 1.2 : 1.6;
  renderer.setPixelRatio(Math.min(devicePixelRatio, quality==='high' ? 1.85 : quality==='low' ? .9 : cap));
}

function showToast(text) {
  ui.toast.textContent=text; ui.toast.classList.add('visible');
  clearTimeout(toastTimer); toastTimer=setTimeout(()=>ui.toast.classList.remove('visible'),1700);
}
function setQuality() {
  quality = quality==='medium' ? 'high' : quality==='high' ? 'low' : 'medium';
  ui.qualityText.textContent = quality==='high' ? 'عالية' : quality==='low' ? 'منخفضة' : 'متوسطة';
  renderer.shadowMap.enabled = quality==='high';
  renderer.shadowMap.needsUpdate = true;
  renderer.setPixelRatio(Math.min(devicePixelRatio,quality==='high'?1.85:quality==='low'?.9:1.3));
  showToast('GRAPHICS: '+quality.toUpperCase());
}
function resetCar() {
  speed=0; steering=0; steerTarget=0; distance=0; car.position.set(0,0,.6); car.rotation.set(0,0,0);
  ui.distance.textContent='0.00 KM'; ui.speed.textContent='000'; ui.speedFill.style.width='0%';
  wheels.forEach(w=>{w.rotation.set(0,0,0);}); showToast('CAR RESET');
}
function startGame() {
  started=true; running=true; paused=false; ui.home.hidden=true; ui.hud.hidden=false; ui.pause.hidden=true; ui.how.hidden=true;
  resetCar(); showToast('READY TO DRIVE');
}
function pauseGame() {
  if(!started) return;
  paused=true; running=false; ui.pause.hidden=false;
}
function resumeGame() { paused=false; running=true; ui.pause.hidden=true; }
function exitGame() {
  started=false; paused=false; running=false; ui.pause.hidden=true; ui.hud.hidden=true; ui.home.hidden=false; resetCar();
}

function bindHold(button, set) {
  const down=e=>{e.preventDefault();set(true);button.classList.add('active');};
  const up=()=>{set(false);button.classList.remove('active');};
  button.addEventListener('pointerdown',down); button.addEventListener('pointerup',up);
  button.addEventListener('pointercancel',up); button.addEventListener('pointerleave',up);
}
bindHold(ui.gas,v=>gasPressed=v);
bindHold(ui.brake,v=>brakePressed=v);

let wheelPointer=null;
function wheelAngle(e) {
  const r=ui.wheel.getBoundingClientRect(), cx=r.left+r.width/2, cy=r.top+r.height/2;
  let a=Math.atan2(e.clientY-cy,e.clientX-cx)+Math.PI/2;
  while(a>Math.PI) a-=Math.PI*2; while(a<-Math.PI) a+=Math.PI*2;
  steerTarget=THREE.MathUtils.clamp(a/(Math.PI*.72),-1,1);
}
ui.wheel.addEventListener('pointerdown',e=>{e.preventDefault();wheelPointer=e.pointerId;ui.wheel.setPointerCapture(e.pointerId);wheelAngle(e);});
ui.wheel.addEventListener('pointermove',e=>{if(wheelPointer===e.pointerId)wheelAngle(e);});
function releaseWheel(){wheelPointer=null;steerTarget=0;}
ui.wheel.addEventListener('pointerup',releaseWheel); ui.wheel.addEventListener('pointercancel',releaseWheel);

window.addEventListener('keydown',e=>{
  const key=e.key.toLowerCase(); keys.add(key);
  if(['arrowup','arrowdown','arrowleft','arrowright',' '].includes(key)) e.preventDefault();
  if(key==='escape' && started && !paused) pauseGame(); else if(key==='escape' && paused) resumeGame();
  if(key==='r' && started) resetCar();
});
window.addEventListener('keyup',e=>keys.delete(e.key.toLowerCase()));
window.addEventListener('blur',()=>{keys.clear();gasPressed=false;brakePressed=false;steerTarget=0;});
ui.start.addEventListener('click',startGame);
ui.howBtn.addEventListener('click',()=>ui.how.hidden=false);
ui.closeHow.addEventListener('click',()=>ui.how.hidden=true);
ui.menu.addEventListener('click',pauseGame); ui.resume.addEventListener('click',resumeGame);
ui.restart.addEventListener('click',()=>{resetCar();resumeGame();}); ui.exit.addEventListener('click',exitGame);
ui.quality.addEventListener('click',setQuality);
ui.sound.addEventListener('click',()=>{ui.sound.classList.toggle('muted');showToast('NO ENGINE AUDIO IN THIS BUILD');});

function update(dt) {
  const keyGas=keys.has('w')||keys.has('arrowup');
  const keyBrake=keys.has('s')||keys.has('arrowdown')||keys.has(' ');
  const left=keys.has('a')||keys.has('arrowleft');
  const right=keys.has('d')||keys.has('arrowright');
  const throttle=gasPressed||keyGas;
  const braking=brakePressed||keyBrake;
  let steerInput=(right?1:0)-(left?1:0);
  if(Math.abs(steerInput)>.01 && wheelPointer===null) steerTarget=steerInput;
  else if(!left&&!right && wheelPointer===null) steerTarget=0;
  steering=THREE.MathUtils.damp(steering,steerTarget,7,dt);

  if(throttle) speed += 27*dt;
  else speed -= 4.7*dt;
  if(braking) speed -= 43*dt;
  speed=THREE.MathUtils.clamp(speed,0,maxSpeed);
  const speedRatio=speed/maxSpeed;
  car.position.x += steering*(2.2+speedRatio*5.8)*dt;
  if(car.position.x>7.55){car.position.x=7.55;speed*=.985;}
  if(car.position.x<-7.55){car.position.x=-7.55;speed*=.985;}
  car.rotation.z=THREE.MathUtils.damp(car.rotation.z,-steering*.17*speedRatio,5,dt);
  car.rotation.y=THREE.MathUtils.damp(car.rotation.y,-steering*.075,5,dt);
  wheels.forEach((w,i)=>{w.rotation.x += speed*dt*1.3; if(i<2) w.rotation.y=steering*.42;});
  const scroll=speed*dt;
  roadMarks.forEach(o=>{o.position.z+=scroll;if(o.position.z>12)o.position.z-=worldLoop;});
  buildings.forEach(o=>{o.position.z+=scroll*.92;if(o.position.z>24)o.position.z-=worldLoop;});
  roadside.forEach(o=>{o.position.z+=scroll*.92;if(o.position.z>24)o.position.z-=worldLoop;});
  lamps.forEach(o=>{o.position.z+=scroll;if(o.position.z>15)o.position.z-=worldLoop;});
  distance += speed*dt/1000;
  const kmh=Math.round(speed*3.6);
  ui.speed.textContent=String(kmh).padStart(3,'0');
  ui.speedFill.style.width=(speedRatio*100)+'%';
  ui.distance.innerHTML=distance.toFixed(2)+' <i>KM</i>';
  ui.gear.textContent=speed<.5?'D / IDLE':'D / DRIVE';
  ui.wheel.style.transform=`rotate(${steering*145}deg)`;
  ui.wheel.setAttribute('aria-valuenow',String(Math.round(steering*100)));
  ui.gas.classList.toggle('active',throttle); ui.brake.classList.toggle('active',braking);
  const desiredCamX=car.position.x*.36;
  camera.position.x=THREE.MathUtils.damp(camera.position.x,desiredCamX,3.2,dt);
  camera.position.y=THREE.MathUtils.damp(camera.position.y,4.7+speedRatio*.12,2,dt);
  camera.lookAt(car.position.x*.24,1.08,-12);
}

function animate() {
  const dt=Math.min(clock.getDelta(),.04);
  if(running && !paused) update(dt);
  if(renderer && scene && camera) renderer.render(scene,camera);
}

try {
  initScene();
  renderer.setAnimationLoop(animate);
  setTimeout(()=>ui.loading.classList.add('done'),650);
} catch(error) {
  console.error(error);
  ui.loading.innerHTML='<div class="loader-brand"><strong>APEX<span>DRIVE</span></strong></div><p style="color:#c8cdd2">تعذّر تشغيل الرسوم ثلاثية الأبعاد. جرّب متصفحًا يدعم WebGL 2.</p>';
}
window.addEventListener('resize',resize);
document.addEventListener('visibilitychange',()=>{if(document.hidden && started && running)pauseGame();});
