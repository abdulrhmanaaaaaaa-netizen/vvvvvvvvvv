import {MeshBuilder} from './engine.js';

const C={
  asphalt:[0.12,0.14,0.15], asphaltWet:[0.17,0.20,0.21], concrete:[0.43,0.46,0.45], grass:[0.20,0.30,0.18], sand:[0.68,0.52,0.31], rock:[0.36,0.34,0.31], white:[0.84,0.86,0.82], yellow:[0.94,0.68,0.12], red:[0.72,0.12,0.09], blue:[0.08,0.32,0.48], glass:[0.12,0.28,0.34], dark:[0.07,0.09,0.10], green:[0.12,0.32,0.18]
};
const clamp=(v,a,b)=>Math.max(a,Math.min(b,v));
function catmull(p0,p1,p2,p3,t){const t2=t*t,t3=t2*t;return .5*((2*p1)+(-p0+p2)*t+(2*p0-5*p1+4*p2-p3)*t2+(-p0+3*p1-3*p2+p3)*t3);}
function createRoute(points,steps=14){
  const out=[];for(let i=0;i<points.length;i++){const p0=points[(i-1+points.length)%points.length],p1=points[i],p2=points[(i+1)%points.length],p3=points[(i+2)%points.length];for(let s=0;s<steps;s++){const t=s/steps;out.push([catmull(p0[0],p1[0],p2[0],p3[0],t),catmull(p0[1],p1[1],p2[1],p3[1],t)]);}}
  const lengths=[0];let total=0;for(let i=0;i<out.length;i++){const a=out[i],b=out[(i+1)%out.length];total+=Math.hypot(b[0]-a[0],b[1]-a[1]);lengths.push(total);}return {points:out,lengths,total};
}
function sample(route,distance){
  let d=((distance%route.total)+route.total)%route.total;let lo=0,hi=route.points.length;while(lo<hi){const mid=(lo+hi)>>1;if(route.lengths[mid]<d)lo=mid+1;else hi=mid;}const i=Math.max(0,Math.min(route.points.length-1,lo-1)),a=route.points[i],b=route.points[(i+1)%route.points.length],l=route.lengths[i+1]-route.lengths[i]||1,t=(d-route.lengths[i])/l;const x=a[0]+(b[0]-a[0])*t,z=a[1]+(b[1]-a[1])*t,y=(a[2]||0)+((b[2]||0)-(a[2]||0))*t;const dx=b[0]-a[0],dz=b[1]-a[1];return {x,y,z,tx:dx/l,tz:dz/l,yaw:Math.atan2(-dx,-dz)};
}
function addRoad(builder,route,width,wet=false){
  const pts=route.points,n=pts.length,asphalt=wet?C.asphaltWet:C.asphalt;
  for(let i=0;i<n;i++){
    const a=pts[i],b=pts[(i+1)%n],dx=b[0]-a[0],dz=b[1]-a[1],len=Math.hypot(dx,dz)||1,nx=-dz/len,nz=dx/len;
    const ya=(a[2]||0)+.10,yb=(b[2]||0)+.10;
    builder.quad([a[0]+nx*width/2,ya,a[1]+nz*width/2],[b[0]+nx*width/2,yb,b[1]+nz*width/2],[b[0]-nx*width/2,yb,b[1]-nz*width/2],[a[0]-nx*width/2,ya,a[1]-nz*width/2],[0,1,0],asphalt);
    const shoulder=width/2+2.2;
    builder.quad([a[0]+nx*shoulder,ya-.03,a[1]+nz*shoulder],[b[0]+nx*shoulder,yb-.03,b[1]+nz*shoulder],[b[0]+nx*width/2,yb-.03,b[1]+nz*width/2],[a[0]+nx*width/2,ya-.03,a[1]+nz*width/2],[0,1,0],C.concrete);
    builder.quad([a[0]-nx*width/2,ya-.03,a[1]-nz*width/2],[b[0]-nx*width/2,yb-.03,b[1]-nz*width/2],[b[0]-nx*shoulder,yb-.03,b[1]-nz*shoulder],[a[0]-nx*shoulder,ya-.03,a[1]-nz*shoulder],[0,1,0],C.concrete);
    if(i%3===0){const dash=3.2;const mid=[(a[0]+b[0])/2,(a[1]+b[1])/2];builder.box(mid[0],(ya+yb)/2+.025,mid[1],.16,.025,dash,C.yellow,Math.atan2(-dx,-dz));}
    if(i%2===0){builder.box(a[0]+nx*(width/2-.26),ya+.03,a[1]+nz*(width/2-.26),.12,.025,2.4,C.white,Math.atan2(-dx,-dz));builder.box(a[0]-nx*(width/2-.26),ya+.03,a[1]-nz*(width/2-.26),.12,.025,2.4,C.white,Math.atan2(-dx,-dz));}
  }
}
function addBuilding(b,x,z,w,d,h,index,yaw=0){
  const palette=[[.40,.43,.45],[.52,.48,.42],[.28,.37,.42],[.60,.58,.52],[.31,.35,.37],[.48,.40,.34]];const col=palette[index%palette.length];
  b.box(x,h/2,z,w,h,d,col,yaw);b.box(x,h+.32,z,w+.25,.64,d+.25,[.18,.21,.22],yaw);
  const floors=Math.max(2,Math.floor(h/3.4)),cols=Math.max(2,Math.floor(w/2.4));
  for(let f=0;f<floors;f++)for(let c=0;c<cols;c++){
    const lx=-w/2+(c+.5)*w/cols,ly=2.1+f*3.4;
    b.box(x+lx*Math.cos(yaw)+0*Math.sin(yaw),ly,z-lx*Math.sin(yaw),Math.min(1.25,w/cols*.65),1.55,.045,(index%3===0)?[.12,.30,.39]:[.10,.22,.29],yaw);
  }
  b.box(x,h+1,z,w*.7,.16,.16,[.72,.42,.16],yaw);
  // roof equipment and service housings
  b.box(x+w*.20,h+.72,z-d*.16,w*.22,.75,d*.22,[.25,.28,.29],yaw);
}
function addPalm(b,x,z,scale=1){
  b.cylinderY(x,2.5*scale,z,.25*scale,.38*scale,5*scale,[.34,.24,.14],9);
  for(let i=0;i<7;i++){const a=i*Math.PI*2/7;b.box(x+Math.cos(a)*1.25*scale,5.05*scale,z+Math.sin(a)*1.25*scale,.42*scale,.12*scale,2.65*scale,[.16,.34,.18],a);}
  b.sphere(x,5.15*scale,z,.40*scale,.28*scale,.40*scale,[.20,.39,.20],8,5);
}
function addTree(b,x,z,s=1){
  b.cylinderY(x,1.2*s,z,.22*s,.28*s,2.4*s,[.28,.20,.13],8);
  b.cone(x,3.0*s,z,1.25*s,2.6*s,[.10,.29,.15],8);b.cone(x,4.1*s,z,.92*s,2.2*s,[.12,.34,.18],8);
}
function addStreetLight(b,x,z,yaw=0){
  b.cylinderY(x,3.4,z,.09,.11,6.8,[.20,.23,.23],8);b.box(x+.8,6.55,z,.12,.12,1.65,[.20,.23,.23],yaw);b.box(x+1.48,6.46,z,.48,.12,.52,[.95,.78,.48],yaw);
}
function addBarrier(b,x,z,yaw=0,color=C.white){
  b.box(x,.55,z,.55,1.05,5.4,color,yaw);b.box(x,.93,z,.62,.14,5.55,[.78,.12,.10],yaw);
}
function addTukTuk(b,x,z,yaw=0){
  b.box(x,.54,z,.98,.72,1.85,[.08,.43,.26],yaw);b.box(x,1.22,z+.05,.90,.75,1.12,[.12,.23,.19],yaw);b.box(x,1.64,z+.05,.96,.14,1.25,[.16,.17,.16],yaw);b.box(x,1.1,z-.55,.72,.42,.04,[.10,.27,.28],yaw);
  for(const [wx,wz] of [[-.53,-.62],[.53,-.62],[0,.79]])b.cylinderX(x+wx,.36,z+wz,.32,.16,[.04,.05,.05],12);
  b.box(x,.23,z-1,.7,.1,.18,[.65,.1,.06],yaw);
}
function addTrafficCar(b,x,z,yaw,color=[.7,.12,.08],wide=1.8){
  b.box(x,.65,z,wide,.58,4.1,color,yaw);b.box(x,1.08,z+.05,wide*.78,.55,1.9,[.09,.18,.22],yaw);b.box(x,.58,z-2.04,wide*.7,.18,.08,[.82,.82,.72],yaw);b.box(x,.58,z+2.04,wide*.72,.20,.08,[.72,.04,.035],yaw);
  for(const xx of [-wide*.53,wide*.53])for(const zz of [-1.35,1.35]){b.cylinderX(x+xx,.42,z+zz,.40,.20,[.035,.04,.045],12);b.cylinderX(x+xx*1.02,.42,z+zz,.20,.21,[.5,.53,.54],12);}
}

