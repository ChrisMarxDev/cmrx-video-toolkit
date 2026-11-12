// Original local artwork. Ordered Bayer 4×4, fixed local origin, one CSS-pixel cell.
// Deterministic ordered dithering for app decoration. No media pixels or exported video are modified.
const bayer = [0, 8, 2, 10, 12, 4, 14, 6, 3, 11, 1, 9, 15, 7, 13, 5];
const lavender = [223, 214, 244],
  lime = [213, 255, 69];
const clamp = (v) => Math.max(0, Math.min(1, v));
function sphere(x, y, cx, cy, radius) {
  const nx = (x - cx) / radius,
    ny = (y - cy) / radius;
  const r = nx * nx + ny * ny;
  if (r >= 1) return 0;
  const z = Math.sqrt(1 - r);
  return clamp(0.08 + 0.88 * Math.max(0, -nx * 0.48 - ny * 0.56 + z * 0.67));
}
function draw(canvas) {
  const { width, height } = canvas.getBoundingClientRect();
  if (!width || !height) return;
  // Draw at CSS resolution, then repeat exact cells at the device pixel scale.
  const w = Math.ceil(width),
    h = Math.ceil(height);
  const dpr = Math.min(3, window.devicePixelRatio || 1);
  canvas.width = Math.round(w * dpr);
  canvas.height = Math.round(h * dpr);
  const raster = document.createElement("canvas");
  raster.width = w;
  raster.height = h;
  const ctx = raster.getContext("2d");
  const pixels = ctx.createImageData(w, h);
  const gradient = canvas.dataset.dither === "gradient";
  for (let y = 0; y < h; y++)
    for (let x = 0; x < w; x++) {
      const u = (x + 0.5) / w,
        v = (y + 0.5) / h;
      let density,
        color = lavender;
      if (canvas.dataset.dither === "portal") {
        // Sculpted orbital field: fixed Bayer cells, composited motion in CSS.
        const nx = (u - 0.5) * 2.5,
          ny = (v - 0.5) * 2.9;
        const angle = Math.atan2(ny, nx),
          radius = Math.hypot(nx, ny);
        const ring = Math.exp(-Math.pow((radius - 0.72) / 0.19, 2));
        const light = 0.25 + 0.7 * Math.max(0, Math.cos(angle + 2.15));
        const horizon = Math.exp(-Math.pow((ny + 0.03) / 0.025, 2)) * 0.24;
        const core = sphere(u * 320, v * 190, 160, 95, 30);
        density = Math.max(
          ring * light,
          horizon * (1 - Math.min(1, Math.abs(nx))),
          core * 0.85,
        );
      } else if (gradient) {
        // A broad folded light field, tapering into untouched chrome.
        density = clamp(
          (0.5 + 0.3 * Math.sin(u * 8 + v * 4)) * (1 - v) ** 2 * 0.5,
        );
      } else {
        const scale = Math.min(w / 320, h / 190);
        const px = (x - w / 2) / scale + 160,
          py = (y - h / 2) / scale + 95;
        const a = sphere(px, py, 130, 93, 78);
        const b = sphere(px, py, 240, 135, 35);
        // Offset film-frame contour, rendered through the same threshold field.
        const frame = px > 33 && px < 288 && py > 24 && py < 169;
        const edge =
          frame && (px < 34.5 || px > 286.5 || py < 25.5 || py > 167.5);
        density = Math.max(a, b, edge ? 0.24 : 0);
        if (b > a) color = lime;
      }
      const threshold = (bayer[(y % 4) * 4 + (x % 4)] + 0.5) / 16;
      if (density < threshold) continue;
      const i = (y * w + x) * 4;
      pixels.data[i] = color[0];
      pixels.data[i + 1] = color[1];
      pixels.data[i + 2] = color[2];
      pixels.data[i + 3] = 255;
    }
  ctx.putImageData(pixels, 0, 0);
  const out = canvas.getContext("2d");
  out.imageSmoothingEnabled = false;
  out.drawImage(raster, 0, 0, canvas.width, canvas.height);
}
// Original GPU field implementation; references: Paper Shaders and dithercn.
// No upstream code or runtime dependency. Keep the threshold grid stationary.
function animate(canvas) {
  const gl = canvas.getContext("webgl", {
    alpha: true,
    premultipliedAlpha: false,
    antialias: false,
  });
  if (!gl) return null;
  const shader = (type, source) => {
    const item = gl.createShader(type);
    gl.shaderSource(item, source);
    gl.compileShader(item);
    if (!gl.getShaderParameter(item, gl.COMPILE_STATUS))
      throw Error(gl.getShaderInfoLog(item));
    return item;
  };
  let program, vertex, fragment, buffer;
  try {
    vertex = shader(
      gl.VERTEX_SHADER,
      `attribute vec2 p; void main(){gl_Position=vec4(p,0.,1.);}`,
    );
    fragment = shader(
      gl.FRAGMENT_SHADER,
      `
      precision mediump float;
      uniform vec2 resolution;
      uniform float time;
      uniform float mode;
      float threshold(vec2 p) {
        vec2 a=mod(floor(p),2.);
        vec2 b=mod(floor(p/2.),2.);
        float lo=2.*a.x+3.*a.y-4.*a.x*a.y;
        float hi=2.*b.x+3.*b.y-4.*b.x*b.y;
        return (4.*lo+hi+.5)/16.;
      }
      float ball(vec2 p,vec2 center,float radius,vec3 light){
        vec2 q=(p-center)/radius;
        float r=dot(q,q);
        if(r>=1.)return 0.;
        return .07+.85*max(0.,dot(vec3(q,sqrt(1.-r)),normalize(light)));
      }
      void main(){
        vec2 p=(gl_FragCoord.xy-.5*resolution)/resolution.y;
        float t=time*.18;
        float waves=sin(p.x*3.2+t+sin(p.y*3.-t)*.8);
        float ribbon=exp(-pow((p.y-.17*waves)/.16,2.));
        float a=ball(p,vec2(-.34+.07*sin(t),.04),.36,vec3(-.6,.6,.7));
        float b=ball(p,vec2(.47+.09*cos(t*.8),-.12+.07*sin(t)),.18,vec3(-.4,.7,.8));
        float density=max(a,b);
        if(mode<.5)density=max(density,ribbon*(.13+.16*(.5+.5*sin(p.x*2.-t))));
        vec3 ink=mix(vec3(.875,.839,.957),vec3(.835,1.,.271),step(a,b)*step(.02,b));
        float edge=1.-smoothstep(.33,.51,abs(p.y));
        float alpha=step(threshold(gl_FragCoord.xy),density*edge);
        gl_FragColor=vec4(ink,alpha);
      }`,
    );
    program = gl.createProgram();
    gl.attachShader(program, vertex);
    gl.attachShader(program, fragment);
    gl.linkProgram(program);
    if (!gl.getProgramParameter(program, gl.LINK_STATUS))
      throw Error("Dither shader unavailable");
    gl.useProgram(program);
    buffer = gl.createBuffer();
    gl.bindBuffer(gl.ARRAY_BUFFER, buffer);
    gl.bufferData(
      gl.ARRAY_BUFFER,
      new Float32Array([-1, -1, 1, -1, -1, 1, -1, 1, 1, -1, 1, 1]),
      gl.STATIC_DRAW,
    );
    const position = gl.getAttribLocation(program, "p");
    gl.enableVertexAttribArray(position);
    gl.vertexAttribPointer(position, 2, gl.FLOAT, false, 0, 0);
  } catch {
    gl.getExtension("WEBGL_lose_context")?.loseContext();
    return null;
  }
  const resolution = gl.getUniformLocation(program, "resolution"),
    clock = gl.getUniformLocation(program, "time");
  gl.uniform1f(
    gl.getUniformLocation(program, "mode"),
    canvas.dataset.dither === "portal" ? 0 : 1,
  );
  const reduced = matchMedia("(prefers-reduced-motion: reduce)");
  let frame = 0,
    visible = false,
    last = -Infinity,
    elapsed = 0,
    previous = 0,
    disposed = false,
    lost = false;
  function render(now = 0) {
    frame = 0;
    if (disposed || lost || !visible || document.hidden) return;
    if (now - last >= 1000 / 24 || reduced.matches) {
      const rect = canvas.getBoundingClientRect();
      // One raster pixel per CSS pixel: crisp fixed cells, bounded GPU work on Retina.
      const width = Math.ceil(rect.width),
        height = Math.ceil(rect.height);
      if (width && height) {
        if (canvas.width !== width || canvas.height !== height) {
          canvas.width = width;
          canvas.height = height;
        }
        if (previous) elapsed += Math.min(100, now - previous) / 1000;
        gl.viewport(0, 0, width, height);
        gl.uniform2f(resolution, width, height);
        gl.uniform1f(clock, reduced.matches ? 0 : elapsed);
        gl.drawArrays(gl.TRIANGLES, 0, 6);
      }
      previous = now;
      last = now;
    }
    if (!reduced.matches) frame = requestAnimationFrame(render);
  }
  function resume() {
    cancelAnimationFrame(frame);
    previous = 0;
    last = -Infinity;
    render(performance.now());
  }
  const intersection = new IntersectionObserver((entries) => {
    visible = entries[0].isIntersecting;
    resume();
  });
  intersection.observe(canvas);
  const resize = new ResizeObserver(resume);
  resize.observe(canvas);
  const onLost = (event) => {
    event.preventDefault();
    lost = true;
    cancelAnimationFrame(frame);
  };
  // Restore with the same static artwork if the GPU is reset; no app failure.
  const onRestored = () => {
    cleanup();
    const replacement = canvas.cloneNode();
    canvas.replaceWith(replacement);
    draw(replacement);
  };
  canvas.addEventListener("webglcontextlost", onLost);
  canvas.addEventListener("webglcontextrestored", onRestored);
  document.addEventListener("visibilitychange", resume);
  reduced.addEventListener("change", resume);
  function cleanup() {
    disposed = true;
    cancelAnimationFrame(frame);
    intersection.disconnect();
    resize.disconnect();
    document.removeEventListener("visibilitychange", resume);
    reduced.removeEventListener("change", resume);
    canvas.removeEventListener("webglcontextlost", onLost);
    canvas.removeEventListener("webglcontextrestored", onRestored);
    gl.deleteBuffer(buffer);
    gl.deleteProgram(program);
    gl.deleteShader(vertex);
    gl.deleteShader(fragment);
  }
  canvas.dataset.ditherRenderer = "webgl";
  return cleanup;
}
export function mountDitherArt(root = document) {
  const cleanups = [];
  const observer = new ResizeObserver((entries) => {
    for (const entry of entries) draw(entry.target);
  });
  for (let canvas of root.querySelectorAll("canvas[data-dither]")) {
    if (canvas.dataset.dither !== "gradient") {
      const cleanup = animate(canvas);
      if (cleanup) {
        cleanups.push(cleanup);
        continue;
      }
      // A canvas cannot switch context type; replace before requesting 2D fallback.
      const replacement = canvas.cloneNode();
      canvas.replaceWith(replacement);
      canvas = replacement;
    }
    canvas.dataset.ditherRenderer = "static";
    observer.observe(canvas);
  }
  return () => {
    observer.disconnect();
    for (const cleanup of cleanups) cleanup();
  };
}
