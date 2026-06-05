/* ===== 交互：悬停 / 点击聚焦 / 详细面板 =====
   (源码片段，按序拼接为单文件；勿在此使用 import/export) */
/* =========================================================================
   7. 交互：悬停信息 + 点击聚焦
   ========================================================================= */
const raycaster = new THREE.Raycaster();
const mouse = new THREE.Vector2(-10, -10);
const tooltip = document.getElementById('tooltip');
const focusInfo = document.getElementById('focus-info');
const detailPanel = document.getElementById('detail-panel');
let hovered = null;
let focusTarget = null;        // 当前追踪的 mesh
let liveTarget = null;         // 详细面板实时量的对象
let pointerDownAt = null;      // 用于区分点击与拖动

renderer.domElement.addEventListener('pointermove', (e) => {
  mouse.x = (e.clientX / innerWidth) * 2 - 1;
  mouse.y = -(e.clientY / innerHeight) * 2 + 1;
  tooltip.style.left = Math.min(e.clientX + 18, innerWidth - 300) + 'px';
  tooltip.style.top = Math.min(e.clientY + 18, innerHeight - 260) + 'px';
});

renderer.domElement.addEventListener('pointerdown', (e) => {
  if (e.button !== 0) return;
  pointerDownAt = { x: e.clientX, y: e.clientY };
});
renderer.domElement.addEventListener('pointerup', (e) => {
  if (e.button !== 0 || !pointerDownAt) return;
  // 区分点击与拖动：移动 >6px 视为拖动，不触发聚焦
  const dx = e.clientX - pointerDownAt.x, dy = e.clientY - pointerDownAt.y;
  pointerDownAt = null;
  if (dx * dx + dy * dy > 36) return;
  raycaster.setFromCamera(mouse, camera);
  const hit = raycaster.intersectObjects(planetMeshes, false)[0];
  if (hit) focusOn(hit.object);
});

function focusOn(mesh) {
  focusTarget = mesh;
  liveTarget = mesh;
  // 真实比例下，太阳/行星按真实世界半径取景；卫星与示意模式用视觉半径
  let r = mesh.userData.radius || 2;
  const isReal = scaleMode === 'true' && (mesh.userData.isSun || KEPLER[mesh.userData.key]);
  if (isReal) r = mesh.userData.radiusKm * DIST_TRUE / AU_KM;
  controls.minDistance = Math.max(r * 1.3, camera.near * 1.5);
  controls.maxDistance = Math.max(r * 200, 200);
  const tp = new THREE.Vector3(); mesh.getWorldPosition(tp);
  let dir = camera.position.clone().sub(tp);
  if (dir.length() < 0.001) dir.set(1, 0.4, 0.8);
  dir.normalize();
  const dist = Math.max(r * 4.5, camera.near * 4);
  animateCamera(tp.clone().add(dir.multiplyScalar(dist)), tp.clone());
  showDetail(mesh.userData);
  focusInfo.classList.remove('show');
}

function unfocus(returnToOverview = true) {
  focusTarget = null;
  liveTarget = null;
  controls.minDistance = 8;
  controls.maxDistance = 14000;
  detailPanel.classList.remove('show');
  focusInfo.classList.remove('show');
  if (returnToOverview) {
    if (scaleMode === 'true') animateCamera(new THREE.Vector3(0, 520, 1450), new THREE.Vector3(0, 0, 0));
    else animateCamera(new THREE.Vector3(0, 120, 320), new THREE.Vector3(0, 0, 0));
  }
}

function showDetail(d) {
  let rows = '';
  for (const k in d.info) rows += `<div class="d-row"><span>${k}</span><span>${d.info[k]}</span></div>`;
  detailPanel.innerHTML = `
    <div class="close" id="detail-close" title="返回全景">×</div>
    <div class="d-name">${d.name}</div>
    <div class="d-en">${d.en}</div>
    <span class="d-tag">${d.tag}</span>
    <div class="d-divider"></div>
    ${rows}
    <div class="d-divider"></div>
    <div class="d-live-title">◉ 实时轨道量 · 仿真历元</div>
    <div id="d-live"></div>
    <div class="d-divider"></div>
    <div class="d-desc">${d.desc}</div>
    <div class="d-tip">🖱 拖动旋转视角观察地表 · 滚轮缩放</div>
    <div class="d-back" id="detail-back">← 返回全景</div>`;
  detailPanel.classList.add('show');
  document.getElementById('detail-close').onclick = () => unfocus(true);
  document.getElementById('detail-back').onclick = () => unfocus(true);
  updateLive();
}