function addMosque(b,x,z){
  b.box(x,2.1,z,15,4.2,12,[.78,.75,.66]);
  b.box(x,4.25,z-6.1,16,.45,.6,[.68,.63,.52]);
  b.sphere(x,4.65,z,4.0,2.15,4.0,[.20,.42,.43],16,8);
  b.sphere(x,6.35,z,1.0,.42,1.0,[.80,.72,.56],12,6);
  b.cylinderY(x+7,5.3,z+4,.55,.72,10,[.77,.73,.64],12);
  b.box(x+7,8.2,z+4,1.55,.22,1.55,[.70,.66,.56]);
  b.cylinderY(x+7,10.1,z+4,.32,.48,3.8,[.72,.68,.58],10);
  b.cone(x+7,12.5,z+4,.55,1.6,[.17,.36,.38],10);
  for(let i=0;i<3;i++)b.box(x-4+i*4,2.0,z-6.35,1.65,2.6,.12,[.12,.28,.32]);
}
function addTrafficSignal(b,x,z,yaw=0){
  b.cylinderY(x,2.3,z,.09,.12,4.6,[.18,.20,.20],8);
  b.box(x,4.0,z,.48,1.25,.42,[.07,.08,.08],yaw);
  for(let i=0;i<3;i++)b.sphere(x,4.38-i*.38,z-.23,.12,.12,.05,[[.76,.06,.035],[.80,.48,.05],[.08,.58,.22]][i],9,6);
}

