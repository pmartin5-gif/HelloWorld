let vesper;
let bloodDrops = [];
let ash = [];
let runes = [];
let screenShake = 0;
let redFlash = 0;

function setup() {
  const side = min(windowWidth - 28, windowHeight - 28, 760);
  createCanvas(max(side, 380), max(side, 380));
  angleMode(DEGREES);
  textFont("Georgia");

  vesper = new DreadCreature(width / 2, height * 0.5, width * 0.24);

  for (let i = 0; i < 55; i++) {
    ash.push(new AshParticle());
  }

  for (let i = 0; i < 9; i++) {
    runes.push({
      angle: i * 40 + random(-8, 8),
      distance: random(width * 0.33, width * 0.45),
      symbol: random(["ᛉ", "ᚷ", "ᛏ", "ᛃ", "ᚾ", "ᛇ"]),
      pulse: random(360)
    });
  }
}

function draw() {
  const shakeX = random(-screenShake, screenShake);
  const shakeY = random(-screenShake, screenShake);
  screenShake *= 0.86;
  redFlash *= 0.88;

  push();
  translate(shakeX, shakeY);
  drawAbyss();

  for (const particle of ash) {
    particle.update();
    particle.display();
  }

  for (let i = bloodDrops.length - 1; i >= 0; i--) {
    bloodDrops[i].update();
    bloodDrops[i].display();
    if (bloodDrops[i].dead) bloodDrops.splice(i, 1);
  }

  vesper.update(bloodDrops);
  vesper.display();
  drawBloodVignette();
  pop();

  drawInterface();

  if (redFlash > 1) {
    noStroke();
    fill(140, 0, 12, redFlash);
    rect(0, 0, width, height);
  }
}

function drawAbyss() {
  background(4, 2, 8);

  // Sickly red glow behind the creature.
  noStroke();
  for (let radius = width * 1.15; radius > 20; radius -= 18) {
    const alpha = map(radius, width * 1.15, 20, 0, 12);
    fill(105, 0, 18, alpha);
    circle(width / 2, height * 0.5, radius);
  }

  // Rotating ritual marks in the background.
  push();
  translate(width / 2, height * 0.5);
  rotate(frameCount * 0.025);
  noFill();
  stroke(115, 5, 22, 55);
  strokeWeight(1.5);
  circle(0, 0, width * 0.73);
  circle(0, 0, width * 0.86);
  for (const rune of runes) {
    push();
    rotate(rune.angle);
    translate(rune.distance, 0);
    rotate(-rune.angle - frameCount * 0.025);
    noStroke();
    fill(160, 12, 29, 45 + sin(frameCount + rune.pulse) * 25);
    textAlign(CENTER, CENTER);
    textSize(width * 0.028);
    text(rune.symbol, 0, 0);
    pop();
  }
  pop();

  // Floor disappears into blackness.
  noStroke();
  fill(8, 4, 10);
  rect(0, height * 0.79, width, height * 0.21);
  stroke(100, 9, 22, 55);
  strokeWeight(1);
  for (let x = -width; x < width * 2; x += width * 0.08) {
    line(width / 2, height * 0.61, x, height);
  }
  for (let y = height * 0.68; y < height; y += height * 0.065) {
    line(0, y, width, y);
  }
}

function drawBloodVignette() {
  noFill();
  for (let i = 0; i < 18; i++) {
    stroke(0, 0, 0, 15 + i * 7);
    strokeWeight(18);
    rect(i * 4, i * 4, width - i * 8, height - i * 8, 32);
  }

  noStroke();
  fill(87, 0, 11, 190);
  for (let x = 15; x < width; x += 52) {
    const drip = 8 + noise(x * 0.1) * 32;
    rect(x, 0, 5, drip, 3);
    circle(x + 2.5, drip, 7);
  }
}

