/* En el Abismo — textured mist, no particle or ash effect. */
(() => {
  'use strict';
  const menu = document.querySelector('.menu-button');
  const nav = document.querySelector('#navigation');
  const closeMenu = () => { nav.classList.remove('open'); menu.setAttribute('aria-expanded', 'false'); };
  menu.addEventListener('click', () => { const open = nav.classList.toggle('open'); menu.setAttribute('aria-expanded', String(open)); });
  nav.addEventListener('click', e => { if (e.target.closest('a')) closeMenu(); });
  document.addEventListener('keydown', e => { if (e.key === 'Escape') closeMenu(); });

  const dialog = document.querySelector('.lightbox');
  const photo = dialog.querySelector('img');
  let opener;
  document.querySelectorAll('[data-photo]').forEach(link => link.addEventListener('click', e => {
    if (typeof dialog.showModal !== 'function') return;
    e.preventDefault(); opener = link;
    photo.src = link.href; photo.alt = link.querySelector('img').alt;
    dialog.querySelector('p').textContent = photo.alt;
    dialog.showModal(); document.body.classList.add('modal-open');
  }));
  dialog.querySelector('button').addEventListener('click', () => dialog.close());
  dialog.addEventListener('click', e => { if (e.target === dialog) dialog.close(); });
  dialog.addEventListener('close', () => { document.body.classList.remove('modal-open'); opener?.focus(); });

  const canvas = document.querySelector('#abyss-mist');
  const ctx = canvas.getContext('2d', { alpha: true });
  const toggle = document.querySelector('.mist-toggle');
  if (!ctx) return;
  const reduced = matchMedia('(prefers-reduced-motion: reduce)');
  const small = matchMedia('(max-width: 800px)');
  let paused = false;
  try { paused = sessionStorage.getItem('abismo-mist-paused') === 'true'; } catch {}
  let width = 0, height = 0, raf = 0, last = 0, clock = 0, sprites, clouds = [];

  // Smooth value noise, layered at different frequencies. All texture is made
  // once on small offscreen canvases; animation only composites cached sprites.
  function noise(x, y, seed) {
    const ix = Math.floor(x), iy = Math.floor(y);
    const fx = x - ix, fy = y - iy;
    const sx = fx * fx * (3 - 2 * fx), sy = fy * fy * (3 - 2 * fy);
    const hash = (a, b) => { const n = Math.sin(a * 127.1 + b * 311.7 + seed * 74.7) * 43758.5453; return n - Math.floor(n); };
    const a = hash(ix, iy), b = hash(ix + 1, iy), c = hash(ix, iy + 1), d = hash(ix + 1, iy + 1);
    return (a + (b - a) * sx) * (1 - sy) + (c + (d - c) * sx) * sy;
  }
  function makeSprite(rgb, seed) {
    const texture = document.createElement('canvas'); texture.width = 256; texture.height = 160;
    const c = texture.getContext('2d'); const pixels = c.createImageData(256, 160);
    for (let y = 0; y < 160; y++) for (let x = 0; x < 256; x++) {
      const nx = (x - 128) / 128, ny = (y - 80) / 80;
      const warp = noise(x / 65, y / 55, seed + 8);
      let v = 0, amp = .55, scale = 75;
      for (let k = 0; k < 4; k++) { v += noise((x + warp * 35) / scale, y / scale, seed + k) * amp; amp *= .5; scale *= .48; }
      const mask = Math.pow(Math.max(0, 1 - nx * nx - ny * ny), 1.8);
      const alpha = Math.min(1, Math.max(0, v - .17) * 1.6) * mask;
      const p = (y * 256 + x) * 4;
      pixels.data[p] = rgb[0]; pixels.data[p + 1] = rgb[1]; pixels.data[p + 2] = rgb[2]; pixels.data[p + 3] = Math.round(alpha * 210);
    }
    c.putImageData(pixels, 0, 0); return texture;
  }
  function resize() {
    width = innerWidth; height = innerHeight;
    const ratio = Math.min(devicePixelRatio || 1, small.matches ? 1 : 1.25);
    canvas.width = Math.round(width * ratio); canvas.height = Math.round(height * ratio);
    ctx.setTransform(ratio, 0, 0, ratio, 0, 0);
    clouds = Array.from({ length: small.matches ? 13 : 21 }, (_, i) => ({
      x: (i * .618034) % 1, y: (i * .381966 + .15) % 1,
      size: .65 + (i % 5) * .1, speed: (i % 2 ? 1 : -1) * (.004 + (i % 4) * .0014),
      phase: i * 1.71, sprite: i % 4, alpha: .26 + (i % 3) * .06
    }));
    paint();
  }
  function paint() {
    ctx.clearRect(0, 0, width, height);
    if (!sprites || reduced.matches) return;
    ctx.globalCompositeOperation = 'source-over';
    const scroll = window.scrollY * .035;
    for (const cloud of clouds) {
      const span = Math.max(600, width * 1.1);
      const w = span * cloud.size, h = Math.max(230, height * .48) * cloud.size;
      const drift = ((cloud.x + clock * cloud.speed) % 1 + 1) % 1;
      const x = drift * (width + w) - w;
      const cycle = height + h;
      const y = ((cloud.y * cycle - scroll + Math.sin(clock * .09 + cloud.phase) * 50) % cycle + cycle) % cycle - h;
      ctx.globalAlpha = cloud.alpha * (.85 + .15 * Math.sin(clock * .15 + cloud.phase));
      ctx.drawImage(sprites[cloud.sprite], x, y, w, h);
    }
    ctx.globalAlpha = 1;
  }
  function frame(now) {
    raf = 0;
    if (paused || reduced.matches || document.hidden) return;
    if (!last) last = now;
    const dt = now - last;
    if (dt >= 1000 / 24) { clock += Math.min(dt, 100) / 1000; last = now; paint(); }
    raf = requestAnimationFrame(frame);
  }
  function sync() {
    cancelAnimationFrame(raf); raf = 0; last = 0;
    toggle.hidden = reduced.matches;
    toggle.textContent = paused ? 'Activar bruma' : 'Pausar bruma';
    toggle.setAttribute('aria-pressed', String(!paused));
    if (reduced.matches) { ctx.clearRect(0, 0, width, height); return; }
    if (!sprites) sprites = [[190,108,59],[116,77,162],[164,120,184],[204,139,82]].map((rgb, i) => makeSprite(rgb, i + 4));
    paint();
    if (!paused && !document.hidden) raf = requestAnimationFrame(frame);
  }
  toggle.addEventListener('click', () => { paused = !paused; try { sessionStorage.setItem('abismo-mist-paused', String(paused)); } catch {} sync(); });
  document.addEventListener('visibilitychange', sync);
  reduced.addEventListener('change', sync);
  window.addEventListener('resize', resize, { passive: true });
  resize(); sync();
})();
