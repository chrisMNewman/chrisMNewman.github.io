/* ============================================================================
   Resting Place — Campfire Under the Stars
   Pure HTML5 Canvas + Web Audio API interactive prototype
   ============================================================================ */

(() => {
  const canvas = document.getElementById("scene");
  const ctx = canvas.getContext("2d");

  const plateCanvas = document.getElementById("plate-canvas");
  const plateCtx = plateCanvas.getContext("2d");

  // UI elements
  const statusText = document.getElementById("status-text");
  const btnSound = document.getElementById("btn-sound");
  const soundIcon = document.getElementById("sound-icon");
  const btnFireToggle = document.getElementById("btn-fire-toggle");
  const fireToggleLabel = document.getElementById("fire-toggle-label");
  const btnStoke = document.getElementById("btn-stoke");

  const roastHud = document.getElementById("roast-hud");
  const roastItemName = document.getElementById("roast-item-name");
  const roastStageEl = document.getElementById("roast-stage");
  const roastBarFill = document.getElementById("roast-bar-fill");
  const btnPrepare = document.getElementById("btn-prepare");
  const btnEatDirect = document.getElementById("btn-eat-direct");
  const btnDiscard = document.getElementById("btn-discard");

  const platePanel = document.getElementById("plate-panel");
  const plateTitle = document.getElementById("plate-title");
  const plateDesc = document.getElementById("plate-desc");
  const btnBite = document.getElementById("btn-bite");
  const btnMustard = document.getElementById("btn-mustard");
  const btnPlateClose = document.getElementById("btn-plate-close");

  const toastEl = document.getElementById("toast");
  const dockButtons = document.querySelectorAll(".dock-btn[data-mode]");

  // --------------------------------------------------------------------------
  // State
  // --------------------------------------------------------------------------
  const state = {
    width: window.innerWidth,
    height: window.innerHeight,
    dpr: Math.min(window.devicePixelRatio || 1, 2),

    fireLit: false,
    fireIntensity: 0, // smoothly animates 0..1 (up to 1.35 when stoked)
    targetIntensity: 0,
    stokeBoost: 0,

    mode: "rest", // "rest" | "marshmallow" | "hotdog"
    roastLevel: 0, // 0..100
    isNearHeat: false,
    sizzleTimer: 0,

    plate: null, // { type: "smore" | "hotdog", roastLevel, bitesLeft, maxBites, mustard }

    pointer: {
      x: window.innerWidth * 0.68,
      y: window.innerHeight * 0.62,
      active: false,
      hoveringFire: false,
    },

    soundEnabled: true,
    toastTimeout: null,
  };

  // Campfire position (computed on resize)
  const firePos = { x: 0, y: 0, radius: 68 };

  // Scene collections
  let stars = [];
  let shootingStars = [];
  let fireflies = [];
  let treesBack = [];
  let treesFront = [];
  let flames = [];
  let embers = [];
  let smoke = [];
  let sizzleSparks = [];
  let stones = [];

  // --------------------------------------------------------------------------
  // Procedural Web Audio Engine (zero external audio files needed)
  // --------------------------------------------------------------------------
  class NightAudio {
    constructor() {
      this.ctx = null;
      this.masterGain = null;
      this.fireGain = null;
      this.windGain = null;
      this.initialized = false;
      this.crackleTimer = null;
      this.cricketTimer = null;
    }

    init() {
      if (this.initialized) {
        if (this.ctx && this.ctx.state === "suspended") {
          this.ctx.resume();
        }
        return;
      }

      const AudioCtx = window.AudioContext || window.webkitAudioContext;
      if (!AudioCtx) return;

      this.ctx = new AudioCtx();
      this.masterGain = this.ctx.createGain();
      this.masterGain.gain.value = state.soundEnabled ? 0.65 : 0;
      this.masterGain.connect(this.ctx.destination);

      // Gentle night breeze (filtered noise)
      const windBuffer = this.createNoiseBuffer(3);
      const windSrc = this.ctx.createBufferSource();
      windSrc.buffer = windBuffer;
      windSrc.loop = true;

      const windFilter = this.ctx.createBiquadFilter();
      windFilter.type = "lowpass";
      windFilter.frequency.value = 260;

      this.windGain = this.ctx.createGain();
      this.windGain.gain.value = 0.08;

      windSrc.connect(windFilter);
      windFilter.connect(this.windGain);
      this.windGain.connect(this.masterGain);
      windSrc.start();

      // Campfire warm rumble (deep filtered noise)
      const fireBuffer = this.createNoiseBuffer(2);
      const fireSrc = this.ctx.createBufferSource();
      fireSrc.buffer = fireBuffer;
      fireSrc.loop = true;

      const fireFilter = this.ctx.createBiquadFilter();
      fireFilter.type = "bandpass";
      fireFilter.frequency.value = 140;
      fireFilter.Q.value = 0.7;

      this.fireGain = this.ctx.createGain();
      this.fireGain.gain.value = 0;

      fireSrc.connect(fireFilter);
      fireFilter.connect(this.fireGain);
      this.fireGain.connect(this.masterGain);
      fireSrc.start();

      this.initialized = true;
      this.scheduleCrackle();
      this.scheduleCricket();
    }

    createNoiseBuffer(seconds) {
      const length = this.ctx.sampleRate * seconds;
      const buffer = this.ctx.createBuffer(1, length, this.ctx.sampleRate);
      const data = buffer.getChannelData(0);
      let lastOut = 0;
      for (let i = 0; i < length; i++) {
        const white = Math.random() * 2 - 1;
        // Soft brown-ish noise
        data[i] = (lastOut + 0.04 * white) / 1.04;
        lastOut = data[i];
        data[i] *= 2.8;
      }
      return buffer;
    }

    setEnabled(enabled) {
      if (!this.initialized || !this.masterGain) return;
      const now = this.ctx.currentTime;
      this.masterGain.gain.cancelScheduledValues(now);
      this.masterGain.gain.setTargetAtTime(enabled ? 0.65 : 0, now, 0.12);
    }

    updateFireVolume(intensity) {
      if (!this.initialized || !this.fireGain) return;
      const now = this.ctx.currentTime;
      const target = Math.min(intensity, 1.3) * 0.22;
      this.fireGain.gain.setTargetAtTime(target, now, 0.18);
    }

    scheduleCrackle() {
      const delay = 140 + Math.random() * 520;
      this.crackleTimer = setTimeout(() => {
        if (this.initialized && state.fireLit && state.soundEnabled) {
          this.playCrackle();
        }
        this.scheduleCrackle();
      }, delay);
    }

    playCrackle() {
      if (!this.ctx) return;
      const now = this.ctx.currentTime;
      const dur = 0.015 + Math.random() * 0.035;
      const buffer = this.ctx.createBuffer(1, Math.floor(this.ctx.sampleRate * dur), this.ctx.sampleRate);
      const data = buffer.getChannelData(0);
      for (let i = 0; i < data.length; i++) {
        const env = Math.pow(1 - i / data.length, 2);
        data[i] = (Math.random() * 2 - 1) * env;
      }

      const src = this.ctx.createBufferSource();
      src.buffer = buffer;

      const filter = this.ctx.createBiquadFilter();
      filter.type = "highpass";
      filter.frequency.value = 1400 + Math.random() * 2400;

      const gain = this.ctx.createGain();
      gain.gain.value = (0.04 + Math.random() * 0.09) * Math.min(state.fireIntensity, 1.2);

      src.connect(filter);
      filter.connect(gain);
      gain.connect(this.masterGain);
      src.start(now);
    }

    scheduleCricket() {
      const delay = 2200 + Math.random() * 4800;
      this.cricketTimer = setTimeout(() => {
        if (this.initialized && state.soundEnabled) {
          this.playCricket();
        }
        this.scheduleCricket();
      }, delay);
    }

    playCricket() {
      if (!this.ctx) return;
      const now = this.ctx.currentTime;
      const chirps = 2 + Math.floor(Math.random() * 3);
      const baseFreq = 4100 + Math.random() * 500;

      for (let i = 0; i < chirps; i++) {
        const start = now + i * 0.065;
        const osc = this.ctx.createOscillator();
        const gain = this.ctx.createGain();
        osc.type = "sine";
        osc.frequency.setValueAtTime(baseFreq, start);
        osc.frequency.exponentialRampToValueAtTime(baseFreq * 0.96, start + 0.04);

        gain.gain.setValueAtTime(0.0001, start);
        gain.gain.linearRampToValueAtTime(0.012, start + 0.008);
        gain.gain.exponentialRampToValueAtTime(0.0001, start + 0.045);

        osc.connect(gain);
        gain.connect(this.masterGain);
        osc.start(start);
        osc.stop(start + 0.05);
      }
    }

    playIgnite() {
      if (!this.ctx || !state.soundEnabled) return;
      const now = this.ctx.currentTime;
      const dur = 0.55;
      const buffer = this.createNoiseBuffer(dur);
      const src = this.ctx.createBufferSource();
      src.buffer = buffer;

      const filter = this.ctx.createBiquadFilter();
      filter.type = "bandpass";
      filter.frequency.setValueAtTime(160, now);
      filter.frequency.exponentialRampToValueAtTime(620, now + 0.18);
      filter.frequency.exponentialRampToValueAtTime(200, now + dur);

      const gain = this.ctx.createGain();
      gain.gain.setValueAtTime(0.001, now);
      gain.gain.linearRampToValueAtTime(0.35, now + 0.12);
      gain.gain.exponentialRampToValueAtTime(0.001, now + dur);

      src.connect(filter);
      filter.connect(gain);
      gain.connect(this.masterGain);
      src.start(now);
    }

    playSizzle() {
      if (!this.ctx || !state.soundEnabled) return;
      const now = this.ctx.currentTime;
      const dur = 0.09;
      const buffer = this.ctx.createBuffer(1, Math.floor(this.ctx.sampleRate * dur), this.ctx.sampleRate);
      const data = buffer.getChannelData(0);
      for (let i = 0; i < data.length; i++) {
        data[i] = (Math.random() * 2 - 1) * Math.sin((i / data.length) * Math.PI);
      }

      const src = this.ctx.createBufferSource();
      src.buffer = buffer;

      const filter = this.ctx.createBiquadFilter();
      filter.type = "highpass";
      filter.frequency.value = 3200;

      const gain = this.ctx.createGain();
      gain.gain.value = 0.045;

      src.connect(filter);
      filter.connect(gain);
      gain.connect(this.masterGain);
      src.start(now);
    }

    playBite() {
      if (!this.ctx || !state.soundEnabled) return;
      const now = this.ctx.currentTime;
      const dur = 0.11;
      const buffer = this.ctx.createBuffer(1, Math.floor(this.ctx.sampleRate * dur), this.ctx.sampleRate);
      const data = buffer.getChannelData(0);
      for (let i = 0; i < data.length; i++) {
        const env = Math.pow(1 - i / data.length, 1.4);
        data[i] = (Math.random() * 2 - 1) * env;
      }

      const src = this.ctx.createBufferSource();
      src.buffer = buffer;

      const filter = this.ctx.createBiquadFilter();
      filter.type = "bandpass";
      filter.frequency.value = 950;
      filter.Q.value = 1.2;

      const gain = this.ctx.createGain();
      gain.gain.value = 0.16;

      src.connect(filter);
      filter.connect(gain);
      gain.connect(this.masterGain);
      src.start(now);
    }
  }

  const audio = new NightAudio();

  // --------------------------------------------------------------------------
  // Scene Initialization & Resize
  // --------------------------------------------------------------------------
  function resize() {
    state.width = window.innerWidth;
    state.height = window.innerHeight;
    state.dpr = Math.min(window.devicePixelRatio || 1, 2);

    canvas.width = Math.floor(state.width * state.dpr);
    canvas.height = Math.floor(state.height * state.dpr);
    ctx.setTransform(state.dpr, 0, 0, state.dpr, 0, 0);

    firePos.x = state.width * 0.5;
    firePos.y = state.height * 0.76;
    firePos.radius = Math.max(54, Math.min(78, state.width * 0.065));

    generateEnvironment();
  }

  function generateEnvironment() {
    const w = state.width;
    const h = state.height;
    const horizon = h * 0.66;

    // Stars
    const starCount = Math.floor((w * h) / 4800);
    stars = Array.from({ length: Math.max(90, Math.min(260, starCount)) }, () => ({
      x: Math.random() * w,
      y: Math.random() * (horizon * 0.92),
      r: 0.5 + Math.random() * 1.45,
      baseAlpha: 0.35 + Math.random() * 0.65,
      phase: Math.random() * Math.PI * 2,
      speed: 0.6 + Math.random() * 1.8,
      tint: Math.random() > 0.82 ? "#ffdcb8" : Math.random() > 0.6 ? "#cde0ff" : "#ffffff",
    }));

    // Fireflies
    fireflies = Array.from({ length: 18 }, () => ({
      x: Math.random() * w,
      y: horizon * 0.72 + Math.random() * (h * 0.22),
      vx: (Math.random() - 0.5) * 14,
      vy: (Math.random() - 0.5) * 8,
      phase: Math.random() * Math.PI * 2,
      speed: 1.4 + Math.random() * 1.8,
      r: 1.4 + Math.random() * 1.4,
    }));

    // Background treeline
    treesBack = [];
    for (let x = -40; x < w + 60; x += 26 + Math.random() * 22) {
      const distFromCenter = Math.abs(x - w * 0.5) / (w * 0.5);
      // Slight clearing in the center
      const clearingFactor = 0.55 + distFromCenter * 0.6;
      treesBack.push({
        x,
        baseY: horizon + 12 + Math.random() * 14,
        height: (95 + Math.random() * 90) * clearingFactor,
        width: 34 + Math.random() * 24,
        tiers: 4 + Math.floor(Math.random() * 2),
      });
    }

    // Foreground framing pines on left and right
    treesFront = [];
    for (let x = -30; x < w + 40; x += 38 + Math.random() * 32) {
      const distFromCenter = Math.abs(x - w * 0.5) / (w * 0.5);
      if (distFromCenter < 0.34) continue; // Keep clearing open around the campfire
      treesFront.push({
        x,
        baseY: horizon + 34 + Math.random() * 34,
        height: 150 + Math.random() * 130 + distFromCenter * 75,
        width: 54 + Math.random() * 34,
        tiers: 5 + Math.floor(Math.random() * 2),
      });
    }

    // Stone ring around campfire
    stones = [];
    const stoneCount = 11;
    for (let i = 0; i < stoneCount; i++) {
      const angle = (i / stoneCount) * Math.PI * 2 + 0.15;
      stones.push({
        x: firePos.x + Math.cos(angle) * (firePos.radius * 0.92),
        y: firePos.y + Math.sin(angle) * (firePos.radius * 0.34) + 14,
        rx: 13 + (i % 3) * 3,
        ry: 8 + (i % 2) * 2.5,
        rot: (Math.sin(i * 2.1) * 0.25),
        shade: 34 + (i % 4) * 5,
      });
    }
    // Sort stones back-to-front by Y
    stones.sort((a, b) => a.y - b.y);
  }

  // --------------------------------------------------------------------------
  // Toast helper
  // --------------------------------------------------------------------------
  function showToast(msg, duration = 2600) {
    toastEl.textContent = msg;
    toastEl.classList.add("visible");
    clearTimeout(state.toastTimeout);
    state.toastTimeout = setTimeout(() => {
      toastEl.classList.remove("visible");
    }, duration);
  }

  // --------------------------------------------------------------------------
  // Fire Actions
  // --------------------------------------------------------------------------
  function lightFire() {
    audio.init();
    if (!state.fireLit) {
      state.fireLit = true;
      state.targetIntensity = 1;
      audio.playIgnite();
      burstEmbers(26);
      statusText.textContent = "The fire is warm. Rest, or roast marshmallows & hotdogs.";
      btnFireToggle.classList.remove("hidden");
      btnStoke.classList.remove("hidden");
      fireToggleLabel.textContent = "Extinguish";
      showToast("The campfire crackles to life.");
    } else {
      stokeFire();
    }
  }

  function stokeFire() {
    if (!state.fireLit) {
      lightFire();
      return;
    }
    audio.init();
    state.stokeBoost = 0.42;
    burstEmbers(22);
    audio.playIgnite();
    showToast("You stoke the fire. Embers drift toward the stars.");
  }

  function extinguishFire() {
    state.fireLit = false;
    state.targetIntensity = 0;
    state.stokeBoost = 0;
    setMode("rest");
    closePlate();
    statusText.textContent = "The embers fade. Click the campfire to relight it.";
    fireToggleLabel.textContent = "Light Fire";
    btnStoke.classList.add("hidden");
    showToast("The fire settles into quiet darkness.");
  }

  function burstEmbers(count) {
    for (let i = 0; i < count; i++) {
      embers.push({
        x: firePos.x + (Math.random() - 0.5) * 44,
        y: firePos.y - 10 - Math.random() * 20,
        vx: (Math.random() - 0.5) * 48,
        vy: -(45 + Math.random() * 95),
        size: 1.5 + Math.random() * 2.5,
        life: 1,
        decay: 0.25 + Math.random() * 0.45,
        wobble: Math.random() * Math.PI * 2,
      });
    }
  }

  // --------------------------------------------------------------------------
  // Roasting & Food Modes
  // --------------------------------------------------------------------------
  function setMode(newMode) {
    if (newMode !== "rest" && !state.fireLit) {
      showToast("Light the campfire first by clicking on the logs.");
      return;
    }

    closePlate();
    state.mode = newMode;
    state.roastLevel = 0;
    state.isNearHeat = false;

    dockButtons.forEach((btn) => {
      btn.classList.toggle("active", btn.dataset.mode === newMode);
    });

    if (newMode === "rest") {
      roastHud.classList.add("hidden");
      statusText.textContent = state.fireLit
        ? "Just resting by the fire under the stars."
        : "Click the campfire to light it.";
    } else if (newMode === "marshmallow") {
      roastItemName.textContent = "Marshmallow";
      btnPrepare.textContent = "Make S'more";
      btnEatDirect.textContent = "Eat Marshmallow";
      roastHud.classList.remove("hidden");
      statusText.textContent = "Hold the marshmallow near the flames to toast it golden.";
      updateRoastHUD();
    } else if (newMode === "hotdog") {
      roastItemName.textContent = "Campfire Hotdog";
      btnPrepare.textContent = "Put in Bun";
      btnEatDirect.textContent = "Eat off Stick";
      roastHud.classList.remove("hidden");
      statusText.textContent = "Roast the hotdog over the fire until it sizzles.";
      updateRoastHUD();
    }
  }

  function getRoastStage(type, level) {
    if (type === "marshmallow") {
      if (level < 18) return { label: "Raw", color: "#f6efe8" };
      if (level < 48) return { label: "Warming", color: "#f5dfb6" };
      if (level < 76) return { label: "Golden", color: "#e59d45" };
      if (level < 90) return { label: "Toasty", color: "#b85d22" };
      return { label: "Charred", color: "#2d1d17" };
    } else {
      if (level < 20) return { label: "Cold", color: "#cf6a58" };
      if (level < 50) return { label: "Warming", color: "#c4573e" };
      if (level < 78) return { label: "Juicy & Grilled", color: "#a63d24" };
      if (level < 92) return { label: "Well Done", color: "#782817" };
      return { label: "Charred", color: "#2e1612" };
    }
  }

  function updateRoastHUD() {
    if (state.mode === "rest") return;
    const stage = getRoastStage(state.mode, state.roastLevel);
    roastStageEl.textContent = stage.label;
    roastBarFill.style.width = `${Math.min(100, state.roastLevel).toFixed(1)}%`;
  }

  function openPlate(plateType) {
    const level = state.roastLevel;
    const stage = getRoastStage(plateType === "smore" ? "marshmallow" : "hotdog", level);

    state.plate = {
      type: plateType,
      roastLevel: level,
      bitesLeft: 3,
      maxBites: 3,
      mustard: false,
    };

    // Hide roasting stick while eating
    state.mode = "rest";
    roastHud.classList.add("hidden");
    dockButtons.forEach((btn) => btn.classList.toggle("active", btn.dataset.mode === "rest"));

    if (plateType === "smore") {
      plateTitle.textContent = `${stage.label} S'more`;
      plateDesc.textContent =
        level >= 48 && level < 90
          ? "Crisp graham crackers, melting chocolate, and a perfectly gooey marshmallow."
          : level >= 90
            ? "Extra smoky and crispy on the outside, warm and gooey inside."
            : "A sweet campfire s'more — warm and comforting.";
      btnMustard.classList.add("hidden");
    } else {
      plateTitle.textContent = `${stage.label} Hotdog`;
      plateDesc.textContent =
        level >= 50 && level < 92
          ? "Snappy, smoky, and tucked into a soft warm bun."
          : level >= 92
            ? "Properly charred campfire style in a soft bun."
            : "Tucked into a warm bun, ready to enjoy by the fire.";
      btnMustard.classList.remove("hidden");
      btnMustard.textContent = "Add Mustard";
    }

    btnBite.textContent = "Take a Bite";
    platePanel.classList.remove("hidden");
    drawPlate();
  }

  function closePlate() {
    state.plate = null;
    platePanel.classList.add("hidden");
  }

  function takeBite() {
    if (!state.plate) return;
    audio.init();
    audio.playBite();
    state.plate.bitesLeft -= 1;

    if (state.plate.bitesLeft <= 0) {
      const finishedName = state.plate.type === "smore" ? "s'more" : "hotdog";
      closePlate();
      showToast(`Delicious! You finished your ${finishedName}.`);
      return;
    }

    btnBite.textContent = state.plate.bitesLeft === 1 ? "Last Bite" : "Take a Bite";
    drawPlate();
  }

  function eatDirectly() {
    if (state.mode === "rest") return;
    audio.init();
    audio.playBite();
    const stage = getRoastStage(state.mode, state.roastLevel);
    const label = state.mode === "marshmallow" ? "marshmallow" : "hotdog";
    showToast(`You eat the ${stage.label.toLowerCase()} ${label} right off the stick.`);
    state.roastLevel = 0;
    updateRoastHUD();
  }

  // --------------------------------------------------------------------------
  // Drawing the Plate (S'more or Hotdog in a Bun)
  // --------------------------------------------------------------------------
  function drawPlate() {
    if (!state.plate) return;
    const p = state.plate;
    const w = plateCanvas.width;
    const h = plateCanvas.height;
    plateCtx.clearRect(0, 0, w, h);

    const bitesTaken = p.maxBites - p.bitesLeft;

    // Campfire tin plate
    plateCtx.save();
    plateCtx.fillStyle = "#263042";
    plateCtx.strokeStyle = "rgba(255, 226, 185, 0.28)";
    plateCtx.lineWidth = 2;
    plateCtx.beginPath();
    plateCtx.ellipse(w / 2, h * 0.72, 86, 30, 0, 0, Math.PI * 2);
    plateCtx.fill();
    plateCtx.stroke();

    plateCtx.strokeStyle = "rgba(255, 255, 255, 0.08)";
    plateCtx.lineWidth = 1.5;
    plateCtx.beginPath();
    plateCtx.ellipse(w / 2, h * 0.72, 68, 20, 0, 0, Math.PI * 2);
    plateCtx.stroke();

    // Clip bites from the right side
    if (bitesTaken > 0) {
      plateCtx.beginPath();
      const cutX = w - bitesTaken * 46 - 24;
      plateCtx.rect(0, 0, cutX, h);
      plateCtx.clip();
    }

    if (p.type === "smore") {
      const mColor = lerpRoastColor("marshmallow", p.roastLevel);

      // Bottom graham cracker
      drawRoundedRect(plateCtx, 58, 80, 104, 16, 4, "#c88d4b", "#8d5b27");

      // Melting chocolate bar
      plateCtx.fillStyle = "#3f2214";
      plateCtx.beginPath();
      plateCtx.roundRect(62, 70, 96, 12, 4);
      plateCtx.fill();
      // Chocolate drips
      plateCtx.beginPath();
      plateCtx.arc(78, 83, 5, 0, Math.PI * 2);
      plateCtx.arc(114, 84, 6, 0, Math.PI * 2);
      plateCtx.arc(140, 82, 4.5, 0, Math.PI * 2);
      plateCtx.fill();

      // Squished roasted marshmallow
      plateCtx.fillStyle = mColor;
      plateCtx.beginPath();
      plateCtx.roundRect(64, 48, 92, 26, 12);
      plateCtx.fill();
      plateCtx.strokeStyle = "rgba(70, 35, 15, 0.25)";
      plateCtx.lineWidth = 1.5;
      plateCtx.stroke();

      // Top graham cracker (slightly tilted)
      plateCtx.save();
      plateCtx.translate(110, 44);
      plateCtx.rotate(-0.04);
      drawRoundedRect(plateCtx, -52, -8, 104, 16, 4, "#d69a55", "#8d5b27");
      // Cracker perforations
      plateCtx.fillStyle = "rgba(115, 70, 26, 0.45)";
      for (let i = -36; i <= 36; i += 18) {
        plateCtx.beginPath();
        plateCtx.arc(i, 0, 1.8, 0, Math.PI * 2);
        plateCtx.fill();
      }
      plateCtx.restore();
    } else {
      // Hotdog in a bun
      const dogColor = lerpRoastColor("hotdog", p.roastLevel);

      // Back bun half
      drawRoundedRect(plateCtx, 42, 54, 136, 32, 16, "#dba35c", "#a56f32");

      // Roasted hotdog
      plateCtx.fillStyle = dogColor;
      plateCtx.beginPath();
      plateCtx.roundRect(32, 50, 156, 26, 13);
      plateCtx.fill();

      // Grill marks if roasted
      if (p.roastLevel > 35) {
        plateCtx.strokeStyle = `rgba(38, 14, 8, ${Math.min(0.75, (p.roastLevel - 30) / 80)})`;
        plateCtx.lineWidth = 3;
        for (let gx = 54; gx <= 162; gx += 22) {
          plateCtx.beginPath();
          plateCtx.moveTo(gx, 52);
          plateCtx.lineTo(gx + 6, 72);
          plateCtx.stroke();
        }
      }

      // Mustard drizzle
      if (p.mustard) {
        plateCtx.strokeStyle = "#f2c938";
        plateCtx.lineWidth = 4;
        plateCtx.lineCap = "round";
        plateCtx.beginPath();
        for (let x = 44; x <= 174; x += 6) {
          const y = 62 + Math.sin(x * 0.25) * 5;
          if (x === 44) plateCtx.moveTo(x, y);
          else plateCtx.lineTo(x, y);
        }
        plateCtx.stroke();
      }

      // Front bun lip
      drawRoundedRect(plateCtx, 44, 68, 132, 24, 12, "#e8b46d", "#b57c3a");
    }

    plateCtx.restore();
  }

  function drawRoundedRect(context, x, y, w, h, r, fill, stroke) {
    context.fillStyle = fill;
    context.beginPath();
    context.roundRect(x, y, w, h, r);
    context.fill();
    if (stroke) {
      context.strokeStyle = stroke;
      context.lineWidth = 1.5;
      context.stroke();
    }
  }

  // Color interpolation for realistic roasting progression
  function lerpColor(a, b, t) {
    const ah = parseInt(a.replace("#", ""), 16);
    const bh = parseInt(b.replace("#", ""), 16);
    const ar = (ah >> 16) & 0xff,
      ag = (ah >> 8) & 0xff,
      ab = ah & 0xff;
    const br = (bh >> 16) & 0xff,
      bg = (bh >> 8) & 0xff,
      bb = bh & 0xff;
    const rr = Math.round(ar + (br - ar) * t);
    const rg = Math.round(ag + (bg - ag) * t);
    const rb = Math.round(ab + (bb - ab) * t);
    return `rgb(${rr}, ${rg}, ${rb})`;
  }

  function lerpRoastColor(type, level) {
    const t = Math.max(0, Math.min(100, level)) / 100;
    if (type === "marshmallow") {
      if (t < 0.45) return lerpColor("#fbf7f2", "#f2cf94", t / 0.45);
      if (t < 0.78) return lerpColor("#f2cf94", "#c96f24", (t - 0.45) / 0.33);
      return lerpColor("#c96f24", "#271914", (t - 0.78) / 0.22);
    } else {
      if (t < 0.5) return lerpColor("#cf6a58", "#b3452a", t / 0.5);
      if (t < 0.82) return lerpColor("#b3452a", "#782414", (t - 0.5) / 0.32);
      return lerpColor("#782414", "#24110d", (t - 0.82) / 0.18);
    }
  }

  // --------------------------------------------------------------------------
  // Pointer & Click Interactions
  // --------------------------------------------------------------------------
  function isPointOverFire(x, y) {
    const dx = x - firePos.x;
    const dy = y - (firePos.y - 10);
    return Math.hypot(dx, dy) < firePos.radius * 1.25;
  }

  function updatePointer(clientX, clientY) {
    state.pointer.x = clientX;
    state.pointer.y = clientY;
    state.pointer.active = true;
    state.pointer.hoveringFire = isPointOverFire(clientX, clientY);

    if (state.mode !== "rest") {
      canvas.style.cursor = "none";
    } else if (state.pointer.hoveringFire) {
      canvas.style.cursor = "pointer";
    } else {
      canvas.style.cursor = "default";
    }
  }

  canvas.addEventListener("pointermove", (e) => {
    updatePointer(e.clientX, e.clientY);
  });

  canvas.addEventListener("pointerdown", (e) => {
    updatePointer(e.clientX, e.clientY);
    audio.init();
    if (state.mode === "rest" && isPointOverFire(e.clientX, e.clientY)) {
      lightFire();
    }
  });

  // UI Button Listeners
  btnSound.addEventListener("click", () => {
    audio.init();
    state.soundEnabled = !state.soundEnabled;
    audio.setEnabled(state.soundEnabled);
    soundIcon.textContent = state.soundEnabled ? "🔊" : "🔇";
    btnSound.setAttribute("aria-pressed", String(state.soundEnabled));
  });

  btnFireToggle.addEventListener("click", () => {
    if (state.fireLit) extinguishFire();
    else lightFire();
  });

  btnStoke.addEventListener("click", stokeFire);

  dockButtons.forEach((btn) => {
    btn.addEventListener("click", () => {
      audio.init();
      setMode(btn.dataset.mode);
    });
  });

  btnPrepare.addEventListener("click", () => {
    if (state.mode === "marshmallow") openPlate("smore");
    else if (state.mode === "hotdog") openPlate("hotdog");
  });

  btnEatDirect.addEventListener("click", eatDirectly);
  btnDiscard.addEventListener("click", () => setMode("rest"));

  btnBite.addEventListener("click", takeBite);
  btnMustard.addEventListener("click", () => {
    if (!state.plate || state.plate.type !== "hotdog") return;
    state.plate.mustard = !state.plate.mustard;
    btnMustard.textContent = state.plate.mustard ? "Remove Mustard" : "Add Mustard";
    drawPlate();
  });
  btnPlateClose.addEventListener("click", closePlate);

  window.addEventListener("resize", resize);

  // --------------------------------------------------------------------------
  // Update Loop
  // --------------------------------------------------------------------------
  let lastTime = performance.now();

  function update(dt, now) {
    // Smooth fire intensity
    if (state.stokeBoost > 0) {
      state.stokeBoost = Math.max(0, state.stokeBoost - dt * 0.16);
    }
    const desired = state.fireLit ? state.targetIntensity + state.stokeBoost : 0;
    state.fireIntensity += (desired - state.fireIntensity) * Math.min(1, dt * 3.5);
    audio.updateFireVolume(state.fireIntensity);

    // Occasional shooting star
    if (Math.random() < dt * 0.09) {
      shootingStars.push({
        x: Math.random() * state.width * 0.75 + state.width * 0.1,
        y: Math.random() * state.height * 0.25 + 20,
        vx: 260 + Math.random() * 180,
        vy: 90 + Math.random() * 70,
        life: 1,
      });
    }
    for (let i = shootingStars.length - 1; i >= 0; i--) {
      const s = shootingStars[i];
      s.x += s.vx * dt;
      s.y += s.vy * dt;
      s.life -= dt * 1.4;
      if (s.life <= 0) shootingStars.splice(i, 1);
    }

    // Fireflies
    const horizon = state.height * 0.66;
    for (const f of fireflies) {
      f.x += f.vx * dt + Math.sin(now * 0.001 + f.phase) * 6 * dt;
      f.y += f.vy * dt + Math.cos(now * 0.0012 + f.phase) * 4 * dt;
      if (f.x < -10) f.x = state.width + 10;
      if (f.x > state.width + 10) f.x = -10;
      if (f.y < horizon * 0.65) f.vy = Math.abs(f.vy);
      if (f.y > state.height * 0.88) f.vy = -Math.abs(f.vy);
    }

    // Spawn flames, embers, smoke when fire is lit
    if (state.fireIntensity > 0.05) {
      const rate = state.fireIntensity;
      // Flame tongues
      if (Math.random() < rate * 0.95) {
        flames.push({
          x: firePos.x + (Math.random() - 0.5) * 34 * Math.min(rate, 1.2),
          y: firePos.y + 2,
          vx: (Math.random() - 0.5) * 14,
          vy: -(52 + Math.random() * 58) * rate,
          size: (14 + Math.random() * 18) * Math.min(rate, 1.25),
          life: 1,
          decay: 1.45 + Math.random() * 0.8,
        });
      }

      // Embers
      if (Math.random() < dt * 10 * rate) {
        embers.push({
          x: firePos.x + (Math.random() - 0.5) * 36,
          y: firePos.y - 12,
          vx: (Math.random() - 0.5) * 26,
          vy: -(38 + Math.random() * 68) * rate,
          size: 1.2 + Math.random() * 2.1,
          life: 1,
          decay: 0.32 + Math.random() * 0.38,
          wobble: Math.random() * Math.PI * 2,
        });
      }

      // Soft smoke wisps
      if (Math.random() < dt * 3.5 * rate) {
        smoke.push({
          x: firePos.x + (Math.random() - 0.5) * 22,
          y: firePos.y - 48 * rate,
          vx: 6 + Math.random() * 10,
          vy: -(18 + Math.random() * 14),
          r: 10 + Math.random() * 12,
          life: 1,
          decay: 0.22 + Math.random() * 0.14,
        });
      }
    }

    // Update particles
    for (let i = flames.length - 1; i >= 0; i--) {
      const p = flames[i];
      p.x += (p.vx + Math.sin(now * 0.008 + i) * 12) * dt;
      p.y += p.vy * dt;
      p.life -= p.decay * dt;
      if (p.life <= 0) flames.splice(i, 1);
    }

    for (let i = embers.length - 1; i >= 0; i--) {
      const e = embers[i];
      e.x += (e.vx + Math.sin(now * 0.004 + e.wobble) * 18) * dt;
      e.y += e.vy * dt;
      e.life -= e.decay * dt;
      if (e.life <= 0) embers.splice(i, 1);
    }

    for (let i = smoke.length - 1; i >= 0; i--) {
      const s = smoke[i];
      s.x += s.vx * dt;
      s.y += s.vy * dt;
      s.r += 12 * dt;
      s.life -= s.decay * dt;
      if (s.life <= 0) smoke.splice(i, 1);
    }

    for (let i = sizzleSparks.length - 1; i >= 0; i--) {
      const sp = sizzleSparks[i];
      sp.x += sp.vx * dt;
      sp.y += sp.vy * dt;
      sp.life -= dt * 2.2;
      if (sp.life <= 0) sizzleSparks.splice(i, 1);
    }

    // Roasting logic
    if (state.mode !== "rest" && state.fireLit) {
      const heatCenterX = firePos.x;
      const heatCenterY = firePos.y - 42;
      const dx = state.pointer.x - heatCenterX;
      const dy = state.pointer.y - heatCenterY;
      const dist = Math.hypot(dx, dy);

      const heatRadius = 115;
      if (dist < heatRadius) {
        state.isNearHeat = true;
        const proximity = 1 - dist / heatRadius; // 0..1
        const speedMultiplier = state.mode === "marshmallow" ? 16 : 12;
        state.roastLevel = Math.min(100, state.roastLevel + proximity * speedMultiplier * state.fireIntensity * dt);
        updateRoastHUD();

        // Sizzle / roast steam particles
        state.sizzleTimer -= dt;
        if (state.sizzleTimer <= 0 && proximity > 0.25) {
          state.sizzleTimer = state.mode === "hotdog" ? 0.14 : 0.24;
          if (state.mode === "hotdog" && Math.random() < 0.55) {
            audio.playSizzle();
          }
          sizzleSparks.push({
            x: state.pointer.x + (Math.random() - 0.5) * 14,
            y: state.pointer.y + (Math.random() - 0.5) * 10,
            vx: (Math.random() - 0.5) * 18,
            vy: -(16 + Math.random() * 24),
            r: state.roastLevel > 88 ? 4 : 2.2,
            color: state.roastLevel > 88 ? "rgba(70, 65, 65, 0.55)" : "rgba(255, 225, 175, 0.5)",
            life: 1,
          });
        }
      } else {
        state.isNearHeat = false;
      }
    }
  }

  // --------------------------------------------------------------------------
  // Render Loop
  // --------------------------------------------------------------------------
  function render(now) {
    const w = state.width;
    const h = state.height;
    const horizon = h * 0.66;
    const flicker = state.fireIntensity > 0 ? 0.92 + Math.sin(now * 0.017) * 0.05 + Math.sin(now * 0.031) * 0.03 : 0;
    const glowStrength = state.fireIntensity * flicker;

    // 1. Night Sky
    const skyGrad = ctx.createLinearGradient(0, 0, 0, horizon + 30);
    skyGrad.addColorStop(0, "#040710");
    skyGrad.addColorStop(0.55, "#0a1326");
    skyGrad.addColorStop(1, "#132036");
    ctx.fillStyle = skyGrad;
    ctx.fillRect(0, 0, w, h);

    // 2. Stars
    for (const s of stars) {
      const twinkle = 0.55 + 0.45 * Math.sin(now * 0.0018 * s.speed + s.phase);
      ctx.globalAlpha = s.baseAlpha * twinkle;
      ctx.fillStyle = s.tint;
      ctx.beginPath();
      ctx.arc(s.x, s.y, s.r, 0, Math.PI * 2);
      ctx.fill();
    }
    ctx.globalAlpha = 1;

    // Shooting stars
    for (const s of shootingStars) {
      ctx.save();
      ctx.strokeStyle = `rgba(255, 248, 232, ${s.life * 0.85})`;
      ctx.lineWidth = 1.6;
      ctx.beginPath();
      ctx.moveTo(s.x, s.y);
      ctx.lineTo(s.x - s.vx * 0.14, s.y - s.vy * 0.14);
      ctx.stroke();
      ctx.restore();
    }

    // 3. Crescent Moon
    drawMoon(w * 0.18, h * 0.17);

    // 4. Distant Treeline
    drawForestLayer(treesBack, "#09101c");

    // 5. Ground Clearing
    const groundGrad = ctx.createLinearGradient(0, horizon, 0, h);
    groundGrad.addColorStop(0, "#0b121b");
    groundGrad.addColorStop(0.45, "#090f16");
    groundGrad.addColorStop(1, "#05080d");
    ctx.fillStyle = groundGrad;
    ctx.fillRect(0, horizon, w, h - horizon);

    // 6. Warm Firelight Cast Across Clearing & Sky
    if (glowStrength > 0.01) {
      const ambientGlow = ctx.createRadialGradient(
        firePos.x,
        firePos.y - 16,
        12,
        firePos.x,
        firePos.y - 16,
        Math.max(w * 0.42, 340) * Math.min(1.2, 0.7 + glowStrength * 0.4)
      );
      ambientGlow.addColorStop(0, `rgba(255, 158, 62, ${0.34 * Math.min(glowStrength, 1.2)})`);
      ambientGlow.addColorStop(0.35, `rgba(224, 102, 34, ${0.14 * Math.min(glowStrength, 1.2)})`);
      ambientGlow.addColorStop(1, "rgba(224, 102, 34, 0)");
      ctx.fillStyle = ambientGlow;
      ctx.fillRect(0, 0, w, h);

      // Ground warm pool
      const groundGlow = ctx.createRadialGradient(
        firePos.x,
        firePos.y + 12,
        10,
        firePos.x,
        firePos.y + 12,
        firePos.radius * 3.8
      );
      groundGlow.addColorStop(0, `rgba(255, 168, 72, ${0.42 * Math.min(glowStrength, 1.2)})`);
      groundGlow.addColorStop(0.55, `rgba(180, 78, 24, ${0.16 * Math.min(glowStrength, 1.2)})`);
      groundGlow.addColorStop(1, "rgba(180, 78, 24, 0)");
      ctx.fillStyle = groundGlow;
      ctx.beginPath();
      ctx.ellipse(firePos.x, firePos.y + 14, firePos.radius * 3.8, firePos.radius * 1.45, 0, 0, Math.PI * 2);
      ctx.fill();
    }

    // 7. Foreground Framing Woods
    drawForestLayer(treesFront, "#050910", glowStrength);

    // 8. Fireflies in the Dark Woods
    for (const f of fireflies) {
      const pulse = 0.2 + 0.8 * Math.pow(0.5 + 0.5 * Math.sin(now * 0.0022 * f.speed + f.phase), 2);
      ctx.fillStyle = `rgba(218, 245, 138, ${pulse * 0.7})`;
      ctx.beginPath();
      ctx.arc(f.x, f.y, f.r, 0, Math.PI * 2);
      ctx.fill();

      ctx.fillStyle = `rgba(218, 245, 138, ${pulse * 0.16})`;
      ctx.beginPath();
      ctx.arc(f.x, f.y, f.r * 4.2, 0, Math.PI * 2);
      ctx.fill();
    }

    // 9. Campfire Pit, Logs, Smoke, Flames, Embers
    drawCampfire(glowStrength, now);

    // 10. Roasting Stick (if holding marshmallow or hotdog)
    if (state.mode !== "rest") {
      drawRoastingStick();
    }

    // 11. Sizzle / steam sparks
    for (const sp of sizzleSparks) {
      ctx.globalAlpha = sp.life;
      ctx.fillStyle = sp.color;
      ctx.beginPath();
      ctx.arc(sp.x, sp.y, sp.r, 0, Math.PI * 2);
      ctx.fill();
    }
    ctx.globalAlpha = 1;
  }

  function drawMoon(mx, my) {
    ctx.save();
    // Soft moon halo
    const halo = ctx.createRadialGradient(mx, my, 12, mx, my, 110);
    halo.addColorStop(0, "rgba(220, 232, 255, 0.18)");
    halo.addColorStop(1, "rgba(220, 232, 255, 0)");
    ctx.fillStyle = halo;
    ctx.beginPath();
    ctx.arc(mx, my, 110, 0, Math.PI * 2);
    ctx.fill();

    // Moon disc
    ctx.fillStyle = "#eef2fa";
    ctx.beginPath();
    ctx.arc(mx, my, 22, 0, Math.PI * 2);
    ctx.fill();

    // Crescent shadow
    ctx.fillStyle = "#070f20";
    ctx.beginPath();
    ctx.arc(mx + 8, my - 4, 19, 0, Math.PI * 2);
    ctx.fill();
    ctx.restore();
  }

  function drawForestLayer(trees, baseColor, fireGlow = 0) {
    for (const t of trees) {
      ctx.fillStyle = baseColor;
      const tierHeight = t.height / t.tiers;
      for (let i = 0; i < t.tiers; i++) {
        const progress = i / t.tiers;
        const yBottom = t.baseY - i * tierHeight * 0.72;
        const yTop = yBottom - tierHeight * 1.25;
        const halfW = t.width * (1 - progress * 0.65) * 0.55;

        ctx.beginPath();
        ctx.moveTo(t.x, yTop);
        ctx.lineTo(t.x - halfW, yBottom);
        ctx.lineTo(t.x + halfW, yBottom);
        ctx.closePath();
        ctx.fill();
      }

      // Subtle warm edge highlight on foreground trees facing the fire
      if (fireGlow > 0.05) {
        const dist = Math.abs(t.x - firePos.x);
        const reach = state.width * 0.45;
        if (dist < reach) {
          const edgeAlpha = (1 - dist / reach) * 0.09 * Math.min(fireGlow, 1.2);
          ctx.fillStyle = `rgba(255, 148, 64, ${edgeAlpha})`;
          const side = t.x < firePos.x ? 1 : -1;
          ctx.beginPath();
          ctx.moveTo(t.x, t.baseY - t.height * 0.9);
          ctx.lineTo(t.x + side * t.width * 0.42, t.baseY);
          ctx.lineTo(t.x, t.baseY);
          ctx.closePath();
          ctx.fill();
        }
      }
    }
  }

  function drawCampfire(glowStrength, now) {
    // Back half of stone ring
    for (const s of stones) {
      if (s.y <= firePos.y + 12) drawStone(s, glowStrength);
    }

    // Smoke behind flames
    for (const s of smoke) {
      ctx.fillStyle = `rgba(170, 178, 192, ${s.life * 0.1})`;
      ctx.beginPath();
      ctx.arc(s.x, s.y, s.r, 0, Math.PI * 2);
      ctx.fill();
    }

    // Ash bed
    ctx.fillStyle = glowStrength > 0.05 ? "#2e1a12" : "#151921";
    ctx.beginPath();
    ctx.ellipse(firePos.x, firePos.y + 14, firePos.radius * 0.72, firePos.radius * 0.24, 0, 0, Math.PI * 2);
    ctx.fill();

    // Glowing coals
    if (glowStrength > 0.05) {
      const coalGrad = ctx.createRadialGradient(
        firePos.x,
        firePos.y + 11,
        4,
        firePos.x,
        firePos.y + 11,
        firePos.radius * 0.58
      );
      coalGrad.addColorStop(0, `rgba(255, 175, 65, ${0.85 * Math.min(glowStrength, 1)})`);
      coalGrad.addColorStop(0.55, `rgba(220, 62, 16, ${0.6 * Math.min(glowStrength, 1)})`);
      coalGrad.addColorStop(1, "rgba(120, 20, 8, 0)");
      ctx.fillStyle = coalGrad;
      ctx.beginPath();
      ctx.ellipse(firePos.x, firePos.y + 12, firePos.radius * 0.58, firePos.radius * 0.2, 0, 0, Math.PI * 2);
      ctx.fill();
    }

    // Crossed wooden logs
    drawLog(firePos.x - 24, firePos.y + 10, 56, 12, 0.24, glowStrength);
    drawLog(firePos.x + 24, firePos.y + 11, 56, 12, -0.26, glowStrength);
    drawLog(firePos.x, firePos.y + 15, 58, 11, 0.03, glowStrength);

    // Subtle invitation ring when fire is unlit
    if (!state.fireLit) {
      const pulse = 0.35 + 0.35 * Math.sin(now * 0.003);
      ctx.save();
      ctx.strokeStyle = state.pointer.hoveringFire
        ? `rgba(255, 198, 122, ${0.55 + pulse * 0.25})`
        : `rgba(215, 226, 245, ${0.14 + pulse * 0.14})`;
      ctx.lineWidth = state.pointer.hoveringFire ? 2 : 1.2;
      ctx.setLineDash([5, 6]);
      ctx.beginPath();
      ctx.ellipse(firePos.x, firePos.y + 10, firePos.radius * 1.08, firePos.radius * 0.44, 0, 0, Math.PI * 2);
      ctx.stroke();
      ctx.restore();
    }

    // Flames
    ctx.save();
    ctx.globalCompositeOperation = "lighter";
    for (const p of flames) {
      const radius = p.size * (0.4 + p.life * 0.8);
      const grad = ctx.createRadialGradient(p.x, p.y, 1, p.x, p.y, radius);
      if (p.life > 0.65) {
        grad.addColorStop(0, `rgba(255, 245, 190, ${p.life * 0.85})`);
        grad.addColorStop(0.45, `rgba(255, 165, 52, ${p.life * 0.65})`);
        grad.addColorStop(1, "rgba(255, 80, 15, 0)");
      } else {
        grad.addColorStop(0, `rgba(255, 158, 48, ${p.life * 0.72})`);
        grad.addColorStop(0.5, `rgba(228, 72, 16, ${p.life * 0.45})`);
        grad.addColorStop(1, "rgba(160, 28, 8, 0)");
      }
      ctx.fillStyle = grad;
      ctx.beginPath();
      ctx.arc(p.x, p.y, radius, 0, Math.PI * 2);
      ctx.fill();
    }

    // Embers
    for (const e of embers) {
      ctx.fillStyle = `rgba(255, 206, 108, ${e.life})`;
      ctx.beginPath();
      ctx.arc(e.x, e.y, e.size, 0, Math.PI * 2);
      ctx.fill();
    }
    ctx.restore();

    // Front half of stone ring
    for (const s of stones) {
      if (s.y > firePos.y + 12) drawStone(s, glowStrength);
    }
  }

  function drawStone(s, glowStrength) {
    ctx.save();
    ctx.translate(s.x, s.y);
    ctx.rotate(s.rot);
    const warmBoost = Math.round(glowStrength * 34);
    ctx.fillStyle = `rgb(${s.shade + warmBoost}, ${s.shade + Math.round(warmBoost * 0.48)}, ${s.shade + 4})`;
    ctx.beginPath();
    ctx.ellipse(0, 0, s.rx, s.ry, 0, 0, Math.PI * 2);
    ctx.fill();

    // Rim highlight facing fire
    if (glowStrength > 0.05) {
      ctx.strokeStyle = `rgba(255, 174, 88, ${0.22 * Math.min(glowStrength, 1)})`;
      ctx.lineWidth = 1.2;
      ctx.stroke();
    }
    ctx.restore();
  }

  function drawLog(x, y, length, thickness, angle, glowStrength) {
    ctx.save();
    ctx.translate(x, y);
    ctx.rotate(angle);

    const warmR = Math.round(62 + glowStrength * 36);
    const warmG = Math.round(42 + glowStrength * 16);
    const warmB = Math.round(30 + glowStrength * 4);

    ctx.fillStyle = `rgb(${warmR}, ${warmG}, ${warmB})`;
    ctx.beginPath();
    ctx.roundRect(-length / 2, -thickness / 2, length, thickness, thickness / 2);
    ctx.fill();

    // Bark highlight
    ctx.strokeStyle = `rgba(255, 178, 96, ${0.12 + glowStrength * 0.22})`;
    ctx.lineWidth = 1.2;
    ctx.beginPath();
    ctx.moveTo(-length * 0.35, -thickness * 0.25);
    ctx.lineTo(length * 0.35, -thickness * 0.25);
    ctx.stroke();

    ctx.restore();
  }

  function drawRoastingStick() {
    const tipX = state.pointer.x;
    const tipY = state.pointer.y;

    // Anchor handle toward bottom-right corner
    const handleX = Math.min(state.width + 60, Math.max(tipX + 180, state.width * 0.88));
    const handleY = Math.min(state.height + 60, Math.max(tipY + 130, state.height * 0.94));
    const angle = Math.atan2(tipY - handleY, tipX - handleX);

    ctx.save();

    // Wooden stick
    ctx.strokeStyle = "#6e4b30";
    ctx.lineWidth = 5;
    ctx.lineCap = "round";
    ctx.beginPath();
    ctx.moveTo(handleX, handleY);
    ctx.lineTo(tipX, tipY);
    ctx.stroke();

    // Lighter wood highlight
    ctx.strokeStyle = "rgba(218, 176, 128, 0.35)";
    ctx.lineWidth = 1.5;
    ctx.beginPath();
    ctx.moveTo(handleX, handleY - 1);
    ctx.lineTo(tipX, tipY - 1);
    ctx.stroke();

    // Food item on the tip
    ctx.translate(tipX, tipY);
    ctx.rotate(angle);

    if (state.mode === "marshmallow") {
      const color = lerpRoastColor("marshmallow", state.roastLevel);

      // Golden perfection aura
      if (state.roastLevel >= 50 && state.roastLevel < 88) {
        ctx.shadowColor = "rgba(255, 186, 86, 0.55)";
        ctx.shadowBlur = 12;
      }

      ctx.fillStyle = color;
      ctx.beginPath();
      ctx.roundRect(-14, -10, 26, 20, 6);
      ctx.fill();

      // Subtle toasted sheen
      ctx.shadowBlur = 0;
      ctx.fillStyle = "rgba(255, 255, 255, 0.16)";
      ctx.beginPath();
      ctx.roundRect(-10, -7, 16, 5, 3);
      ctx.fill();
    } else if (state.mode === "hotdog") {
      const color = lerpRoastColor("hotdog", state.roastLevel);

      if (state.roastLevel >= 52 && state.roastLevel < 90) {
        ctx.shadowColor = "rgba(255, 148, 66, 0.45)";
        ctx.shadowBlur = 10;
      }

      ctx.fillStyle = color;
      ctx.beginPath();
      ctx.roundRect(-24, -8, 48, 16, 8);
      ctx.fill();
      ctx.shadowBlur = 0;

      // Grill marks
      if (state.roastLevel > 35) {
        ctx.strokeStyle = `rgba(38, 12, 8, ${Math.min(0.7, (state.roastLevel - 30) / 80)})`;
        ctx.lineWidth = 2;
        for (let gx = -12; gx <= 12; gx += 8) {
          ctx.beginPath();
          ctx.moveTo(gx, -7);
          ctx.lineTo(gx + 3, 7);
          ctx.stroke();
        }
      }

      // Juicy sheen
      ctx.fillStyle = "rgba(255, 232, 210, 0.22)";
      ctx.beginPath();
      ctx.roundRect(-16, -5, 30, 3.5, 2);
      ctx.fill();
    }

    ctx.restore();
  }

  // --------------------------------------------------------------------------
  // Main Animation Loop
  // --------------------------------------------------------------------------
  function frame(now) {
    const dt = Math.min(0.05, (now - lastTime) / 1000);
    lastTime = now;

    update(dt, now);
    render(now);
    requestAnimationFrame(frame);
  }

  resize();
  requestAnimationFrame(frame);
})();
