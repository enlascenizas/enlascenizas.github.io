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
  const previous = dialog.querySelector('.photo-previous');
  const next = dialog.querySelector('.photo-next');
  const counter = dialog.querySelector('.photo-counter');
  const galleryLinks = [...document.querySelectorAll('[data-gallery]')];
  let opener, group = [], active = 0;
  function showPhoto(index) {
    active = (index + group.length) % group.length;
    const link = group[active];
    photo.src = link.href; photo.alt = link.querySelector('img').alt;
    dialog.querySelector('p').textContent = photo.alt;
    counter.textContent = `${active + 1} / ${group.length}`;
    previous.disabled = next.disabled = group.length < 2;
  }
  document.querySelectorAll('[data-photo]').forEach(link => link.addEventListener('click', e => {
    if (typeof dialog.showModal !== 'function') return;
    e.preventDefault(); opener = link;
    group = link.hasAttribute('data-gallery') ? galleryLinks : [link];
    showPhoto(group.indexOf(link));
    dialog.showModal(); document.body.classList.add('modal-open');
  }));
  dialog.querySelector('.lightbox-close').addEventListener('click', () => dialog.close());
  previous.addEventListener('click', () => showPhoto(active - 1));
  next.addEventListener('click', () => showPhoto(active + 1));
  dialog.addEventListener('keydown', e => {
    if (e.key === 'ArrowLeft') { e.preventDefault(); showPhoto(active - 1); }
    if (e.key === 'ArrowRight') { e.preventDefault(); showPhoto(active + 1); }
  });
  dialog.addEventListener('click', e => { if (e.target === dialog) dialog.close(); });
  dialog.addEventListener('close', () => { document.body.classList.remove('modal-open'); opener?.focus(); });

  const canvas = document.querySelector('#abyss-mist');
  const ctx = canvas.getContext('2d', { alpha: true });
  const toggle = document.querySelector('.mist-toggle');
  if (!ctx) return;
  const reduced = matchMedia('(prefers-reduced-motion: reduce)');
  const small = matchMedia('(max-width: 800px)');
  const fine = matchMedia('(hover: hover) and (pointer: fine)');
  let paused = false;
  try { paused = sessionStorage.getItem('abismo-mist-paused') === 'true'; } catch {}
  let width = 0, height = 0, raf = 0, last = 0, clock = 0, sprites, clouds = [];
  const pointer = { x: -9999, y: -9999, vx: 0, vy: 0, time: 0, strength: 0 };
  const wakes = [];
  let lastWake = 0;
  const clamp = (v, lo, hi) => Math.max(lo, Math.min(hi, v));

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
      phase: i * 1.71, sprite: i % 4, alpha: .27 + (i % 3) * .06,
      ox: 0, oy: 0, vx: 0, vy: 0
    }));
    paint();
  }
  function geometry(cloud) {
    const w = Math.max(600, width * 1.1) * cloud.size * (1 + .055 * Math.sin(clock * .13 + cloud.phase));
    const h = Math.max(230, height * .48) * cloud.size * (1 + .075 * Math.cos(clock * .11 + cloud.phase));
    const x = cloud.x * width + Math.sin(clock * .075 + cloud.phase) * width * .12;
    const y = cloud.y * height + Math.cos(clock * .085 + cloud.phase) * height * .12;
    return { x, y, w, h };
  }
  function evolve(dt) {
    clock += dt;
    pointer.strength *= Math.exp(-dt * 2.4);
    pointer.vx *= Math.exp(-dt * 3); pointer.vy *= Math.exp(-dt * 3);
    for (const cloud of clouds) {
      const g = geometry(cloud);
      const dx = g.x + cloud.ox - pointer.x, dy = g.y + cloud.oy - pointer.y;
      const distance = Math.hypot(dx / (g.w * .52), dy / (g.h * .65));
      const influence = Math.exp(-distance * distance * 3) * pointer.strength;
      // A gentle breeze carries the mist; a damped spring restores its drift.
      const forceX = (pointer.vx * .20 + clamp(dx, -90, 90) * .75) * influence;
      const forceY = (pointer.vy * .18 + clamp(dy, -65, 65) * .65) * influence;
      cloud.vx += (forceX - cloud.ox * .55 - cloud.vx * 1.65) * dt;
      cloud.vy += (forceY - cloud.oy * .55 - cloud.vy * 1.65) * dt;
      cloud.ox = clamp(cloud.ox + cloud.vx * dt, -120, 120);
      cloud.oy = clamp(cloud.oy + cloud.vy * dt, -85, 85);
    }
    for (let i = wakes.length - 1; i >= 0; i--) {
      wakes[i].age += dt;
      if (wakes[i].age > 3.2) wakes.splice(i, 1);
    }
  }
  function paint() {
    ctx.clearRect(0, 0, width, height);
    if (!sprites || reduced.matches) return;
    ctx.globalCompositeOperation = 'source-over';
    for (const cloud of clouds) {
      const { x, y, w, h } = geometry(cloud);
      ctx.save();
      ctx.translate(x + cloud.ox, y + cloud.oy);
      ctx.rotate(Math.sin(clock * .06 + cloud.phase) * .12);
      ctx.globalAlpha = cloud.alpha * (.85 + .15 * Math.sin(clock * .12 + cloud.phase));
      ctx.drawImage(sprites[cloud.sprite], -w / 2, -h / 2, w, h);
      ctx.restore();
    }
    // Feathered, elongated clearings dissolve back into the mist in seconds.
    ctx.globalCompositeOperation = 'destination-out';
    for (const wake of wakes) {
      const fade = Math.pow(1 - wake.age / 3.2, 2);
      const radius = wake.radius * (1 + wake.age * .16);
      ctx.save(); ctx.translate(wake.x, wake.y - wake.age * 5);
      ctx.rotate(wake.angle + wake.age * .10); ctx.scale(1.25, .72);
      const gradient = ctx.createRadialGradient(0, 0, 0, 0, 0, radius);
      gradient.addColorStop(0, `rgba(0,0,0,${.35 * fade * wake.power})`);
      gradient.addColorStop(.45, `rgba(0,0,0,${.17 * fade * wake.power})`);
      gradient.addColorStop(1, 'rgba(0,0,0,0)');
      ctx.fillStyle = gradient; ctx.fillRect(-radius, -radius, radius * 2, radius * 2);
      ctx.restore();
    }
    ctx.globalCompositeOperation = 'source-over';
    ctx.globalAlpha = 1;
  }
  function frame(now) {
    raf = 0;
    if (paused || reduced.matches || document.hidden) return;
    if (!last) last = now;
    const dt = now - last;
    if (dt >= 1000 / 24) { evolve(Math.min(dt, 100) / 1000); last = now; paint(); }
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
  window.addEventListener('pointermove', e => {
    if (paused || reduced.matches || document.hidden || !fine.matches || e.pointerType !== 'mouse') return;
    const now = performance.now(), elapsed = now - pointer.time;
    if (!pointer.time || elapsed > 350) { pointer.x = e.clientX; pointer.y = e.clientY; pointer.time = now; return; }
    const dx = e.clientX - pointer.x, dy = e.clientY - pointer.y;
    const seconds = Math.max(elapsed, 16) / 1000;
    pointer.x = e.clientX; pointer.y = e.clientY; pointer.time = now;
    if (Math.hypot(dx, dy) < 1) return;
    pointer.vx = pointer.vx * .65 + clamp(dx / seconds, -850, 850) * .35;
    pointer.vy = pointer.vy * .65 + clamp(dy / seconds, -650, 650) * .35;
    pointer.strength = Math.min(1, pointer.strength + .3);
    if (now - lastWake > 90) {
      const speed = Math.hypot(pointer.vx, pointer.vy);
      wakes.push({ x: pointer.x, y: pointer.y, angle: Math.atan2(dy, dx), radius: 85 + Math.min(speed * .065, 65), power: .5 + Math.min(speed / 700, .5), age: 0 });
      if (wakes.length > 12) wakes.shift();
      lastWake = now;
    }
  }, { passive: true });
  document.addEventListener('pointerleave', () => { pointer.time = 0; pointer.strength = 0; });
  document.addEventListener('visibilitychange', sync);
  reduced.addEventListener('change', sync);
  window.addEventListener('resize', resize, { passive: true });
  resize(); sync();
})();
