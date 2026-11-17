const VERTEX_SHADER = `#version 300 es
in vec3 aPosition;
in vec3 aNormal;
in vec3 aColor;
uniform mat4 uViewProjection;
uniform mat4 uModel;
uniform vec3 uCamera;
out vec3 vNormal;
out vec3 vColor;
out vec3 vWorld;
void main(){
  vec4 world = uModel * vec4(aPosition, 1.0);
  vWorld = world.xyz;
  vNormal = normalize(mat3(uModel) * aNormal);
  vColor = aColor;
  gl_Position = uViewProjection * world;
}`;

const FRAGMENT_SHADER = `#version 300 es
precision highp float;
in vec3 vNormal;
in vec3 vColor;
in vec3 vWorld;
uniform vec3 uCamera;
uniform vec3 uFogColor;
uniform float uFogNear;
uniform float uFogFar;
uniform float uWetness;
out vec4 outColor;
void main(){
  vec3 n = normalize(vNormal);
  vec3 lightDir = normalize(vec3(-0.38, 0.82, 0.42));
  float diffuse = max(dot(n, lightDir), 0.0);
  float hemi = 0.5 + 0.5 * n.y;
  vec3 viewDir = normalize(uCamera - vWorld);
  vec3 halfDir = normalize(lightDir + viewDir);
  float spec = pow(max(dot(n, halfDir), 0.0), 34.0);
  float wet = uWetness * (0.025 + 0.08 * spec);
  vec3 lit = vColor * (0.40 + 0.42 * diffuse + 0.16 * hemi) + vec3(wet) + vec3(spec * 0.12);
  float distanceToCamera = length(uCamera - vWorld);
  float fog = smoothstep(uFogNear, uFogFar, distanceToCamera);
  vec3 finalColor = mix(lit, uFogColor, fog);
  outColor = vec4(finalColor, 1.0);
}`;

export function mat4Identity(){
  return new Float32Array([1,0,0,0, 0,1,0,0, 0,0,1,0, 0,0,0,1]);
}
export function mat4Perspective(fov, aspect, near, far){
  const f = 1 / Math.tan(fov / 2), nf = 1 / (near - far);
  return new Float32Array([f/aspect,0,0,0, 0,f,0,0, 0,0,(far+near)*nf,-1, 0,0,(2*far*near)*nf,0]);
}
export function mat4LookAt(eye, target, up=[0,1,0]){
  let zx=eye[0]-target[0], zy=eye[1]-target[1], zz=eye[2]-target[2];
  let zl=Math.hypot(zx,zy,zz)||1; zx/=zl; zy/=zl; zz/=zl;
  let xx=up[1]*zz-up[2]*zy, xy=up[2]*zx-up[0]*zz, xz=up[0]*zy-up[1]*zx;
  let xl=Math.hypot(xx,xy,xz)||1; xx/=xl; xy/=xl; xz/=xl;
  const yx=zy*xz-zz*xy, yy=zz*xx-zx*xz, yz=zx*xy-zy*xx;
  return new Float32Array([
    xx,yx,zx,0, xy,yy,zy,0, xz,yz,zz,0,
    -(xx*eye[0]+xy*eye[1]+xz*eye[2]),
    -(yx*eye[0]+yy*eye[1]+yz*eye[2]),
    -(zx*eye[0]+zy*eye[1]+zz*eye[2]),1
  ]);
}
export function mat4Multiply(a,b){
  const out=new Float32Array(16);
  for(let c=0;c<4;c++) for(let r=0;r<4;r++) out[c*4+r]=a[r]*b[c*4]+a[4+r]*b[c*4+1]+a[8+r]*b[c*4+2]+a[12+r]*b[c*4+3];
  return out;
}
export function modelMatrix(x=0,y=0,z=0,yaw=0,sx=1,sy=1,sz=1){
  const c=Math.cos(yaw),s=Math.sin(yaw);
  return new Float32Array([c*sx,0,-s*sx,0, 0,sy,0,0, s*sz,0,c*sz,0, x,y,z,1]);
}

