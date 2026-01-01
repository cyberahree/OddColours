(() => {
  "use strict";

  // ----------------------------------------------------------------------------
  // utility functions
  // ----------------------------------------------------------------------------

  const clamp = (value, max, min) => Math.max(max, Math.min(min, value));
  const lerp = (initialValue, targetValue, lerpTime) => initialValue + (targetValue - initialValue) * lerpTime;

  // https://github.com/cprosche/mulberry32
  function mulberry32(a) {
    return function() {
      var t = a += 0x6D2B79F5;
      t = Math.imul(t ^ t >>> 15, t | 1);
      t ^= t + Math.imul(t ^ t >>> 7, t | 61);
      return ((t ^ t >>> 14) >>> 0) / 4294967296;
    }
  }

  // read uint32 from byte array at offset
  function u32FromBytes(b, off) {
    return ((b[off] << 24) | (b[off + 1] << 16) | (b[off + 2] << 8) | b[off + 3]) >>> 0;
  }

  const buildHSLalpha = (h, s, l, a = 1) => `hsla(${((h % 360) + 360) % 360}, ${s}%, ${l}%, ${a})`;
  const lerpedRandomRange = (rnd, a, b) => lerp(a, b, rnd());

  // SHA-256 digest
  async function sha256Bytes(uint8) {
    const digest = await crypto.subtle.digest("SHA-256", uint8);
    return new Uint8Array(digest);
  }

  // convert bytes to hex string
  function bytesToHex(u8, max = 32) {
    let asHex = "";
    for (let i = 0; i < Math.min(u8.length, max); i++) asHex += u8[i].toString(16).padStart(2, "0");
    return asHex;
  }

  function pickPalette(hashBytes) {
    // loud palette derived from hash
    const palette = [];

    for (let i = 0; i < 8; i++) {
      // saturation range: 70 -> 100
      // lightness range: 40 -> 70
      const hue = Math.round((hashBytes[i] * 360) / 255);
      const saturation = 70 + (hashBytes[8 + i] % 31);
      const lightness = 40 + (hashBytes[16 + i] % 31);
  
      palette.push({ hue, saturation, lightness });
    }

    return palette;
  }

  // high-dpi canvas scaling
  function resizeSquareCanvas(canvas, canvasContext, renderSize) {
    const devicePixelRatio = Math.max(1, Math.floor(window.devicePixelRatio || 1));

    canvas.width = renderSize * devicePixelRatio;
    canvas.height = renderSize * devicePixelRatio;
  
    canvasContext.setTransform(devicePixelRatio, 0, 0, devicePixelRatio, 0, 0);
    canvasContext.imageSmoothingEnabled = true;
  }

  function pickModulesWeightedUnique(modules, randomGen, moduleCount) {
    const pool = modules.slice();
    const chosenModules = [];
  
    for (let k = 0; k < moduleCount && pool.length; k++) {
      let totalWeight = 0;
      for (const module of pool) totalWeight += module.weight ?? 1;
  
      let randWeight = randomGen() * totalWeight;
      let index = 0;
  
      for (; index < pool.length; index++) {
        randWeight -= pool[index].weight ?? 1;
        if (randWeight <= 0) break;
      }

      chosenModules.push(
        pool.splice(
          Math.min(index, pool.length - 1), 1
        )[0]
      );
    }
  
    return chosenModules;
  }

  // ----------------------------------------------------------------------------
  // module registry
  // ----------------------------------------------------------------------------
  // module structure: { name, stage: "background" |"midplane"| "foreground"| "overlay", weight, run(state) }
  const Modules = [];

  Modules.push({
    name: "metal_streaks",
    stage: "background",
    weight: 0,
    run(state) {
      console.log("Running module: metal_streaks");
    }
  })

  // ----------------------------------------------------------------------------
  // render handling
  // ----------------------------------------------------------------------------
  async function renderFileArt(canvas, file, options = {}) {
    const canvasContext = canvas.getContext("2d", { alpha: false });

    const renderSize = clamp(options.size ?? 1024, 256, 4096);
    const moduleCount = clamp(options.moduleCount ?? 5, 2, 16);

    resizeSquareCanvas(canvas, canvasContext, renderSize);

    const fileBuffer = await file.arrayBuffer();
    const fileBytes = new Uint8Array(fileBuffer);
  
    const fileHash = await sha256Bytes(fileBytes);
    const hashHex = bytesToHex(fileHash, 32);
    
    // XORing parts of the hash
    const rngSeed = (u32FromBytes(fileHash, 0) ^ u32FromBytes(fileHash, 4) ^ u32FromBytes(fileHash, 8)) >>> 0;
    const randomGen = mulberry32(rngSeed);
  
    const colorPalette = pickPalette(fileHash);

    // clear the canvas
    canvasContext.fillStyle = "#000";
    canvasContext.fillRect(0, 0, renderSize, renderSize);

    const state = {
      canvasContext,
      renderSize,
      fileBytes,
      fileHash,
      hashHex,
      randomGen,
      colorPalette,
      fileName: (file.name || "untitled")
    };

    // mandatory background
    Modules.find(m => m.name === "metal_streaks")?.run(state);

    // pick remaining modules
    const pool = Modules.filter(m => m.name !== "metal_streaks");
    const picked = pickModulesWeightedUnique(pool, randomGen, moduleCount);

    // stage ordering for clean layering
    const stageOrder = { "background": 0, "midplane": 1, "foreground": 2, "overlay": 3 };
    picked.sort((a, b) => (stageOrder[a.stage] ?? 9) - (stageOrder[b.stage] ?? 9));

    for (const module of picked) module.run(state);

    return {
      hashHex,
      picked: ["metal_streaks", ...picked.map(m => m.name)],
      toDataURL: () => canvas.toDataURL("image/png"),
    };
  }

  // expose
  window.OddColoursEffects = {
    Modules,
    renderFileArt,
  };
})();
