/* ===== 星空/太阳着色器/环/卫星/小行星带 等工厂 =====
   (源码片段，按序拼接为单文件；勿在此使用 import/export) */
/* ---- 背景星空 ---- */
function makeStarfield() {
  const cnt = 5000, pos = new Float32Array(cnt * 3), col = new Float32Array(cnt * 3);
  for (let i = 0; i < cnt; i++) {
    const r = 9000 + Math.random() * 11000;
    const th = Math.acos(2 * Math.random() - 1), ph = Math.random() * Math.PI * 2;
    pos[i*3] = r * Math.sin(th) * Math.cos(ph);
    pos[i*3+1] = r * Math.cos(th);
    pos[i*3+2] = r * Math.sin(th) * Math.sin(ph);
    const t = Math.random();
    const c = t < 0.7 ? [1,1,1] : t < 0.88 ? [0.7,0.8,1] : [1,0.85,0.7];
    const b = 0.5 + Math.random() * 0.5;
    col[i*3] = c[0]*b; col[i*3+1] = c[1]*b; col[i*3+2] = c[2]*b;
  }
  const g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.BufferAttribute(pos, 3));
  g.setAttribute('color', new THREE.BufferAttribute(col, 3));
  return new THREE.Points(g, new THREE.PointsMaterial({ size: 1.6, vertexColors: true, transparent: true, sizeAttenuation: false }));
}

/* ---- 太阳 shader：动态等离子体 + HDR 输出 + 日冕火焰 ---- */
const COMMON_GLSL = `
float hash3(vec3 p){return fract(sin(dot(p,vec3(127.1,311.7,74.7)))*43758.5453);}
float noise3(vec3 p){
  vec3 i=floor(p), f=fract(p);
  vec3 u=f*f*(3.0-2.0*f);
  return mix(
    mix(mix(hash3(i+vec3(0,0,0)), hash3(i+vec3(1,0,0)), u.x),
        mix(hash3(i+vec3(0,1,0)), hash3(i+vec3(1,1,0)), u.x), u.y),
    mix(mix(hash3(i+vec3(0,0,1)), hash3(i+vec3(1,0,1)), u.x),
        mix(hash3(i+vec3(0,1,1)), hash3(i+vec3(1,1,1)), u.x), u.y),
    u.z);
}
float fbm(vec3 p){
  float v=0.0, a=0.5;
  for(int i=0;i<5;i++){ v += a*noise3(p); p *= 2.0; a *= 0.5; }
  return v;
}
float turb(vec3 p){
  float v=0.0, a=0.5;
  for(int i=0;i<5;i++){ v += a*abs(noise3(p)*2.0-1.0); p *= 2.0; a *= 0.5; }
  return v;
}`;

const SUN_VS = `
varying vec3 vN; varying vec3 vP; varying vec3 vLocal;
void main(){
  vN = normalize(normalMatrix * normal);
  vLocal = normalize(position);
  vec4 mv = modelViewMatrix * vec4(position, 1.0);
  vP = mv.xyz;
  gl_Position = projectionMatrix * mv;
}`;

