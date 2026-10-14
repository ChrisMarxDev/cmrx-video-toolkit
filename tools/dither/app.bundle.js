(() => {
  // toolkit/tools/dither/core.mjs
  function bayer(x, y, order) {
    let value = 0, denominator = 1;
    for (let n = order; n > 1; n /= 2) {
      const bx = x % 2, by = y % 2;
      value = value * 4 + 2 * ((bx + by) % 2) + by;
      denominator *= 4;
      x = Math.floor(x / 2);
      y = Math.floor(y / 2);
    }
    return (value + 0.5) / denominator;
  }
  function render({ width, height, cell, order, background, foreground, contrast, bias, invert, shape, phase, source }) {
    if (![width, height, cell].every(Number.isInteger) || width < 16 || height < 16 || width > 4096 || height > 4096 || width * height > 8e6 || cell < 1 || cell > 24) throw Error("Use dimensions 16\u20134096, at most 8 million pixels, and a cell size of 1\u201324.");
    if (![2, 4, 8].includes(order) || ![contrast, bias, phase].every(Number.isFinite)) throw Error("Invalid texture settings.");
    if (source && source.length !== width * height * 4) throw Error("Image dimensions do not match.");
    const rgb = (hex) => [1, 3, 5].map((i) => parseInt(hex.slice(i, i + 2), 16));
    const back = rgb(background), front = rgb(foreground), data = new Uint8ClampedArray(width * height * 4);
    const scale = Math.min(width, height);
    for (let cy = 0; cy < Math.ceil(height / cell); cy++) for (let cx = 0; cx < Math.ceil(width / cell); cx++) {
      const sx = Math.min(width - 1, Math.floor((cx + 0.5) * cell)), sy = Math.min(height - 1, Math.floor((cy + 0.5) * cell));
      const u = (sx - width / 2) / scale, v = (sy - height / 2) / scale;
      let density;
      if (source) {
        const i = (sy * width + sx) * 4;
        density = (source[i] * 0.2126 + source[i + 1] * 0.7152 + source[i + 2] * 0.0722) / 255;
      } else if (shape === "sphere") {
        const x = u * 2.6, y = v * 2.6, r = x * x + y * y;
        const lx = 0.6 * Math.cos(phase), ly = -0.65, lz = 0.8;
        density = r < 1 ? 0.12 + 0.83 * Math.max(0, (x * lx + y * ly + Math.sqrt(1 - r) * lz) / Math.hypot(lx, ly, lz)) : 0;
      } else if (shape === "ripple") density = 0.5 + 0.45 * Math.sin(Math.hypot(u, v) * 24 - phase * 2);
      else if (shape === "ramp") density = 0.5 + u * Math.cos(phase) + v * Math.sin(phase);
      else if (shape === "solid") density = 0.5;
      else density = 0.5 + 0.28 * Math.sin(u * 9 + Math.sin(v * 6 + phase) * 1.6 + phase);
      if (invert) density = 1 - density;
      density = Math.max(0, Math.min(1, (density - 0.5) * contrast + 0.5 + bias));
      const color = density >= bayer(cx, cy, order) ? front : back;
      for (let y = cy * cell; y < Math.min(height, (cy + 1) * cell); y++) for (let x = cx * cell; x < Math.min(width, (cx + 1) * cell); x++) {
        const i = (y * width + x) * 4;
        data[i] = color[0];
        data[i + 1] = color[1];
        data[i + 2] = color[2];
        data[i + 3] = source ? source[i + 3] : 255;
      }
    }
    return data;
  }

  // toolkit/tools/dither/app.js
  var cmrx = { colors: { white: "#FFFFFF", ink: "#1C2533", lavender: "#E1E7EF", lime: "#B8E4D5" } };
  var $ = (id) => document.getElementById(id);
  var canvas = $("canvas");
  var ctx = canvas.getContext("2d");
  var mode = "generate";
  var image = null;
  var selected = "lime";
  var colors = { background: cmrx.colors.ink, foreground: cmrx.colors.lavender };
  var timer;
  var loadId = 0;
  var valid = false;
  var names = ["white", "ink", "lavender", "lime"];
  function say(message) {
    $("status").textContent = message;
  }
  function buttons() {
    $("export").disabled = !valid;
    $("save-settings").disabled = !valid;
  }
  function updateColors() {
    for (const role of ["background", "foreground"]) {
      const el = $(role), color = colors[role];
      el.style.background = color;
      el.style.color = color === cmrx.colors.ink ? "#FFFFFF" : cmrx.colors.ink;
      el.querySelector("strong").textContent = color;
      el.setAttribute("aria-label", `${role} ${color}. Click to assign selected ${selected}. Drag to swap.`);
    }
    document.querySelectorAll(".swatch").forEach((el) => el.setAttribute("aria-pressed", String(el.dataset.name === selected)));
  }
  for (const name of names) {
    const el = document.createElement("button");
    el.className = "swatch";
    el.dataset.name = name;
    el.draggable = true;
    el.style.background = cmrx.colors[name];
    el.title = `${name} ${cmrx.colors[name]}`;
    el.setAttribute("aria-label", el.title);
    el.addEventListener("click", () => {
      selected = name;
      updateColors();
      say(`${name} selected. Click either color slot to apply.`);
    });
    el.addEventListener("dragstart", (e) => {
      e.dataTransfer.setData("text/plain", cmrx.colors[name]);
      e.dataTransfer.effectAllowed = "copy";
    });
    $("swatches").append(el);
  }
  for (const role of ["background", "foreground"]) {
    const el = $(role);
    el.draggable = true;
    el.addEventListener("click", () => {
      colors[role] = cmrx.colors[selected];
      updateColors();
      schedule();
    });
    el.addEventListener("dragstart", (e) => {
      e.dataTransfer.setData("text/plain", colors[role]);
      e.dataTransfer.setData("application/x-cmrx-slot", role);
    });
    el.addEventListener("dragover", (e) => {
      e.preventDefault();
      el.classList.add("dragover");
    });
    el.addEventListener("dragleave", () => el.classList.remove("dragover"));
    el.addEventListener("drop", (e) => {
      e.preventDefault();
      el.classList.remove("dragover");
      const value = e.dataTransfer.getData("text/plain"), from = e.dataTransfer.getData("application/x-cmrx-slot");
      if (!names.some((n) => cmrx.colors[n] === value)) return;
      if (from && from !== role && ["background", "foreground"].includes(from)) colors[from] = colors[role];
      colors[role] = value;
      updateColors();
      schedule();
    });
  }
  $("swap").onclick = () => {
    [colors.background, colors.foreground] = [colors.foreground, colors.background];
    updateColors();
    schedule();
  };
  function setMode(next) {
    mode = next;
    $("generate").setAttribute("aria-pressed", String(mode === "generate"));
    $("image-mode").setAttribute("aria-pressed", String(mode === "image"));
    $("pattern-controls").hidden = mode !== "generate";
    $("image-controls").hidden = mode !== "image";
    schedule();
  }
  $("generate").onclick = () => setMode("generate");
  $("image-mode").onclick = () => setMode("image");
  function settings() {
    return { width: Number($("width").value), height: Number($("height").value), cell: Number($("cell").value), order: Number($("order").value), background: colors.background, foreground: colors.foreground, contrast: Number($("contrast").value), bias: Number($("bias").value), phase: Number($("phase").value), invert: $("invert").checked, shape: $("shape").value };
  }
  function draw() {
    valid = false;
    buttons();
    if (mode === "image" && !image) {
      canvas.hidden = true;
      $("empty").hidden = false;
      say("Choose or drop an image.");
      return;
    }
    try {
      const options = settings(), { width, height } = options;
      if (![width, height].every(Number.isInteger) || width < 16 || height < 16 || width > 4096 || height > 4096 || width * height > 8e6) throw Error("Use dimensions 16\u20134096 and at most 8 million pixels.");
      if (mode === "image") {
        const temp = document.createElement("canvas");
        temp.width = width;
        temp.height = height;
        const c = temp.getContext("2d", { willReadFrequently: true });
        const ratio = ($("fit").value === "cover" ? Math.max : Math.min)(width / image.width, height / image.height), w = image.width * ratio, h = image.height * ratio;
        c.drawImage(image, (width - w) / 2, (height - h) / 2, w, h);
        options.source = c.getImageData(0, 0, width, height).data;
      }
      const pixels = render(options);
      canvas.width = width;
      canvas.height = height;
      ctx.putImageData(new ImageData(pixels, width, height), 0, 0);
      canvas.hidden = false;
      $("empty").hidden = true;
      $("dimensions").textContent = `${width} \xD7 ${height} / ${options.cell} px cells`;
      valid = true;
      buttons();
      say(colors.background === colors.foreground ? "Both slots use the same color. Assign a different color to reveal the pattern." : "Ready to export.");
    } catch (error) {
      say(error.message);
    }
  }
  function schedule() {
    clearTimeout(timer);
    valid = false;
    buttons();
    say("Updating\u2026");
    timer = setTimeout(draw, 100);
  }
  for (const id of ["width", "height", "cell", "order", "shape", "phase", "contrast", "bias", "invert", "fit"]) $(id).addEventListener("input", () => {
    for (const name of ["phase", "contrast", "bias"]) $(name + "-value").textContent = $(name).value;
    schedule();
  });
  $("actual").onchange = () => $("drop-area").classList.toggle("actual", $("actual").checked);
  async function load(file) {
    if (!file) return;
    const id = ++loadId;
    if (!/^image\/(png|jpeg|webp|gif|avif)$/.test(file.type)) {
      say("Choose a PNG, JPEG, WebP, GIF or AVIF image.");
      return;
    }
    if (file.size > 40 * 1024 * 1024) {
      say("Choose an image smaller than 40 MB.");
      return;
    }
    say("Reading image\u2026");
    try {
      const bitmap = await createImageBitmap(file);
      if (id !== loadId) {
        bitmap.close();
        return;
      }
      if (bitmap.width * bitmap.height > 64e6) {
        bitmap.close();
        throw Error("Source image is too large. Resize it below 64 million pixels.");
      }
      image?.close();
      image = bitmap;
      const scale = Math.min(1, 2048 / Math.max(image.width, image.height));
      $("width").value = Math.max(16, Math.round(image.width * scale));
      $("height").value = Math.max(16, Math.round(image.height * scale));
      $("filename").textContent = `${file.name} \xB7 ${image.width} \xD7 ${image.height}`;
      setMode("image");
    } catch (error) {
      say(`Could not read image: ${error.message}`);
    }
  }
  $("file").onchange = (e) => load(e.target.files[0]);
  for (const id of ["upload", "drop-area"]) {
    const el = $(id);
    el.addEventListener("dragover", (e) => {
      if ([...e.dataTransfer.types].includes("Files")) {
        e.preventDefault();
        el.classList.add("dragover");
      }
    });
    el.addEventListener("dragleave", () => el.classList.remove("dragover"));
    el.addEventListener("drop", (e) => {
      if (!e.dataTransfer.files.length) return;
      e.preventDefault();
      el.classList.remove("dragover");
      load(e.dataTransfer.files[0]);
    });
  }
  function download(blob, name) {
    const url = URL.createObjectURL(blob), a = document.createElement("a");
    a.href = url;
    a.download = name;
    a.click();
    setTimeout(() => URL.revokeObjectURL(url), 3e4);
  }
  $("export").onclick = () => {
    if (!valid) return;
    const name = `cmrx-dither-${canvas.width}x${canvas.height}.png`;
    canvas.toBlob((blob) => {
      if (blob) {
        download(blob, name);
        say("PNG exported.");
      } else say("Could not export PNG.");
    }, "image/png");
  };
  $("save-settings").onclick = () => {
    if (!valid) return;
    download(new Blob([JSON.stringify({ identity: "cmrx", version: cmrx.version, renderer: "cmrx-cpu-bayer", mode, fit: $("fit").value, ...settings() }, null, 2)], { type: "application/json" }), "cmrx-dither-settings.json");
    say("Settings exported. The source image is not included.");
  };
  updateColors();
  draw();
})();
