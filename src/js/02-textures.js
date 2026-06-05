/* ===== 各类星球地表纹理生成器 =====
   (源码片段，按序拼接为单文件；勿在此使用 import/export) */
/* =========================================================================
   3. 各类星球地表纹理生成器  (返回 {map, bump?})
   ========================================================================= */

// ---- 岩质行星通用：逐像素着色 + 可选凹凸 ----
function buildPixelTexture(w, h, shadeFn, withBump = false) {
  const cv = document.createElement('canvas'); cv.width = w; cv.height = h;
  const ctx = cv.getContext('2d');
  const img = ctx.createImageData(w, h);
  const d = img.data;
  let bumpCv, bd;
  if (withBump) { bumpCv = document.createElement('canvas'); bumpCv.width = w; bumpCv.height = h; }
  const bImg = withBump ? ctx.createImageData(w, h) : null;
  if (withBump) bd = bImg.data;

  for (let j = 0; j < h; j++) {
    for (let i = 0; i < w; i++) {
      const [x, y, z, theta] = sphereDir(i, j, w, h);
      const out = shadeFn(x, y, z, theta, i, j);
      const idx = (j * w + i) * 4;
      d[idx] = out[0]; d[idx + 1] = out[1]; d[idx + 2] = out[2]; d[idx + 3] = 255;
      if (withBump) {
        const e = out[3] !== undefined ? out[3] : 128;
        bd[idx] = bd[idx + 1] = bd[idx + 2] = e; bd[idx + 3] = 255;
      }
    }
  }
  ctx.putImageData(img, 0, 0);
  const map = new THREE.CanvasTexture(cv);
  map.colorSpace = THREE.SRGBColorSpace;
  map.anisotropy = 8;
  let bump = null;
  if (withBump) {
    const bctx = bumpCv.getContext('2d'); bctx.putImageData(bImg, 0, 0);
    bump = new THREE.CanvasTexture(bumpCv);
  }
  return { map, bump };
}

// 太阳：翻腾的等离子体 + 黑子 + 颗粒
function texSun(N) {
  const w = 1024, h = 512;
  const { fbm, turb } = N;
  return buildPixelTexture(w, h, (x, y, z) => {
    const f = 2.4;
    let t = turb(x * f, y * f, z * f, 6);
    let cells = fbm(x * 7, y * 7, z * 7, 4) * 0.5 + 0.5;
    let v = clamp(t * 1.1 + cells * 0.25, 0, 1);
    // 黑子
    const spot = fbm(x * 1.3 + 11, y * 1.3, z * 1.3, 4);
    let col;
    const deep = [60, 10, 0], mid = [200, 60, 5], hot = [255, 170, 40], white = [255, 240, 190];
    if (v < 0.45) col = mix(deep, mid, v / 0.45);
    else if (v < 0.75) col = mix(mid, hot, (v - 0.45) / 0.3);
    else col = mix(hot, white, (v - 0.75) / 0.25);
    if (spot > 0.42) { const k = clamp((spot - 0.42) / 0.18, 0, 1); col = mix(col, [40, 12, 2], k * 0.85); }
    return col;
  }).map;
}

// 地球：海洋 + 大陆(按高度上色) + 极冠
function texEarth(N) {
  const w = 1024, h = 512;
  const { fbm } = N;
  const deepSea = [8, 30, 75], sea = [16, 70, 130], shallow = [30, 120, 160];
  const sand = [205, 195, 150], grass = [60, 120, 55], forest = [34, 85, 42];
  const rock = [110, 95, 78], snow = [240, 244, 250];
  return buildPixelTexture(w, h, (x, y, z, theta) => {
    let e = fbm(x * 1.7, y * 1.7, z * 1.7, 6) * 0.5 + 0.5;
    e += (fbm(x * 5, y * 5, z * 5, 4)) * 0.12;  // 细节
    const lat = Math.abs(y);  // 0赤道 1极
    let col, h2 = 128;
    if (e < 0.5) {
      const t = e / 0.5;
      col = t < 0.7 ? mix(deepSea, sea, t / 0.7) : mix(sea, shallow, (t - 0.7) / 0.3);
      h2 = 90 + t * 30;
    } else {
      const t = (e - 0.5) / 0.5;
      if (t < 0.08) col = mix(shallow, sand, t / 0.08);
      else if (t < 0.4) col = mix(grass, forest, (t - 0.08) / 0.32);
      else if (t < 0.7) col = mix(forest, rock, (t - 0.4) / 0.3);
      else col = mix(rock, snow, (t - 0.7) / 0.3);
      h2 = 140 + t * 110;
      // 沙漠带（副热带）
      const dryness = clamp(1 - Math.abs(lat - 0.32) * 4, 0, 1) * (fbm(x * 3 + 5, y * 3, z * 3, 3) * .5 + .5);
      if (t > 0.05 && t < 0.5) col = mix(col, [200, 180, 120], dryness * 0.5);
    }
    // 极地冰冠
    const ice = clamp((lat - 0.78) / 0.12, 0, 1) * clamp((e * 0.5 + 0.6), 0, 1);
    if (ice > 0) { col = mix(col, snow, ice); h2 = lerp(h2, 250, ice); }
    return [col[0], col[1], col[2], h2];
  }, true);
}

