/* =============================================================================
   构建脚本：把 src/ 模块内联拼回单个 index.html（双击离线可运行）。
   用法：
     node build.mjs            # 构建一次
     node build.mjs --watch    # 监听 src/ 改动，自动重建
   原理：src/js/*.js 是按序号拼接的源码片段（共享同一模块作用域），
   构建即「按文件名排序拼接 + 内联 CSS」，不做任何代码改写 → 行为与源码一致。
   ============================================================================= */
import { readFileSync, writeFileSync, readdirSync, watch } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';

const ROOT = dirname(fileURLToPath(import.meta.url));
const SRC = join(ROOT, 'src');
const JS_DIR = join(SRC, 'js');
const OUT = join(ROOT, 'index.html');

function build() {
  const tpl = readFileSync(join(SRC, 'index.html'), 'utf8');
  const css = readFileSync(join(SRC, 'styles.css'), 'utf8');

  const files = readdirSync(JS_DIR).filter(f => f.endsWith('.js')).sort();
  const js = files.map(f => {
    const code = readFileSync(join(JS_DIR, f), 'utf8');
    return `/* ====================== src/js/${f} ====================== */\n${code}`;
  }).join('\n');

  const html = tpl
    .replace('<!DOCTYPE html>', '<!DOCTYPE html>\n<!-- ⚠ 本文件由 build.mjs 自动生成，请勿直接编辑。修改源码见 src/，重建：node build.mjs -->')
    .replace('<!-- INJECT:CSS -->', `<style>\n${css}\n</style>`)
    .replace('<!-- INJECT:JS -->', `<script type="module">\n${js}\n</script>`);

  writeFileSync(OUT, html);
  const kb = (Buffer.byteLength(html) / 1024).toFixed(1);
  console.log(`[build] index.html  ←  ${files.length} 模块 + styles.css   (${kb} KB)  ${new Date().toLocaleTimeString()}`);
}

build();

if (process.argv.includes('--watch')) {
  console.log('[watch] 监听 src/ … (Ctrl+C 退出)');
  let timer = null;
  const rebuild = () => { clearTimeout(timer); timer = setTimeout(() => { try { build(); } catch (e) { console.error('[build error]', e.message); } }, 80); };
  watch(SRC, { recursive: true }, rebuild);
}
