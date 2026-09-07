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
  const distMultiplier = mesh.userData.isProbe ? 7.5 : mesh.userData.isComet ? 6.5 : 4.5;
  const dist = Math.max(r * distMultiplier, camera.near * 4);
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
  if (d.isComet) {
    const s = cometState(d, jd);
    const es = planetState('earth', jd);
    const dx = s.x - es.x, dy = s.y - es.y, dz = s.z - es.z;
    const dE = Math.sqrt(dx * dx + dy * dy + dz * dz);
    const act = s.r < 4.0 ? '🔥 活跃期（升华爆发/双彗尾）' : '❄️ 冰冻休眠态（无显著彗尾）';
    live.innerHTML = row('日心距 r', s.r.toFixed(4) + ' au')
      + row('≈', (s.r * AU_KM / 1e8).toFixed(3) + ' 亿 km')
      + row('轨道速度', s.v.toFixed(2) + ' km/s')
      + row('距地球', dE.toFixed(4) + ' au (' + (dE * AU_KM / 1e8).toFixed(3) + ' 亿 km)')
      + row('升华活性', act)
      + row('轨道周期', s.periodYr.toFixed(2) + ' 年 (逆行)')
      + `<div class="d-note">哈雷彗星高度偏心椭圆轨道 (e=0.967)，由 JPL 历元参数与开普勒方程实时解算。彗尾动态背向太阳。</div>`;
    return;
  }
  if (d.isProbe) {
    const s = probeState(d, jd);
    const es = planetState('earth', jd);
    const dx = s.x - es.x, dy = s.y - es.y, dz = s.z - es.z;
    const dE = Math.sqrt(dx * dx + dy * dy + dz * dz);
    const lightSec = (dE * AU_KM) / 299792.458;
    const fmtTime = (sec) => {
      const h = Math.floor(sec / 3600);
      const m = Math.floor((sec % 3600) / 60);
      const ss = Math.floor(sec % 60);
      return (h > 0 ? h + ' 小时 ' : '') + m + ' 分 ' + ss + ' 秒';
    };
    live.innerHTML = row('距太阳', s.r.toFixed(3) + ' au (' + (s.r * AU_KM / 1e8).toFixed(3) + ' 亿 km)')
      + row('距地球', dE.toFixed(3) + ' au (' + (dE * AU_KM / 1e8).toFixed(3) + ' 亿 km)')
      + row('巡航航速', s.v.toFixed(2) + ' km/s')
      + row('单程光时', fmtTime(lightSec))
      + row('双向延迟(RTT)', fmtTime(lightSec * 2))
      + `<div class="d-note">深空轨道插值自引力弹弓与双曲线逃逸轨迹，天线自动指向地球通讯。</div>`;
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

// ---------- 天体与探测器快捷搜索 / 焦点漫游 (Spotlight Search) ----------
const searchInput = document.getElementById('celestial-search');
const searchResults = document.getElementById('search-results');

function getAllSearchTargets() {
  const list = [];
  if (sunMesh) list.push({ name: '太阳', en: 'Sun', tag: '恒星', mesh: sunMesh });
  for (const p of PLANETS) {
    if (p._mesh) list.push({ name: p.name, en: p.en, tag: '行星', mesh: p._mesh });
  }
  for (const m of moons) {
    list.push({ name: m.data.name, en: m.data.en, tag: '卫星', mesh: m.mesh });
  }
  for (const c of comets) {
    list.push({ name: c.data.name, en: c.data.en, tag: '彗星', mesh: c.mesh });
  }
  for (const pr of probes) {
    list.push({ name: pr.data.name, en: pr.data.en, tag: '深空探测器', mesh: pr.mesh });
  }
  return list;
}

if (searchInput && searchResults) {
  let activeIdx = -1;
  let currentFiltered = [];

  function renderSearch(query) {
    query = (query || '').trim().toLowerCase();
    const all = getAllSearchTargets();
    currentFiltered = query ? all.filter(item =>
      item.name.toLowerCase().includes(query) ||
      item.en.toLowerCase().includes(query) ||
      item.tag.toLowerCase().includes(query)
    ) : all.slice(0, 10);

    activeIdx = currentFiltered.length > 0 ? 0 : -1;
    if (currentFiltered.length === 0) {
      searchResults.innerHTML = `<div class="search-empty">无匹配天体或探测器</div>`;
      searchResults.classList.add('show');
      return;
    }

    searchResults.innerHTML = currentFiltered.map((item, idx) => `
      <div class="search-item ${idx === activeIdx ? 'active' : ''}" data-idx="${idx}">
        <div class="search-item-info">
          <span class="search-item-name">${item.name}</span>
          <span class="search-item-en">${item.en}</span>
        </div>
        <span class="search-item-tag">${item.tag}</span>
      </div>
    `).join('');
    searchResults.classList.add('show');

    searchResults.querySelectorAll('.search-item').forEach(el => {
      el.addEventListener('click', () => {
        const idx = parseInt(el.getAttribute('data-idx'), 10);
        selectSearchResult(idx);
      });
    });
  }

  function selectSearchResult(idx) {
    if (idx >= 0 && idx < currentFiltered.length) {
      const item = currentFiltered[idx];
      focusOn(item.mesh);
      searchResults.classList.remove('show');
      searchInput.value = '';
      searchInput.blur();
    }
  }

  searchInput.addEventListener('input', (e) => renderSearch(e.target.value));
  searchInput.addEventListener('focus', () => renderSearch(searchInput.value));

  searchInput.addEventListener('keydown', (e) => {
    if (e.key === 'ArrowDown') {
      e.preventDefault();
      if (currentFiltered.length > 0) {
        activeIdx = (activeIdx + 1) % currentFiltered.length;
        updateActiveSearchItem();
      }
    } else if (e.key === 'ArrowUp') {
      e.preventDefault();
      if (currentFiltered.length > 0) {
        activeIdx = (activeIdx - 1 + currentFiltered.length) % currentFiltered.length;
        updateActiveSearchItem();
      }
    } else if (e.key === 'Enter') {
      e.preventDefault();
      selectSearchResult(activeIdx);
    } else if (e.key === 'Escape') {
      searchResults.classList.remove('show');
      searchInput.blur();
    }
  });

  function updateActiveSearchItem() {
    searchResults.querySelectorAll('.search-item').forEach((el, idx) => {
      el.classList.toggle('active', idx === activeIdx);
    });
    const activeEl = searchResults.querySelector('.search-item.active');
    if (activeEl) activeEl.scrollIntoView({ block: 'nearest' });
  }

  document.addEventListener('click', (e) => {
    if (!e.target.closest('.search-box')) {
      searchResults.classList.remove('show');
    }
  });

  addEventListener('keydown', (e) => {
    if (e.key === '/' && document.activeElement !== searchInput && document.activeElement.tagName !== 'INPUT') {
      e.preventDefault();
      searchInput.focus();
    }
  });
}


