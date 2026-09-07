/* ===== JPL 星历根数 + 开普勒解算 + 坐标/尺度 =====
   (源码片段，按序拼接为单文件；勿在此使用 import/export) */
/* =========================================================================
   4b. JPL 近似星历根数 (J2000 历元 + 每世纪长期变率)
   来源：E.M. Standish, "Keplerian Elements for Approximate Positions of
   the Major Planets" (JPL/SSD)，适用 1800–2050，精度约角分级。
   每项格式 [历元值, 每儒略世纪变率]，角度单位为度。
   a=半长轴(au) e=偏心率 I=轨道倾角 L=平黄经 w=近日点黄经ϖ O=升交点黄经Ω
   注：earth 实为地月质心(EMB)。
   ========================================================================= */
const KEPLER = {
  mercury:{ a:[0.38709927,0.00000037], e:[0.20563593,0.00001906], I:[7.00497902,-0.00594749],
            L:[252.25032350,149472.67411175], w:[77.45779628,0.16047689], O:[48.33076593,-0.12534081] },
  venus:  { a:[0.72333566,0.00000390], e:[0.00677672,-0.00004107], I:[3.39467605,-0.00078890],
            L:[181.97909950,58517.81538729], w:[131.60246718,0.00268329], O:[76.67984255,-0.27769418] },
  earth:  { a:[1.00000261,0.00000562], e:[0.01671123,-0.00004392], I:[-0.00001531,-0.01294668],
            L:[100.46457166,35999.37244981], w:[102.93768193,0.32327364], O:[0.0,0.0] },
  mars:   { a:[1.52371034,0.00001847], e:[0.09339410,0.00007882], I:[1.84969142,-0.00813131],
            L:[-4.55343205,19140.30268499], w:[-23.94362959,0.44441088], O:[49.55953891,-0.29257343] },
  jupiter:{ a:[5.20288700,-0.00011607], e:[0.04838624,-0.00013253], I:[1.30439695,-0.00183714],
            L:[34.39644051,3034.74612775], w:[14.72847983,0.21252668], O:[100.47390909,0.20469106] },
  saturn: { a:[9.53667594,-0.00125060], e:[0.05386179,-0.00050991], I:[2.48599187,0.00193609],
            L:[49.95424423,1222.49362201], w:[92.59887831,-0.41897216], O:[113.66242448,-0.28867794] },
  uranus: { a:[19.18916464,-0.00196176], e:[0.04725744,-0.00004397], I:[0.77263783,-0.00242939],
            L:[313.23810451,428.48202785], w:[170.95427630,0.40805281], O:[74.01692503,0.04240589] },
  neptune:{ a:[30.06992276,0.00026291], e:[0.00859048,0.00005105], I:[1.77004347,0.00035372],
            L:[-55.12002969,218.45945325], w:[44.96476227,-0.32241464], O:[131.78422574,-0.00508664] },
};

/* ③ JPL 扩展根数 (Table 2，适用 3000 BC – 3000 AD)。木星–海王星附加
   大不等式修正项 b,c,s,f：M += b·T² + c·cos(f·T) + s·sin(f·T)（角度制）。
   1800–2050 用上方 Table 1（更优），区间外自动切换到此表。 */
const KEPLER2 = {
  mercury:{ a:[0.38709843,0.0], e:[0.20563661,0.00002123], I:[7.00559432,-0.00590158],
            L:[252.25166724,149472.67486623], w:[77.45771895,0.15940013], O:[48.33961819,-0.12214182] },
  venus:  { a:[0.72332102,-0.00000026], e:[0.00676399,-0.00005107], I:[3.39777545,0.00043494],
            L:[181.97970850,58517.81560260], w:[131.76755713,0.05679648], O:[76.67261496,-0.27274174] },
  earth:  { a:[1.00000018,-0.00000003], e:[0.01673163,-0.00003661], I:[-0.00054346,-0.01337178],
            L:[100.46691572,35999.37306329], w:[102.93005885,0.31795260], O:[-5.11260389,-0.24123856] },
  mars:   { a:[1.52371243,0.00000097], e:[0.09336511,0.00009149], I:[1.85181869,-0.00724757],
            L:[-4.56813164,19140.29934243], w:[-23.91744784,0.45223625], O:[49.71320984,-0.26852431] },
  jupiter:{ a:[5.20248019,-0.00002864], e:[0.04853590,0.00018026], I:[1.29861416,-0.00322699],
            L:[34.33479152,3034.90371757], w:[14.27495244,0.18199196], O:[100.29282654,0.13024619],
            b:-0.00012452, c:0.06064060, s:-0.35635438, f:38.35125 },
  saturn: { a:[9.54149883,-0.00003065], e:[0.05550825,-0.00032044], I:[2.49424102,0.00451969],
            L:[50.07571329,1222.11494724], w:[92.86136063,0.54179478], O:[113.63998702,-0.25015002],
            b:0.00025899, c:-0.13434469, s:0.87320147, f:38.35125 },
  uranus: { a:[19.18797948,-0.00020455], e:[0.04685740,-0.00001550], I:[0.77298127,-0.00180155],
            L:[314.20276625,428.49512595], w:[172.43404441,0.09266985], O:[73.96250215,0.05739699],
            b:0.00058331, c:-0.97731848, s:0.17689245, f:7.67025 },
  neptune:{ a:[30.06952752,0.00006447], e:[0.00895439,0.00000818], I:[1.77005520,0.00022400],
            L:[304.22289287,218.46515314], w:[46.68158724,0.01009938], O:[131.78635853,-0.00606302],
            b:-0.00041348, c:0.68346318, s:-0.10162547, f:7.67025 },
};

