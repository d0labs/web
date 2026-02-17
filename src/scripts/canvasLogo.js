export function initCanvasLogo({ canvasId, ratio = 0.5, maxWidth = 1100 } = {}) {
  const canvas = document.getElementById(canvasId);
  if (!canvas) return;

  const ctx = canvas.getContext("2d");

  const DURATION = 8000;
  const textColor = "#000";
  const step = 6;
  let W;
  let H;
  let center;
  let fontMain;
  let fontAlt;
  let pD0;
  let pDAY;
  let particles;

  function easeInOut(t) {
    return t < 0.5 ? 2 * t * t : 1 - Math.pow(-2 * t + 2, 2) / 2;
  }
  function lerp(a, b, t) {
    return a + (b - a) * t;
  }

  function sampleText(text, font) {
    const off = document.createElement("canvas");
    off.width = W;
    off.height = H;
    const octx = off.getContext("2d");
    octx.clearRect(0, 0, W, H);
    octx.fillStyle = "#000";
    octx.font = font;
    octx.textAlign = "center";
    octx.textBaseline = "middle";
    octx.fillText(text, center.x, center.y);
    const data = octx.getImageData(0, 0, W, H).data;
    const pts = [];
    for (let y = 0; y < H; y += step) {
      for (let x = 0; x < W; x += step) {
        const i = (y * W + x) * 4 + 3;
        if (data[i] > 10) pts.push({ x, y });
      }
    }
    return pts;
  }

  function padPoints(pts, maxPts) {
    const out = pts.slice();
    while (out.length < maxPts) {
      out.push(out[Math.floor(Math.random() * pts.length)]);
    }
    return out;
  }

  function init() {
    const width = Math.min(window.innerWidth - 40, maxWidth);
    const height = Math.round(width * ratio);
    canvas.width = Math.max(320, Math.round(width * 2));
    canvas.height = Math.max(200, Math.round(height * 2));
    canvas.style.width = `${Math.max(320, width)}px`;
    canvas.style.height = `${Math.max(200, height)}px`;

    W = canvas.width;
    H = canvas.height;
    center = { x: W / 2, y: H / 2 + 10 };

    const mainSize = Math.round(W * 0.184);
    const altSize = Math.round(W * 0.1);
    fontMain = `300 ${mainSize}px 'Space Grotesk', Arial, sans-serif`;
    fontAlt = `300 ${altSize}px 'Space Grotesk', Arial, sans-serif`;

    const ptsD0 = sampleText("DØ", fontMain);
    const ptsDAY = sampleText("DAY ZERØ", fontAlt);

    const maxPts = Math.max(ptsD0.length, ptsDAY.length);
    pD0 = padPoints(ptsD0, maxPts);
    pDAY = padPoints(ptsDAY, maxPts);

    particles = Array.from({ length: maxPts }, (_, i) => ({
      x: pD0[i].x,
      y: pD0[i].y,
    }));
  }

  function drawParticles(alpha = 1) {
    ctx.fillStyle = textColor;
    ctx.globalAlpha = alpha;
    for (const p of particles) {
      ctx.fillRect(p.x, p.y, 2, 2);
    }
    ctx.globalAlpha = 1;
  }

  function drawText(text, font) {
    ctx.fillStyle = textColor;
    ctx.font = font;
    ctx.textAlign = "center";
    ctx.textBaseline = "middle";
    ctx.fillText(text, center.x, center.y);
  }

  function drawDayZer0() {
    ctx.fillStyle = textColor;
    ctx.textBaseline = "middle";
    const fontNormal = fontAlt;
    const fontBig = fontAlt.replace(/\b(\d+)px\b/, (_, n) =>
      `${Math.round(parseInt(n, 10) * 1.25)}px`
    );

    ctx.font = fontBig;
    const wD = ctx.measureText("D").width;
    const w0 = ctx.measureText("Ø").width;

    ctx.font = fontNormal;
    const wAYZER = ctx.measureText("AY ZER").width;

    const total = wD + wAYZER + w0;
    let x = center.x - total / 2;

    ctx.font = fontBig;
    ctx.textAlign = "left";
    ctx.fillText("D", x, center.y);
    x += wD;

    ctx.font = fontNormal;
    ctx.fillText("AY ZER", x, center.y);
    x += wAYZER;

    ctx.font = fontBig;
    ctx.fillText("Ø", x, center.y);
  }

  function transition(fromPts, toPts, t) {
    const e = easeInOut(t);
    for (let i = 0; i < particles.length; i++) {
      const a = fromPts[i];
      const b = toPts[i];
      particles[i].x = lerp(a.x, b.x, e);
      particles[i].y = lerp(a.y, b.y, e);
    }
  }

  function smashFromD0ToDAY(t) {
    const e = easeInOut(t);
    const expand = 1 + 0.08 * Math.sin(Math.PI * e);
    for (let i = 0; i < particles.length; i++) {
      const a = pD0[i];
      const b = pDAY[i];
      const ex = center.x + (a.x - center.x) * expand;
      const ey = center.y + (a.y - center.y) * expand;
      particles[i].x = lerp(ex, b.x, e);
      particles[i].y = lerp(ey, b.y, e);
    }
  }

  function smashTo(pts, t) {
    const e = easeInOut(t);
    const expand = 1 + 0.08 * Math.sin(Math.PI * e);
    for (let i = 0; i < particles.length; i++) {
      const a = pDAY[i];
      const b = pts[i];
      const ex = center.x + (a.x - center.x) * expand;
      const ey = center.y + (a.y - center.y) * expand;
      particles[i].x = lerp(ex, b.x, e);
      particles[i].y = lerp(ey, b.y, e);
    }
  }

  function render(time) {
    const t = time % DURATION;
    ctx.clearRect(0, 0, W, H);

    if (t < 1000) {
      transition(pD0, pD0, t / 1000);
      drawText("DØ", fontMain);
    } else if (t < 3000) {
      smashFromD0ToDAY((t - 1000) / 2000);
      drawParticles(1);
    } else if (t < 4500) {
      transition(pDAY, pDAY, (t - 3000) / 1500);
      drawDayZer0();
    } else if (t < 6500) {
      smashTo(pD0, (t - 4500) / 2000);
      drawParticles(1);
    } else {
      transition(pD0, pD0, (t - 6500) / 1500);
      drawText("DØ", fontMain);
    }

    requestAnimationFrame(render);
  }

  function start() {
    init();
    requestAnimationFrame(render);
  }

  if (document.fonts?.ready) {
    document.fonts.ready.then(start).catch(start);
  } else {
    start();
  }

  window.addEventListener("resize", () => {
    init();
  });
}
