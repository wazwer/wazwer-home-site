window.addEventListener("load", () => {
  const img = document.getElementById("lava-test-img");
  const out = document.getElementById("wave-canvas");
  const outCtx = out.getContext("2d");

  // Display at 4K (internal buffer size)
  const W = 2553, H = 2392;
  out.width = W;
  out.height = H;

  // Compute at lower res
  const scale = 0.15;
  const w = Math.round(W * scale);
  const h = Math.round(H * scale);

  const work = document.createElement("canvas");
  work.width = w;
  work.height = h;
  const ctx = work.getContext("2d");

  const amplitude = 1;
  const wavelength = 60;
  const speed = 1;
  const sliceH = 2;

  let t0 = performance.now();

  function start() {
    // sanity check
    if (!img.naturalWidth) {
      console.warn("Image has no naturalWidth yet.");
      return;
    }

    function frame(now) {
      const t = (now - t0) / 1000;
      ctx.clearRect(0, 0, w, h);

      for (let y = 0; y < h; y += sliceH) {
        const phase = (2 * Math.PI * y) / wavelength;
        const xOff = Math.sin(phase + t * speed) * amplitude;

        const sy = (y / h) * img.height;
        const sh = (sliceH / h) * img.height;

        ctx.drawImage(img, 0, sy, img.width, sh, xOff, y, w, sliceH);
      }

      outCtx.clearRect(0, 0, W, H);
      outCtx.imageSmoothingEnabled = true;
      outCtx.drawImage(work, 0, 0, W, H);

      requestAnimationFrame(frame);
    }

    requestAnimationFrame(frame);
  }

  // ✅ Key change: if already loaded, start immediately
  if (img.complete && img.naturalWidth > 0) {
    start();
  } else {
    img.addEventListener("load", start, { once: true });
  }
});