/* ---- 物理常数与历元/尺度系统 ---- */
const AU_KM = 1.495978707e8;          // 1 天文单位 (km)
const DEG = Math.PI / 180;
const J2000 = 2451545.0;              // J2000.0 历元儒略日
const GM_SUN = 1.32712440018e11;      // 太阳引力常数 GM (km³/s²)

const dateToJD = (d) => d.getTime() / 86400000 + 2440587.5;
const jdToDate = (jd) => new Date((jd - 2440587.5) * 86400000);

let jd = dateToJD(new Date());        // 仿真时钟：默认 = 当前真实时刻
let scaleMode = 'schematic';          // 'schematic' 示意压缩 | 'true' 真实比例(距离+大小)
const DIST_TRUE = 100;                // 真实模式：每 au 对应的世界单位
const compress = (rAU) => 42 * Math.pow(rAU, 0.5);  // 示意模式径向压缩
const SUN_TRUE_R = SUN_INFO.radiusKm * DIST_TRUE / AU_KM;   // 太阳真实半径(世界单位)
// 真实扁率(赤道隆起) f = (Req-Rpol)/Req
const FLAT = { mercury:0.0009, venus:0, earth:0.00335, mars:0.00589, jupiter:0.06487, saturn:0.09796, uranus:0.02293, neptune:0.01708 };

/* 按历元选表并解算轨道根数：1800–2050 用 Table 1，区间外用 Table 2(+大不等式) */
function elemAt(key, jdt, forceExt) {
  const yr = 2000 + (jdt - J2000) / 365.25;
  const ext = (forceExt !== undefined) ? forceExt : (yr < 1800 || yr > 2050);
  const el = ext ? KEPLER2[key] : KEPLER[key];
  const T = (jdt - J2000) / 36525;
  const a = el.a[0] + el.a[1] * T;
  const e = el.e[0] + el.e[1] * T;
  const I = (el.I[0] + el.I[1] * T) * DEG;
  const Ldeg = el.L[0] + el.L[1] * T;
  const wbarDeg = el.w[0] + el.w[1] * T;
  const O = (el.O[0] + el.O[1] * T) * DEG;
  let Mdeg = Ldeg - wbarDeg;
  if (ext && el.b !== undefined) {
    Mdeg += el.b * T * T + el.c * Math.cos(el.f * T * DEG) + el.s * Math.sin(el.f * T * DEG);
  }
  let M = Mdeg * DEG;
  M = ((M % (2 * Math.PI)) + 3 * Math.PI) % (2 * Math.PI) - Math.PI;
  return { a, e, I, O, w: wbarDeg * DEG - O, M, ext };
}

/* 求解某历元 jd 下行星的日心黄道(J2000)状态：位置(au)、速度(km/s)等 */
function planetState(key, jdt, forceExt) {
  const { a, e, I, O, w, M } = elemAt(key, jdt, forceExt);
  let E = M + e * Math.sin(M);
  for (let i = 0; i < 12; i++) {
    const dE = (E - e * Math.sin(E) - M) / (1 - e * Math.cos(E));
    E -= dE; if (Math.abs(dE) < 1e-10) break;
  }
  const xp = a * (Math.cos(E) - e);
  const yp = a * Math.sqrt(1 - e * e) * Math.sin(E);
  const cw = Math.cos(w), sw = Math.sin(w), cO = Math.cos(O), sO = Math.sin(O), cI = Math.cos(I), sI = Math.sin(I);
  const x = (cw * cO - sw * sO * cI) * xp + (-sw * cO - cw * sO * cI) * yp;
  const y = (cw * sO + sw * cO * cI) * xp + (-sw * sO + cw * cO * cI) * yp;
  const z = (sw * sI) * xp + (cw * sI) * yp;
  const r = a * (1 - e * Math.cos(E));
  const nu = Math.atan2(Math.sqrt(1 - e * e) * Math.sin(E), Math.cos(E) - e);
  const v = Math.sqrt(GM_SUN * (2 / (r * AU_KM) - 1 / (a * AU_KM)));
  const lon = (Math.atan2(y, x) / DEG + 360) % 360;
  return { x, y, z, a, e, I, r, nu, E, M, v, lon, periodYr: Math.pow(a, 1.5) };
}