// 地球云层（独立半透明球的 alpha 贴图）
function texClouds(N) {
  const w = 1024, h = 512;
  const { fbm } = N;
  const cv = document.createElement('canvas'); cv.width = w; cv.height = h;
  const ctx = cv.getContext('2d'); const img = ctx.createImageData(w, h); const d = img.data;
  for (let j = 0; j < h; j++) for (let i = 0; i < w; i++) {
    const [x, y, z] = sphereDir(i, j, w, h);
    let c = fbm(x * 2.2, y * 2.2, z * 2.2, 6) * 0.5 + 0.5;
    c += fbm(x * 6, y * 6, z * 6, 4) * 0.15;
    let a = clamp((c - 0.58) / 0.26, 0, 1);
    a = a * a * (3 - 2 * a) * 205;
    const idx = (j * w + i) * 4;
    d[idx] = d[idx + 1] = d[idx + 2] = 255; d[idx + 3] = a;
  }
  ctx.putImageData(img, 0, 0);
  const t = new THREE.CanvasTexture(cv); t.colorSpace = THREE.SRGBColorSpace; t.anisotropy = 8;
  return t;
}

// 类月/水星：灰岩 + 陨石坑
function texCratered(N, base, seedScale = 1.6, craterCount = 230) {
  const w = 1024, h = 512;
  const { fbm, noise } = N;
  const res = buildPixelTexture(w, h, (x, y, z) => {
    let e = fbm(x * seedScale, y * seedScale, z * seedScale, 6) * 0.5 + 0.5;
    let g = fbm(x * 9, y * 9, z * 9, 3) * 0.5 + 0.5;
    let v = e * 0.7 + g * 0.3;
    const c = mix(base.dark, base.light, v);
    // 暗色月海/平原
    const mare = fbm(x * 1.1 + 20, y * 1.1, z * 1.1, 3);
    let col = c;
    if (base.mare && mare > 0.25) col = mix(col, base.mare, clamp((mare - 0.25) / 0.3, 0, 1) * 0.6);
    return [col[0], col[1], col[2], 110 + v * 60];
  }, true);
  // 叠加陨石坑（直接画在 canvas 上）
  addCraters(res.map.image, craterCount, N);
  addCraters(res.bump.image, craterCount, N, true);
  res.map.needsUpdate = true; res.bump.needsUpdate = true;
  return res;
}

function addCraters(canvas, count, N, isBump = false) {
  const ctx = canvas.getContext('2d'); const w = canvas.width, h = canvas.height;
  let s = 12345;
  const rnd = () => ((s = (s * 1664525 + 1013904223) >>> 0) / 4294967296);
  for (let k = 0; k < count; k++) {
    const cx = rnd() * w;
    const cyN = rnd();                        // 纬度按 sin 分布，避免极区拥挤
    const cy = (Math.acos(1 - 2 * cyN) / Math.PI) * h;
    const r = (2 + rnd() * 22) * (0.5 + 0.5 * Math.sin(cy / h * Math.PI));
    if (r < 1.2) continue;
    // 坑底阴影
    const g = ctx.createRadialGradient(cx, cy, r * 0.2, cx, cy, r);
    if (isBump) {
      g.addColorStop(0, 'rgba(60,60,60,.9)'); g.addColorStop(0.7, 'rgba(120,120,120,.5)');
      g.addColorStop(0.85, 'rgba(220,220,220,.7)'); g.addColorStop(1, 'rgba(128,128,128,0)');
    } else {
      g.addColorStop(0, 'rgba(0,0,0,.32)'); g.addColorStop(0.7, 'rgba(0,0,0,.12)');
      g.addColorStop(0.84, 'rgba(255,255,255,.18)'); g.addColorStop(1, 'rgba(255,255,255,0)');
    }
    ctx.fillStyle = g; ctx.beginPath(); ctx.arc(cx, cy, r, 0, 7); ctx.fill();
  }
}

