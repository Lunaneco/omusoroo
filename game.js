(() => {
  "use strict";

  const canvas = document.getElementById("game");
  const ctx = canvas.getContext("2d", { alpha: false });
  const shell = document.querySelector(".game-shell");

  const hpFill = document.getElementById("hpFill");
  const forceFill = document.getElementById("forceFill");
  const waveText = document.getElementById("waveText");
  const scoreText = document.getElementById("scoreText");
  const comboText = document.getElementById("comboText");
  const bossHud = document.getElementById("bossHud");
  const bossFill = document.getElementById("bossFill");
  const bossName = document.getElementById("bossName");
  const centerPanel = document.getElementById("centerPanel");
  const panelTitle = document.getElementById("panelTitle");
  const kicker = document.getElementById("kicker");
  const startButton = document.getElementById("startButton");
  const restartButton = document.getElementById("restartButton");

  const ASSETS = {
    bg: "bg_diorama_mon0qncp.png",
    playerIdle: "player_idle_momzwm7l.png",
    playerAttack: "player_attack_momzwmke.png",
    playerForce: "player_force_momzwmxb.png",
    enemyMelee: "enemy_melee_mon0qbv2.png",
    enemyRanged: "enemy_ranged_mon0qc7x.png",
    bossIdle: "boss_idle_mon0qagj.png",
    bossRun: "boss_run_mon0qasx.png",
    bossAttack: "boss_attack_mon0qb5q.png",
    bossForce: "boss_force_mon0qbil.png",
    lastBossIdle: "lastboss_idle_mon0qckn.png",
    lastBossAttack: "lastboss_attack_mon0qcx2.png",
    slash: "effect_slash_mon0qd9l.png",
    force: "effect_force_mon0qdm9.png"
  };

  const MUSIC_ASSETS = {
    normal: "omusong1.wav",
    boss: "omusong2.wav",
    lastboss: "omusong3.wav"
  };

  const music = {
    normal: null,
    boss: null,
    lastboss: null
  };

  const ENEMY_CONFIG = {
    melee: { hp: 58, speed: 132, height: 124, damage: 10, score: 150 },
    ranged: { hp: 48, speed: 112, height: 124, damage: 9, score: 170 },
    boss: { hp: 250, speed: 98, height: 166, damage: 16, score: 850 },
    lastboss: { hp: 360, speed: 116, height: 186, damage: 20, score: 1500 }
  };

  const WAVES = [
    [
      { type: "melee", x: 620 },
      { type: "ranged", x: 900 },
      { type: "melee", x: 1120 }
    ],
    [
      { type: "ranged", x: 1400 },
      { type: "melee", x: 1580 },
      { type: "melee", x: 1790 },
      { type: "ranged", x: 2040 }
    ],
    [
      { type: "boss", x: 2300 }
    ],
    [
      { type: "melee", x: 2500 },
      { type: "ranged", x: 2730 },
      { type: "boss", x: 3000 }
    ],
    [
      { type: "lastboss", x: 3460 }
    ]
  ];

  const LEVEL_LENGTH = 4100;
  const keys = new Set();
  const touch = {
    left: false,
    right: false,
    jump: false
  };

  const view = {
    w: 1,
    h: 1,
    dpr: 1
  };

  const player = {};
  const state = {
    mode: "loading",
    time: 0,
    last: 0,
    cameraX: 0,
    score: 0,
    waveIndex: 0,
    waveDelay: 0,
    shake: 0,
    flash: 0,
    jumpWasDown: false,
    assetsReady: false
  };

  const art = {};
  const enemies = [];
  const projectiles = [];
  const particles = [];
  const slashes = [];
  const forceBursts = [];
  const afterImages = [];

  let audioCtx = null;
  let bgmSource = null;
  let bgmGain = null;
  let activeBgmType = null;
  let musicData = {};
  Object.assign(player, { hp: 100, force: 100, combo: 0 });

  const clamp = (value, min, max) => Math.max(min, Math.min(max, value));
  const lerp = (from, to, speed) => from + (to - from) * speed;
  const sign = (value) => (value < 0 ? -1 : 1);

  function groundY() {
    return view.h * (view.w < 720 ? 0.77 : 0.78);
  }

  function resize() {
    const bounds = shell.getBoundingClientRect();
    view.w = Math.max(1, bounds.width);
    view.h = Math.max(1, bounds.height);
    view.dpr = Math.min(window.devicePixelRatio || 1, 2);
    canvas.width = Math.max(1, Math.floor(view.w * view.dpr));
    canvas.height = Math.max(1, Math.floor(view.h * view.dpr));
    canvas.style.width = `${view.w}px`;
    canvas.style.height = `${view.h}px`;
    ctx.setTransform(view.dpr, 0, 0, view.dpr, 0, 0);
    ctx.imageSmoothingEnabled = false;
  }

  function loadImage(src) {
    return new Promise((resolve, reject) => {
      const img = new Image();
      img.onload = () => resolve(img);
      img.onerror = () => reject(new Error(`Failed to load ${src}`));
      img.src = src;
    });
  }

  function maskPink(image) {
    try {
      const out = document.createElement("canvas");
      out.width = image.naturalWidth || image.width;
      out.height = image.naturalHeight || image.height;
      const local = out.getContext("2d", { willReadFrequently: true });
      local.drawImage(image, 0, 0);
      const pixels = local.getImageData(0, 0, out.width, out.height);
      const data = pixels.data;

      for (let i = 0; i < data.length; i += 4) {
        const r = data[i];
        const g = data[i + 1];
        const b = data[i + 2];
        if (r > 178 && g < 95 && b > 170) {
          data[i + 3] = 0;
        }
      }

      local.putImageData(pixels, 0, 0);
      return out;
    } catch (e) {
      console.warn("Masking failed (CORS restriction).", e);
      return image;
    }
  }

  async function loadAssets() {
    const entries = await Promise.all(
      Object.entries(ASSETS).map(async ([key, src]) => [key, await loadImage(src)])
    );

    for (const [key, img] of entries) {
      art[key] = key === "bg" ? img : maskPink(img);
    }

    const musicPromises = Object.entries(MUSIC_ASSETS).map(async ([key, src]) => {
      try {
        const resp = await fetch(src);
        if (resp.ok) {
          musicData[key] = await resp.arrayBuffer();
        }
      } catch (e) {
        console.warn(`Could not fetch ${src} directly.`, e);
      }
    });
    await Promise.all(musicPromises);
  }

  function setOverlay(kind) {
    centerPanel.hidden = kind === "none";
    startButton.hidden = true;
    restartButton.hidden = true;
    startButton.disabled = !state.assetsReady;

    if (kind === "loading") {
      kicker.textContent = "LOADING";
      panelTitle.textContent = "OMSOLO";
    }

    if (kind === "title") {
      kicker.textContent = "NEON SABER RUSH";
      panelTitle.textContent = "OMSOLO";
      startButton.hidden = false;
      startButton.disabled = false;
    }

    if (kind === "clear") {
      kicker.textContent = "MISSION CLEAR";
      panelTitle.textContent = "CLEAR";
      restartButton.hidden = false;
    }

    if (kind === "down") {
      kicker.textContent = "SIGNAL LOST";
      panelTitle.textContent = "DOWN";
      restartButton.hidden = false;
    }
  }

  function ensureAudio() {
    const Ctor = window.AudioContext || window.webkitAudioContext;
    if (!Ctor) return;
    if (!audioCtx) {
      audioCtx = new Ctor();
      Object.keys(musicData).forEach(key => {
        audioCtx.decodeAudioData(musicData[key].slice(0)).then(decoded => {
          music[key] = decoded;
          delete musicData[key];
        });
      });
    }
    if (audioCtx.state === "suspended") audioCtx.resume();
  }

  function playBGM(type) {
    if (!audioCtx || activeBgmType === type) return;
    const buffer = music[type];
    if (!buffer) return;

    if (bgmSource) {
      const oldGain = bgmGain;
      const oldSource = bgmSource;
      const now = audioCtx.currentTime;
      oldGain.gain.exponentialRampToValueAtTime(0.001, now + 1.2);
      setTimeout(() => {
        try { oldSource.stop(); } catch(e) {}
      }, 1300);
    }

    const source = audioCtx.createBufferSource();
    const gain = audioCtx.createGain();
    source.buffer = buffer;
    source.loop = true;

    const now = audioCtx.currentTime;
    gain.gain.setValueAtTime(0.001, now);
    gain.gain.exponentialRampToValueAtTime(0.45, now + 1.0);

    source.connect(gain);
    gain.connect(audioCtx.destination);
    source.start(0);

    bgmSource = source;
    bgmGain = gain;
    activeBgmType = type;
  }

  function stopBGM(fadeTime = 1) {
    if (bgmSource && bgmGain) {
      const now = audioCtx.currentTime;
      bgmGain.gain.exponentialRampToValueAtTime(0.001, now + fadeTime);
      const s = bgmSource;
      setTimeout(() => {
        try { s.stop(); } catch(e) {}
      }, fadeTime * 1000 + 100);
      bgmSource = null;
      bgmGain = null;
      activeBgmType = null;
    }
  }

  function tone(freq, duration, type = "sine", gain = 0.05, sweep = 1) {
    if (!audioCtx) return;
    const now = audioCtx.currentTime;
    const osc = audioCtx.createOscillator();
    const volume = audioCtx.createGain();
    osc.type = type;
    osc.frequency.setValueAtTime(freq, now);
    osc.frequency.exponentialRampToValueAtTime(Math.max(24, freq * sweep), now + duration);
    volume.gain.setValueAtTime(gain, now);
    volume.gain.exponentialRampToValueAtTime(0.001, now + duration);
    osc.connect(volume);
    volume.connect(audioCtx.destination);
    osc.start(now);
    osc.stop(now + duration);
  }

  function sound(name) {
    if (!audioCtx) return;
    if (name === "slash") {
      tone(620, 0.08, "sawtooth", 0.035, 1.8);
      tone(1300, 0.05, "triangle", 0.025, 0.7);
    } else if (name === "force") {
      tone(120, 0.16, "sine", 0.055, 2.7);
      tone(430, 0.12, "triangle", 0.035, 0.55);
    } else if (name === "hit") {
      tone(190, 0.05, "square", 0.035, 0.55);
    } else if (name === "dash") {
      tone(760, 0.07, "sawtooth", 0.03, 0.42);
    } else if (name === "laser") {
      tone(520, 0.08, "square", 0.022, 1.45);
    } else if (name === "clear") {
      tone(380, 0.1, "triangle", 0.04, 1.7);
      setTimeout(() => tone(620, 0.12, "triangle", 0.04, 1.45), 80);
    }
  }

  function resetGame() {
    Object.assign(player, {
      x: 180,
      z: 0,
      vx: 0,
      vz: 0,
      facing: 1,
      hp: 100,
      force: 78,
      grounded: true,
      attackTimer: 0,
      attackCooldown: 0,
      forceTimer: 0,
      forceCooldown: 0,
      dashTimer: 0,
      dashCooldown: 0,
      invuln: 0,
      hurtTimer: 0,
      combo: 0,
      comboTimer: 0
    });

    enemies.length = 0;
    projectiles.length = 0;
    particles.length = 0;
    slashes.length = 0;
    forceBursts.length = 0;
    afterImages.length = 0;

    state.mode = "playing";
    state.time = 0;
    state.cameraX = 0;
    state.score = 0;
    state.waveIndex = 0;
    state.waveDelay = 0;
    state.shake = 0;
    state.flash = 0;
    state.jumpWasDown = false;
    spawnWave(0);
    setOverlay("none");
    playBGM("normal");
  }

  function spawnWave(index) {
    for (const spec of WAVES[index]) {
      enemies.push(createEnemy(spec.type, spec.x));
      if (spec.type === "boss") playBGM("boss");
      if (spec.type === "lastboss") playBGM("lastboss");
    }
    for (let i = 0; i < 26; i += 1) {
      particles.push({
        x: player.x + 280 + Math.random() * 260,
        z: 120 + Math.random() * 190,
        vx: -120 - Math.random() * 130,
        vz: -20 + Math.random() * 70,
        life: 0.45 + Math.random() * 0.4,
        max: 0.85,
        size: 2 + Math.random() * 2.5,
        color: i % 2 ? "#42e8ff" : "#ffd166"
      });
    }
  }

  function createEnemy(type, x) {
    const config = ENEMY_CONFIG[type];
    return {
      type,
      x,
      z: 0,
      vx: 0,
      hp: config.hp,
      maxHp: config.hp,
      speed: config.speed,
      height: config.height,
      damage: config.damage,
      score: config.score,
      facing: -1,
      cooldown: 0.4 + Math.random() * 0.5,
      attackTimer: 0,
      forceTimer: 0,
      hitFlash: 0,
      dead: false
    };
  }

  function requestJump() {
    if (state.mode !== "playing" || !player.grounded) return;
    player.vz = 610;
    player.grounded = false;
    tone(300, 0.06, "triangle", 0.02, 1.35);
  }

  function requestDash() {
    if (state.mode !== "playing" || player.dashCooldown > 0) return;
    ensureAudio();
    player.dashTimer = 0.15;
    player.dashCooldown = 0.55;
    player.invuln = Math.max(player.invuln, 0.2);
    player.vx = player.facing * 850;
    state.shake = Math.max(state.shake, 4);
    sound("dash");
    afterImages.push({ x: player.x, z: player.z, facing: player.facing, life: 0.22, max: 0.22 });
  }

  function requestAttack() {
    if (state.mode !== "playing" || player.attackCooldown > 0) return;
    ensureAudio();
    player.attackTimer = 0.18;
    player.attackCooldown = 0.24;
    sound("slash");

    slashes.push({
      x: player.x + player.facing * 92,
      z: player.z + 84,
      facing: player.facing,
      life: 0.16,
      max: 0.16,
      height: 154
    });

    const reach = player.dashTimer > 0 ? 220 : 170;
    for (const enemy of enemies) {
      if (enemy.dead) continue;
      const side = (enemy.x - player.x) * player.facing;
      const vertical = Math.abs(enemy.z - player.z);
      if (side > -38 && side < reach && vertical < 120) {
        hurtEnemy(enemy, 30, player.facing * (360 + player.dashTimer * 900));
      }
    }

    for (const bolt of projectiles) {
      if (bolt.owner !== "enemy") continue;
      const side = (bolt.x - player.x) * player.facing;
      if (side > -18 && side < 145 && Math.abs(bolt.z - (player.z + 72)) < 90) {
        bolt.owner = "player";
        bolt.vx = player.facing * Math.max(690, Math.abs(bolt.vx) + 140);
        bolt.color = "#42e8ff";
        bolt.damage = 34;
        state.score += 15;
        sound("laser");
      }
    }
  }

  function requestForce() {
    if (state.mode !== "playing" || player.forceCooldown > 0 || player.force < 30) return;
    ensureAudio();
    player.force -= 30;
    player.forceTimer = 0.27;
    player.forceCooldown = 0.66;
    state.shake = Math.max(state.shake, 6);
    sound("force");

    forceBursts.push({
      x: player.x + player.facing * 136,
      z: player.z + 76,
      facing: player.facing,
      life: 0.28,
      max: 0.28
    });

    for (const enemy of enemies) {
      if (enemy.dead) continue;
      const side = (enemy.x - player.x) * player.facing;
      if (side > -20 && side < 390) {
        hurtEnemy(enemy, enemy.type === "lastboss" ? 18 : 24, player.facing * 520);
      }
    }

    for (const bolt of projectiles) {
      const side = (bolt.x - player.x) * player.facing;
      if (side > -60 && side < 430) {
        bolt.owner = "player";
        bolt.vx = player.facing * 780;
        bolt.color = "#6dff9f";
        bolt.damage = Math.max(bolt.damage, 38);
      }
    }
  }

  function hurtEnemy(enemy, amount, knockback) {
    if (enemy.dead) return;
    enemy.hp -= amount;
    enemy.vx += knockback;
    enemy.hitFlash = 0.12;
    player.combo += 1;
    player.comboTimer = 1.25;
    player.force = clamp(player.force + 7, 0, 100);
    state.score += Math.round(amount * (1 + Math.min(player.combo, 30) * 0.04));
    state.shake = Math.max(state.shake, enemy.type === "melee" || enemy.type === "ranged" ? 3 : 5);
    sound("hit");
    spark(enemy.x, enemy.height * 0.58, 12, enemy.type === "ranged" ? "#ff3fd8" : "#42e8ff");

    if (enemy.hp <= 0) {
      enemy.dead = true;
      state.score += enemy.score;
      player.force = clamp(player.force + 14, 0, 100);
      if (enemy.type === "boss" || enemy.type === "lastboss") {
        player.hp = clamp(player.hp + 18, 0, 100);
        state.shake = Math.max(state.shake, 12);
        spark(enemy.x, enemy.height * 0.72, 34, "#ffd166");
      }
    }
  }

  function damagePlayer(amount, knockback) {
    if (player.invuln > 0 || state.mode !== "playing") return;
    player.hp = clamp(player.hp - amount, 0, 100);
    player.vx += knockback;
    player.invuln = 0.58;
    player.hurtTimer = 0.18;
    player.combo = 0;
    player.comboTimer = 0;
    state.shake = Math.max(state.shake, 8);
    state.flash = 0.16;
    sound("hit");
    spark(player.x, player.z + 82, 14, "#ff5a6d");

    if (player.hp <= 0) {
      state.mode = "down";
      setOverlay("down");
      stopBGM(0.6);
    }
  }

  function fireProjectile(owner, x, z, vx, color, damage, radius = 8) {
    projectiles.push({
      owner,
      x,
      z,
      vx,
      life: 2.8,
      color,
      damage,
      radius
    });
    sound("laser");
  }

  function spark(x, z, count, color) {
    for (let i = 0; i < count; i += 1) {
      const angle = Math.random() * Math.PI * 2;
      const speed = 90 + Math.random() * 310;
      particles.push({
        x,
        z,
        vx: Math.cos(angle) * speed,
        vz: Math.sin(angle) * speed,
        life: 0.35 + Math.random() * 0.45,
        max: 0.8,
        size: 2 + Math.random() * 3,
        color
      });
    }
  }

  function update(dt) {
    state.time += dt;
    state.shake = Math.max(0, state.shake - dt * 22);
    state.flash = Math.max(0, state.flash - dt);

    if (state.mode !== "playing") {
      updateParticles(dt);
      return;
    }

    updatePlayer(dt);
    updateEnemies(dt);
    updateProjectiles(dt);
    updateEffects(dt);
    updateParticles(dt);
    updateWaves(dt);
    updateHud();
  }

  function updatePlayer(dt) {
    const left = keys.has("ArrowLeft") || keys.has("KeyA") || touch.left;
    const right = keys.has("ArrowRight") || keys.has("KeyD") || touch.right;
    const jumpDown = keys.has("ArrowUp") || keys.has("KeyW") || keys.has("Space") || touch.jump;

    if (jumpDown && !state.jumpWasDown) requestJump();
    state.jumpWasDown = jumpDown;

    player.attackTimer = Math.max(0, player.attackTimer - dt);
    player.attackCooldown = Math.max(0, player.attackCooldown - dt);
    player.forceTimer = Math.max(0, player.forceTimer - dt);
    player.forceCooldown = Math.max(0, player.forceCooldown - dt);
    player.dashTimer = Math.max(0, player.dashTimer - dt);
    player.dashCooldown = Math.max(0, player.dashCooldown - dt);
    player.invuln = Math.max(0, player.invuln - dt);
    player.hurtTimer = Math.max(0, player.hurtTimer - dt);
    player.comboTimer = Math.max(0, player.comboTimer - dt);
    if (player.comboTimer <= 0) player.combo = 0;
    player.force = clamp(player.force + dt * 10, 0, 100);

    const move = (right ? 1 : 0) - (left ? 1 : 0);
    if (move !== 0) {
      player.facing = move;
      if (player.dashTimer <= 0) player.vx += move * (player.grounded ? 1840 : 980) * dt;
    } else if (player.dashTimer <= 0) {
      player.vx *= Math.pow(player.grounded ? 0.045 : 0.22, dt);
    }

    const maxSpeed = player.dashTimer > 0 ? 920 : 360;
    player.vx = clamp(player.vx, -maxSpeed, maxSpeed);
    player.x += player.vx * dt;
    player.x = clamp(player.x, 80, LEVEL_LENGTH - 120);

    player.vz -= 1420 * dt;
    player.z += player.vz * dt;
    if (player.z <= 0) {
      player.z = 0;
      player.vz = 0;
      player.grounded = true;
    } else {
      player.grounded = false;
    }

    const targetCamera = clamp(player.x - view.w * 0.36, 0, Math.max(0, LEVEL_LENGTH - view.w * 0.82));
    state.cameraX = lerp(state.cameraX, targetCamera, clamp(dt * 5.4, 0, 1));

    if (player.dashTimer > 0 && Math.random() < 0.55) {
      afterImages.push({ x: player.x, z: player.z, facing: player.facing, life: 0.18, max: 0.18 });
    }
  }

  function updateEnemies(dt) {
    for (const enemy of enemies) {
      if (enemy.dead) continue;

      enemy.cooldown -= dt;
      enemy.attackTimer = Math.max(0, enemy.attackTimer - dt);
      enemy.forceTimer = Math.max(0, enemy.forceTimer - dt);
      enemy.hitFlash = Math.max(0, enemy.hitFlash - dt);
      enemy.facing = sign(player.x - enemy.x);

      const dist = player.x - enemy.x;
      const absDist = Math.abs(dist);
      const active = absDist < 980 || enemy.type === "boss" || enemy.type === "lastboss";

      if (!active) {
        enemy.vx *= Math.pow(0.2, dt);
        enemy.x += enemy.vx * dt;
        continue;
      }

      if (enemy.type === "melee") {
        if (absDist > 76) enemy.vx += enemy.facing * enemy.speed * 11 * dt;
        if (absDist <= 86 && enemy.cooldown <= 0) {
          enemy.cooldown = 0.82;
          enemy.attackTimer = 0.22;
          slashes.push({ x: enemy.x + enemy.facing * 62, z: 80, facing: enemy.facing, life: 0.12, max: 0.12, height: 112 });
          damagePlayer(enemy.damage, enemy.facing * 270);
        }
      } else if (enemy.type === "ranged") {
        if (absDist < 240) enemy.vx -= enemy.facing * enemy.speed * 10 * dt;
        if (absDist > 420) enemy.vx += enemy.facing * enemy.speed * 7 * dt;
        if (absDist < 760 && enemy.cooldown <= 0) {
          enemy.cooldown = 1.18 + Math.random() * 0.25;
          enemy.attackTimer = 0.18;
          fireProjectile("enemy", enemy.x + enemy.facing * 50, 84, enemy.facing * 520, "#ff5a6d", enemy.damage);
        }
      } else {
        const bossRange = enemy.type === "lastboss" ? 128 : 118;
        if (absDist > bossRange) enemy.vx += enemy.facing * enemy.speed * 8 * dt;
        if (enemy.cooldown <= 0) {
          if (absDist < bossRange + 28) {
            enemy.cooldown = enemy.type === "lastboss" ? 0.8 : 0.95;
            enemy.attackTimer = 0.24;
            slashes.push({ x: enemy.x + enemy.facing * 82, z: 100, facing: enemy.facing, life: 0.16, max: 0.16, height: 156 });
            damagePlayer(enemy.damage, enemy.facing * 390);
          } else {
            enemy.cooldown = enemy.type === "lastboss" ? 1.05 : 1.25;
            enemy.forceTimer = 0.28;
            const color = enemy.type === "lastboss" ? "#ff3fd8" : "#ffd166";
            fireProjectile("enemy", enemy.x + enemy.facing * 80, 96, enemy.facing * 610, color, enemy.damage + 2, 10);
            if (enemy.hp < enemy.maxHp * 0.46) {
              setTimeout(() => {
                if (state.mode === "playing" && !enemy.dead) {
                  fireProjectile("enemy", enemy.x + enemy.facing * 80, 132, enemy.facing * 700, color, enemy.damage + 3, 9);
                }
              }, 160);
            }
          }
        }
      }

      enemy.vx = clamp(enemy.vx, -enemy.speed * 2.1, enemy.speed * 2.1);
      enemy.x += enemy.vx * dt;
      enemy.vx *= Math.pow(0.12, dt);
      enemy.x = clamp(enemy.x, 100, LEVEL_LENGTH - 90);
    }

    for (let i = enemies.length - 1; i >= 0; i -= 1) {
      if (enemies[i].dead) enemies.splice(i, 1);
    }
  }

  function updateProjectiles(dt) {
    for (const bolt of projectiles) {
      bolt.life -= dt;
      bolt.x += bolt.vx * dt;

      if (bolt.owner === "enemy") {
        const nearX = Math.abs(bolt.x - player.x) < bolt.radius + 34;
        const nearZ = Math.abs(bolt.z - (player.z + 72)) < 70;
        if (nearX && nearZ) {
          bolt.life = 0;
          damagePlayer(bolt.damage, sign(bolt.vx) * 210);
        }
      } else {
        for (const enemy of enemies) {
          if (enemy.dead) continue;
          const nearX = Math.abs(bolt.x - enemy.x) < bolt.radius + 42;
          const nearZ = Math.abs(bolt.z - enemy.height * 0.52) < enemy.height * 0.48;
          if (nearX && nearZ) {
            bolt.life = 0;
            hurtEnemy(enemy, bolt.damage, sign(bolt.vx) * 280);
            break;
          }
        }
      }
    }

    for (let i = projectiles.length - 1; i >= 0; i -= 1) {
      const bolt = projectiles[i];
      if (bolt.life <= 0 || bolt.x < state.cameraX - 260 || bolt.x > state.cameraX + view.w + 260) {
        projectiles.splice(i, 1);
      }
    }
  }

  function updateEffects(dt) {
    for (const group of [slashes, forceBursts, afterImages]) {
      for (const item of group) item.life -= dt;
      for (let i = group.length - 1; i >= 0; i -= 1) {
        if (group[i].life <= 0) group.splice(i, 1);
      }
    }
  }

  function updateParticles(dt) {
    for (const p of particles) {
      p.life -= dt;
      p.x += p.vx * dt;
      p.z += p.vz * dt;
      p.vz -= 520 * dt;
      p.vx *= Math.pow(0.2, dt);
      if (p.z < 0) {
        p.z = 0;
        p.vz *= -0.25;
      }
    }

    for (let i = particles.length - 1; i >= 0; i -= 1) {
      if (particles[i].life <= 0) particles.splice(i, 1);
    }
  }

  function updateWaves(dt) {
    if (state.waveDelay > 0) {
      state.waveDelay -= dt;
      if (state.waveDelay <= 0) spawnWave(state.waveIndex);
      return;
    }

    if (enemies.length === 0) {
      if (state.waveIndex < WAVES.length - 1) {
        state.waveIndex += 1;
        state.waveDelay = 0.75;
      } else {
        state.mode = "clear";
        sound("clear");
        setOverlay("clear");
        stopBGM(2.5);
      }
    }
  }

  function updateHud() {
    hpFill.style.width = `${player.hp}%`;
    forceFill.style.width = `${player.force}%`;
    waveText.textContent = String(Math.min(state.waveIndex + 1, WAVES.length)).padStart(2, "0");
    scoreText.textContent = String(state.score).padStart(6, "0");
    comboText.textContent = `x${player.combo}`;

    const boss = enemies.find((enemy) => enemy.type === "boss" || enemy.type === "lastboss");
    bossHud.hidden = !boss;
    if (boss) {
      bossName.textContent = boss.type === "lastboss" ? "FINAL" : "BOSS";
      bossFill.style.width = `${clamp((boss.hp / boss.maxHp) * 100, 0, 100)}%`;
    }
  }

  function draw() {
    ctx.save();
    ctx.setTransform(view.dpr, 0, 0, view.dpr, 0, 0);
    ctx.imageSmoothingEnabled = false;
    ctx.clearRect(0, 0, view.w, view.h);

    if (state.shake > 0) {
      ctx.translate((Math.random() - 0.5) * state.shake, (Math.random() - 0.5) * state.shake);
    }

    drawBackground();
    drawProjectiles();
    drawAfterImages();
    drawEnemies();
    drawPlayer();
    drawEffects();
    drawParticles();

    if (state.flash > 0) {
      ctx.globalAlpha = state.flash * 1.8;
      ctx.fillStyle = "#ff5a6d";
      ctx.fillRect(0, 0, view.w, view.h);
      ctx.globalAlpha = 1;
    }

    ctx.restore();
  }

  function drawBackground() {
    const g = groundY();
    ctx.fillStyle = "#050712";
    ctx.fillRect(0, 0, view.w, view.h);

    if (art.bg) {
      const aspect = art.bg.width / art.bg.height;
      const bgH = view.h;
      const bgW = bgH * aspect;
      const offset = -((state.cameraX * 0.22) % bgW);
      for (let x = offset - bgW; x < view.w + bgW; x += bgW) {
        ctx.drawImage(art.bg, x, 0, bgW, bgH);
      }
    }

    const fade = ctx.createLinearGradient(0, 0, 0, view.h);
    fade.addColorStop(0, "rgba(0, 0, 0, 0.22)");
    fade.addColorStop(0.44, "rgba(2, 7, 18, 0.06)");
    fade.addColorStop(1, "rgba(2, 4, 10, 0.58)");
    ctx.fillStyle = fade;
    ctx.fillRect(0, 0, view.w, view.h);

    ctx.save();
    ctx.globalAlpha = 0.62;
    for (let wx = -240; wx < LEVEL_LENGTH + 480; wx += 190) {
      const x = wx - state.cameraX;
      if (x < -140 || x > view.w + 140) continue;
      const glow = wx % 380 === 0 ? "#42e8ff" : "#ff3fd8";
      ctx.strokeStyle = glow;
      ctx.lineWidth = 1;
      ctx.globalAlpha = 0.16;
      ctx.beginPath();
      ctx.moveTo(x, g - 58);
      ctx.lineTo(x - 78, view.h);
      ctx.stroke();

      ctx.globalAlpha = 0.38;
      ctx.fillStyle = glow;
      ctx.fillRect(x - 1, g - 78, 2, 72);
    }
    ctx.restore();

    const road = ctx.createLinearGradient(0, g - 50, 0, view.h);
    road.addColorStop(0, "rgba(6, 13, 26, 0.18)");
    road.addColorStop(1, "rgba(1, 3, 8, 0.68)");
    ctx.fillStyle = road;
    ctx.fillRect(0, g - 70, view.w, view.h - g + 70);

    ctx.save();
    ctx.globalAlpha = 0.44;
    ctx.strokeStyle = "#ffd166";
    ctx.lineWidth = 2;
    ctx.beginPath();
    ctx.moveTo(0, g + 22);
    ctx.lineTo(view.w, g + 22);
    ctx.stroke();
    ctx.globalAlpha = 0.18;
    ctx.strokeStyle = "#42e8ff";
    ctx.beginPath();
    ctx.moveTo(0, g - 16);
    ctx.lineTo(view.w, g - 16);
    ctx.stroke();
    ctx.restore();
  }

  function drawProjectiles() {
    const g = groundY();
    ctx.save();
    for (const bolt of projectiles) {
      const x = bolt.x - state.cameraX;
      const y = g - bolt.z;
      const tail = clamp(Math.abs(bolt.vx) * 0.07, 20, 54) * -sign(bolt.vx);
      ctx.globalAlpha = clamp(bolt.life, 0, 1);
      ctx.shadowColor = bolt.color;
      ctx.shadowBlur = 18;
      ctx.strokeStyle = bolt.color;
      ctx.lineWidth = bolt.radius;
      ctx.lineCap = "round";
      ctx.beginPath();
      ctx.moveTo(x, y);
      ctx.lineTo(x + tail, y);
      ctx.stroke();
      ctx.fillStyle = "#fff";
      ctx.beginPath();
      ctx.arc(x, y, Math.max(2, bolt.radius * 0.34), 0, Math.PI * 2);
      ctx.fill();
    }
    ctx.restore();
  }

  function drawAfterImages() {
    const g = groundY();
    for (const ghost of afterImages) {
      const alpha = clamp(ghost.life / ghost.max, 0, 1) * 0.3;
      drawSprite("playerIdle", ghost.x - state.cameraX, g - ghost.z, 128, ghost.facing, alpha, "#42e8ff");
    }
  }

  function drawEnemies() {
    const g = groundY();
    const ordered = [...enemies].sort((a, b) => a.x - b.x);

    for (const enemy of ordered) {
      const x = enemy.x - state.cameraX;
      if (x < -260 || x > view.w + 260) continue;
      drawShadow(x, g, enemy.height * 0.46, enemy.hitFlash > 0 ? "#ff5a6d" : "#42e8ff");

      const key = enemyImage(enemy);
      const alpha = enemy.hitFlash > 0 ? 0.9 : 1;
      const tint = enemy.hitFlash > 0 ? "#ffffff" : null;
      drawSprite(key, x, g - enemy.z, enemy.height, enemy.facing, alpha, tint);

      if (enemy.hp < enemy.maxHp) {
        const width = enemy.type === "boss" || enemy.type === "lastboss" ? 74 : 46;
        const y = g - enemy.height - 18;
        ctx.save();
        ctx.fillStyle = "rgba(0, 0, 0, 0.58)";
        ctx.fillRect(x - width / 2, y, width, 5);
        ctx.fillStyle = enemy.type === "lastboss" ? "#ff3fd8" : "#ffd166";
        ctx.fillRect(x - width / 2, y, width * clamp(enemy.hp / enemy.maxHp, 0, 1), 5);
        ctx.restore();
      }
    }
  }

  function drawPlayer() {
    const g = groundY();
    const x = player.x - state.cameraX;
    const y = g - player.z;
    const blink = player.invuln > 0 && Math.floor(state.time * 24) % 2 === 0;
    if (blink) return;

    drawShadow(x, g, 48, player.dashTimer > 0 ? "#42e8ff" : "#ffd166");
    let key = "playerIdle";
    let height = 132;
    let offset = 0;
    if (player.forceTimer > 0) {
      key = "playerForce";
      height = 132;
      offset = 18 * player.facing;
    } else if (player.attackTimer > 0) {
      key = "playerAttack";
      height = 138;
      offset = 34 * player.facing;
    }

    drawSprite(key, x + offset, y, height, player.facing, player.hurtTimer > 0 ? 0.82 : 1, player.hurtTimer > 0 ? "#ff5a6d" : null);
  }

  function drawEffects() {
    const g = groundY();
    ctx.save();
    for (const slash of slashes) {
      const alpha = clamp(slash.life / slash.max, 0, 1);
      drawSprite("slash", slash.x - state.cameraX, g - slash.z, slash.height, slash.facing, alpha, null);
    }

    for (const burst of forceBursts) {
      const alpha = clamp(burst.life / burst.max, 0, 1);
      drawSprite("force", burst.x - state.cameraX, g - burst.z, 162, burst.facing, alpha * 0.92, null);
      ctx.save();
      ctx.globalAlpha = alpha * 0.32;
      ctx.strokeStyle = "#42e8ff";
      ctx.lineWidth = 4;
      ctx.shadowColor = "#42e8ff";
      ctx.shadowBlur = 18;
      ctx.beginPath();
      ctx.arc(burst.x - state.cameraX, g - burst.z, 82 * (1 - alpha + 0.4), -0.8, 0.8);
      ctx.stroke();
      ctx.restore();
    }
    ctx.restore();
  }

  function drawParticles() {
    const g = groundY();
    ctx.save();
    for (const p of particles) {
      const alpha = clamp(p.life / p.max, 0, 1);
      const x = p.x - state.cameraX;
      const y = g - p.z;
      if (x < -20 || x > view.w + 20 || y < -20 || y > view.h + 20) continue;
      ctx.globalAlpha = alpha;
      ctx.fillStyle = p.color;
      ctx.shadowColor = p.color;
      ctx.shadowBlur = 9;
      ctx.fillRect(x, y, p.size, p.size);
    }
    ctx.restore();
  }

  function enemyImage(enemy) {
    if (enemy.type === "melee") return "enemyMelee";
    if (enemy.type === "ranged") return "enemyRanged";
    if (enemy.type === "lastboss") return enemy.attackTimer > 0 ? "lastBossAttack" : "lastBossIdle";
    if (enemy.forceTimer > 0) return "bossForce";
    if (enemy.attackTimer > 0) return "bossAttack";
    if (Math.abs(enemy.vx) > 28) return "bossRun";
    return "bossIdle";
  }

  function drawShadow(x, y, width, color) {
    ctx.save();
    ctx.globalAlpha = 0.32;
    ctx.fillStyle = color;
    ctx.shadowColor = color;
    ctx.shadowBlur = 14;
    ctx.beginPath();
    ctx.ellipse(x, y + 5, width, 10, 0, 0, Math.PI * 2);
    ctx.fill();
    ctx.restore();
  }

  function drawSprite(key, x, bottomY, height, facing, alpha = 1, tint = null) {
    const image = art[key];
    if (!image) return;
    const width = height * (image.width / image.height);

    ctx.save();
    ctx.globalAlpha = alpha;
    if (tint) {
      ctx.filter = `drop-shadow(0 0 12px ${tint}) brightness(1.6)`;
    } else {
      ctx.filter = "drop-shadow(0 0 12px rgba(0, 0, 0, 0.55))";
    }
    ctx.translate(x, bottomY);
    ctx.scale(facing, 1);
    ctx.drawImage(image, -width / 2, -height, width, height);
    ctx.restore();
  }

  function loop(now) {
    const dt = Math.min(0.033, ((now || 0) - state.last) / 1000 || 0.016);
    state.last = now || 0;
    update(dt);
    draw();
    requestAnimationFrame(loop);
  }

  function handleKeyDown(event) {
    const code = event.code;
    if (["ArrowLeft", "ArrowRight", "ArrowUp", "Space", "KeyA", "KeyD", "KeyW", "KeyJ", "KeyK", "KeyL", "ShiftLeft", "ShiftRight", "Enter"].includes(code)) {
      event.preventDefault();
    }

    if (state.mode === "title" && (code === "Enter" || code === "Space")) {
      ensureAudio();
      resetGame();
      return;
    }

    if ((state.mode === "down" || state.mode === "clear") && (code === "Enter" || code === "Space")) {
      ensureAudio();
      resetGame();
      return;
    }

    if (event.repeat) {
      keys.add(code);
      return;
    }

    keys.add(code);
    if (code === "KeyJ" || code === "KeyX") requestAttack();
    if (code === "KeyK" || code === "KeyC") requestForce();
    if (code === "KeyL" || code === "ShiftLeft" || code === "ShiftRight") requestDash();
  }

  function handleKeyUp(event) {
    keys.delete(event.code);
  }

  function bindTouchControls() {
    const area = shell;
    const g = {
      x: 0,
      y: 0,
      t: 0,
      active: false
    };

    area.addEventListener("pointerdown", (e) => {
      ensureAudio();
      if (state.mode === "title" || state.mode === "down" || state.mode === "clear") {
        resetGame();
        return;
      }
      g.x = e.clientX;
      g.y = e.clientY;
      g.t = Date.now();
      g.active = true;
      if (area.setPointerCapture) area.setPointerCapture(e.pointerId);
    });

    area.addEventListener("pointermove", (e) => {
      if (!g.active) return;
      const dx = e.clientX - g.x;
      if (Math.abs(dx) > 15) {
        touch.left = dx < -15;
        touch.right = dx > 15;
      } else {
        touch.left = false;
        touch.right = false;
      }
    });

    const handleUp = (e) => {
      if (!g.active) return;
      g.active = false;

      const dx = e.clientX - g.x;
      const dy = e.clientY - g.y;
      const dt = Date.now() - g.t;
      const dist = Math.hypot(dx, dy);
      const vx = dx / dt;

      // タップ -> 攻撃
      if (dt < 220 && dist < 12) {
        requestAttack();
      }
      // 横フリック -> フォース
      else if (dt < 280 && Math.abs(vx) > 0.55 && Math.abs(dx) > 35) {
        requestForce();
      }
      // 上スワイプ -> ジャンプ
      else if (dy < -35 && Math.abs(dx) < 80) {
        requestJump();
      }

      touch.left = false;
      touch.right = false;
    };

    area.addEventListener("pointerup", handleUp);
    area.addEventListener("pointercancel", handleUp);
  }

  startButton.addEventListener("click", () => {
    ensureAudio();
    resetGame();
  });

  restartButton.addEventListener("click", () => {
    ensureAudio();
    resetGame();
  });

  window.addEventListener("resize", resize);
  window.addEventListener("keydown", handleKeyDown);
  window.addEventListener("keyup", handleKeyUp);
  window.addEventListener("blur", () => {
    keys.clear();
    touch.left = false;
    touch.right = false;
    touch.jump = false;
  });

  async function init() {
    resize();
    bindTouchControls();
    setOverlay("loading");

    try {
      await loadAssets();
      state.assetsReady = true;
      setOverlay("title");
      updateHud();
      requestAnimationFrame(loop);
    } catch (error) {
      kicker.textContent = "LOAD ERROR";
      panelTitle.textContent = "ASSETS";
      console.error(error);
    }
  }

  init();
})();
