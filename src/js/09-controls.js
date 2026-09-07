/* ===== 控制面板：时间 / 比例 / 刻度 / 精度说明 =====
   (源码片段，按序拼接为单文件；勿在此使用 import/export) */
/* =========================================================================
   8. 控制面板
   ========================================================================= */
let playing = true;
const simDateEl = document.getElementById('sim-date');
const simJdEl = document.getElementById('sim-jd');
const rateLabel = document.getElementById('rate-label');

// 时间速率：滑块 0..1 → 对数映射到 [实时, ~2年/秒]
const RATE_LO = Math.log10(1 / 86400);   // 1 秒/秒（实时）
const RATE_HI = Math.log10(730);          // 约 2 年/秒
const sliderToRate = (t) => Math.pow(10, RATE_LO + (RATE_HI - RATE_LO) * t);
function fmtRate(dps) {
  if (dps < 1.6 / 86400) return '实时';
  if (dps < 1 / 24) return (dps * 1440).toFixed(0) + ' 分/秒';
  if (dps < 1) return (dps * 24).toFixed(1) + ' 时/秒';
  if (dps < 30) return dps.toFixed(dps < 3 ? 2 : 1) + ' 天/秒';
  if (dps < 365) return (dps / 30.44).toFixed(1) + ' 月/秒';
  return (dps / 365.25).toFixed(2) + ' 年/秒';
}
function applyRate() {
  daysPerSec = sliderToRate(parseFloat(document.getElementById('speed').value));
  rateLabel.textContent = (timeDir < 0 ? '-' : '') + fmtRate(daysPerSec);
}
document.getElementById('speed').oninput = applyRate;
applyRate();

document.getElementById('btn-play').onclick = (e) => {
  playing = !playing;
  e.currentTarget.textContent = playing ? '⏸' : '▶';
};
document.getElementById('btn-rev').onclick = (e) => {
  timeDir = -timeDir;
  e.currentTarget.textContent = timeDir < 0 ? '▶' : '◀';
  e.currentTarget.classList.toggle('active', timeDir < 0);
  applyRate();
};
document.getElementById('btn-now').onclick = () => { jd = dateToJD(new Date()); syncPicker(); };

document.getElementById('chk-orbit').onchange = (e) => { orbitObjs.forEach(o => o.visible = e.target.checked); };
document.getElementById('chk-label').onchange = (e) => { labelObjs.forEach(o => o.visible = e.target.checked); };
document.getElementById('chk-grid').onchange = (e) => { gridOn = e.target.checked; if (auGrid) auGrid.visible = gridOn; };

// 精度说明面板开关
const aboutPanel = document.getElementById('about-panel');
const aboutMask = document.getElementById('about-mask');
const toggleAbout = (show) => { aboutPanel.classList.toggle('show', show); aboutMask.classList.toggle('show', show); };
document.getElementById('btn-about').onclick = () => toggleAbout(true);
document.getElementById('about-close').onclick = () => toggleAbout(false);
aboutMask.onclick = () => toggleAbout(false);
document.getElementById('btn-reset').onclick = () => unfocus(true);

// 比例模式切换：真实比例 ↔ 示意比例
function setScaleMode(mode) {
  scaleMode = mode;
  const btn = document.getElementById('btn-scale');
  btn.textContent = mode === 'true' ? '真实比例' : '示意比例';
  btn.classList.toggle('active', mode === 'true');
  // 重建所有行星轨道线（eclToWorld 已按新模式变换）
  for (const p of PLANETS) {
    if (!p._orbitLine) continue;
    const tmp = makePlanetOrbit(p.key);
    p._orbitLine.geometry.dispose();
    p._orbitLine.geometry = tmp.geometry;
    tmp.material.dispose();
  }
  // 卫星轨道线随比例模式重建（真实↔示意 半长轴切换）
  for (const item of moons) {
    if (!item.orbitLine) continue;
    item.orbitLine.geometry.dispose();
    item.orbitLine.geometry = makeMoonOrbitGeom(item.data);
  }
  // 彗星轨道线随比例模式重建
  for (const c of comets) {
    if (!c.orbitLine) continue;
    const tmp = makeCometOrbit(c.data);
    c.orbitLine.geometry.dispose();
    c.orbitLine.geometry = tmp.geometry;
    tmp.material.dispose();
  }
  // 探测器轨道线随比例模式重建
  for (const pr of probes) {
    if (!pr.trajectoryLine) continue;
    const tmp = makeProbeTrajectory(pr.data);
    pr.trajectoryLine.geometry.dispose();
    pr.trajectoryLine.geometry = tmp.geometry;
    tmp.material.dispose();
  }
  // 小行星带仅在示意模式（其位置为示意单位）
  if (asteroidBelt) asteroidBelt.mesh.visible = (mode === 'schematic');
  buildAuGrid();   // 刻度环随比例模式重建
  // 重新取景
  unfocus(false);
  if (mode === 'true') animateCamera(new THREE.Vector3(0, 520, 1450), new THREE.Vector3(0, 0, 0));
  else animateCamera(new THREE.Vector3(0, 120, 320), new THREE.Vector3(0, 0, 0));
}
document.getElementById('btn-scale').onclick = () => setScaleMode(scaleMode === 'true' ? 'schematic' : 'true');