// 火星：红橙地表 + 暗区 + 极冠 + 峡谷
function texMars(N) {
  const w = 1024, h = 512;
  const { fbm } = N;
  const lo = [120, 50, 30], mid = [180, 90, 55], hi = [205, 130, 90], dark = [90, 45, 35];
  const res = buildPixelTexture(w, h, (x, y, z) => {
    let e = fbm(x * 1.9, y * 1.9, z * 1.9, 6) * 0.5 + 0.5;
    let d2 = fbm(x * 4 + 7, y * 4, z * 4, 4) * 0.5 + 0.5;
    let col = mix(lo, hi, e);
    col = mix(col, mid, d2 * 0.4);
    const darkRegion = fbm(x * 1.3 + 30, y * 1.3, z * 1.3, 3);
    if (darkRegion > 0.2) col = mix(col, dark, clamp((darkRegion - 0.2) / 0.35, 0, 1) * 0.55);
    // 极冠
    const lat = Math.abs(y);
    const ice = clamp((lat - 0.82) / 0.1, 0, 1);
    if (ice > 0) col = mix(col, [235, 235, 240], ice * (0.6 + 0.4 * (fbm(x * 8, y * 8, z * 8, 2) * .5 + .5)));
    return [col[0], col[1], col[2], 110 + e * 80];
  }, true);
  return res;
}

// 气态巨行星：纬度条纹 + 湍流 + 可选大红斑
function texGasGiant(N, bands, opt = {}) {
  const w = 1024, h = 512;
  const { fbm } = N;
  return buildPixelTexture(w, h, (x, y, z, theta) => {
    const lat = y; // -1..1
    // 用湍流扰动纬度，形成翻卷的带状
    const warp = fbm(x * 2.5, y * 6, z * 2.5, 5) * (opt.warp ?? 0.06);
    let p = (lat + warp) * 0.5 + 0.5; // 0..1
    // 多频条纹
    let band = Math.sin(p * Math.PI * (opt.freq ?? 22)) * 0.5 + 0.5;
    band = band * 0.6 + (Math.sin(p * Math.PI * (opt.freq2 ?? 9)) * 0.5 + 0.5) * 0.4;
    let col = sampleGradient(bands, p);
    // 亮带提亮、暗带压暗，增强条纹层次
    col = mix(col, mix(col, [255, 255, 255], 0.22), band * 0.7);
    col = mix(col, mix(col, [0, 0, 0], 0.22), (1 - band) * 0.4);
    // 横向絮状细节
    const fl = fbm(x * 8, y * 14, z * 8, 4);
    col = mix(col, mix(col, [0, 0, 0], 0.18), clamp(fl, 0, 1) * 0.3);
    // 大红斑
    if (opt.spot) {
      const sp = opt.spot;
      const dx = Math.atan2(z, x) - sp.lon;
      const ddx = Math.atan2(Math.sin(dx), Math.cos(dx));
      const dy = (Math.asin(clamp(y, -1, 1))) - sp.lat;
      const dist = Math.sqrt((ddx / sp.rx) ** 2 + (dy / sp.ry) ** 2);
      if (dist < 1) {
        const k = (1 - dist);
        const swirl = fbm(x * 10, y * 10, z * 10, 3) * 0.2;
        col = mix(col, sp.color, clamp(k * 1.4 + swirl, 0, 1));
      }
    }
    return col;
  }).map;
}

// 在颜色站点数组上按 t 采样
function sampleGradient(stops, t) {
  t = clamp(t, 0, 1);
  for (let i = 0; i < stops.length - 1; i++) {
    const a = stops[i], b = stops[i + 1];
    if (t >= a.p && t <= b.p) {
      const k = (t - a.p) / (b.p - a.p || 1);
      return mix(a.c, b.c, k);
    }
  }
  return stops[stops.length - 1].c;
}

// 冰巨星：近乎纯色 + 极淡条纹 + 斑点
function texIceGiant(N, baseCol, spotCol, spots = 0) {
  const w = 768, h = 384;
  const { fbm } = N;
  return buildPixelTexture(w, h, (x, y, z) => {
    const lat = y;
    let band = Math.sin((lat * 0.5 + 0.5) * Math.PI * 7) * 0.5 + 0.5;
    let col = mix(baseCol, mix(baseCol, [255, 255, 255], 0.16), band * 0.25);
    const cl = fbm(x * 3, y * 5, z * 3, 4) * 0.5 + 0.5;
    col = mix(col, mix(baseCol, [255, 255, 255], 0.1), cl * 0.2);
    if (spots) {
      const sv = fbm(x * 1.5 + 50, y * 1.5, z * 1.5, 3);
      if (sv > 0.45) col = mix(col, spotCol, clamp((sv - 0.45) / 0.2, 0, 1) * 0.7);
    }
    return col;
  }).map;
}