export class MeshBuilder{
  constructor(){ this.positions=[]; this.normals=[]; this.colors=[]; this.indices=[]; }
  vertex(p,n,c){ this.positions.push(p[0],p[1],p[2]); this.normals.push(n[0],n[1],n[2]); this.colors.push(c[0],c[1],c[2]); return this.positions.length/3-1; }
  tri(a,b,c,normal,color){ const i=this.vertex(a,normal,color),j=this.vertex(b,normal,color),k=this.vertex(c,normal,color); this.indices.push(i,j,k); }
  quad(a,b,c,d,normal,color){ this.tri(a,b,c,normal,color); this.tri(a,c,d,normal,color); }
  box(x,y,z,w,h,d,color,yaw=0){
    const c=Math.cos(yaw),s=Math.sin(yaw), hx=w/2,hy=h/2,hz=d/2;
    const tr=(p)=>[x+p[0]*c+p[2]*s,y+p[1],z-p[0]*s+p[2]*c];
    const faces=[
      {p:[[-hx,-hy,hz],[hx,-hy,hz],[hx,hy,hz],[-hx,hy,hz]],n:[0,0,1]},
      {p:[[hx,-hy,-hz],[-hx,-hy,-hz],[-hx,hy,-hz],[hx,hy,-hz]],n:[0,0,-1]},
      {p:[[-hx,-hy,-hz],[-hx,-hy,hz],[-hx,hy,hz],[-hx,hy,-hz]],n:[-1,0,0]},
      {p:[[hx,-hy,hz],[hx,-hy,-hz],[hx,hy,-hz],[hx,hy,hz]],n:[1,0,0]},
      {p:[[-hx,hy,hz],[hx,hy,hz],[hx,hy,-hz],[-hx,hy,-hz]],n:[0,1,0]},
      {p:[[-hx,-hy,-hz],[hx,-hy,-hz],[hx,-hy,hz],[-hx,-hy,hz]],n:[0,-1,0]}
    ];
    for(const f of faces){ const n=[f.n[0]*c+f.n[2]*s,f.n[1],-f.n[0]*s+f.n[2]*c]; this.quad(...f.p.map(tr),n,color); }
    return this;
  }
  sphere(x,y,z,rx,ry,rz,color,segments=12,rings=8){
    for(let r=0;r<rings;r++){
      const p0=Math.PI*r/rings-Math.PI/2, p1=Math.PI*(r+1)/rings-Math.PI/2;
      for(let s=0;s<segments;s++){
        const t0=2*Math.PI*s/segments,t1=2*Math.PI*(s+1)/segments;
        const pt=(p,t)=>[x+rx*Math.cos(p)*Math.cos(t),y+ry*Math.sin(p),z+rz*Math.cos(p)*Math.sin(t)];
        const a=pt(p0,t0),b=pt(p0,t1),c=pt(p1,t1),d=pt(p1,t0);
        const n=(p,t)=>[Math.cos(p)*Math.cos(t),Math.sin(p),Math.cos(p)*Math.sin(t)];
        this.quad(a,b,c,d,n((p0+p1)/2,(t0+t1)/2),color);
      }
    }
    return this;
  }
  cylinderY(x,y,z,rTop,rBottom,h,color,segments=12){
    const base=this.positions.length/3;
    for(let i=0;i<=segments;i++){
      const a=i/segments*Math.PI*2, co=Math.cos(a),si=Math.sin(a);
      for(const [yy,rr] of [[y-h/2,rBottom],[y+h/2,rTop]]){
        const n=[co,0,si]; this.vertex([x+co*rr,yy,z+si*rr],n,color);
      }
    }
    for(let i=0;i<segments;i++){const k=base+i*2;this.indices.push(k,k+1,k+3,k,k+3,k+2);}
    return this;
  }
  cylinderX(x,y,z,r,length,color,segments=16){
    const base=this.positions.length/3;
    for(let i=0;i<=segments;i++){
      const a=i/segments*Math.PI*2,co=Math.cos(a),si=Math.sin(a);
      this.vertex([x-length/2,y+co*r,z+si*r],[0,co,si],color);
      this.vertex([x+length/2,y+co*r,z+si*r],[0,co,si],color);
    }
    for(let i=0;i<segments;i++){const k=base+i*2;this.indices.push(k,k+1,k+3,k,k+3,k+2);}
    return this;
  }
  cone(x,y,z,r,h,color,segments=8){
    const base=this.positions.length/3;
    for(let i=0;i<segments;i++){
      const a=i/segments*Math.PI*2,b=(i+1)/segments*Math.PI*2;
      const p0=[x+Math.cos(a)*r,y-h/2,z+Math.sin(a)*r],p1=[x+Math.cos(b)*r,y-h/2,z+Math.sin(b)*r],tip=[x,y+h/2,z];
      const ux=p1[0]-p0[0],uy=p1[1]-p0[1],uz=p1[2]-p0[2],vx=tip[0]-p0[0],vy=tip[1]-p0[1],vz=tip[2]-p0[2];
      let nx=uy*vz-uz*vy,ny=uz*vx-ux*vz,nz=ux*vy-uy*vx,l=Math.hypot(nx,ny,nz)||1;this.quad(p0,p1,tip,tip,[nx/l,ny/l,nz/l],color);
    }
    return this;
  }
  roadSegment(a,b,width,color){
    const dx=b[0]-a[0],dz=b[1]-a[1],len=Math.hypot(dx,dz)||1,nx=-dz/len*width/2,nz=dx/len*width/2;
    this.quad([a[0]+nx,a[2]||0,a[1]+nz],[b[0]+nx,b[2]||0,b[1]+nz],[b[0]-nx,b[2]||0,b[1]-nz],[a[0]-nx,a[2]||0,a[1]-nz],[0,1,0],color);
    return this;
  }
  build(){return {positions:new Float32Array(this.positions),normals:new Float32Array(this.normals),colors:new Float32Array(this.colors),indices:new Uint32Array(this.indices)};}
}

