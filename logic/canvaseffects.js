(() => {
  "use strict";

  // ----------------------------------------------------------------------------
  // utility functions
  // ----------------------------------------------------------------------------

  const clamp = (value, min, max) => Math.max(min, Math.min(max, value));
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

  function generatePalette(hashBytes) {
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

  function pickPaletteColour(pal, rnd, a = 1, lJitter = 0) {
    const selection = pal[
      (rnd() * pal.length) | 0
    ];

    return buildHSLalpha(
      selection.hue,
      selection.saturation,
      clamp(selection.lightness + lJitter, 10, 95),
      a
    );
  }

  function getScratch(canvas, key, w, h) {
    const store = (canvas.__oddScratch ||= {});
    const cvs = (store[key] ||= document.createElement("canvas"));
  
    if (cvs.width !== w) cvs.width = w;
    if (cvs.height !== h) cvs.height = h;
  
    return cvs;
  }

  // ----------------------------------------------------------------------------
  // module registry
  // ----------------------------------------------------------------------------
  // module structure: { name, stage: "background" |"midplane"| "foreground"| "overlay", weight, run(state) }
  const Modules = [];

  // (mandatory) background: metallic streaks
  Modules.push({
    name: "metal_streaks",
    stage: "background",
    weight: 0, // mandatory
    run(state) {
      const { canvasContext, renderSize, randomGen, colourPalette } = state;

      canvasContext.save();

      // base gradient
      const gradient = canvasContext.createLinearGradient(0, 0, renderSize, renderSize);
      const firstPaletteColour = colourPalette[0];
      const secondPaletteColour = colourPalette[3];
      gradient.addColorStop(0, buildHSLalpha(firstPaletteColour.hue, firstPaletteColour.saturation, 8, 1));
      gradient.addColorStop(1, buildHSLalpha(secondPaletteColour.hue, secondPaletteColour.saturation, 14, 1));

      canvasContext.fillStyle = gradient;
      canvasContext.fillRect(0, 0, renderSize, renderSize);

      // rotate for diagonal streaks
      const rotationRadians = lerpedRandomRange(randomGen, -0.9, -0.15);
      canvasContext.translate(renderSize / 2, renderSize / 2);
      canvasContext.rotate(rotationRadians);
      canvasContext.translate(-renderSize / 2, -renderSize / 2);

      // bright streaks
      canvasContext.globalCompositeOperation = "screen";

      for (let i = 0; i < 320; i++) {
        const streakX = lerpedRandomRange(randomGen, -renderSize * 0.35, renderSize * 1.35);
        const streakWidth = lerpedRandomRange(randomGen, 0.5, 2.6);
        const streakOpacity = lerpedRandomRange(randomGen, 0.03, 0.18);
        const streakPalette = colourPalette[(randomGen() * colourPalette.length) | 0];

        canvasContext.fillStyle = buildHSLalpha(streakPalette.hue, streakPalette.saturation, 55 + randomGen() * 30, streakOpacity);
        canvasContext.fillRect(streakX, -renderSize * 0.25, streakWidth, renderSize * 1.5);
      }

      // glitter specks
      canvasContext.globalCompositeOperation = "lighter";
      const speckCount = Math.floor(renderSize * renderSize * 0.002);
      for (let i = 0; i < speckCount; i++) {
        const speckX = (randomGen() * renderSize) | 0;
        const speckY = (randomGen() * renderSize) | 0;
        const speckRadius = (randomGen() ** 3) * 2.8 + 0.2;
        canvasContext.fillStyle = pickPaletteColour(colourPalette, randomGen, 0.10 + randomGen() * 0.25, 25 + randomGen() * 15);
        canvasContext.beginPath();
        canvasContext.arc(speckX, speckY, speckRadius, 0, Math.PI * 2);
        canvasContext.fill();
      }

      canvasContext.restore();
      canvasContext.globalCompositeOperation = "source-over";
      canvasContext.globalAlpha = 1;
    }
  });

  // background: chromatic fog
  Modules.push({
    name: "chromatic_fog",
    stage: "background",
    weight: 1.2,
    run(state) {
      const { canvasContext, renderSize, randomGen, colourPalette } = state;

      canvasContext.save();
      canvasContext.globalCompositeOperation = "screen";

      const blobCount = 10 + ((randomGen() * 10) | 0);
      for (let i = 0; i < blobCount; i++) {
        const centreX = randomGen() * renderSize;
        const centreY = randomGen() * renderSize;
        const innerRadius = lerpedRandomRange(randomGen, renderSize * 0.08, renderSize * 0.35);
        const outerRadius = innerRadius * lerpedRandomRange(randomGen, 1.4, 2.2);

        const blobPalette = colourPalette[(randomGen() * colourPalette.length) | 0];
        const blobGradient = canvasContext.createRadialGradient(centreX, centreY, innerRadius * 0.2, centreX, centreY, outerRadius);
        blobGradient.addColorStop(0, buildHSLalpha(blobPalette.hue, blobPalette.saturation, 65 + randomGen() * 20, 0.20));
        blobGradient.addColorStop(1, buildHSLalpha(blobPalette.hue, blobPalette.saturation, 45 + randomGen() * 10, 0.00));

        canvasContext.fillStyle = blobGradient;
        canvasContext.fillRect(0, 0, renderSize, renderSize);
      }

      // add a little contrast punch
      canvasContext.globalCompositeOperation = "overlay";
      canvasContext.globalAlpha = 0.25;
      canvasContext.fillStyle = "rgba(255,255,255,1)";
      canvasContext.fillRect(0, 0, renderSize, renderSize);

      canvasContext.restore();
      canvasContext.globalCompositeOperation = "source-over";
      canvasContext.globalAlpha = 1;
    }
  });

  // midplane: acid moiré (sharp interference lines; this is what i see when im VERY high)
  Modules.push({
    name: "acid_moire",
    stage: "midplane",
    weight: 1.3,
    run(state) {
      const { canvasContext, renderSize, randomGen, colourPalette } = state;

      canvasContext.save();
      canvasContext.lineWidth = 1;
      canvasContext.globalCompositeOperation = "difference";
      canvasContext.globalAlpha = 0.55;

      // two sets of lines at slightly different angles
      const baseAngle = lerpedRandomRange(randomGen, -0.5, 0.5);
      const offsetAngle = baseAngle + lerpedRandomRange(randomGen, 0.03, 0.11);

      function drawLineSet(angle, spacing, strokeColour) {
        canvasContext.save();
        canvasContext.translate(renderSize / 2, renderSize / 2);
        canvasContext.rotate(angle);
        canvasContext.translate(-renderSize / 2, -renderSize / 2);

        canvasContext.strokeStyle = strokeColour;
        for (let y = -renderSize; y <= renderSize * 2; y += spacing) {
          canvasContext.beginPath();
          canvasContext.moveTo(-renderSize, y);
          canvasContext.lineTo(renderSize * 2, y);
          canvasContext.stroke();
        }
        canvasContext.restore();
      }

      const firstSpacing = lerpedRandomRange(randomGen, 6, 16);
      const secondSpacing = firstSpacing * lerpedRandomRange(randomGen, 0.85, 1.15);

      drawLineSet(baseAngle, firstSpacing, pickPaletteColour(colourPalette, randomGen, 0.35, 25));
      drawLineSet(offsetAngle, secondSpacing, pickPaletteColour(colourPalette, randomGen, 0.35, 25));

      // brighten edges a bit
      canvasContext.globalCompositeOperation = "screen";
      canvasContext.globalAlpha = 0.18;
      canvasContext.fillStyle = "rgba(255,255,255,1)";
      canvasContext.fillRect(0, 0, renderSize, renderSize);

      canvasContext.restore();
      canvasContext.globalCompositeOperation = "source-over";
      canvasContext.globalAlpha = 1;
    }
  });

  // midplane: prism rays
  Modules.push({
    name: "prism_rays",
    stage: "midplane",
    weight: 1.2,
    run(state) {
      const { canvasContext, renderSize, randomGen, colourPalette } = state;

      canvasContext.save();
      canvasContext.globalCompositeOperation = "screen";
      canvasContext.globalAlpha = 0.55;

      const originX = lerpedRandomRange(randomGen, renderSize * 0.2, renderSize * 0.8);
      const originY = lerpedRandomRange(randomGen, renderSize * 0.2, renderSize * 0.8);
      const rayCount = 16 + ((randomGen() * 26) | 0);
      const baseAngle = randomGen() * Math.PI * 2;

      for (let i = 0; i < rayCount; i++) {
        const startAngle = baseAngle + (i / rayCount) * Math.PI * 2;
        const endAngle = startAngle + lerpedRandomRange(randomGen, 0.04, 0.18);
        const rayLength = lerpedRandomRange(randomGen, renderSize * 0.55, renderSize * 1.2);

        const rayColour = pickPaletteColour(colourPalette, randomGen, 0.22 + randomGen() * 0.18, 25 + randomGen() * 15);
        canvasContext.fillStyle = rayColour;

        canvasContext.beginPath();
        canvasContext.moveTo(originX, originY);
        canvasContext.lineTo(originX + Math.cos(startAngle) * rayLength, originY + Math.sin(startAngle) * rayLength);
        canvasContext.lineTo(originX + Math.cos(endAngle) * rayLength, originY + Math.sin(endAngle) * rayLength);
        canvasContext.closePath();
        canvasContext.fill();
      }

      canvasContext.restore();
      canvasContext.globalCompositeOperation = "source-over";
      canvasContext.globalAlpha = 1;
    }
  });

  // midplane: barcode band
  Modules.push({
    name: "barcode_band",
    stage: "midplane",
    weight: 1.0,
    run(state) {
      const { canvasContext, renderSize, randomGen, fileBytes, colourPalette } = state;

      canvasContext.save();
      canvasContext.globalCompositeOperation = "overlay";
      canvasContext.globalAlpha = 0.8;

      const bandY = lerpedRandomRange(randomGen, renderSize * 0.15, renderSize * 0.75);
      const bandHeight = lerpedRandomRange(randomGen, renderSize * 0.08, renderSize * 0.18);

      canvasContext.fillStyle = "rgba(255,255,255,0.10)";
      canvasContext.fillRect(0, bandY, renderSize, bandHeight);

      canvasContext.globalCompositeOperation = "difference";
      let bandX = 0;
      const byteStep = Math.max(1, (fileBytes.length / 600) | 0);
      let byteIndex = (randomGen() * fileBytes.length) | 0;

      while (bandX < renderSize) {
        const byteValue = fileBytes[byteIndex % fileBytes.length] || 0;
        byteIndex += byteStep;

        const barWidth = 1 + (byteValue % 12);
        const barPalette = colourPalette[byteValue % colourPalette.length];

        canvasContext.fillStyle = buildHSLalpha(barPalette.hue, barPalette.saturation, 65 + (byteValue % 20), 0.35);
        canvasContext.fillRect(bandX, bandY, barWidth, bandHeight);

        bandX += barWidth + (byteValue % 3);
      }

      canvasContext.restore();
      canvasContext.globalCompositeOperation = "source-over";
      canvasContext.globalAlpha = 1;
    }
  });

  // midplane: hue-cycled bezier ribbons
  Modules.push({
    name: "hue_cycle_ribbons",
    stage: "midplane",
    weight: 0.22,
    run(state) {
      const { canvasContext, renderSize, randomGen, colourPalette } = state;

      canvasContext.save();
      canvasContext.globalCompositeOperation = randomGen() < 0.5 ? "lighter" : "screen";
      canvasContext.lineCap = "round";
      canvasContext.lineJoin = "round";

      const ribbonCount = 6 + ((randomGen() * 10) | 0);

      for (let ribbonIndex = 0; ribbonIndex < ribbonCount; ribbonIndex++) {
        const ribbonPalette = colourPalette[(randomGen() * colourPalette.length) | 0];
        canvasContext.strokeStyle = buildHSLalpha(ribbonPalette.hue + ribbonIndex * 25, 100, 60, 0.18 + randomGen() * 0.22);
        canvasContext.lineWidth = lerpedRandomRange(randomGen, renderSize * 0.006, renderSize * 0.03);

        const startX = lerpedRandomRange(randomGen, -renderSize * 0.1, renderSize * 1.1);
        const startY = lerpedRandomRange(randomGen, 0, renderSize);
        const endX = lerpedRandomRange(randomGen, -renderSize * 0.1, renderSize * 1.1);
        const endY = lerpedRandomRange(randomGen, 0, renderSize);

        const controlX1 = lerpedRandomRange(randomGen, 0, renderSize);
        const controlY1 = lerpedRandomRange(randomGen, 0, renderSize);
        const controlX2 = lerpedRandomRange(randomGen, 0, renderSize);
        const controlY2 = lerpedRandomRange(randomGen, 0, renderSize);

        canvasContext.beginPath();
        canvasContext.moveTo(startX, startY);
        canvasContext.bezierCurveTo(controlX1, controlY1, controlX2, controlY2, endX, endY);
        canvasContext.stroke();

        if (randomGen() < 0.55) {
          canvasContext.globalAlpha = 0.35;
          canvasContext.lineWidth *= 0.35;
          canvasContext.strokeStyle = "rgba(255,255,255,0.9)";
          canvasContext.stroke();
          canvasContext.globalAlpha = 1;
        }
      }

      canvasContext.restore();
      canvasContext.globalCompositeOperation = "source-over";
      canvasContext.globalAlpha = 1;
    }
  });

  // foreground: neon shards
  Modules.push({
    name: "neon_shards",
    stage: "foreground",
    weight: 1.3,
    run(state) {
      const { canvasContext, renderSize, randomGen, colourPalette } = state;

      canvasContext.save();
      const blendModes = ["screen", "overlay", "lighter", "difference"];
      canvasContext.globalCompositeOperation = blendModes[(randomGen() * blendModes.length) | 0];

      const shardCount = 140 + ((randomGen() * 280) | 0);

      for (let i = 0; i < shardCount; i++) {
        const shardX = randomGen() * renderSize;
        const shardY = randomGen() * renderSize;

        const shardSize = (randomGen() ** 2) * renderSize * 0.12 + renderSize * 0.006;
        const shardRotation = randomGen() * Math.PI * 2;

        const angleA = shardRotation;
        const angleB = shardRotation + lerpedRandomRange(randomGen, 0.4, 1.4);
        const angleC = shardRotation + lerpedRandomRange(randomGen, 1.6, 2.8);

        canvasContext.fillStyle = pickPaletteColour(colourPalette, randomGen, 0.08 + randomGen() * 0.22, 30 + randomGen() * 20);

        canvasContext.beginPath();
        canvasContext.moveTo(shardX + Math.cos(angleA) * shardSize, shardY + Math.sin(angleA) * shardSize);
        canvasContext.lineTo(
          shardX + Math.cos(angleB) * shardSize * lerpedRandomRange(randomGen, 0.6, 1.6),
          shardY + Math.sin(angleB) * shardSize * lerpedRandomRange(randomGen, 0.6, 1.6)
        );
        canvasContext.lineTo(
          shardX + Math.cos(angleC) * shardSize * lerpedRandomRange(randomGen, 0.6, 1.6),
          shardY + Math.sin(angleC) * shardSize * lerpedRandomRange(randomGen, 0.6, 1.6)
        );
        canvasContext.closePath();
        canvasContext.fill();
      }

      // crisp highlight
      canvasContext.globalCompositeOperation = "screen";
      canvasContext.globalAlpha = 0.12;
      canvasContext.fillStyle = "rgba(255,255,255,1)";
      canvasContext.fillRect(0, 0, renderSize, renderSize);

      canvasContext.restore();
      canvasContext.globalCompositeOperation = "source-over";
      canvasContext.globalAlpha = 1;
    }
  });

  // foreground: glitch slices
  Modules.push({
    name: "glitch_slices",
    stage: "foreground",
    weight: 1.3,
    run(state) {
      const { canvasContext, renderSize, randomGen } = state;

      const sourceCanvas = getScratch(canvasContext.canvas, "glitch_src", renderSize, renderSize);
      const sourceContext = sourceCanvas.getContext("2d", { alpha: false });
      sourceContext.drawImage(canvasContext.canvas, 0, 0, renderSize, renderSize);

      canvasContext.save();
      canvasContext.globalCompositeOperation = "source-over";

      const sliceCount = 18 + ((randomGen() * 40) | 0);

      for (let i = 0; i < sliceCount; i++) {
        const sliceY = (randomGen() * renderSize) | 0;
        const sliceHeight = Math.max(2, (lerpedRandomRange(randomGen, renderSize * 0.006, renderSize * 0.05) | 0));
        const sliceOffsetX = (lerpedRandomRange(randomGen, -renderSize * 0.18, renderSize * 0.18) | 0);

        canvasContext.drawImage(sourceCanvas, 0, sliceY, renderSize, sliceHeight, sliceOffsetX, sliceY, renderSize, sliceHeight);

        if (randomGen() < 0.25) {
          canvasContext.globalAlpha = 0.08 + randomGen() * 0.14;
          canvasContext.fillStyle = "rgba(255,255,255,1)";
          canvasContext.fillRect(0, sliceY, renderSize, 1);
          canvasContext.globalAlpha = 1;
        }
      }

      const blockCount = 12 + ((randomGen() * 20) | 0);
      canvasContext.globalCompositeOperation = "screen";
      for (let i = 0; i < blockCount; i++) {
        const blockX = (randomGen() * renderSize) | 0;
        const blockY = (randomGen() * renderSize) | 0;
        const blockWidth = (lerpedRandomRange(randomGen, renderSize * 0.04, renderSize * 0.18) | 0);
        const blockHeight = (lerpedRandomRange(randomGen, renderSize * 0.01, renderSize * 0.06) | 0);
        const sourceX = clamp(blockX + ((randomGen() - 0.5) * renderSize * 0.12) | 0, 0, renderSize);
        canvasContext.globalAlpha = 0.10 + randomGen() * 0.20;
        canvasContext.drawImage(sourceCanvas, sourceX, blockY, blockWidth, blockHeight, blockX, blockY, blockWidth, blockHeight);
      }

      canvasContext.restore();
      canvasContext.globalCompositeOperation = "source-over";
      canvasContext.globalAlpha = 1;
    }
  });

  // foreground: vortex tunnel overlay
  Modules.push({
    name: "vortex_tunnel",
    stage: "foreground",
    weight: 0.08,
    run(state) {
      const { canvasContext, renderSize, randomGen, colourPalette } = state;

      const sourceCanvas = getScratch(canvasContext.canvas, "vortex_src", renderSize, renderSize);
      const sourceContext = sourceCanvas.getContext("2d", { alpha: false });
      sourceContext.drawImage(canvasContext.canvas, 0, 0, renderSize, renderSize);

      const centreX = lerpedRandomRange(randomGen, renderSize * 0.3, renderSize * 0.7);
      const centreY = lerpedRandomRange(randomGen, renderSize * 0.3, renderSize * 0.7);
      const layerCount = 22 + ((randomGen() * 28) | 0);

      canvasContext.save();
      canvasContext.globalCompositeOperation = "screen";

      for (let i = 0; i < layerCount; i++) {
        const layerProgress = i / layerCount;
        const layerScale = 1 + layerProgress * lerpedRandomRange(randomGen, 0.6, 2.2);
        const layerRotation = layerProgress * lerpedRandomRange(randomGen, -0.8, 0.8);

        canvasContext.save();
        canvasContext.translate(centreX, centreY);
        canvasContext.rotate(layerRotation);
        canvasContext.scale(layerScale, layerScale);
        canvasContext.translate(-centreX, -centreY);

        canvasContext.globalAlpha = (1 - layerProgress) * (0.12 + randomGen() * 0.10);
        canvasContext.drawImage(sourceCanvas, 0, 0, renderSize, renderSize);

        if (randomGen() < 0.35) {
          canvasContext.globalCompositeOperation = "overlay";
          canvasContext.globalAlpha *= 0.65;
          canvasContext.fillStyle = pickPaletteColour(colourPalette, randomGen, 1, 25 + randomGen() * 15);
          canvasContext.fillRect(0, 0, renderSize, renderSize);
          canvasContext.globalCompositeOperation = "screen";
        }

        canvasContext.restore();
      }

      canvasContext.restore();
      canvasContext.globalCompositeOperation = "source-over";
      canvasContext.globalAlpha = 1;
    }
  });

  // overlay: rgb split "chroma ghost"
  Modules.push({
    name: "rgb_split",
    stage: "overlay",
    weight: 1.4,
    run(state) {
      const { canvasContext, renderSize, randomGen } = state;

      const sourceCanvas = getScratch(canvasContext.canvas, "rgb_src", renderSize, renderSize);
      const sourceContext = sourceCanvas.getContext("2d", { alpha: false });
      sourceContext.drawImage(canvasContext.canvas, 0, 0, renderSize, renderSize);

      const tintCanvas = getScratch(canvasContext.canvas, "rgb_tmp", renderSize, renderSize);
      const tintContext = tintCanvas.getContext("2d", { alpha: true });

      function tintedPass(color, offsetX, offsetY, alpha) {
        tintContext.clearRect(0, 0, renderSize, renderSize);
        tintContext.globalCompositeOperation = "source-over";
        tintContext.drawImage(sourceCanvas, 0, 0, renderSize, renderSize);
        tintContext.globalCompositeOperation = "source-in";
        tintContext.fillStyle = color;
        tintContext.fillRect(0, 0, renderSize, renderSize);

        canvasContext.save();
        canvasContext.globalCompositeOperation = "screen";
        canvasContext.globalAlpha = alpha;
        canvasContext.drawImage(tintCanvas, offsetX, offsetY);
        canvasContext.restore();
      }

      const offsetAmount = lerpedRandomRange(randomGen, renderSize * 0.003, renderSize * 0.02);
      tintedPass("rgba(255,0,80,1)",  (offsetAmount * 1.2) | 0,  (-offsetAmount * 0.6) | 0, 0.28 + randomGen() * 0.18);
      tintedPass("rgba(0,255,200,1)", (-offsetAmount * 1.0) | 0, (offsetAmount * 0.7) | 0, 0.24 + randomGen() * 0.16);
      tintedPass("rgba(120,80,255,1)", (offsetAmount * 0.2) | 0,  (offsetAmount * 1.1) | 0, 0.22 + randomGen() * 0.16);
    }
  });

  // overlay: strobe scanlines (visual pressure)
  Modules.push({
    name: "strobe_scanlines",
    stage: "overlay",
    weight: 1.1,
    run(state) {
      const { canvasContext, renderSize, randomGen, colourPalette } = state;

      canvasContext.save();
      canvasContext.globalCompositeOperation = "overlay";

      const scanlineStep = lerpedRandomRange(randomGen, 2, 6);
      canvasContext.globalAlpha = 0.22;
      canvasContext.fillStyle = "rgba(255,255,255,1)";
      for (let y = 0; y < renderSize; y += scanlineStep) canvasContext.fillRect(0, y, renderSize, 1);

      canvasContext.globalCompositeOperation = "screen";
      const hitCount = 2 + ((randomGen() * 6) | 0);
      for (let i = 0; i < hitCount; i++) {
        const hitY = lerpedRandomRange(randomGen, renderSize * 0.06, renderSize * 0.94);
        const hitHeight = lerpedRandomRange(randomGen, renderSize * 0.01, renderSize * 0.06);
        canvasContext.globalAlpha = 0.08 + randomGen() * 0.18;
        canvasContext.fillStyle = pickPaletteColour(colourPalette, randomGen, 1, 30 + randomGen() * 20);
        canvasContext.fillRect(0, hitY, renderSize, hitHeight);
      }

      canvasContext.restore();
      canvasContext.globalCompositeOperation = "source-over";
      canvasContext.globalAlpha = 1;
    }
  });

  // overlay: pixel-pop posterize
  Modules.push({
    name: "pixel_pop",
    stage: "overlay",
    weight: 1.0,
    run(state) {
      const { canvasContext, renderSize, randomGen } = state;

      const pixelScale = clamp((renderSize / lerpedRandomRange(randomGen, 120, 260)) | 0, 2, 12);
      const scaledWidth = Math.max(1, (renderSize / pixelScale) | 0);
      const scaledHeight = Math.max(1, (renderSize / pixelScale) | 0);

      const smallCanvas = getScratch(canvasContext.canvas, "pixel_small", scaledWidth, scaledHeight);
      const smallContext = smallCanvas.getContext("2d", { alpha: false });

      smallContext.imageSmoothingEnabled = true;
      smallContext.drawImage(canvasContext.canvas, 0, 0, scaledWidth, scaledHeight);

      const imageData = smallContext.getImageData(0, 0, scaledWidth, scaledHeight);
      const pixelData = imageData.data;
      const levelCount = 4 + ((randomGen() * 5) | 0);
      const quantStep = 255 / (levelCount - 1);

      for (let i = 0; i < pixelData.length; i += 4) {
        pixelData[i] = Math.round(pixelData[i] / quantStep) * quantStep;
        pixelData[i + 1] = Math.round(pixelData[i + 1] / quantStep) * quantStep;
        pixelData[i + 2] = Math.round(pixelData[i + 2] / quantStep) * quantStep;
      }
      smallContext.putImageData(imageData, 0, 0);

      canvasContext.save();
      canvasContext.globalCompositeOperation = "overlay";
      canvasContext.globalAlpha = 0.65;
      canvasContext.imageSmoothingEnabled = false;
      canvasContext.drawImage(smallCanvas, 0, 0, scaledWidth, scaledHeight, 0, 0, renderSize, renderSize);
      canvasContext.restore();

      canvasContext.imageSmoothingEnabled = true;
      canvasContext.globalCompositeOperation = "source-over";
      canvasContext.globalAlpha = 1;
    }
  });

  // overlay: pixelate mosaic overlay
  Modules.push({
    name: "pixelate_mosaic",
    stage: "overlay",
    weight: 0.9,
    run(state) {
      const { canvasContext, renderSize, randomGen } = state;

      const pixelSize = Math.max(3, (lerpedRandomRange(randomGen, 4, 28) | 0));
      const scaledWidth = Math.max(1, (renderSize / pixelSize) | 0);
      const scaledHeight = Math.max(1, (renderSize / pixelSize) | 0);

      const smallCanvas = getScratch(canvasContext.canvas, "pix_small", scaledWidth, scaledHeight);
      const smallContext = smallCanvas.getContext("2d", { alpha: false });

      smallContext.imageSmoothingEnabled = true;
      smallContext.drawImage(canvasContext.canvas, 0, 0, scaledWidth, scaledHeight);

      if (randomGen() < 0.75) {
        const imageData = smallContext.getImageData(0, 0, scaledWidth, scaledHeight);
        const pixelData = imageData.data;
        const levelCount = 3 + ((randomGen() * 6) | 0);
        const quantStep = 255 / (levelCount - 1);
        for (let i = 0; i < pixelData.length; i += 4) {
          pixelData[i]     = Math.round(pixelData[i]     / quantStep) * quantStep;
          pixelData[i + 1] = Math.round(pixelData[i + 1] / quantStep) * quantStep;
          pixelData[i + 2] = Math.round(pixelData[i + 2] / quantStep) * quantStep;
        }
        smallContext.putImageData(imageData, 0, 0);
      }

      canvasContext.save();
      canvasContext.imageSmoothingEnabled = false;
      canvasContext.globalCompositeOperation = randomGen() < 0.5 ? "overlay" : "source-over";
      canvasContext.globalAlpha = 0.65 + randomGen() * 0.25;
      canvasContext.drawImage(smallCanvas, 0, 0, scaledWidth, scaledHeight, 0, 0, renderSize, renderSize);
      canvasContext.restore();

      canvasContext.imageSmoothingEnabled = true;
      canvasContext.globalCompositeOperation = "source-over";
      canvasContext.globalAlpha = 1;
    }
  });

  // overlay: CRT subpixel mask overlay
  Modules.push({
    name: "crt_subpixel_mask",
    stage: "overlay",
    weight: 0.5,
    run(state) {
      const { canvasContext, renderSize, randomGen } = state;

      canvasContext.save();
      canvasContext.globalCompositeOperation = "multiply";
      canvasContext.globalAlpha = 0.16 + randomGen() * 0.12;

      const subpixelStep = Math.max(2, (lerpedRandomRange(randomGen, 2, 5) | 0));
      for (let x = 0; x < renderSize; x += subpixelStep * 3) {
        canvasContext.fillStyle = "rgba(255,0,0,1)";
        canvasContext.fillRect(x, 0, subpixelStep, renderSize);
        canvasContext.fillStyle = "rgba(0,255,0,1)";
        canvasContext.fillRect(x + subpixelStep, 0, subpixelStep, renderSize);
        canvasContext.fillStyle = "rgba(0,0,255,1)";
        canvasContext.fillRect(x + subpixelStep * 2, 0, subpixelStep, renderSize);
      }

      canvasContext.restore();
      canvasContext.globalCompositeOperation = "source-over";
      canvasContext.globalAlpha = 1;
    }
  });

  // overlay: kaleidoscopic mirror overlay
  Modules.push({
    name: "kaleido_mirror",
    stage: "overlay",
    weight: 0.18,
    run(state) {
      const { canvasContext, renderSize, randomGen } = state;

      const sourceCanvas = getScratch(canvasContext.canvas, "kaleido_src", renderSize, renderSize);
      const sourceContext = sourceCanvas.getContext("2d", { alpha: false });
      sourceContext.drawImage(canvasContext.canvas, 0, 0, renderSize, renderSize);

      const rotationRadians = lerpedRandomRange(randomGen, -0.45, 0.45);
      const zoomAmount = lerpedRandomRange(randomGen, 1.02, 1.18);

      canvasContext.save();
      canvasContext.globalCompositeOperation = randomGen() < 0.5 ? "screen" : "difference";
      canvasContext.globalAlpha = 0.35 + randomGen() * 0.35;

      const halfSize = renderSize / 2;
      for (let quadrant = 0; quadrant < 4; quadrant++) {
        canvasContext.save();
        canvasContext.translate(halfSize, halfSize);
        canvasContext.rotate(rotationRadians + quadrant * (Math.PI / 2));
        canvasContext.scale((quadrant % 2 === 0) ? 1 : -1, (quadrant < 2) ? 1 : -1);
        canvasContext.scale(zoomAmount, zoomAmount);
        canvasContext.translate(-halfSize, -halfSize);
        canvasContext.drawImage(sourceCanvas, 0, 0, renderSize, renderSize);
        canvasContext.restore();
      }

      canvasContext.restore();
      canvasContext.globalCompositeOperation = "source-over";
      canvasContext.globalAlpha = 1;
    }
  });

  // overlay: droste portal overlay
  Modules.push({
    name: "droste_portal",
    stage: "overlay",
    weight: 0.06,
    run(state) {
      const { canvasContext, renderSize, randomGen } = state;

      const sourceCanvas = getScratch(canvasContext.canvas, "droste_src", renderSize, renderSize);
      const sourceContext = sourceCanvas.getContext("2d", { alpha: false });
      sourceContext.drawImage(canvasContext.canvas, 0, 0, renderSize, renderSize);

      const stepCount = 10 + ((randomGen() * 12) | 0);
      const centreX = renderSize / 2;
      const centreY = renderSize / 2;

      canvasContext.save();
      canvasContext.globalCompositeOperation = randomGen() < 0.5 ? "screen" : "difference";
      for (let i = 0; i < stepCount; i++) {
        const progress = i / stepCount;
        const scaleAmount = 1 - progress * lerpedRandomRange(randomGen, 0.55, 0.85);
        const rotationRadians = progress * lerpedRandomRange(randomGen, -0.8, 0.8);

        canvasContext.save();
        canvasContext.translate(centreX, centreY);
        canvasContext.rotate(rotationRadians);
        canvasContext.scale(scaleAmount, scaleAmount);
        canvasContext.translate(-centreX, -centreY);

        canvasContext.globalAlpha = 0.18 * (1 - progress);
        canvasContext.drawImage(sourceCanvas, 0, 0, renderSize, renderSize);

        canvasContext.restore();
      }
      canvasContext.restore();

      canvasContext.globalCompositeOperation = "source-over";
      canvasContext.globalAlpha = 1;
    }
  });

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
  
    const colourPalette = generatePalette(fileHash);

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
      colourPalette,
      fileName: (file.name || "untitled")
    };

    // mandatory background
    Modules.find(module => module.name === "metal_streaks")?.run(state);

    // pick remaining modules
    const pool = Modules.filter(module => module.name !== "metal_streaks");
    const picked = pickModulesWeightedUnique(pool, randomGen, moduleCount);

    // stage ordering for clean layering
    const stageOrder = {
      "background": 0,
      "midplane": 1,
      "foreground": 2,
      "overlay": 3
    };
  
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
