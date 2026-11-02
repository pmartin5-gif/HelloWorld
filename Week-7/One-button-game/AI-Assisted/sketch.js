// A 200 x 200 picture, enlarged with nearest-neighbor pixels.
const GAME_SIZE = 200;
const TARGET = { x: 94, y: 112, width: 12, height: 25 };
const BAR = { width: 3, height: 8, y: 121, speed: 60 };
const INK = '#f4efd9';
const GOLD = '#ffe36e';
const GREEN = '#70f0a0';
const RED = '#ff5266';

const DIFFICULTIES = ['Easy', 'Medium', 'Hard'];
let selectedDifficulty = 1;
let screen = 'start';
let hits = 0;
let misses = 0;
let round;
let player;
let session = 0;
let errorMessage = false;
let resuming = false;
let particles = [];
let feedback = null;
let spaceHeld = false;
let audioContext;
const voices = new Set();

// Tiny bitmap lettering keeps text as crisp as the rest of the game.
const FONT = {
  A: ['010','101','111','101','101'], B: ['110','101','110','101','110'],
  C: ['011','100','100','100','011'], D: ['110','101','101','101','110'],
  E: ['111','100','110','100','111'], F: ['111','100','110','100','100'],
  G: ['011','100','101','101','011'], H: ['101','101','111','101','101'],
  I: ['111','010','010','010','111'], J: ['001','001','001','101','010'],
  K: ['101','101','110','101','101'], L: ['100','100','100','100','111'],
  M: ['101','111','111','101','101'], N: ['101','111','111','111','101'],
  O: ['010','101','101','101','010'], P: ['110','101','110','100','100'],
  Q: ['010','101','101','111','011'], R: ['110','101','110','101','101'],
  S: ['011','100','010','001','110'], T: ['111','010','010','010','010'],
  U: ['101','101','101','101','111'], V: ['101','101','101','101','010'],
  W: ['101','101','111','111','101'], X: ['101','101','010','101','101'],
  Y: ['101','101','010','010','010'], Z: ['111','001','010','100','111'],
  0: ['111','101','101','101','111'], 1: ['010','110','010','010','111'],
  2: ['110','001','010','100','111'], 3: ['110','001','010','001','110'],
  4: ['101','101','111','001','001'], 5: ['111','100','110','001','110'],
  6: ['011','100','111','101','111'], 7: ['111','001','010','010','010'],
  8: ['111','101','111','101','111'], 9: ['111','101','111','001','110'],
  ':': ['000','010','000','010','000'], '.': ['000','000','000','000','010'],
  '!': ['010','010','010','000','010']
};

function pixelText(message, x, y, scale = 1, tint = INK, centered = false) {
  const letters = message.toUpperCase();
  if (centered) x -= (letters.length * 4 - 1) * scale / 2;
  noStroke();
  fill(tint);
  for (let i = 0; i < letters.length; i++) {
    const glyph = FONT[letters[i]];
    if (!glyph) continue;
    glyph.forEach((row, gy) => {
      for (let gx = 0; gx < row.length; gx++) {
        if (row[gx] === '1') rect(Math.round(x + (i * 4 + gx) * scale), y + gy * scale, scale, scale);
      }
    });
  }
}

function setup() {
  const canvas = createCanvas(GAME_SIZE, GAME_SIZE);
  canvas.parent('game');
  canvas.attribute('role', 'img');
  canvas.attribute('aria-label', 'Triangle Hero. Space opens difficulty selection. Arrow keys choose a level and Space confirms. Hit bars with Space. Escape returns to Start.');
  pixelDensity(1);
  noSmooth();
  document.getElementById('start-button').addEventListener('click', openDifficultyScreen);
  DIFFICULTIES.forEach((_, index) => {
    document.getElementById(`difficulty-${index}`).addEventListener('click', () => {
      selectedDifficulty = index;
      confirmDifficulty();
    });
  });
  window.addEventListener('blur', () => { spaceHeld = false; pauseGame(); });
  document.addEventListener('visibilitychange', () => { if (document.hidden) pauseGame(); });
}

