/* En el Abismo — soft, drifting orange and violet mist. */
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
  if (!ctx) return;
  const reduced = matchMedia('(prefers-reduced-motion: reduce)');
  const small = matchMedia('(max-width: 800px)');
  const fine = matchMedia('(hover: hover) and (pointer: fine)');
  let width = 0, height = 0, raf = 0, last = 0, clock = 0, sprites, clouds = [];
  const pointer = { x: -9999, y: -9999, vx: 0, vy: 0, time: 0, strength: 0 };
  const wakes = [];
  let lastWake = 0;
  const clamp = (v, lo, hi) => Math.max(lo, Math.min(hi, v));

  // Bake the merged, soft-edged lobes once. Each frame moves the cached sprites.
  function makeSprite(rgb, index) {
    const texture = document.createElement('canvas');
    texture.width = 256;
    texture.height = 192;
    const c = texture.getContext('2d');
    const pixels = c.createImageData(texture.width, texture.height);
    const skew = index % 2 ? 1 : -1;
    for (let y = 0; y < texture.height; y++) {
      const ny = 2 * (y + .5) / texture.height - 1;
      for (let x = 0; x < texture.width; x++) {
        const nx = 2 * (x + .5) / texture.width - 1;
        const main = Math.exp(-((nx + .18) ** 2 * 5.8 + (ny - .07 * skew) ** 2 * 7.5));
        const lobe = Math.exp(-((nx - .30) ** 2 * 9.2 + (ny + .24 * skew) ** 2 * 12));
        const tip = Math.exp(-((nx - .04) ** 2 * 10 + (ny - .40 * skew) ** 2 * 13));
        const edge = Math.max(0, 1 - nx * nx - ny * ny);
        const density = 1 - Math.exp(-1.45 * (main + .83 * lobe + .47 * tip));
        const i = (y * texture.width + x) * 4;
        pixels.data[i] = rgb[0];
        pixels.data[i + 1] = rgb[1];
        pixels.data[i + 2] = rgb[2];
        const outline = clamp((density - .12) / .64, 0, 1);
        const opacity = outline * outline * (3 - 2 * outline);
        pixels.data[i + 3] = Math.round(226 * opacity * edge ** 1.1);
      }
    }
    c.putImageData(pixels, 0, 0);
    return texture;
  }
  function resize() {
    width = innerWidth; height = innerHeight;
    canvas.width = width;
    canvas.height = height;
    const centers = [
      [.13, .30], [.74, .28], [.41, .76], [.84, .85],
      [.17, .88], [.88, .51], [.53, .08], [.38, .48]
    ];
    clouds = centers.map(([x, y], i) => ({
      x, y,
      size: .89 + (i % 3) * .11,
      spin: (i % 2 ? 1 : -1) * (.105 + (i % 4) * .018),
      phase: i * 1.71, sprite: i % 4, alpha: .68 + (i % 3) * .08,
      ox: 0, oy: 0, vx: 0, vy: 0
    }));
    paint();
  }
  function geometry(cloud) {
    const orbit = clock * cloud.spin + cloud.phase;
    const swell = Math.sin(clock * .28 + cloud.phase);
    const w = Math.max(320, width * (small.matches ? 1.06 : .72)) * cloud.size * (1 + .15 * swell);
    const h = height * .70 * cloud.size * (1 - .18 * swell);
    const x = (cloud.x + Math.cos(orbit) * .13) * width;
    const y = (cloud.y + Math.sin(orbit) * .21) * height;
    return { x, y, w, h };
  }
  function evolve(dt) {
    clock += dt * 1.1;
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
      ctx.rotate(Math.sin(clock * .17 + cloud.phase) * .38);
      ctx.globalAlpha = cloud.alpha * (.89 + .11 * Math.sin(clock * .24 + cloud.phase));
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
    if (reduced.matches || document.hidden) return;
    if (!last) last = now;
    const dt = now - last;
    if (dt >= 1000 / 30) { evolve(Math.min(dt, 100) / 1000); last = now; paint(); }
    raf = requestAnimationFrame(frame);
  }
  function sync() {
    cancelAnimationFrame(raf); raf = 0; last = 0;
    if (reduced.matches) { ctx.clearRect(0, 0, width, height); return; }
    if (!sprites) {
      sprites = [[221, 109, 46], [136, 68, 204], [174, 86, 231], [198, 73, 32]].map(makeSprite);
    }
    paint();
    if (!document.hidden) raf = requestAnimationFrame(frame);
  }
  window.addEventListener('pointermove', e => {
    if (reduced.matches || document.hidden || !fine.matches || e.pointerType !== 'mouse') return;
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