/* 日心黄道坐标(au) → three.js 世界坐标(Y 轴朝黄北极)。两种比例模式 */
function eclToWorld(x, y, z, out) {
  if (scaleMode === 'true') {
    out.set(x * DIST_TRUE, z * DIST_TRUE, -y * DIST_TRUE);
  } else {
    const r = Math.sqrt(x * x + y * y + z * z) || 1e-9;
    const k = compress(r) / r;
    out.set(x * k, z * k, -y * k);
  }
  return out;
}

/* 采样某行星当前历元的整条椭圆轨道（用于绘制轨道线，经 eclToWorld 变换） */
function makePlanetOrbit(key, n = 360) {
  const { a, e, I, O, w } = elemAt(key, jd);
  const cw = Math.cos(w), sw = Math.sin(w), cO = Math.cos(O), sO = Math.sin(O), cI = Math.cos(I), sI = Math.sin(I);
  const v = new THREE.Vector3(), arr = [];
  for (let i = 0; i <= n; i++) {
    const E = i / n * 2 * Math.PI;
    const xp = a * (Math.cos(E) - e), yp = a * Math.sqrt(1 - e * e) * Math.sin(E);
    const x = (cw * cO - sw * sO * cI) * xp + (-sw * cO - cw * sO * cI) * yp;
    const y = (cw * sO + sw * cO * cI) * xp + (-sw * sO + cw * cO * cI) * yp;
    const z = (sw * sI) * xp + (cw * sI) * yp;
    arr.push(eclToWorld(x, y, z, v).clone());
  }
  const g = new THREE.BufferGeometry().setFromPoints(arr);
  return new THREE.LineLoop(g, new THREE.LineBasicMaterial({ color: 0x3a5378, transparent: true, opacity: 0.5 }));
}

/* 解算彗星日心黄道坐标(au)、速度(km/s)等 */
function cometState(comet, jdt) {
  const { a, e, I, O, w, P, T0 } = comet;
  const n = (360 / (P * 365.25)) * DEG;
  let M = (n * (jdt - T0)) % (2 * Math.PI);
  if (M < 0) M += 2 * Math.PI;

  const I_rad = I * DEG, O_rad = O * DEG, w_rad = w * DEG;
  let E = M + e * Math.sin(M);
  for (let i = 0; i < 15; i++) {
    const dE = (E - e * Math.sin(E) - M) / (1 - e * Math.cos(E));
    E -= dE;
    if (Math.abs(dE) < 1e-10) break;
  }

  const xp = a * (Math.cos(E) - e);
  const yp = a * Math.sqrt(Math.max(0, 1 - e * e)) * Math.sin(E);

  const cw = Math.cos(w_rad), sw = Math.sin(w_rad);
  const cO = Math.cos(O_rad), sO = Math.sin(O_rad);
  const cI = Math.cos(I_rad), sI = Math.sin(I_rad);

  const x = (cw * cO - sw * sO * cI) * xp + (-sw * cO - cw * sO * cI) * yp;
  const y = (cw * sO + sw * cO * cI) * xp + (-sw * sO + cw * cO * cI) * yp;
  const z = (sw * sI) * xp + (cw * sI) * yp;
  const r = Math.sqrt(x * x + y * y + z * z);
  const v = Math.sqrt(GM_SUN * (2 / (r * AU_KM) - 1 / (a * AU_KM)));

  return { x, y, z, r, a, e, I, v, periodYr: P };
}

