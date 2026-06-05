/* ===== 真实贴图混合加载 + 启动 =====
   (源码片段，按序拼接为单文件；勿在此使用 import/export) */
/* =========================================================================
   10. 启动
   ========================================================================= */
/* =========================================================================
   ①真实贴图：混合加载。程序化纹理先即时显示（离线可用），
   联网时异步替换为高清真实贴图，失败自动回退。
   贴图源：three.js 官方(地球/月球) + jeromeetienne/threex.planets(其余)，
   均经 jsDelivr CDN(CORS 友好)。
   ========================================================================= */
const T3 = 'https://cdn.jsdelivr.net/gh/mrdoob/three.js@r160/examples/textures/planets/';
const PT = 'https://cdn.jsdelivr.net/gh/jeromeetienne/threex.planets@master/images/';
const TEXMAP = {
  mercury: { map: PT + 'mercurymap.jpg', bump: PT + 'mercurybump.jpg' },
  venus:   { map: PT + 'venusmap.jpg', bump: PT + 'venusbump.jpg' },
  earth:   { map: T3 + 'earth_atmos_2048.jpg', normal: T3 + 'earth_normal_2048.jpg',
             clouds: T3 + 'earth_clouds_1024.png', lights: T3 + 'earth_lights_2048.png' },
  mars:    { map: PT + 'marsmap1k.jpg', bump: PT + 'marsbump1k.jpg' },
  jupiter: { map: PT + 'jupitermap.jpg' },
  saturn:  { map: PT + 'saturnmap.jpg', ring: PT + 'saturnringcolor.jpg' },
  uranus:  { map: PT + 'uranusmap.jpg' },
  neptune: { map: PT + 'neptunemap.jpg' },
};
const MOON_TEX = { moon: T3 + 'moon_1024.jpg' };

const texLoader = new THREE.TextureLoader();
texLoader.setCrossOrigin('anonymous');
function loadTex(url, srgb) {
  return new Promise((resolve) => {
    let done = false;
    const to = setTimeout(() => { if (!done) { done = true; resolve(null); } }, 12000);
    texLoader.load(url,
      (t) => { if (done) return; done = true; clearTimeout(to); t.colorSpace = srgb ? THREE.SRGBColorSpace : THREE.NoColorSpace; t.anisotropy = 8; resolve(t); },
      undefined,
      () => { if (done) return; done = true; clearTimeout(to); resolve(null); });
  });
}
async function loadRealTextures() {
  const status = document.getElementById('tex-status');
  status.textContent = '正在加载高清贴图…'; status.classList.add('show');
  let ok = 0, tried = 0;
  for (const p of PLANETS) {
    const man = TEXMAP[p.key]; if (!man || !p._mesh) continue;
    const mat = p._mesh.material;
    if (man.map)    { tried++; const t = await loadTex(man.map, true);    if (t) { mat.map = t; mat.color.set(0xffffff); mat.needsUpdate = true; ok++; } }
    if (man.bump)   { const t = await loadTex(man.bump, false);   if (t) { mat.bumpMap = t; mat.bumpScale = 0.05; mat.needsUpdate = true; } }
    if (man.normal) { const t = await loadTex(man.normal, false); if (t) { mat.normalMap = t; mat.needsUpdate = true; } }
    // 地球云层与夜面城市灯光保留程序化版本（自定义着色器，效果更自然可靠）；仅替换地表主贴图
    if (man.ring && p._ringMesh) { const t = await loadTex(man.ring, true); if (t) { p._ringMesh.material.map = t; p._ringMesh.material.color.set(0xffffff); p._ringMesh.material.needsUpdate = true; } }
  }
  // 月球
  for (const item of moons) {
    if (item.data.key === 'moon') { const t = await loadTex(MOON_TEX.moon, true); if (t) { item.mesh.material.map = t; item.mesh.material.bumpMap = null; item.mesh.material.needsUpdate = true; } }
  }
  if (ok > 0) { status.textContent = `✓ 高清贴图已加载 (${ok}/${tried})`; setTimeout(() => status.classList.remove('show'), 2600); }
  else { status.textContent = '离线模式：使用程序化贴图'; setTimeout(() => status.classList.remove('show'), 2600); }
}

build().then(() => { buildAuGrid(); syncPicker(); clock.start(); animate(); loadRealTextures(); });