function addShop(b,x,z,yaw=0){
  b.box(x,1.35,z,5.4,2.7,4.2,[.67,.57,.41],yaw);b.box(x,2.82,z,5.7,.22,4.45,[.14,.19,.20],yaw);
  b.box(x,2.23,z-2.13,4.7,.58,.10,[.73,.16,.07],yaw);b.box(x,1.17,z-2.17,1.9,1.35,.12,[.11,.26,.30],yaw);b.box(x-1.65,1.2,z-2.18,1.0,1.25,.12,[.17,.29,.31],yaw);
}
function buildCity(b,route){
  const count=route.points.length;
  for(let i=0;i<count;i+=7){const p=route.points[i],n=route.points[(i+1)%count],dx=n[0]-p[0],dz=n[1]-p[1],l=Math.hypot(dx,dz)||1,nx=-dz/l,nz=dx/l,yaw=Math.atan2(-dx,-dz);
    for(const side of [-1,1]){const off=side*(18+(i%3)*5),x=p[0]+nx*off,z=p[1]+nz*off;if(i%21===0)addShop(b,x,z,yaw);else addBuilding(b,x,z,10+(i%3)*3,9+(i%4)*2,10+(i%6)*5,i,yaw);if(i%14===0)addPalm(b,p[0]+nx*side*10,p[1]+nz*side*10,.85);if(i%28===0)addStreetLight(b,p[0]+nx*side*8,p[1]+nz*side*8,yaw);}
  }
  // Local urban details: tuk-tuks, taxis, minibus, storefronts and Arabic road markers.
  addTukTuk(b,-15,18,-.22);addTrafficCar(b,14,-32,.10,[.76,.66,.14]);addTrafficCar(b,-14,64,-.15,[.78,.82,.82],2.0);addMosque(b,55,62);addTrafficSignal(b,-24,-48,.1);addTrafficSignal(b,27,44,-.2);
  b.box(34,1.6,22,7,3.2,10,[.13,.32,.42]);b.box(34,3.3,22,7.1,.16,10.1,[.07,.12,.15]);
  b.box(-31,1.0,-15,6,2,5,[.10,.16,.18]);b.box(-31,2.1,-15,5.4,.35,4.6,[.76,.20,.08]);
  for(let i=0;i<18;i++){const a=i*.72,r=145+(i%3)*12,x=Math.cos(a)*r,z=Math.sin(a)*r;addBuilding(b,x,z,11,12,16+(i%5)*6,i+2,a);}
}
function buildDesert(b,route){
  for(let i=0;i<95;i++){const a=i*2.399,r=85+(i%11)*13,x=Math.cos(a)*r,z=Math.sin(a)*r;b.sphere(x,-1,z,7+(i%4)*3,2.5+(i%3),9+(i%5)*3,[.62+(i%3)*.025,.43+(i%4)*.018,.25],9,5);if(i%4===0){b.cylinderY(x,1.3,z,.16,.23,2.6,[.12,.29,.15],7);b.box(x+.5,2.3,z,.95,.1,.16,[.13,.33,.16],.4);}}
  // Distant Egyptian plateau silhouette and three pyramidal landmarks.
  b.cone(220,18,230,28,36,[.70,.57,.39],4);b.cone(270,13,260,21,27,[.68,.55,.38],4);b.cone(170,10,275,16,20,[.73,.60,.43],4);
  for(let i=0;i<route.points.length;i+=10){const p=route.points[i],n=route.points[(i+1)%route.points.length],yaw=Math.atan2(-(n[0]-p[0]),-(n[1]-p[1]));addBarrier(b,p[0]+9,p[1],yaw,[.78,.46,.18]);}
  addShop(b,48,54,.6);b.box(48,2.9,51,4.2,.35,.18,[.73,.14,.06]);
}
function buildCoast(b,route){
  b.box(160,-.5,190,450,.8,210,[.06,.27,.37]);
  for(let i=0;i<route.points.length;i+=12){const p=route.points[i],n=route.points[(i+1)%route.points.length],dx=n[0]-p[0],dz=n[1]-p[1],l=Math.hypot(dx,dz)||1,nx=-dz/l,nz=dx/l;for(const side of [-1,1]){const x=p[0]+nx*side*15,z=p[1]+nz*side*15;addPalm(b,x,z,.8);if(i%24===0)b.box(x,1,z,4,.3,2,[.74,.68,.53]);}}
  for(let i=0;i<24;i++){const x=90+i*9,z=115+(i%4)*12;addBuilding(b,x,z,7,8,6+(i%4)*3,i);}
  b.box(135,.4,130,32,.6,7,[.42,.34,.25]);for(let i=0;i<5;i++)b.cylinderY(121+i*7,.5,138,.12,.12,2.4,[.3,.22,.16],8);
}
function buildMountain(b,route){
  for(let i=0;i<70;i++){const a=i*2.4,r=115+(i%7)*17,x=Math.cos(a)*r,z=Math.sin(a)*r;b.cone(x,10+(i%5)*2,z,18+(i%4)*5,22+(i%6)*6,[.30+(i%3)*.03,.31+(i%4)*.02,.30],7);b.sphere(x,1,z,18,3,15,[.19,.28,.18],8,4);}
  for(let i=0;i<route.points.length;i+=8){const p=route.points[i],n=route.points[(i+1)%route.points.length],yaw=Math.atan2(-(n[0]-p[0]),-(n[1]-p[1]));addBarrier(b,p[0]+8,p[1],yaw,[.52,.54,.53]);addTree(b,p[0]-18,p[1]+8,.95);}
}
function buildCircuit(b,route){
  // Race paddock and spectator infrastructure.
  for(let i=0;i<14;i++){const x=-100+i*15;b.box(x,.45,84,12,.9,5,[.22,.24,.25]);for(let j=0;j<5;j++)b.box(x-4+j*2,1.7,81,1.3,1.5,.25,[.12,.24,.30]);}
  for(let i=0;i<route.points.length;i+=6){const p=route.points[i],n=route.points[(i+1)%route.points.length],yaw=Math.atan2(-(n[0]-p[0]),-(n[1]-p[1]));if(i%12===0){b.box(p[0]+10,1.3,p[1],.7,2.6,4,[.86,.13,.09],yaw);b.box(p[0]-10,1.3,p[1],.7,2.6,4,[.86,.13,.09],yaw);}}
  b.box(0,7,-80,35,1.3,2,[.06,.08,.09]);b.box(0,8.4,-80,31,1.1,.5,[.1,.34,.46]);
}

