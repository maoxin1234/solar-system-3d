/* ===== 主渲染循环 animate() =====
   (源码片段，按序拼接为单文件；勿在此使用 import/export) */
/* =========================================================================
   9. 主循环
   ========================================================================= */
const clock = new THREE.Clock();
function animate() {
  requestAnimationFrame(animate);
  const dt = clock.getDelta();

  // 太阳表面始终缓慢翻腾（不受仿真倍率影响，保持观感）
  sunPhase += dt * 0.6;
  if (sunMesh && sunMesh.userData.uniforms) sunMesh.userData.uniforms.time.value = sunPhase;

  if (playing) {
    jd += daysPerSec * dt * timeDir;     // 推进仿真时钟（真实儒略日）
  }

  if (sunMesh) {
    const elapsed = jd - J2000;          // 距 J2000 的天数
    // 太阳自转（恒星自转周期 ~25.38 天）
    sunMesh.rotation.y = (elapsed / (SUN_INFO.rotH / 24)) * 2 * Math.PI % (2 * Math.PI);

    for (const p of PLANETS) {
      if (!p._planetPos) continue;
      const s = planetState(p.key, jd);
      eclToWorld(s.x, s.y, s.z, tmpV);
      p._planetPos.position.copy(tmpV);
      p._state = s;
      // 真实自转：自转角 = 2π · 经历天数 / 自转周期(天)，负周期=逆行
      const rev = elapsed / (p.rotH / 24);
      p._mesh.rotation.y = (rev * 2 * Math.PI) % (2 * Math.PI);
      if (p._mesh.userData.clouds) p._mesh.userData.clouds.rotation.y = (rev * 1.04 * 2 * Math.PI) % (2 * Math.PI);
      // 地球夜面 shader：传入「行星 → 太阳」方向
      if (p.nightLights && p._mesh.material.userData.shader) {
        p._mesh.getWorldPosition(tmpV);
        tmpV.negate().normalize();
        p._mesh.material.userData.shader.uniforms.uSunDir.value.copy(tmpV);
      }
    }
    // 卫星：真实开普勒根数(a,e,i,周期)，在行星赤道面运行；负周期=逆行
    for (const item of moons) {
      const m = item.data;
      const M = m._M0 + (elapsed / m.periodD) * 2 * Math.PI;
      moonOrbitVec(m, M, tmpV).multiplyScalar(moonScale(m));
      item.moonPos.position.copy(tmpV);
      item.mesh.rotation.y = ((elapsed / m.periodD) * 2 * Math.PI) % (2 * Math.PI);  // 潮汐锁定近似
    }
    if (asteroidBelt) asteroidBelt.tick(elapsed * 0.02);
  }

  // 标签跟随 + 恒定屏幕尺寸（按到相机距离缩放，避免靠近时变成巨型）
  for (const l of labelObjs) {
    l.userData.holder.getWorldPosition(tmpV);
    tmpV.y += l.userData.radius + 1.4;
    l.position.copy(tmpV);
    const d = camera.position.distanceTo(tmpV);
    const hh = clamp(d * 0.038, 1.2, 9);
    l.scale.set(hh * 4, hh, 1);
  }

  // 追踪聚焦：相机与 target 一起平移到行星新位置（不在相机过渡动画期间）
  if (focusTarget && !camAnim) {
    focusTarget.getWorldPosition(tmpV);
    const dx = tmpV.x - controls.target.x;
    const dy = tmpV.y - controls.target.y;
    const dz = tmpV.z - controls.target.z;
    controls.target.set(tmpV.x, tmpV.y, tmpV.z);
    camera.position.x += dx; camera.position.y += dy; camera.position.z += dz;
  }

  // 相机过渡动画
  if (camAnim) {
    camAnim.t = Math.min(1, camAnim.t + dt * 1.4);
    const e = camAnim.t < 0.5 ? 2*camAnim.t*camAnim.t : 1 - Math.pow(-2*camAnim.t+2,2)/2;
    camera.position.lerpVectors(camAnim.fromPos, camAnim.toPos, e);
    controls.target.lerpVectors(camAnim.fromTar, camAnim.toTarget, e);
    if (camAnim.t >= 1) camAnim = null;
  }

  applySizes();

  // AU 刻度标注：保持近似恒定屏幕尺寸
  if (auGrid && auGrid.visible) {
    for (const l of gridLabels) {
      const d = camera.position.distanceTo(l.userData.base);
      const hh = clamp(d * 0.025, 0.6, 200);
      l.scale.set(hh * 3.4, hh, 1);
    }
  }

  updateClock();
  updateLive();
  updateHover();
  controls.update();
  renderWithBloom();
}

addEventListener('resize', () => {
  camera.aspect = innerWidth / innerHeight; camera.updateProjectionMatrix();
  renderer.setSize(innerWidth, innerHeight);
  bloomComposer.setSize(innerWidth, innerHeight);
  finalComposer.setSize(innerWidth, innerHeight);
});