const SUN_FS = COMMON_GLSL + `
uniform float time;
varying vec3 vN; varying vec3 vP; varying vec3 vLocal;
void main(){
  vec3 wp = vLocal;
  // 翻腾的等离子体（多尺度噪声 + 缓慢演化）
  vec3 p1 = wp * 2.4 + vec3(time*0.03, time*0.04, -time*0.02);
  vec3 p2 = wp * 6.0 - vec3(time*0.06, 0.0, time*0.05);
  vec3 p3 = wp * 14.0 + vec3(0.0, -time*0.08, time*0.07);
  float t = turb(p1) * 0.6 + fbm(p2) * 0.3 + noise3(p3) * 0.1;
  t = clamp(t * 1.5 - 0.05, 0.0, 1.6);
  // HDR 颜色梯度：>1.0 让 bloom 真正发光
  vec3 dark  = vec3(0.30, 0.05, 0.0);
  vec3 mid   = vec3(2.20, 0.70, 0.08);
  vec3 hot   = vec3(3.50, 2.00, 0.40);
  vec3 white = vec3(4.50, 3.50, 2.20);
  vec3 col;
  if (t < 0.45)      col = mix(dark, mid, t/0.45);
  else if (t < 0.85) col = mix(mid, hot, (t-0.45)/0.4);
  else               col = mix(hot, white, (t-0.85)/0.75);
  // 黑子：在低频噪声大值处压暗
  float spot = noise3(wp * 1.2 + vec3(20.0, 7.0, 11.0));
  if (spot > 0.62) col *= mix(1.0, 0.12, smoothstep(0.62, 0.85, spot));
  // 米粒组织（高频颗粒）
  float grain = noise3(wp * 35.0 + vec3(time*0.4, 0.0, 0.0));
  col *= 0.82 + grain * 0.32;
  // 临边昏暗反向：边缘反而更亮（色球层增亮）
  vec3 vd = normalize(-vP);
  float rim = 1.0 - max(dot(normalize(vN), vd), 0.0);
  col += vec3(3.5, 1.5, 0.3) * pow(rim, 2.0) * 0.55;
  gl_FragColor = vec4(col, 1.0);
}`;

const CORONA_VS = `
varying vec3 vN; varying vec3 vP; varying vec3 vLocal;
void main(){
  vN = normalize(normalMatrix * normal);
  vLocal = normalize(position);
  vec4 mv = modelViewMatrix * vec4(position, 1.0);
  vP = mv.xyz;
  gl_Position = projectionMatrix * mv;
}`;

const CORONA_FS = COMMON_GLSL + `
uniform float time;
varying vec3 vN; varying vec3 vP; varying vec3 vLocal;
void main(){
  vec3 vd = normalize(-vP);
  // BackSide：从外面看到的是球内壁；fresnel 越靠"赤道剪影"越大
  float fres = 1.0 - max(dot(normalize(vN), vd), 0.0);
  fres = pow(fres, 1.6);
  // 火焰丝：径向辐射噪声 + 时间扰动
  vec3 wp = vLocal;
  float flame = turb(wp * 3.0 + vec3(time*0.08, -time*0.05, time*0.06));
  flame += fbm(wp * 9.0 - vec3(0.0, time*0.12, time*0.09)) * 0.4;
  flame = clamp(flame, 0.0, 1.8);
  // 日珥状大尺度突出
  float prom = pow(noise3(wp * 1.8 + vec3(0.0, time*0.04, 0.0)), 3.0) * 4.0;
  vec3 baseCol = vec3(2.6, 1.0, 0.25);
  vec3 col = baseCol * (0.6 + flame + prom * 0.6);
  float alpha = fres * (0.45 + flame * 0.35);
  gl_FragColor = vec4(col, alpha);
}`;

/* ---- 大气辉光壳（fresnel 近似） ---- */
function makeAtmosphere(radius, color) {
  const mat = new THREE.ShaderMaterial({
    uniforms: { glowColor: { value: new THREE.Color(color) } },
    vertexShader: `varying vec3 vN; varying vec3 vP;
      void main(){ vN = normalize(normalMatrix*normal); vec4 mv=modelViewMatrix*vec4(position,1.0); vP=mv.xyz; gl_Position=projectionMatrix*mv; }`,
    fragmentShader: `uniform vec3 glowColor; varying vec3 vN; varying vec3 vP;
      void main(){ vec3 vd=normalize(-vP); float f=pow(1.0-max(dot(vN,vd),0.0),3.8); gl_FragColor=vec4(glowColor,f*0.55); }`,
    blending: THREE.AdditiveBlending, transparent: true, side: THREE.BackSide, depthWrite: false
  });
  return new THREE.Mesh(new THREE.SphereGeometry(radius * 1.06, 48, 48), mat);
}