// 实时轨道量（由当前历元星历解算，每帧刷新）
function updateLive() {
  if (!detailPanel.classList.contains('show') || !liveTarget) return;
  const live = document.getElementById('d-live'); if (!live) return;
  const d = liveTarget.userData;
  const row = (k, v) => `<div class="d-row"><span>${k}</span><span>${v}</span></div>`;
  if (d.isSun) {
    const es = planetState('earth', jd);
    live.innerHTML = row('日地距离', es.r.toFixed(4) + ' au')
      + row('≈', (es.r * AU_KM / 1e6).toFixed(2) + ' ×10⁶ km')
      + row('恒星自转', (SUN_INFO.rotH / 24).toFixed(2) + ' 天');
    return;
  }
  if (KEPLER[d.key]) {
    const s = planetState(d.key, jd);
    const es = planetState('earth', jd);
    const dx = s.x - es.x, dy = s.y - es.y, dz = s.z - es.z;
    const dE = Math.sqrt(dx * dx + dy * dy + dz * dz);
    live.innerHTML = row('日心距 r', s.r.toFixed(4) + ' au')
      + row('≈', (s.r * AU_KM / 1e6).toFixed(2) + ' ×10⁶ km')
      + row('轨道速度', s.v.toFixed(2) + ' km/s')
      + row('距地球', d.key === 'earth' ? '—' : dE.toFixed(4) + ' au')
      + row('日心黄经 λ', s.lon.toFixed(2) + '°')
      + row('黄道 XYZ', `${s.x.toFixed(2)}, ${s.y.toFixed(2)}, ${s.z.toFixed(2)} au`)
      + row('公转周期', s.periodYr.toFixed(3) + ' 年');
    return;
  }
  if (d.periodD) {
    const aKm = d._aKm || (MOON_AKM[d.key] || 0);
    live.innerHTML = row('公转周期', Math.abs(d.periodD).toFixed(2) + ' 天' + (d.periodD < 0 ? '(逆行)' : ''))
      + (aKm ? row('轨道半长轴', Math.round(aKm).toLocaleString() + ' km') : '')
      + row('偏心率 e', (d.e || 0).toFixed(4))
      + row('轨道倾角 i', (d.incl || 0).toFixed(2) + '°')
      + `<div class="d-note">采用真实开普勒根数(a,e,i,周期)；真实比例下为真实星-卫距离，示意模式下半长轴压缩显示。</div>`;
    return;
  }
  live.innerHTML = '';
}

renderer.domElement.addEventListener('dblclick', () => unfocus(true));
addEventListener('keydown', (e) => { if (e.key === 'Escape') unfocus(true); });

function updateHover() {
  // 聚焦模式时隐藏 hover tooltip（详细面板已显示同样信息）
  if (detailPanel.classList.contains('show')) {
    if (hovered) { tooltip.classList.remove('show'); document.body.style.cursor = ''; hovered = null; }
    return;
  }
  raycaster.setFromCamera(mouse, camera);
  const hit = raycaster.intersectObjects(planetMeshes, false)[0];
  const obj = hit ? hit.object : null;
  if (obj !== hovered) {
    hovered = obj;
    if (obj) { fillTooltip(obj.userData); tooltip.classList.add('show'); document.body.style.cursor = 'pointer'; }
    else { tooltip.classList.remove('show'); document.body.style.cursor = ''; }
  }
}

function fillTooltip(d) {
  let rows = '';
  for (const k in d.info) rows += `<div class="tt-row"><span>${k}</span><span>${d.info[k]}</span></div>`;
  tooltip.innerHTML =
    `<div class="tt-head"><span class="tt-name">${d.name}</span><span class="tt-en">${d.en}</span></div>
     <span class="tt-tag">${d.tag}</span>${rows}
     <div class="tt-desc">${d.desc}</div>`;
}