function drawInterface() {
  const pad = 22;
  noStroke();
  fill(3, 1, 7, 205);
  rect(pad, pad, min(300, width - pad * 2), 105, 3);
  stroke(112, 8, 24);
  strokeWeight(1);
  noFill();
  rect(pad, pad, min(300, width - pad * 2), 105, 3);

  noStroke();
  fill(198, 18, 38);
  textAlign(LEFT, TOP);
  textStyle(BOLD);
  textSize(25);
  text("VESPER", pad + 15, pad + 12);

  fill(165, 145, 149);
  textStyle(ITALIC);
  textSize(11);
  text(vesper.message, pad + 16, pad + 46);

  const meterWidth = min(268, width - pad * 2 - 32);
  fill(26, 9, 13);
  rect(pad + 16, pad + 73, meterWidth, 12);
  fill(127, 0, 20);
  rect(pad + 16, pad + 73, meterWidth * vesper.blood / 100, 12);
  fill(235, 213, 216);
  textStyle(NORMAL);
  textAlign(RIGHT, BOTTOM);
  textSize(9);
  text("BLOOD HUNGER", pad + 16 + meterWidth, pad + 69);

  textAlign(CENTER, BOTTOM);
  textSize(11);
  fill(150, 133, 138);
  text("CLICK TO SPILL BLOOD   •   MOVE TO LURE IT   •   R TO REAWAKEN", width / 2, height - 17);
}

function mousePressed() {
  if (mouseX > 0 && mouseX < width && mouseY > 0 && mouseY < height) {
    const amount = floor(random(3, 7));
    for (let i = 0; i < amount; i++) {
      bloodDrops.push(new BloodDrop(mouseX + random(-15, 15), mouseY + random(-10, 10)));
    }
    vesper.message = "It smells fresh blood.";
    vesper.awake = true;
    screenShake = 3;
    redFlash = 35;
  }
}

function keyPressed() {
  if (key === "r" || key === "R") {
    bloodDrops = [];
    vesper = new DreadCreature(width / 2, height * 0.5, width * 0.24);
    screenShake = 8;
    redFlash = 90;
  }
}

function windowResized() {
  const side = min(windowWidth - 28, windowHeight - 28, 760);
  resizeCanvas(max(side, 380), max(side, 380));
}

class DreadCreature {
  constructor(x, y, size) {
    this.position = createVector(x, y);
    this.velocity = createVector(0, 0);
    this.size = size;
    this.blood = 42;
    this.awake = false;
    this.mouthOpen = 0.2;
    this.feedingBurst = 0;
    this.message = "It is sleeping. For now.";
    this.eyeSeeds = [17, 43, 88, 124, 199, 251, 311];
  }

  update(drops) {
    this.blood = max(0, this.blood - 0.012);
    let target = createVector(width / 2, height * 0.51);

    if (drops.length > 0) {
      let closest = drops[0];
      let closestDistance = p5.Vector.dist(this.position, closest.position);
      for (const drop of drops) {
        const d = p5.Vector.dist(this.position, drop.position);
        if (d < closestDistance) {
          closest = drop;
          closestDistance = d;
        }
      }
      target = closest.position.copy();
      this.awake = true;
      this.message = "Feed me.";
      this.mouthOpen = lerp(this.mouthOpen, 1, 0.08);
    } else {
      this.mouthOpen = lerp(this.mouthOpen, this.blood < 25 ? 0.72 : 0.22, 0.035);
      if (this.blood < 25) this.message = "Its hunger is becoming dangerous.";
      else if (this.awake) this.message = "It wants more.";
    }

    if (mouseX > 0 && mouseX < width && mouseY > 0 && mouseY < height && drops.length === 0) {
      target.x = lerp(width / 2, mouseX, 0.17);
      target.y = lerp(height * 0.51, mouseY, 0.12);
    }

    const desired = p5.Vector.sub(target, this.position);
    if (desired.mag() > 4) {
      desired.setMag(drops.length > 0 ? 2.9 : 0.75);
      this.velocity.lerp(desired, drops.length > 0 ? 0.055 : 0.025);
    }
    this.velocity.mult(0.975);
    this.position.add(this.velocity);
    this.position.x = constrain(this.position.x, this.size * 0.8, width - this.size * 0.8);
    this.position.y = constrain(this.position.y, this.size * 0.9, height * 0.7);

    for (const drop of drops) {
      if (!drop.dead && p5.Vector.dist(this.position, drop.position) < this.size * 0.54) {
        drop.dead = true;
        this.blood = min(100, this.blood + 4.5);
        this.feedingBurst = 1;
        this.message = random(["More.", "Still warm.", "The hunger recedes.", "Delicious."]);
        screenShake = 7;
        redFlash = 75;
      }
    }

    this.feedingBurst *= 0.9;
  }