const TRACKS={
 city:{name:'قلب المدينة',subtitle:'شوارع مضاءة وحركة حضرية',width:15,wet:true,sky:[.55,.67,.76],fog:[.55,.65,.72],points:[[0,0],[0,-100],[55,-165],[140,-172],[225,-125],[252,-35],[215,70],[125,118],[25,98],[-42,45],[-70,-35]]},
 desert:{name:'طريق الصحراء',subtitle:'مساحات مفتوحة ومنعطفات طويلة',width:17,wet:false,sky:[.78,.68,.48],fog:[.75,.63,.42],points:[[0,0],[35,-125],[120,-190],[235,-165],[310,-55],[255,65],[145,135],[25,110],[-65,35],[-75,-65]]},
 coast:{name:'الطريق الساحلي',subtitle:'منحنيات بحرية ومناظر مفتوحة',width:14,wet:true,sky:[.48,.69,.79],fog:[.53,.70,.78],points:[[0,0],[40,-90],[115,-130],[205,-85],[242,10],[195,98],[95,145],[-5,112],[-62,38],[-44,-48]]},
 mountain:{name:'ممر المرتفعات',subtitle:'منعطفات ضيقة وتغيرات ارتفاع',width:13,wet:false,sky:[.54,.63,.70],fog:[.56,.64,.68],points:[[0,0],[35,-100],[120,-170],[190,-120],[205,-20],[145,55],[185,145],[90,192],[-5,130],[-72,25]]},
 circuit:{name:'حلبة APEX الدولية',subtitle:'حلبة مغلقة ونقاط توقيت',width:18,wet:false,sky:[.55,.66,.74],fog:[.58,.68,.74],points:[[-110,-70],[-75,-130],[75,-130],[125,-80],[125,70],[70,125],[-80,125],[-130,65]]}
};