function updateClock() {
  const d = jdToDate(jd);
  simDateEl.textContent = d.toISOString().slice(0, 16).replace('T', ' ') + ' UTC';
  simJdEl.textContent = 'JD ' + jd.toFixed(2);
}

// 日期选择器：跳转到任意历元（按 UTC 解析）
const datePick = document.getElementById('date-pick');
function syncPicker() { datePick.value = jdToDate(jd).toISOString().slice(0, 16); }
datePick.onchange = () => { if (datePick.value) jd = dateToJD(new Date(datePick.value + ':00Z')); };

// 真实模式：本体按真实半径缩放，并保证至少 minPx 像素以保持可见/可点选
const tmpV2 = new THREE.Vector3();
function applySizes() {
  if (scaleMode !== 'true') {
    for (const p of PLANETS) if (p._scaleGroup) p._scaleGroup.scale.setScalar(1);
    if (sunMesh) sunMesh.scale.setScalar(1);
    return;
  }
  const minPx = 3.5;
  const k = 2 * Math.tan(camera.fov * DEG / 2) / innerHeight;  // 世界单位/像素/单位距离
  for (const p of PLANETS) {
    if (!p._scaleGroup) continue;
    const dist = camera.position.distanceTo(p._planetPos.position);
    const target = Math.max(p._trueR, minPx * k * dist);
    p._scaleGroup.scale.setScalar(target / p.radius);
  }
  if (sunMesh) {
    const dist = camera.position.length();
    const target = Math.max(SUN_TRUE_R, minPx * k * dist);
    sunMesh.scale.setScalar(target / 6);
  }
}

// AU 参考刻度（同心环 + 黄经辐线 + 标注）；随比例模式重建
let auGrid = null, gridOn = false;
const gridLabels = [];
function makeAuLabel(text) {
  const cv = document.createElement('canvas'); cv.width = 128; cv.height = 40;
  const ctx = cv.getContext('2d');
  ctx.font = '500 22px "PingFang SC","Microsoft YaHei",sans-serif';
  ctx.fillStyle = '#6b8bbd'; ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
  ctx.fillText(text, 64, 20);
  const t = new THREE.CanvasTexture(cv); t.colorSpace = THREE.SRGBColorSpace;
  return new THREE.Sprite(new THREE.SpriteMaterial({ map: t, transparent: true, depthTest: false, depthWrite: false }));
}
function buildAuGrid() {
  if (auGrid) {
    scene.remove(auGrid);
    auGrid.traverse(o => { if (o.geometry) o.geometry.dispose(); if (o.material) o.material.dispose(); });
  }
  gridLabels.length = 0;
  auGrid = new THREE.Group();
  const radii = scaleMode === 'true' ? [1, 5, 10, 20, 30] : [0.4, 1, 2, 5, 10, 20, 30];
  const v = new THREE.Vector3();
  const rmax = radii[radii.length - 1];
  for (const au of radii) {
    const pts = [];
    for (let i = 0; i <= 160; i++) { const a = i / 160 * 2 * Math.PI; pts.push(eclToWorld(Math.cos(a) * au, Math.sin(a) * au, 0, v).clone()); }
    auGrid.add(new THREE.LineLoop(new THREE.BufferGeometry().setFromPoints(pts),
      new THREE.LineBasicMaterial({ color: 0x2b3c58, transparent: true, opacity: 0.55 })));
    const lab = makeAuLabel(au + ' AU');
    eclToWorld(au, 0, 0, v); lab.position.copy(v);
    lab.userData.base = v.clone();
    auGrid.add(lab); gridLabels.push(lab);
  }
  // 黄经辐线（每 30°）
  for (let kdeg = 0; kdeg < 12; kdeg++) {
    const a = kdeg * 30 * DEG;
    const p0 = eclToWorld(0, 0, 0, v).clone();
    const p1 = eclToWorld(Math.cos(a) * rmax, Math.sin(a) * rmax, 0, v).clone();
    auGrid.add(new THREE.Line(new THREE.BufferGeometry().setFromPoints([p0, p1]),
      new THREE.LineBasicMaterial({ color: 0x223047, transparent: true, opacity: 0.32 })));
  }
  auGrid.visible = gridOn;
  scene.add(auGrid);
}

// 相机平滑过渡
let camAnim = null;
function animateCamera(toPos, toTarget) {
  camAnim = { fromPos: camera.position.clone(), toPos, fromTar: controls.target.clone(), toTarget, t: 0 };
}

