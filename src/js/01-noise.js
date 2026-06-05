/* ===== 程序化噪声引擎 (3D Perlin/FBM) + 工具函数 =====
   (源码片段，按序拼接为单文件；勿在此使用 import/export) */
/* =========================================================================
   1. 程序化噪声引擎 (3D Perlin + FBM) —— 用于在球面上无缝生成地表纹理
   ========================================================================= */
function makePerlin(seed = 1) {
  const perm = new Uint8Array(512);
  const base = new Uint8Array(256);
  for (let i = 0; i < 256; i++) base[i] = i;
  let s = seed >>> 0 || 1;
  const rnd = () => ((s = (s * 1664525 + 1013904223) >>> 0) / 4294967296);
  for (let i = 255; i > 0; i--) {
    const j = Math.floor(rnd() * (i + 1));
    const t = base[i]; base[i] = base[j]; base[j] = t;
  }
  for (let i = 0; i < 512; i++) perm[i] = base[i & 255];

  const fade = t => t * t * t * (t * (t * 6 - 15) + 10);
  const lerp = (a, b, t) => a + t * (b - a);
  function grad(h, x, y, z) {
    h &= 15;
    const u = h < 8 ? x : y;
    const v = h < 4 ? y : (h === 12 || h === 14 ? x : z);
    return ((h & 1) ? -u : u) + ((h & 2) ? -v : v);
  }
  function noise(x, y, z) {
    const X = Math.floor(x) & 255, Y = Math.floor(y) & 255, Z = Math.floor(z) & 255;
    x -= Math.floor(x); y -= Math.floor(y); z -= Math.floor(z);
    const u = fade(x), v = fade(y), w = fade(z);
    const A = perm[X] + Y, AA = perm[A] + Z, AB = perm[A + 1] + Z;
    const B = perm[X + 1] + Y, BA = perm[B] + Z, BB = perm[B + 1] + Z;
    return lerp(
      lerp(lerp(grad(perm[AA], x, y, z), grad(perm[BA], x - 1, y, z), u),
           lerp(grad(perm[AB], x, y - 1, z), grad(perm[BB], x - 1, y - 1, z), u), v),
      lerp(lerp(grad(perm[AA + 1], x, y, z - 1), grad(perm[BA + 1], x - 1, y, z - 1), u),
           lerp(grad(perm[AB + 1], x, y - 1, z - 1), grad(perm[BB + 1], x - 1, y - 1, z - 1), u), v),
      w);
  }
  function fbm(x, y, z, oct = 5, lac = 2.0, gain = 0.5) {
    let amp = 0.5, freq = 1, sum = 0, norm = 0;
    for (let i = 0; i < oct; i++) {
      sum += amp * noise(x * freq, y * freq, z * freq);
      norm += amp; amp *= gain; freq *= lac;
    }
    return sum / norm; // 约 [-1,1]
  }
  // 湍流（绝对值 fbm，用于太阳/气态行星的纹理）
  function turb(x, y, z, oct = 5) {
    let amp = 0.5, freq = 1, sum = 0, norm = 0;
    for (let i = 0; i < oct; i++) {
      sum += amp * Math.abs(noise(x * freq, y * freq, z * freq));
      norm += amp; amp *= 0.5; freq *= 2;
    }
    return sum / norm;
  }
  return { noise, fbm, turb };
}

/* =========================================================================
   2. 工具函数
   ========================================================================= */
const clamp = (v, a, b) => Math.min(b, Math.max(a, v));
const lerp = (a, b, t) => a + (b - a) * t;
function mix(c1, c2, t) { // c=[r,g,b] 0..255
  return [lerp(c1[0], c2[0], t), lerp(c1[1], c2[1], t), lerp(c1[2], c2[2], t)];
}
const nextFrame = () => new Promise(r => requestAnimationFrame(r));

// 把每个纹理像素映射到单位球方向，保证经度方向无缝
function sphereDir(i, j, w, h) {
  const phi = (i / w) * Math.PI * 2;      // 经度 0..2π
  const theta = (j / h) * Math.PI;        // 纬度 0..π (0=北极)
  const st = Math.sin(theta);
  return [st * Math.cos(phi), Math.cos(theta), st * Math.sin(phi), theta, phi];
}