export function createTrack(key){
  const def=TRACKS[key]||TRACKS.city,route=createRoute(def.points,16),b=new MeshBuilder();
  for(let i=0;i<route.points.length;i++){const d=route.lengths[i];let elevation=0;if(key==='mountain')elevation=1.8+Math.sin(d/74)*2.1+Math.sin(d/29)*.55;else if(key==='coast')elevation=.35+Math.sin(d/105)*.32;else if(key==='desert')elevation=.12+Math.sin(d/145)*.18;else if(key==='city')elevation=.12+Math.sin(d/170)*.10;route.points[i][2]=elevation;}
  b.box(0,-2,0,800,.8,800,key==='desert'?C.sand:key==='coast'?[.22,.34,.30]:key==='mountain'?[.20,.28,.22]:[.18,.25,.19]);
  // Large distant horizon masses.
  if(key==='city'||key==='circuit')for(let i=0;i<40;i++){const a=i*Math.PI*2/40,r=310,x=Math.cos(a)*r,z=Math.sin(a)*r;b.box(x,12+(i%4)*5,z,18,25+(i%5)*8,18,[.28,.34,.36]);}
  addRoad(b,route,def.width,def.wet);
  if(key==='city')buildCity(b,route);else if(key==='desert')buildDesert(b,route);else if(key==='coast')buildCoast(b,route);else if(key==='mountain')buildMountain(b,route);else buildCircuit(b,route);
  // Route checkpoints, lamp poles, reflector blocks, cones and roadside posts.
  for(let i=0;i<route.points.length;i+=16){const p=route.points[i],q=route.points[(i+1)%route.points.length],dx=q[0]-p[0],dz=q[1]-p[1],len=Math.hypot(dx,dz)||1,nx=-dz/len,nz=dx/len,yaw=Math.atan2(-dx,-dz);
    if(key!=='desert'&&i%32===0){addStreetLight(b,p[0]+nx*10,p[1]+nz*10,yaw);}
    if(i%48===0){for(const side of [-1,1]){const x=p[0]+nx*side*(def.width/2+4),z=p[1]+nz*side*(def.width/2+4);b.cylinderY(x,.55,z,.12,.12,1.1,[.85,.78,.52],8);}}
  }
  // Local traffic and support vehicles.
  const traffic=[];for(let i=0;i<7;i++){const d=route.total*(i+.5)/8;const p=sample(route,d);traffic.push({distance:d,lane:(i%2?2.5:-2.3),color:[[.75,.08,.06],[.08,.28,.55],[.75,.66,.18],[.68,.70,.68],[.12,.16,.18]][i%5],type:i%5});}
  return {key,definition:def,route,world:b.build(),traffic,sample:(d)=>sample(route,d)};
}