  display() {
    const s = this.size;
    const breathe = 1 + sin(frameCount * 1.4) * 0.035;
    const aim = createVector(mouseX - this.position.x, mouseY - this.position.y);
    aim.limit(s * 0.027);

    push();
    translate(this.position.x, this.position.y + sin(frameCount * 1.2) * 5);
    scale(breathe + this.feedingBurst * 0.09, 1 / breathe - this.feedingBurst * 0.04);

    // Eight living tentacles reach out before the body is drawn.
    this.drawTentacles(s);

    // Shadow aura.
    noStroke();
    for (let i = 7; i > 0; i--) {
      fill(73, 0, 18, 6 + i * 2);
      ellipse(0, 10, s * (1.25 + i * 0.08), s * (1.4 + i * 0.08));
    }

    // Swept-back horns.
    fill(20, 14, 24);
    stroke(105, 7, 25);
    strokeWeight(2);
    beginShape();
    vertex(-s * 0.3, -s * 0.35);
    bezierVertex(-s * 0.7, -s * 0.88, -s * 0.85, -s * 0.54, -s * 0.58, -s * 0.18);
    bezierVertex(-s * 0.75, -s * 0.44, -s * 0.5, -s * 0.38, -s * 0.3, -s * 0.18);
    endShape(CLOSE);
    beginShape();
    vertex(s * 0.3, -s * 0.35);
    bezierVertex(s * 0.7, -s * 0.88, s * 0.85, -s * 0.54, s * 0.58, -s * 0.18);
    bezierVertex(s * 0.75, -s * 0.44, s * 0.5, -s * 0.38, s * 0.3, -s * 0.18);
    endShape(CLOSE);

    // Main body, layered to feel wet and organic.
    noStroke();
    fill(10, 7, 14);
    ellipse(0, 0, s * 1.35, s * 1.5);
    fill(22, 10, 20);
    ellipse(-s * 0.08, -s * 0.05, s * 1.13, s * 1.28);
    fill(46, 8, 23, 120);
    ellipse(-s * 0.22, -s * 0.2, s * 0.4, s * 0.7);

    // Seven eyes watch the cursor independently.
    this.drawEyes(s, aim);

    // Circular lamprey mouth.
    this.drawMouth(s);

    // Blood leaking from the mouth.
    if (this.blood > 55 || this.feedingBurst > 0.05) {
      fill(120, 0, 17);
      const dripLength = s * (0.12 + abs(sin(frameCount * 1.8)) * 0.12);
      rect(-s * 0.035, s * 0.31, s * 0.07, dripLength, s * 0.03);
      ellipse(0, s * 0.31 + dripLength, s * 0.09, s * 0.13);
    }

    pop();
  }

  drawTentacles(s) {
    noFill();
    for (let i = 0; i < 8; i++) {
      const angle = i * 45 + 22;
      const wave = sin(frameCount * 1.7 + i * 47) * s * 0.18;
      const startX = cos(angle) * s * 0.38;
      const startY = sin(angle) * s * 0.43;
      const endX = cos(angle) * s * 1.25 + sin(angle) * wave;
      const endY = sin(angle) * s * 1.15 - cos(angle) * wave;

      stroke(5, 3, 9, 130);
      strokeWeight(s * 0.13);
      bezier(startX, startY, startX * 1.8 + wave, startY * 1.5, endX * 0.72, endY * 0.84, endX, endY);
      stroke(82, 5, 27, 160);
      strokeWeight(s * 0.035);
      bezier(startX, startY, startX * 1.8 + wave, startY * 1.5, endX * 0.72, endY * 0.84, endX, endY);
    }
  }

