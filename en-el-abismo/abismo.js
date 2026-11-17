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
    const texture = document.createElement('canvas');
    const tw = 640, th = 400;
    texture.width = tw; texture.height = th;
    const c = texture.getContext('2d'), pixels = c.createImageData(tw, th);
    for (let y = 0; y < th; y++) for (let x = 0; x < tw; x++) {
      const nx = (x - tw / 2) / (tw / 2), ny = (y - th / 2) / (th / 2);
      const radius = Math.hypot(nx, ny), angle = Math.atan2(ny, nx);
      // Twist the noise coordinates into ragged curls, with clear fine ridges.
      const twist = angle + 3.8 * Math.exp(-radius * 1.65);
      const u = Math.cos(twist) * radius * 250 + 340;
      const v = Math.sin(twist) * radius * 250 + 230;
      const warp = noise(u / 70, v / 70, seed + 8);
      let value = 0, amp = .56, scale = 110;
      for (let k = 0; k < 5; k++) {
        value += noise((u + warp * 65) / scale, v / scale, seed + k) * amp;
        amp *= .48; scale *= .46;
      }
      const ridge = Math.pow(Math.max(0, 1 - Math.abs(value - .48) * 8), 2.4);
      const mask = Math.pow(Math.max(0, 1 - radius * radius), 1.45);
      const alpha = (.10 * value + .84 * ridge) * mask;
      const i = (y * tw + x) * 4;
      pixels.data[i] = rgb[0]; pixels.data[i + 1] = rgb[1];
      pixels.data[i + 2] = rgb[2]; pixels.data[i + 3] = Math.round(alpha * 235);
    }
    c.putImageData(pixels, 0, 0); return texture;
  }
  function resize() {
    width = innerWidth; height = innerHeight;
    const ratio = Math.min(devicePixelRatio || 1, small.matches ? 1.5 : 2);
    canvas.width = Math.round(width * ratio); canvas.height = Math.round(height * ratio);
    ctx.setTransform(ratio, 0, 0, ratio, 0, 0);
    clouds = Array.from({ length: small.matches ? 16 : 26 }, (_, i) => ({
      x: (i * .618034) % 1, y: (i * .381966 + .15) % 1,
      size: .55 + (i % 5) * .09, spin: (i % 2 ? 1 : -1) * (.12 + (i % 4) * .026),
      phase: i * 1.71, sprite: i % 4, alpha: .36 + (i % 3) * .06,
      ox: 0, oy: 0, vx: 0, vy: 0
    }));
    paint();
  }
  function geometry(cloud) {
    const orbit = clock * cloud.spin + cloud.phase;
    const w = Math.max(400, width * .65) * cloud.size * (1 + .13 * Math.sin(clock * .65 + cloud.phase));
    const h = Math.max(250, height * .48) * cloud.size * (1 + .16 * Math.cos(clock * .53 + cloud.phase));
    const x = cloud.x * width + Math.cos(orbit) * width * .105 + Math.sin(clock * .47 + cloud.phase) * 26;
    const y = cloud.y * height + Math.sin(orbit) * height * .12 + Math.cos(clock * .39 + cloud.phase) * 22;
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
      ctx.rotate(clock * cloud.spin * 1.8 + Math.sin(clock * .44 + cloud.phase) * .28);
      ctx.globalAlpha = cloud.alpha * (.82 + .18 * Math.sin(clock * .55 + cloud.phase));
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
    if (dt >= 1000 / 30) { evolve(Math.min(dt, 100) / 1000); last = now; paint(); }
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