/* ---- 土星环 ---- */
function makeRing(radius, N) {
  const inner = radius * 1.35, outer = radius * 2.3;
  const geo = new THREE.RingGeometry(inner, outer, 128, 1);
  // 重映射 UV，使纹理沿半径方向
  const pos = geo.attributes.position, uv = geo.attributes.uv;
  const v3 = new THREE.Vector3();
  for (let i = 0; i < pos.count; i++) {
    v3.fromBufferAttribute(pos, i);
    const r = v3.length();
    uv.setXY(i, (r - inner) / (outer - inner), 0.5);
  }
  const mat = new THREE.MeshBasicMaterial({ map: texSaturnRing(N), side: THREE.DoubleSide, transparent: true, opacity: 0.95, depthWrite: false });
  const ring = new THREE.Mesh(geo, mat);
  ring.rotation.x = Math.PI / 2;
  return ring;
}

function makeThinRing(radius) {
  const geo = new THREE.RingGeometry(radius * 1.5, radius * 1.72, 96, 1);
  const mat = new THREE.MeshBasicMaterial({ color: 0x9fc4d6, side: THREE.DoubleSide, transparent: true, opacity: 0.28, depthWrite: false });
  const ring = new THREE.Mesh(geo, mat);
  ring.rotation.x = Math.PI / 2;
  return ring;
}

/* ---- 椭圆轨道线（含偏心率，太阳/中心位于其中一个焦点） ---- */
function makeOrbitLine(a, e = 0, opt = {}) {
  const b = a * Math.sqrt(1 - e * e);
  const c = a * e;
  const pts = [];
  for (let i = 0; i <= 192; i++) {
    const E = (i / 192) * Math.PI * 2;
    pts.push(new THREE.Vector3(a * Math.cos(E) - c, 0, b * Math.sin(E)));
  }
  const g = new THREE.BufferGeometry().setFromPoints(pts);
  return new THREE.LineLoop(g, new THREE.LineBasicMaterial({
    color: opt.color ?? 0x3a5378, transparent: true, opacity: opt.opacity ?? 0.45
  }));
}

/* ---- 开普勒方程求解：由平近点角 M 解出偏近点角 E ---- */
function solveKepler(M, e) {
  M = ((M % (Math.PI * 2)) + Math.PI * 2) % (Math.PI * 2);
  let E = e < 0.8 ? M : Math.PI;
  for (let i = 0; i < 5; i++) {
    const dE = (E - e * Math.sin(E) - M) / (1 - e * Math.cos(E));
    E -= dE;
    if (Math.abs(dE) < 1e-6) break;
  }
  return E;
}

/* ---- 由半长轴/偏心率/平近点角 → 平面 (x, z) 位置（焦点在原点） ---- */
function ellipsePos(a, e, M, out) {
  const E = solveKepler(M, e);
  const b = a * Math.sqrt(1 - e * e);
  out.x = a * (Math.cos(E) - e);
  out.y = 0;
  out.z = b * Math.sin(E);
}

/* ====== ② 卫星真实开普勒根数 ======
   真实半长轴(km)。卫星在行星赤道面(本体 tiltGroup 局部 XZ 平面)内运行，
   真实 e/i + 真实周期；真实比例下为真实星-卫距离，示意模式下半长轴压缩为 dist。*/