export class NativeRenderer{
  constructor(canvas){
    this.canvas=canvas;
    const gl=canvas.getContext('webgl2',{alpha:false,antialias:true,powerPreference:'high-performance'});
    if(!gl) throw new Error('هذا المتصفح لا يدعم WebGL 2');
    this.gl=gl;
    const program=this.createProgram(VERTEX_SHADER,FRAGMENT_SHADER);this.program=program;
    this.locations={
      position:gl.getAttribLocation(program,'aPosition'),normal:gl.getAttribLocation(program,'aNormal'),color:gl.getAttribLocation(program,'aColor'),
      vp:gl.getUniformLocation(program,'uViewProjection'),model:gl.getUniformLocation(program,'uModel'),camera:gl.getUniformLocation(program,'uCamera'),fog:gl.getUniformLocation(program,'uFogColor'),fogNear:gl.getUniformLocation(program,'uFogNear'),fogFar:gl.getUniformLocation(program,'uFogFar'),wet:gl.getUniformLocation(program,'uWetness')
    };
    gl.enable(gl.DEPTH_TEST);gl.depthFunc(gl.LEQUAL);gl.enable(gl.BLEND);gl.blendFunc(gl.SRC_ALPHA,gl.ONE_MINUS_SRC_ALPHA);
    this.meshes=new WeakMap();this.pixelRatio=1;this.fogColor=[0.52,0.62,0.69];this.wetness=0.3;this.quality='balanced';
  }
  createProgram(vsSource,fsSource){
    const gl=this.gl;
    const compile=(type,source)=>{const s=gl.createShader(type);gl.shaderSource(s,source);gl.compileShader(s);if(!gl.getShaderParameter(s,gl.COMPILE_STATUS))throw new Error(gl.getShaderInfoLog(s));return s;};
    const p=gl.createProgram();gl.attachShader(p,compile(gl.VERTEX_SHADER,vsSource));gl.attachShader(p,compile(gl.FRAGMENT_SHADER,fsSource));gl.linkProgram(p);if(!gl.getProgramParameter(p,gl.LINK_STATUS))throw new Error(gl.getProgramInfoLog(p));return p;
  }
  resize(){
    const dpr=Math.min(window.devicePixelRatio||1,this.quality==='high'?1.8:this.quality==='low'?1:1.35);
    const w=Math.max(1,Math.floor(this.canvas.clientWidth*dpr)),h=Math.max(1,Math.floor(this.canvas.clientHeight*dpr));
    if(this.canvas.width!==w||this.canvas.height!==h){this.canvas.width=w;this.canvas.height=h;this.gl.viewport(0,0,w,h);}
    this.pixelRatio=dpr;
  }
  setQuality(q){this.quality=q;this.resize();}
  upload(data){
    const gl=this.gl,vao=gl.createVertexArray();gl.bindVertexArray(vao);
    const make=(array,loc,size)=>{const b=gl.createBuffer();gl.bindBuffer(gl.ARRAY_BUFFER,b);gl.bufferData(gl.ARRAY_BUFFER,array,gl.STATIC_DRAW);gl.enableVertexAttribArray(loc);gl.vertexAttribPointer(loc,size,gl.FLOAT,false,0,0);};
    make(data.positions,this.locations.position,3);make(data.normals,this.locations.normal,3);make(data.colors,this.locations.color,3);
    const ib=gl.createBuffer();gl.bindBuffer(gl.ELEMENT_ARRAY_BUFFER,ib);gl.bufferData(gl.ELEMENT_ARRAY_BUFFER,data.indices,gl.STATIC_DRAW);
    gl.bindVertexArray(null);
    const mesh={vao,count:data.indices.length,ib};this.meshes.set(data,mesh);return data;
  }
  draw(data,model,vp,camera,fogFar=500){
    const gl=this.gl,mesh=this.meshes.get(data)||this.upload(data);gl.useProgram(this.program);gl.bindVertexArray(mesh.vao);
    gl.uniformMatrix4fv(this.locations.vp,false,vp);gl.uniformMatrix4fv(this.locations.model,false,model);gl.uniform3fv(this.locations.camera,camera);gl.uniform3fv(this.locations.fog,this.fogColor);gl.uniform1f(this.locations.fogNear,fogFar*0.48);gl.uniform1f(this.locations.fogFar,fogFar);gl.uniform1f(this.locations.wet,this.wetness);
    gl.drawElements(gl.TRIANGLES,mesh.count,gl.UNSIGNED_INT,0);gl.bindVertexArray(null);
  }
  begin(sky=[0.53,0.68,0.79]){const gl=this.gl;this.resize();gl.clearColor(...sky,1);gl.clear(gl.COLOR_BUFFER_BIT|gl.DEPTH_BUFFER_BIT);}
}