function openDifficultyScreen() {
  screen = 'difficulty';
  selectedDifficulty = 1;
  document.getElementById('start-button').hidden = true;
  document.getElementById('difficulty-menu').hidden = false;
  announceDifficulty();
}

function announceDifficulty() {
  announce(`${DIFFICULTIES[selectedDifficulty]} selected. Space to play. Arrow keys change difficulty. Escape returns to Start.`);
}

function confirmDifficulty() {
  if (screen !== 'difficulty') return;
  startGame();
}

function drawDifficultyScreen() {
  pixelText('SELECT LEVEL', 100, 28, 2, INK, true);
  DIFFICULTIES.forEach((name, index) => {
    const y = 61 + index * 32;
    const tint = index === selectedDifficulty ? GOLD : INK;
    noFill(); stroke(tint); strokeWeight(1);
    rect(48, y, 104, 25);
    pixelText(name, 100, y + 8, 2, tint, true);
  });
  pixelText('ARROWS: CHOOSE', 8, 165);
  pixelText('SPACE: SELECT', 8, 175);
  pixelText('ESC: START', 8, 185);
}

async function startGame() {
  if (screen === 'loading') return;
  const token = ++session;
  screen = 'loading';
  document.getElementById('difficulty-menu').hidden = true;
  errorMessage = false;
  document.getElementById('start-button').hidden = true;
  const songId = DIFFICULTIES[selectedDifficulty].toLowerCase();
  announce(`Loading ${DIFFICULTIES[selectedDifficulty]}.`);
  try {
    await unlockAudio();
    if (token !== session) return;
    if (!player || player.songId !== songId) player = new SongPlayer(audioContext, songId);
    await player.load();
    if (token !== session) return;
    hits = 0;
    misses = 0;
    particles = [];
    feedback = null;
    round = new SongRound(player.chart, resolveBar);
    player.start();
    screen = 'game';
    if (document.hidden || !document.hasFocus()) pauseGame();
    else announce('Get ready. Three second countdown.');
  } catch (error) {
    if (token !== session) return;
    console.error('Song loading failed:', error);
    returnToStart();
    errorMessage = error.code === 'UNMAPPED' ? 'unmapped' : true;
    announce(errorMessage === 'unmapped' ? error.message : 'Song could not load. Use a local HTTP server, then press Space to retry.');
  }
}

function pauseGame() {
  if (screen !== 'game') return;
  screen = 'paused';
  const token = session;
  audioContext.suspend().catch(() => { if (token === session) returnToStart(); });
  announce('Paused. Press Space to resume.');
}

async function resumeGame() {
  if (resuming) return;
  const token = session;
  resuming = true;
  try {
    await audioContext.resume();
    if (token !== session || screen !== 'paused') return;
    screen = 'game';
    if (document.hidden || !document.hasFocus()) pauseGame();
    else announce('Resumed.');
  } catch (error) {
    if (token === session) returnToStart();
  } finally { resuming = false; }
}

function returnToStart() {
  session++;
  if (player) player.stop();
  screen = 'start';
  particles = [];
  feedback = null;
  for (const voice of voices) voice.stop();
  voices.clear();
  document.getElementById('start-button').hidden = false;
  document.getElementById('difficulty-menu').hidden = true;
  announce('Start screen. Use the space bar to make a selection.');
}