const MOON_AKM = {
  moon:384400, phobos:9376, deimos:23463,
  io:421800, europa:671100, ganymede:1070400, callisto:1882700,
  titan:1221870, triton:354759
};
// 由平近点角 M → 行星局部坐标单位向量(以半长轴为 1)：XZ 为轨道面，Y 为倾角分量
function moonOrbitVec(m, M, out) {
  const e = m.e || 0;
  const E = solveKepler(M, e);
  const xp = Math.cos(E) - e;
  const yp = Math.sqrt(1 - e * e) * Math.sin(E);
  const I = (m.incl || 0) * DEG, O = m._node || 0;
  const cO = Math.cos(O), sO = Math.sin(O), cI = Math.cos(I), sI = Math.sin(I);
  out.set(cO * xp - sO * cI * yp, sI * yp, sO * xp + cO * cI * yp);
  return out;
}
const moonScale = (m) => (scaleMode === 'true') ? (m._aKm * DIST_TRUE / AU_KM) : m.dist;
function makeMoonOrbitGeom(m) {
  const e = m.e || 0, I = (m.incl || 0) * DEG, O = m._node || 0;
  const cO = Math.cos(O), sO = Math.sin(O), cI = Math.cos(I), sI = Math.sin(I);
  const sc = moonScale(m), pts = [];
  for (let i = 0; i <= 160; i++) {
    const E = i / 160 * 2 * Math.PI;
    const xp = Math.cos(E) - e, yp = Math.sqrt(1 - e * e) * Math.sin(E);
    pts.push(new THREE.Vector3((cO * xp - sO * cI * yp) * sc, (sI * yp) * sc, (sO * xp + cO * cI * yp) * sc));
  }
  return new THREE.BufferGeometry().setFromPoints(pts);
}

/* ---- 文字标签（精灵） ---- */
function makeLabel(text) {
  const cv = document.createElement('canvas'); cv.width = 256; cv.height = 64;
  const ctx = cv.getContext('2d');
  ctx.font = '600 30px "PingFang SC","Microsoft YaHei",sans-serif';
  ctx.fillStyle = '#88a3c8'; ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
  ctx.shadowColor = 'rgba(0,0,0,.9)'; ctx.shadowBlur = 8;
  ctx.fillText(text, 128, 32);
  const tex = new THREE.CanvasTexture(cv); tex.colorSpace = THREE.SRGBColorSpace;
  const sp = new THREE.Sprite(new THREE.SpriteMaterial({ map: tex, transparent: true, depthTest: false, depthWrite: false }));
  sp.scale.set(11, 2.75, 1);
  return sp;
}

/* ---- 不规则小卫星(火卫一/二) ---- */
function texRockyMoon(N, baseCol) {
  const w = 256, h = 128;
  const { fbm } = N;
  return buildPixelTexture(w, h, (x, y, z) => {
    let v = fbm(x * 3, y * 3, z * 3, 4) * 0.5 + 0.5;
    let v2 = fbm(x * 8 + 5, y * 8, z * 8, 3) * 0.5 + 0.5;
    let col = mix(mix(baseCol, [40, 30, 25], 0.35), mix(baseCol, [240, 220, 195], 0.18), v);
    if (v2 < 0.3) col = mix(col, [22, 18, 14], (0.3 - v2) / 0.3 * 0.7);
    return col;
  });
}

/* ---- 地球夜面城市灯光（emissive 贴图） ---- */
function texNightLights(N) {
  const w = 1024, h = 512;
  const { fbm } = N;
  const cv = document.createElement('canvas'); cv.width = w; cv.height = h;
  const ctx = cv.getContext('2d'); const img = ctx.createImageData(w, h); const d = img.data;
  for (let j = 0; j < h; j++) for (let i = 0; i < w; i++) {
    const [x, y, z] = sphereDir(i, j, w, h);
    let e = fbm(x * 1.7, y * 1.7, z * 1.7, 6) * 0.5 + 0.5;
    e += fbm(x * 5, y * 5, z * 5, 4) * 0.12;
    const lat = Math.abs(y);
    let intensity = 0;
    if (e > 0.5) {                                  // 仅陆地
      // 沿海/城市富集：靠近海岸 (e ~= 0.52) 灯光更密
      const coast = clamp(1 - Math.abs(e - 0.55) * 6, 0, 1);
      // 文明分布：中纬度 (lat 0.2-0.7) 灯多，赤道与极地少
      const civ = clamp(1 - Math.abs(lat - 0.45) * 2.2, 0, 1);
      const speckle = fbm(x * 22, y * 22, z * 22, 4) * 0.5 + 0.5;
      intensity = clamp((speckle - 0.55) * 6, 0, 1) * coast * civ;
    }
    const r = intensity * 255, g = intensity * 200, b = intensity * 90;
    const idx = (j * w + i) * 4;
    d[idx] = r; d[idx + 1] = g; d[idx + 2] = b; d[idx + 3] = 255;
  }
  ctx.putImageData(img, 0, 0);
  const t = new THREE.CanvasTexture(cv); t.colorSpace = THREE.SRGBColorSpace; t.anisotropy = 8;
  return t;
}

