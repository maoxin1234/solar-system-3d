/* ===== 场景构建主流程 build() =====
   (源码片段，按序拼接为单文件；勿在此使用 import/export) */
/* =========================================================================
   6. 构建（异步逐个生成，带进度）
   ========================================================================= */
const loadStatus = document.getElementById('load-status');
const loadBar = document.getElementById('load-bar');
const planetMeshes = []; // 用于 raycaster
const orbitObjs = [];
const labelObjs = [];
const moons = [];        // 卫星 {data, moonPos, mesh, M0}
let asteroidBelt = null;
let sunPhase = 0;        // 太阳表面动画相位（独立于仿真时钟）
let daysPerSec = 5;      // 时间速率：每真实秒推进的天数
let timeDir = 1;         // 时间方向：+1 正放 / -1 倒放
const tmpV = new THREE.Vector3();
let sunMesh, sunGlow;
const segHi = 64, segLo = 48;

async function build() {
  const N = makePerlin(2024);
  const total = PLANETS.length + 2;
  let step = 0;
  const tick = async (txt) => { loadStatus.textContent = txt; loadBar.style.width = `${(++step / total) * 100}%`; await nextFrame(); await nextFrame(); };

  // --- 星空背景 ---
  await tick('绘制星空…');
  scene.add(makeStarfield());

  // --- 太阳：shader-based HDR 等离子体 + 日冕火焰 ---
  await tick('点燃恒星：太阳…');
  const sunUniforms = { time: { value: 0 } };
  sunMesh = new THREE.Mesh(
    new THREE.SphereGeometry(6, 96, 96),
    new THREE.ShaderMaterial({
      uniforms: sunUniforms,
      vertexShader: SUN_VS,
      fragmentShader: SUN_FS
    })
  );
  sunMesh.userData = { isSun: true, radius: 6, ...SUN_INFO };
  sunMesh.layers.enable(BLOOM_LAYER);
  scene.add(sunMesh);
  planetMeshes.push(sunMesh);
  // 日冕：内壳（紧贴表面的火焰丝）
  const corona1 = new THREE.Mesh(
    new THREE.SphereGeometry(6.8, 64, 64),
    new THREE.ShaderMaterial({
      uniforms: sunUniforms, vertexShader: CORONA_VS, fragmentShader: CORONA_FS,
      side: THREE.BackSide, blending: THREE.AdditiveBlending, transparent: true, depthWrite: false
    })
  );
  corona1.layers.enable(BLOOM_LAYER);
  sunMesh.add(corona1);
  // 日冕：外壳（更大、更柔的辐射火焰）
  const corona2 = new THREE.Mesh(
    new THREE.SphereGeometry(10, 64, 64),
    new THREE.ShaderMaterial({
      uniforms: sunUniforms, vertexShader: CORONA_VS, fragmentShader: CORONA_FS,
      side: THREE.BackSide, blending: THREE.AdditiveBlending, transparent: true, depthWrite: false
    })
  );
  corona2.layers.enable(BLOOM_LAYER);
  sunMesh.add(corona2);
  sunMesh.userData.uniforms = sunUniforms;

  // --- 行星 ---
  for (const p of PLANETS) {
    await tick(`生成行星地表：${p.name}…`);
    const mat = new THREE.MeshStandardMaterial({ roughness: 1, metalness: 0 });
    const tex = genPlanetTexture(p, N);
    mat.map = tex.map;
    if (tex.bump) { mat.bumpMap = tex.bump; mat.bumpScale = p.key === 'earth' ? 0.04 : 0.06; }
    if (p.key === 'jupiter' || p.key === 'saturn') { mat.roughness = 0.9; }
    if (p.nightLights) injectNightLights(mat, texNightLights(N));

    // 真实轨道线：由 JPL 星历根数解算，置于世界坐标系
    const orbitLine = makePlanetOrbit(p.key);
    scene.add(orbitLine); orbitObjs.push(orbitLine);

    // 行星位置组（每帧由星历更新 position，世界坐标系）
    const planetPos = new THREE.Group();
    scene.add(planetPos);

    // 自转轴倾斜（真实黄赤交角）
    const tiltGroup = new THREE.Group();
    tiltGroup.rotation.z = THREE.MathUtils.degToRad(p.tilt);
    planetPos.add(tiltGroup);

    // 尺寸缩放组：仅包裹行星本体(不含卫星)。示意=1；真实=真实半径并保最小可见像素
    const scaleGroup = new THREE.Group();
    tiltGroup.add(scaleGroup);

    const mesh = new THREE.Mesh(
      new THREE.SphereGeometry(p.radius, p.radius > 3 ? segHi : segLo, p.radius > 3 ? segHi : segLo),
      mat
    );
    if (FLAT[p.key]) mesh.scale.y = 1 - FLAT[p.key];   // 真实扁率（赤道隆起）
    mesh.userData = { ...p, holder: planetPos };
    scaleGroup.add(mesh);
    planetMeshes.push(mesh);

    if (p.clouds) {
      const clouds = new THREE.Mesh(
        new THREE.SphereGeometry(p.radius * 1.02, segLo, segLo),
        new THREE.MeshStandardMaterial({ alphaMap: texClouds(N), transparent: true, color: 0xffffff, roughness: 1, depthWrite: false })
      );
      mesh.add(clouds);
      mesh.userData.clouds = clouds;
    }
    if (p.atmosphere) scaleGroup.add(makeAtmosphere(p.radius, p.atmosphere));

    // 卫星（挂在 tiltGroup，不随本体尺寸缩放）
    if (p.moons) {
      for (const m of p.moons) {
        const r = createMoon(m, N);
        tiltGroup.add(r.orbitGroup);
        planetMeshes.push(r.mesh);
        moons.push({ data: m, moonPos: r.moonPos, mesh: r.mesh, orbitLine: r.orbitLine });
      }
    }

    if (p.ring === true) { const ring = makeRing(p.radius, N); scaleGroup.add(ring); p._ringMesh = ring; }
    if (p.ring === 'thin') scaleGroup.add(makeThinRing(p.radius));

    const label = makeLabel(p.name);
    label.userData = { holder: planetPos, radius: p.radius };
    scene.add(label); labelObjs.push(label);

    p._mesh = mesh;
    p._orbitLine = orbitLine;
    p._planetPos = planetPos;
    p._tiltGroup = tiltGroup;
    p._scaleGroup = scaleGroup;
    p._trueR = p.radiusKm * DIST_TRUE / AU_KM;   // 真实模式下的世界半径
    // 初始位置：当前历元真实星历
    const s0 = planetState(p.key, jd);
    eclToWorld(s0.x, s0.y, s0.z, tmpV);
    planetPos.position.copy(tmpV);
  }

  // --- 小行星带（主带，火-木之间 2.1–3.3 au，示意模式下显示） ---
  await tick('生成小行星带…');
  asteroidBelt = makeAsteroidBelt(72, 88, 1500);
  scene.add(asteroidBelt.mesh);

  document.getElementById('loading').classList.add('hidden');
}