function draw() {
  background('#080b18');
  if (screen === 'start') {
    drawStartScreen();
    return;
  }
  if (screen === 'difficulty') {
    drawDifficultyScreen();
    return;
  }
  if (screen === 'loading') {
    pixelText('LOADING SONG', 100, 90, 2, GOLD, true);
    pixelText('ESC: MENU', 100, 180, 1, INK, true);
    return;
  }
  if (screen === 'results') {
    pixelText('RESULTS', 100, 35, 3, GOLD, true);
    pixelText(`SUCCESSFUL HITS: ${hits}`, 20, 85, 1, GREEN);
    pixelText(`MISSES: ${misses}`, 20, 100, 1, RED);
    pixelText(`TOTAL NOTES: ${round.notes.length}`, 20, 115);
    pixelText('SPACE: REPLAY', 100, 155, 1, GOLD, true);
    pixelText('ESC: MENU', 100, 175, 1, INK, true);
    return;
  }
  if (screen === 'game') updateGame(Math.min(deltaTime / 1000, 0.05));
  drawGame();
  if (screen === 'paused') {
    noStroke();
    fill('#080b18');
    rect(30, 63, 140, 40);
    pixelText('PAUSED', 100, 68, 2, GOLD, true);
    pixelText('SPACE: RESUME', 100, 88, 1, INK, true);
  } else if (round.time < 0) {
    pixelText(String(Math.ceil(-round.time)), 100, 148, 3, GOLD, true);
  }
}

function drawStartScreen() {
  pixelText('TRIANGLE', 100, 26, 3, INK, true);
  pixelText('HERO', 100, 47, 3, GOLD, true);
  push();
  translate(35, 40);
  scale(0.65);
  drawInstrument(0, 0, INK);
  pop();
  noFill();
  stroke(GOLD);
  strokeWeight(1);
  rect(66, 112, 68, 18);
  pixelText('START', 100, 119, 1, GOLD, true);
  if (errorMessage) {
    pixelText(errorMessage === 'unmapped' ? 'SONG NEEDS A CHART' : 'SONG COULD NOT LOAD', 100, 142, 1, RED, true);
    pixelText(errorMessage === 'unmapped' ? 'MAP IT IN THE EDITOR' : 'USE LOCAL HTTP SERVER', 100, 153, 1, INK, true);
    pixelText('SPACE: SELECT LEVEL', 100, 162, 1, GOLD, true);
  }
  pixelText('USE THE SPACE BAR', 8, 175);
  pixelText('TO MAKE A SELECTION.', 8, 184);
}

function updateGame(dt) {
  if (feedback) {
    feedback.time -= dt;
    if (feedback.time <= 0) feedback = null;
  }
  for (const particle of particles) {
    particle.x += particle.vx * dt;
    particle.y += particle.vy * dt;
    particle.vy += 65 * dt;
    particle.life -= dt;
  }
  particles = particles.filter(particle => particle.life > 0);

  round.update(player.time);
  hits = round.hits;
  misses = round.misses;
  if (round.finished) {
    player.stop();
    screen = 'results';
    announce(`Results. Successful hits: ${hits}. Misses: ${misses}. Total notes: ${round.notes.length}. Space to replay. Escape for menu.`);
  }
}

function attemptHit() {
  round.press(player.time);
}

function resolveBar(note, success) {
  feedback = { success, time: success ? 0.55 : 0.32 };
  if (success) {
    hits = round.hits;
    for (let i = 0; i < 18; i++) {
      const angle = random(TWO_PI);
      const speed = random(12, 48);
      particles.push({ x: round.x(note) + BAR.width / 2, y: BAR.y + BAR.height / 2,
        vx: Math.cos(angle) * speed, vy: Math.sin(angle) * speed,
        life: random(0.25, 0.6), tint: i % 2 ? GREEN : GOLD });
    }
    playChime();
  } else {
    misses = round.misses;
    playFailure();
  }
  announce(`${success ? 'Hit!' : 'Miss.'} Successful hits: ${hits}. Misses: ${misses}.`);
}

