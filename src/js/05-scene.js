/* ===== 场景 / 相机 / 渲染器 / Bloom 管线 =====
   (源码片段，按序拼接为单文件；勿在此使用 import/export) */
/* =========================================================================
   5. 场景搭建
   ========================================================================= */
const app = document.getElementById('app');
const scene = new THREE.Scene();
const camera = new THREE.PerspectiveCamera(50, innerWidth / innerHeight, 0.02, 80000);
camera.position.set(0, 120, 320);

const renderer = new THREE.WebGLRenderer({ antialias: true, powerPreference: 'high-performance', logarithmicDepthBuffer: true, preserveDrawingBuffer: true });
renderer.setSize(innerWidth, innerHeight);
renderer.setPixelRatio(Math.min(devicePixelRatio, 2));
renderer.toneMapping = THREE.ACESFilmicToneMapping;
renderer.toneMappingExposure = 1.0;
renderer.outputColorSpace = THREE.SRGBColorSpace;
app.appendChild(renderer.domElement);

const controls = new OrbitControls(camera, renderer.domElement);
controls.enableDamping = true;
controls.dampingFactor = 0.06;
controls.minDistance = 8;
controls.maxDistance = 14000;
controls.maxPolarAngle = Math.PI * 0.96;

// 光照：背阳面真的暗，对比度强；太阳为唯一光源（decay=0 均匀照射所有行星）
scene.add(new THREE.AmbientLight(0x141826, 0.55));
const sunLight = new THREE.PointLight(0xfff2d8, 3.0, 0, 0);
scene.add(sunLight);

// === Selective Bloom：只让指定 layer 的对象（太阳/辉光）发光，其他不受影响 ===
const BLOOM_LAYER = 1;
const bloomLayer = new THREE.Layers();
bloomLayer.set(BLOOM_LAYER);
const darkMaterial = new THREE.MeshBasicMaterial({ color: 0x000000 });
const savedMaterials = {};

const bloomPass = new UnrealBloomPass(new THREE.Vector2(innerWidth, innerHeight), 0.7, 0.45, 0.0);

const bloomComposer = new EffectComposer(renderer);
bloomComposer.renderToScreen = false;
bloomComposer.addPass(new RenderPass(scene, camera));
bloomComposer.addPass(bloomPass);

const mixPass = new ShaderPass(new THREE.ShaderMaterial({
  uniforms: {
    baseTexture: { value: null },
    bloomTexture: { value: bloomComposer.renderTarget2.texture }
  },
  vertexShader: `varying vec2 vUv; void main(){ vUv = uv; gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0); }`,
  fragmentShader: `uniform sampler2D baseTexture; uniform sampler2D bloomTexture; varying vec2 vUv;
    void main(){ gl_FragColor = texture2D(baseTexture, vUv) + texture2D(bloomTexture, vUv); }`
}), 'baseTexture');

const finalComposer = new EffectComposer(renderer);
finalComposer.addPass(new RenderPass(scene, camera));
finalComposer.addPass(mixPass);
finalComposer.addPass(new OutputPass());

function darkenNonBloom(obj) {
  if ((obj.isMesh || obj.isPoints || obj.isSprite || obj.isLine) && bloomLayer.test(obj.layers) === false) {
    savedMaterials[obj.uuid] = obj.material;
    obj.material = darkMaterial;
  }
}
function restoreMaterial(obj) {
  if (savedMaterials[obj.uuid]) {
    obj.material = savedMaterials[obj.uuid];
    delete savedMaterials[obj.uuid];
  }
}
function renderWithBloom() {
  scene.traverse(darkenNonBloom);
  bloomComposer.render();
  scene.traverse(restoreMaterial);
  finalComposer.render();
}