function makeCometOrbit(comet, n = 360) {
  const { a, e, I, O, w } = comet;
  const I_rad = I * DEG, O_rad = O * DEG, w_rad = w * DEG;
  const cw = Math.cos(w_rad), sw = Math.sin(w_rad);
  const cO = Math.cos(O_rad), sO = Math.sin(O_rad);
  const cI = Math.cos(I_rad), sI = Math.sin(I_rad);
  const v = new THREE.Vector3(), arr = [];
  for (let i = 0; i <= n; i++) {
    const E = (i / n) * 2 * Math.PI;
    const xp = a * (Math.cos(E) - e);
    const yp = a * Math.sqrt(Math.max(0, 1 - e * e)) * Math.sin(E);
    const x = (cw * cO - sw * sO * cI) * xp + (-sw * cO - cw * sO * cI) * yp;
    const y = (cw * sO + sw * cO * cI) * xp + (-sw * sO + cw * cO * cI) * yp;
    const z = (sw * sI) * xp + (cw * sI) * yp;
    arr.push(eclToWorld(x, y, z, v).clone());
  }
  const g = new THREE.BufferGeometry().setFromPoints(arr);
  return new THREE.LineLoop(g, new THREE.LineBasicMaterial({ color: 0x4df0ff, transparent: true, opacity: 0.55 }));
}

/* 解算深空探测器日心坐标(au)与任务物理量 */
function probeState(probe, jdt) {
  if (probe.orbit) {
    const s = cometState(probe.orbit, jdt);
    return { ...s, name: probe.name, key: probe.key };
  }

  const fb = probe.flybys;
  const asymp = probe.asymptotic;
  const lastFb = fb[fb.length - 1];

  let x = 0, y = 0, z = 0;
  if (jdt < fb[0].jd) {
    const p0 = fb[0];
    const r = p0.r, lon = p0.lon * DEG, lat = p0.lat * DEG;
    x = r * Math.cos(lat) * Math.cos(lon);
    y = r * Math.cos(lat) * Math.sin(lon);
    z = r * Math.sin(lat);
  } else if (jdt >= lastFb.jd) {
    const dtYears = (jdt - lastFb.jd) / 365.25;
    const rLast = lastFb.r, lonLast = lastFb.lon * DEG, latLast = lastFb.lat * DEG;
    const xLast = rLast * Math.cos(latLast) * Math.cos(lonLast);
    const yLast = rLast * Math.cos(latLast) * Math.sin(lonLast);
    const zLast = rLast * Math.sin(latLast);

    const asympLon = asymp.eclLon * DEG, asympLat = asymp.eclLat * DEG;
    const vx = asymp.speedAUPerYr * Math.cos(asympLat) * Math.cos(asympLon);
    const vy = asymp.speedAUPerYr * Math.cos(asympLat) * Math.sin(asympLon);
    const vz = asymp.speedAUPerYr * Math.sin(asympLat);

    x = xLast + vx * dtYears;
    y = yLast + vy * dtYears;
    z = zLast + vz * dtYears;
  } else {
    let idx = 0;
    while (idx < fb.length - 1 && jdt > fb[idx + 1].jd) idx++;
    const f0 = fb[idx], f1 = fb[idx + 1];
    const u = (jdt - f0.jd) / (f1.jd - f0.jd);
    const smoothU = u * u * (3 - 2 * u);

    const r0 = f0.r, lon0 = f0.lon * DEG, lat0 = f0.lat * DEG;
    const r1 = f1.r, lon1 = f1.lon * DEG, lat1 = f1.lat * DEG;

    const x0 = r0 * Math.cos(lat0) * Math.cos(lon0), y0 = r0 * Math.cos(lat0) * Math.sin(lon0), z0 = r0 * Math.sin(lat0);
    const x1 = r1 * Math.cos(lat1) * Math.cos(lon1), y1 = r1 * Math.cos(lat1) * Math.sin(lon1), z1 = r1 * Math.sin(lat1);

    x = x0 + (x1 - x0) * smoothU;
    y = y0 + (y1 - y0) * smoothU;
    z = z0 + (z1 - z0) * smoothU;
  }

  const r = Math.sqrt(x * x + y * y + z * z);
  const v = asymp ? asymp.speedAUPerYr * (AU_KM / (365.25 * 86400)) : 16.0;

  return { x, y, z, r, v, name: probe.name, key: probe.key };
}

function makeProbeTrajectory(probe, n = 300) {
  if (probe.orbit) {
    const l = makeCometOrbit(probe.orbit, 240);
    l.material.color.setHex(0xffaa33);
    return l;
  }

  const v = new THREE.Vector3(), pts = [];
  const startJD = probe.launchJD;
  const endJD = dateToJD(new Date('2035-01-01'));
  for (let i = 0; i <= n; i++) {
    const tj = startJD + (i / n) * (endJD - startJD);
    const s = probeState(probe, tj);
    pts.push(eclToWorld(s.x, s.y, s.z, v).clone());
  }
  const g = new THREE.BufferGeometry().setFromPoints(pts);
  return new THREE.Line(g, new THREE.LineBasicMaterial({ color: 0xffd152, transparent: true, opacity: 0.5 }));
}