/* 注入：把 emissiveMap 限定在「太阳背面」才显示（自定义 shader chunk） */
function injectNightLights(mat, nightTex) {
  mat.emissiveMap = nightTex;
  mat.emissive = new THREE.Color(0xffffff);
  mat.emissiveIntensity = 1.0;
  mat.onBeforeCompile = (shader) => {
    shader.uniforms.uSunDir = { value: new THREE.Vector3(1, 0, 0) };
    shader.vertexShader = shader.vertexShader
      .replace('#include <common>', '#include <common>\nvarying vec3 vWorldN;')
      .replace('#include <worldpos_vertex>', '#include <worldpos_vertex>\nvWorldN = normalize((modelMatrix * vec4(normal,0.0)).xyz);');
    shader.fragmentShader = shader.fragmentShader
      .replace('#include <common>', '#include <common>\nuniform vec3 uSunDir;\nvarying vec3 vWorldN;')
      .replace('#include <emissivemap_fragment>',
        `#include <emissivemap_fragment>
         float nDotS = dot(vWorldN, normalize(uSunDir));
         float nightFactor = smoothstep(0.1, -0.25, nDotS);  // 背阳面才亮
         totalEmissiveRadiance *= nightFactor * 2.6;`);
    mat.userData.shader = shader;
  };
}

/* ---- 小行星带（InstancedMesh） ---- */
function makeAsteroidBelt(innerR, outerR, count = 1600) {
  const geom = new THREE.DodecahedronGeometry(0.18, 0);
  const mat = new THREE.MeshStandardMaterial({ color: 0x6c5a48, roughness: 1, flatShading: true });
  const im = new THREE.InstancedMesh(geom, mat, count);
  const dummy = new THREE.Object3D();
  let s = 42;
  const rnd = () => ((s = (s * 1664525 + 1013904223) >>> 0) / 4294967296);
  const meta = new Array(count);
  for (let i = 0; i < count; i++) {
    const r = innerR + rnd() * (outerR - innerR);
    const ang = rnd() * Math.PI * 2;
    const yScatter = (rnd() - 0.5) * 3;
    const scale = 0.4 + rnd() * 1.4;
    const omega = (0.05 + rnd() * 0.05) * (rnd() < 0.5 ? 1 : 1);
    meta[i] = { r, ang, y: yScatter, scale, omega, rx: rnd() * 7, ry: rnd() * 7, rz: rnd() * 7 };
  }
  function tick(simTime) {
    for (let i = 0; i < count; i++) {
      const a = meta[i];
      const ang = a.ang + simTime * a.omega;
      dummy.position.set(Math.cos(ang) * a.r, a.y, Math.sin(ang) * a.r);
      dummy.scale.set(a.scale, a.scale * (0.6 + (a.rx % 1) * 0.6), a.scale);
      dummy.rotation.set(a.rx + simTime * 0.05, a.ry + simTime * 0.03, a.rz);
      dummy.updateMatrix();
      im.setMatrixAt(i, dummy.matrix);
    }
    im.instanceMatrix.needsUpdate = true;
  }
  return { mesh: im, tick };
}

/* ---- 卫星纹理分发 ---- */
function genMoonTexture(m, N) {
  switch (m.type) {
    case 'cratered': return texCratered(N, m.base, 1.9, m.craters ?? 160);
    case 'volcanic': return { map: texVolcanic(N) };
    case 'icecrack': {
      const base = m.key === 'europa' ? [225, 215, 200] : [195, 205, 225];
      const crack = m.key === 'europa' ? [170, 130, 100] : [120, 150, 195];
      return { map: texIceCrack(N, base, crack) };
    }
    case 'hazy': return { map: texHazy(N) };
    case 'rocky': return texRockyMoon(N, m.color || [140, 120, 100]);
    default: return texRockyMoon(N, [160, 160, 160]);
  }
}