function drawGame() {
  pixelText(`SUCCESSFUL HITS: ${hits}`, 8, 8, 1, GREEN);
  pixelText(`MISSES: ${misses}`, 8, 18, 1, RED);

  let shake = 0;
  let tint = INK;
  if (feedback) {
    const strength = feedback.time / (feedback.success ? 0.55 : 0.32);
    shake = Math.round(Math.sin(feedback.time * (feedback.success ? 95 : 140)) * strength * (feedback.success ? 2 : 5));
    tint = feedback.success ? GREEN : RED;
  }
  drawInstrument(shake, feedback && !feedback.success ? -Math.abs(shake) : 0, tint);

  stroke(feedback ? tint : INK);
  strokeWeight(1);
  noFill();
  rect(TARGET.x, TARGET.y, TARGET.width, TARGET.height);
  noStroke();
  for (const note of round.notes) {
    const x = round.x(note);
    if (note.result === 'hit' || x > GAME_SIZE || x + BAR.width < 0) continue;
    fill(note.result === 'miss' ? RED : INK);
    rect(Math.round(x), BAR.y, BAR.width, BAR.height);
  }
  for (const particle of particles) {
    fill(particle.tint);
    rect(Math.round(particle.x), Math.round(particle.y), 2, 2);
  }
  if (feedback) pixelText(feedback.success ? 'HIT!' : 'MISS', 100, 150, 1, tint, true);
  pixelText('SPACE: HIT', 8, 184);
  pixelText('ESC: MENU', 157, 184);
}

function drawInstrument(dx, dy, tint) {
  push();
  translate(dx, dy);
  noFill();
  stroke(tint);
  strokeWeight(2);
  // Keep the silhouette of the original triangle at the smaller resolution.
  triangle(66, 93, 100, 42, 136, 93);
  pop();
}

function keyPressed(event) {
  if (keyCode === ESCAPE) {
    returnToStart();
    return false;
  }
  if (screen === 'difficulty' && [37, 38, 39, 40].includes(keyCode)) {
    const direction = keyCode === 37 || keyCode === 38 ? -1 : 1;
    selectedDifficulty = (selectedDifficulty + direction + DIFFICULTIES.length) % DIFFICULTIES.length;
    announceDifficulty();
    return false;
  }
  if (keyCode !== 32) return;
  if (spaceHeld || (event && event.repeat)) return false;
  spaceHeld = true;
  if (screen === 'start') openDifficultyScreen();
  else if (screen === 'difficulty') confirmDifficulty();
  else if (screen === 'results') startGame();
  else if (screen === 'paused') resumeGame();
  else if (screen === 'game') attemptHit();
  return false; // Prevent Space from scrolling or activating a focused button too.
}

function keyReleased() {
  if (keyCode === 32) {
    spaceHeld = false;
    return false;
  }
}

function announce(message) {
  document.getElementById('status').textContent = message;
}

// Synthesized locally: no audio downloads, and audio unlocks on the first input.
async function unlockAudio() {
  const Audio = window.AudioContext || window.webkitAudioContext;
  if (!Audio) throw new Error('Web Audio is unavailable');
  if (!audioContext) audioContext = new Audio();
  if (audioContext.state !== 'running') await audioContext.resume();
}

function tone(frequency, duration, volume, type = 'sine', endFrequency = frequency) {
  if (!audioContext || audioContext.state !== 'running') return;
  const now = audioContext.currentTime;
  const oscillator = audioContext.createOscillator();
  const envelope = audioContext.createGain();
  oscillator.type = type;
  oscillator.frequency.setValueAtTime(frequency, now);
  oscillator.frequency.exponentialRampToValueAtTime(endFrequency, now + duration);
  envelope.gain.setValueAtTime(0, now);
  envelope.gain.linearRampToValueAtTime(volume, now + 0.003);
  envelope.gain.exponentialRampToValueAtTime(0.0001, now + duration);
  oscillator.connect(envelope);
  envelope.connect(audioContext.destination);
  voices.add(oscillator);
  oscillator.onended = () => {
    voices.delete(oscillator);
    oscillator.disconnect();
    envelope.disconnect();
  };
  oscillator.start(now);
  oscillator.stop(now + duration);
}

function playChime() {
  // Inharmonic partials evoke a struck metal triangle, with a bright ringing tail.
  tone(1760, 0.7, 0.035);
  tone(2497, 0.5, 0.02);
  tone(3860, 0.3, 0.01);
}

function playFailure() {
  tone(155, 0.22, 0.12, 'sawtooth', 48);
  tone(93, 0.16, 0.06, 'square', 35);
}