  drawEyes(s, aim) {
    const eyePositions = [
      [-0.28, -0.26, 0.18], [0, -0.38, 0.22], [0.3, -0.24, 0.16],
      [-0.38, 0.02, 0.14], [0.38, 0.04, 0.14],
      [-0.24, 0.22, 0.12], [0.25, 0.23, 0.12]
    ];

    for (let i = 0; i < eyePositions.length; i++) {
      const [ex, ey, es] = eyePositions[i];
      const twitch = sin(frameCount * 0.7 + this.eyeSeeds[i]) * s * 0.008;
      fill(202, 196, 171);
      stroke(72, 3, 17);
      strokeWeight(s * 0.018);
      ellipse(ex * s, ey * s + twitch, es * s, es * s * 0.72);
      noStroke();
      fill(151, 0, 24);
      circle(ex * s + aim.x, ey * s + twitch + aim.y, es * s * 0.42);
      fill(4, 1, 5);
      circle(ex * s + aim.x, ey * s + twitch + aim.y, es * s * 0.2);
      fill(255, 219, 219, 180);
      circle(ex * s + aim.x - es * s * 0.07, ey * s + twitch + aim.y - es * s * 0.08, es * s * 0.08);
    }
  }

  drawMouth(s) {
    const open = this.mouthOpen;
    const mouthSize = s * (0.27 + open * 0.2);
    noStroke();
    fill(2, 0, 3);
    circle(0, s * 0.18, mouthSize);
    fill(87, 0, 21);
    circle(0, s * 0.18, mouthSize * 0.7);
    fill(8, 0, 6);
    circle(0, s * 0.18, mouthSize * 0.37);

    fill(218, 205, 177);
    for (let i = 0; i < 14; i++) {
      const a = i * (360 / 14) + frameCount * 0.05;
      const radius = mouthSize * 0.42;
      push();
      translate(cos(a) * radius * 0.67, s * 0.18 + sin(a) * radius * 0.67);
      rotate(a + 90);
      triangle(-s * 0.025, 0, s * 0.025, 0, 0, s * 0.09 * open);
      pop();
    }
  }
}

class BloodDrop {
  constructor(x, y) {
    this.position = createVector(x, y);
    this.velocity = createVector(random(-1.4, 1.4), random(-3.8, -1.1));
    this.size = random(8, 17);
    this.dead = false;
    this.splat = 0;
  }

  update() {
    if (this.splat === 0) {
      this.velocity.y += 0.13;
      this.position.add(this.velocity);
      if (this.position.y > height * 0.84) {
        this.position.y = height * 0.84;
        this.velocity.set(0, 0);
        this.splat = random(1.4, 2.3);
      }
    }
  }

  display() {
    noStroke();
    fill(126, 0, 19);
    if (this.splat > 0) {
      ellipse(this.position.x, this.position.y, this.size * this.splat, this.size * 0.45);
      fill(184, 9, 28, 160);
      ellipse(this.position.x - this.size * 0.2, this.position.y - 1, this.size * 0.45, this.size * 0.12);
    } else {
      push();
      translate(this.position.x, this.position.y);
      rotate(this.velocity.heading() + 90);
      ellipse(0, 0, this.size * 0.72, this.size);
      triangle(-this.size * 0.35, 0, this.size * 0.35, 0, 0, -this.size * 0.9);
      pop();
    }
  }
}

class AshParticle {
  constructor() {
    this.reset(true);
  }

  reset(firstFrame = false) {
    this.x = random(width);
    this.y = firstFrame ? random(height) : height + 10;
    this.size = random(1, 4);
    this.speed = random(0.15, 0.7);
    this.drift = random(360);
  }

  update() {
    this.y -= this.speed;
    this.x += sin(frameCount * 0.4 + this.drift) * 0.18;
    if (this.y < -10) this.reset();
  }

  display() {
    noStroke();
    fill(145, 21, 39, 50);
    circle(this.x, this.y, this.size);
  }
}