/* ---- 通用卫星创建 ---- */
function createMoon(m, N) {
  const tex = genMoonTexture(m, N);
  const mat = new THREE.MeshStandardMaterial({ map: tex.map, roughness: 1, metalness: 0 });
  if (tex.bump) { mat.bumpMap = tex.bump; mat.bumpScale = 0.03; }

  // 由 key 派生确定性历元相位与升交点经度（精确星历不在范围内，故采用稳定相位）
  let s = 0; for (const ch of m.key) s = (s * 131 + ch.charCodeAt(0)) >>> 0;
  m._M0 = (s % 360) * DEG;
  m._node = ((s >>> 3) % 360) * DEG;
  m._aKm = MOON_AKM[m.key] || (m.dist * AU_KM / DIST_TRUE);

  const orbitGroup = new THREE.Group();   // 不再旋转：i/Ω 已在开普勒变换中处理

  const ol = new THREE.LineLoop(makeMoonOrbitGeom(m),
    new THREE.LineBasicMaterial({ color: 0x44597a, transparent: true, opacity: 0.22 }));
  orbitGroup.add(ol); orbitObjs.push(ol);

  const moonPos = new THREE.Group();
  orbitGroup.add(moonPos);

  let geom;
  if (m.irregular) {
    geom = new THREE.DodecahedronGeometry(m.radius, 1);
    const pos = geom.attributes.position;
    let s = (m.key.charCodeAt(0) + m.key.charCodeAt(1)) * 137;
    const rnd = () => ((s = (s * 1664525 + 1013904223) >>> 0) / 4294967296);
    for (let i = 0; i < pos.count; i++) {
      const k = 0.7 + rnd() * 0.55;
      pos.setXYZ(i, pos.getX(i) * k, pos.getY(i) * k * (0.85 + rnd() * 0.3), pos.getZ(i) * k);
    }
    pos.needsUpdate = true; geom.computeVertexNormals();
  } else {
    geom = new THREE.SphereGeometry(m.radius, 28, 28);
  }
  const mesh = new THREE.Mesh(geom, mat);
  mesh.userData = { ...m, holder: moonPos };
  moonPos.add(mesh);

  return { mesh, orbitGroup, moonPos, orbitLine: ol };
}

/* ---- 行星纹理分发 ---- */
function genPlanetTexture(p, N) {
  switch (p.key) {
    case 'mercury': return texCratered(N, { dark:[70,65,60], light:[160,150,140], mare:[90,82,76] }, 1.7, 260);
    case 'venus':   return { map: texVenus(N) };
    case 'earth':   return texEarth(N);
    case 'mars':    return texMars(N);
    case 'jupiter': return { map: texGasGiant(N, [
        {p:0,c:[200,165,120]},{p:0.2,c:[235,220,190]},{p:0.35,c:[180,120,80]},
        {p:0.5,c:[225,205,170]},{p:0.65,c:[170,110,75]},{p:0.8,c:[230,215,185]},{p:1,c:[195,160,120]}
      ], { freq:26, freq2:11, warp:0.05, spot:{ lon:0.6, lat:-0.32, rx:0.45, ry:0.22, color:[200,90,55] } }) };
    case 'saturn':  return { map: texGasGiant(N, [
        {p:0,c:[210,190,150]},{p:0.25,c:[235,222,185]},{p:0.5,c:[205,180,140]},
        {p:0.75,c:[238,225,190]},{p:1,c:[212,192,152]}
      ], { freq:20, freq2:8, warp:0.04 }) };
    case 'uranus':  return { map: texIceGiant(N, [165,225,225], [200,240,240], 0) };
    case 'neptune': return { map: texIceGiant(N, [50,90,190], [120,150,235], 1) };
    default:        return { map: texVenus(N) };
  }
}