export function buildCar(color=[.78,.08,.055],variant='sport'){
  const b=new MeshBuilder(),suv=variant==='suv',sedan=variant==='sedan';
  const length=suv?4.85:4.35,width=suv?2.0:1.92;
  // Main lower body, shoulders and aerodynamic front/rear sections.
  b.box(0,.69,.05,width,.56,length,color);
  // Faceted sculpted outer shell with tapered nose, shoulders and rear haunches.
  const sections=[[-2.28,.69,.48,.98],[-1.82,.91,.48,1.10],[-1.12,.96,.47,1.16],[-.35,.94,.48,1.12],[.70,.93,.48,1.08],[1.62,.84,.50,1.00],[2.18,.68,.55,.91]];
  const ringPts=sections.map(([z,w,low,high])=>[[-w*.88,low,z],[-w,low+.12,z],[-w*.98,high-.12,z],[-w*.72,high,z],[w*.72,high,z],[w*.98,high-.12,z],[w,low+.12,z],[w*.88,low,z]]);
  for(let r=0;r<ringPts.length-1;r++)for(let k=0;k<8;k++){const a=ringPts[r][k],bb=ringPts[r][(k+1)%8],c=ringPts[r+1][(k+1)%8],d=ringPts[r+1][k];const ux=bb[0]-a[0],uy=bb[1]-a[1],uz=bb[2]-a[2],vx=d[0]-a[0],vy=d[1]-a[1],vz=d[2]-a[2];let nx=uy*vz-uz*vy,ny=uz*vx-ux*vz,nz=ux*vy-uy*vx,ll=Math.hypot(nx,ny,nz)||1;b.quad(a,bb,c,d,[nx/ll,ny/ll,nz/ll],color);}
  b.box(0,.95,-1.32,width*.91,.28,1.62,color);
  b.box(0,.92,1.48,width*.91,.30,1.18,color);
  b.box(0,1.04,-.05,width*.96,.22,1.35,color);
  b.box(0,1.30,.18,width*.79,suv?.83:.56,suv?2.35:1.85,[.045,.075,.09]);
  b.box(0,1.39,-.42,width*.74,.46,.06,[.055,.13,.16]);
  b.quad([-.70,1.10,-.72],[.70,1.10,-.72],[.57,1.61,-.31],[-.57,1.61,-.31],[0,.76,-.65],[.035,.10,.13]);
  b.quad([.56,1.60,.80],[-.56,1.60,.80],[-.67,1.08,1.14],[.67,1.08,1.14],[0,.70,.71],[.035,.09,.12]);
  b.box(0,1.38,.87,width*.72,.42,.06,[.05,.12,.15]);
  b.box(-width*.49,1.15,.12,.08,.38,2.22,[.035,.045,.05]);b.box(width*.49,1.15,.12,.08,.38,2.22,[.035,.045,.05]);
  // Doors, side skirts, mirrors, handles.
  for(const side of [-1,1]){b.box(side*width*.51,.71,.15,.10,.23,1.55,[.12,.14,.15]);b.box(side*width*.60,1.26,-.18,.26,.15,.35,color);b.box(side*width*.56,.96,.4,.08,.035,.23,[.04,.05,.05]);}
  // Front intake, splitter, mesh-like grille and rear diffuser.
  b.box(0,.57,-2.21,width*.72,.22,.08,[.025,.032,.035]);b.box(0,.58,-2.26,width*.42,.13,.035,[.10,.12,.13]);
  for(let i=0;i<7;i++)b.box(-.36+i*.12,.59,-2.285,.035,.07,.018,[.32,.35,.36]);
  b.box(0,.48,2.23,width*.83,.18,.13,[.055,.06,.065]);
  // Glass trim and roof details.
  b.box(0,1.68,.18,width*.73,.07,.1,[.18,.21,.22]);
  b.box(0,1.68,-.03,.68,.045,1.1,[.025,.035,.04]);
  // Headlights and tail lamps.
  for(const side of [-1,1]){b.box(side*.69,.94,-2.20,.38,.12,.10,[.78,.88,.92]);b.box(side*.72,.94,2.09,.40,.13,.09,[.90,.025,.018]);b.box(side*.84,.55,-2.18,.19,.09,.08,[.95,.72,.24]);}
  // Hood vents and body creases.
  for(let i=0;i<4;i++)b.box(-.32+i*.21,1.105,-1.25,.07,.025,.45,[.10,.12,.13]);
  // Four performance wheels with rubber, rim, hub and brake disc.
  for(const side of [-1,1])for(const z of [-1.36,1.36]){
    const x=side*(width*.52);b.cylinderX(x,.49,z,.47,.28,[.025,.029,.032],20);b.cylinderX(x+side*.15,.49,z,.32,.035,[.40,.43,.44],16);b.cylinderX(x+side*.174,.49,z,.22,.025,[.09,.11,.12],14);b.cylinderX(x+side*.19,.49,z,.085,.045,[.73,.75,.73],12);
    for(let k=0;k<6;k++){const a=k*Math.PI/3;b.box(x+side*.205,.49+Math.cos(a)*.17,z+Math.sin(a)*.17,.035,.25,.055,[.68,.70,.69],a);}
    for(let k=0;k<8;k++){const a=k*Math.PI/4;b.sphere(x+side*.21,.49+Math.cos(a)*.255,z+Math.sin(a)*.255,.023,.023,.023,[.13,.14,.15],6,4);}
  }
  // Rear wing, supports, mirrors and exhausts (sports models).
  if(!suv){for(const side of [-1,1])b.box(side*.48,1.48,1.78,.09,.62,.10,[.08,.09,.10]);b.box(0,1.78,1.80,2.05,.12,.48,[.055,.065,.07]);}
  for(const side of [-1,1])b.cylinderY(side*.42,.52,2.24,.09,.09,.18,[.36,.39,.39],10);
  // Front emblem plate / rear plate; compact local mesh detail.
  b.box(0,.55,-2.30,.72,.17,.035,[.08,.10,.11]);b.box(0,.57,2.30,.78,.20,.04,[.72,.72,.68]);
  return b.build();
}

export function buildRoadsideVehicle(color=[.8,.7,.12],type='taxi'){
  const b=new MeshBuilder();b.box(0,.62,0,1.8,.58,4.0,color);b.box(0,1.10,.05,1.42,.56,1.85,[.07,.16,.19]);b.box(0,1.42,.05,1.32,.12,1.75,[.06,.08,.09]);
  for(const side of [-1,1])for(const z of [-1.25,1.25]){b.cylinderX(side*.94,.4,z,.38,.18,[.025,.03,.032],14);b.cylinderX(side*1.04,.4,z,.18,.04,[.53,.55,.55],12);}
  for(const side of [-1,1]){b.box(side*.91,.92,-1.95,.12,.1,.08,[.82,.84,.73]);b.box(side*.92,.92,1.95,.12,.1,.08,[.76,.03,.02]);}
  if(type==='taxi'){b.box(0,1.48,-.1,.72,.22,.45,[.9,.85,.65]);b.box(0,.86,.15,1.86,.22,.28,[.08,.12,.12]);}
  return b.build();
}
export {TRACKS};