// 金星：浓密黄白云漩涡
function texVenus(N) {
  const w = 768, h = 384;
  const { fbm, turb } = N;
  const a = [200, 170, 110], b = [235, 215, 165], c = [250, 240, 210];
  return buildPixelTexture(w, h, (x, y, z) => {
    let t = turb(x * 2 + 3, y * 4, z * 2, 6);
    let col = mix(a, b, clamp(t * 1.3, 0, 1));
    col = mix(col, c, clamp(t * t * 1.2, 0, 1));
    return col;
  }).map;
}

// ---- 木卫一 Io：硫化物斑驳火山世界 ----
function texVolcanic(N) {
  const w = 768, h = 384;
  const { fbm } = N;
  return buildPixelTexture(w, h, (x, y, z) => {
    let b = fbm(x * 2.5, y * 2.5, z * 2.5, 5) * 0.5 + 0.5;
    const spots = fbm(x * 4 + 9, y * 4, z * 4, 4) * 0.5 + 0.5;
    let col;
    if (b < 0.4) col = mix([200, 130, 30], [225, 185, 70], b / 0.4);
    else if (b < 0.7) col = mix([225, 185, 70], [240, 220, 130], (b - 0.4) / 0.3);
    else col = mix([240, 220, 130], [255, 245, 200], (b - 0.7) / 0.3);
    if (spots > 0.62) col = mix(col, [80, 25, 15], clamp((spots - 0.62) / 0.18, 0, 1) * 0.85);
    const sulfur = fbm(x * 6 + 30, y * 6, z * 6, 3) * 0.5 + 0.5;
    if (sulfur > 0.7) col = mix(col, [255, 100, 40], (sulfur - 0.7) / 0.3 * 0.4);
    return col;
  }).map;
}

// ---- 木卫二 Europa：冰壳 + 红褐色裂纹 ----
function texIceCrack(N, baseCol, crackCol) {
  const w = 768, h = 384;
  const { fbm, noise } = N;
  return buildPixelTexture(w, h, (x, y, z) => {
    let i = fbm(x * 3, y * 3, z * 3, 4) * 0.5 + 0.5;
    let col = mix(baseCol, [255, 255, 255], i * 0.3);
    // 用 |fbm| 形成线状裂纹
    const c1 = Math.abs(noise(x * 4 + 5, y * 4, z * 4));
    const c2 = Math.abs(noise(x * 8 + 12, y * 8, z * 8));
    const crack = Math.max(0, 0.07 - Math.min(c1, c2)) * 14;
    if (crack > 0) col = mix(col, crackCol, clamp(crack, 0, 1));
    // 极淡斑驳
    const sp = fbm(x * 7, y * 7, z * 7, 3);
    col = mix(col, [200, 200, 195], clamp(sp + 0.3, 0, 1) * 0.1);
    return col;
  }).map;
}

// ---- 土卫六：橙黄烟霾 ----
function texHazy(N) {
  const w = 512, h = 256;
  const { fbm, turb } = N;
  return buildPixelTexture(w, h, (x, y, z) => {
    let t = turb(x * 1.5 + 4, y * 3, z * 1.5, 5);
    let col = mix([180, 130, 60], [235, 195, 110], clamp(t * 1.2, 0, 1));
    col = mix(col, [255, 220, 150], clamp(t * t, 0, 1) * 0.5);
    return col;
  }).map;
}

// 土星环：径向条带 + 透明环缝
function texSaturnRing(N) {
  const w = 1024, h = 8;
  const cv = document.createElement('canvas'); cv.width = w; cv.height = h;
  const ctx = cv.getContext('2d'); const img = ctx.createImageData(w, h); const d = img.data;
  const { noise } = N;
  for (let i = 0; i < w; i++) {
    const t = i / w;
    let v = noise(t * 40, 0, 0) * 0.5 + 0.5;
    v = v * 0.5 + (noise(t * 130, 5, 0) * 0.5 + 0.5) * 0.5;
    // 卡西尼环缝等：几处压暗到透明
    let alpha = 220;
    const gaps = [0.46, 0.62, 0.72, 0.34];
    for (const g of gaps) { if (Math.abs(t - g) < 0.012) alpha *= 0.15; }
    if (t < 0.12 || t > 0.98) alpha *= clamp((t < 0.12 ? t / 0.12 : (1 - t) / 0.02), 0, 1);
    const base = mix([120, 100, 75], [220, 205, 175], v);
    for (let j = 0; j < h; j++) {
      const idx = (j * w + i) * 4;
      d[idx] = base[0]; d[idx + 1] = base[1]; d[idx + 2] = base[2]; d[idx + 3] = alpha * (0.7 + 0.3 * v);
    }
  }
  ctx.putImageData(img, 0, 0);
  const tx = new THREE.CanvasTexture(cv); tx.colorSpace = THREE.SRGBColorSpace;
  return tx;
}

