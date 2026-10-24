// code here based on an example at this URL: https://p5js.org/examples/Classes-And-Objects-Flocking/
// additional credits:
// Demonstration of flocking behavior. Full discussion of the implementation can be found in the Nature of Code book by Daniel Shiffman. The simulation is based on the research of Craig Reynolds, who used the term ‘boid’ to represent a bird-like object.

// Creative Commons BY-NC-SA license badge
// Flocking: Revised by Darren Kessner. Edited and maintained by p5.js Contributors and Processing Foundation. Licensed under CC BY-NC-SA 4.0.

// Edit this paragraph to change the text. Slashes remain visible characters.
const PARAGRAPH = 'If we move with the fluidity of starlings, / like a puddle of clippings in the air that shape- / shifts but never falls hard to the ground, / if we sense enough of each other to know / in which direction to fly away from being / preyed upon, but never from one another, // in swirls and with the unshakable faith / that wherever we turn we will be synchronal, / miming in a language only our bodies // comprehend the intention of our design, / the spaces we will fill up and disappear from. / We will be spirals and domes, we will make // mountains and geysers and open mouths / in the sky, an unnoticed eclipse at twilight / as our bodies thrum and flutter without // leading, only the sense of same direction, / of how moving together this way / makes us impenetrable to hawk and falcon, // how having no intention of place or time / allows us to tighten our formation, but leave / space enough not to tangle feather or wing. – Emily Schulten';

const FONT_SIZE = 17;
const LINE_HEIGHT = 35;
const MARGIN = 100;
const INTERACTION_RADIUS = 200;
// Let the flock linger, then gradually trade flocking for a gentle landing.
const MURMURATION_MS = 8500;
const HOME_TRANSITION_MS = 10500;
const FLOCK_HOME_WEIGHT = 0.15;
// Wider awareness and stronger group steering keep the murmuration together.
const NEIGHBOR_DISTANCE = 120;
const ALIGNMENT_WEIGHT = 1.5;
const COHESION_WEIGHT = 2.0;
const MOUSE_RESPONSE_MS = 800;
const WANDER_WEIGHT = 1.5;
// Start turning before reaching an edge; these are a bias, not hard walls.
const EDGE_ZONE = 125;
const EDGE_WEIGHT = 2.0;
// Reserve a quiet strip below the flying flock; larger values raise the horizon.
const GROUND_CLEARANCE = 300;
const TAKEOFF_UPWARD_BIAS = 0.6;

let flock;
let pointerInside = false;

function setup() {
  const canvas = createCanvas(2000, 1000);
  textFont('Georgia');
  textSize(FONT_SIZE);
  textAlign(LEFT, TOP);
  noStroke();

  canvas.elt.addEventListener('pointerenter', () => {
    pointerInside = true;
    loop();
  });
  canvas.elt.addEventListener('pointerleave', () => { pointerInside = false; });
  canvas.elt.addEventListener('pointercancel', () => { pointerInside = false; });
  window.addEventListener('blur', () => { pointerInside = false; });

  flock = new Flock();
  // Native canvas measurements preserve spaces and proportional font widths.
  const measure = value => drawingContext.measureText(value).width;
  let x = MARGIN;
  let y = MARGIN;

  // Keep words together while preserving the paragraph's spaces and slashes.
  for (const token of PARAGRAPH.match(/\s+|\S+/g)) {
    const tokenWidth = measure(token);
    if (/^\s+$/.test(token)) {
      x += tokenWidth;
      continue;
    }
    if (x + tokenWidth > width - MARGIN) {
      x = MARGIN;
      y += LINE_HEIGHT;
    }

    let prefix = '';
    for (const character of token) {
      prefix += character;
      // Measure the word prefix to retain kerning between neighboring letters.
      const characterX = x + measure(prefix) - measure(character);
      flock.addBoid(new Boid(characterX, y, character));
    }
    x += tokenWidth;
  }

  // Anchor the last line above the bottom margin after wrapping is complete.
  const verticalOffset = height - MARGIN - FONT_SIZE - y;
  const glyphs = new Map();
  for (const boid of flock.boids) {
    boid.home.y += verticalOffset;
    boid.position.y = boid.home.y;
    boid.wanderY = boid.home.y * 0.01;
    if (!glyphs.has(boid.character)) {
      glyphs.set(boid.character, createGlyphSprite(boid.character));
    }
    boid.glyph = glyphs.get(boid.character);
  }

  describe('A paragraph of Wild Geese by Mary Oliver. Nearby letters flock away from the pointer, continue in a murmuration after it leaves, then gradually return to their original places. Text: ' + PARAGRAPH);
}

function draw() {
  background(255);
  fill(0);
  const moving = flock.run();
  if (!moving && !pointerInside) noLoop();
}

// Rasterize each unique letter once at the canvas's native pixel density.
function createGlyphSprite(character) {
  const density = pixelDensity();
  const padding = Math.ceil(FONT_SIZE / 2);
  const metrics = drawingContext.measureText(character);
  const offsetX = padding + Math.ceil(Math.max(0, metrics.actualBoundingBoxLeft || 0));
  const spriteWidth = Math.ceil(Math.max(metrics.width, metrics.actualBoundingBoxRight || 0)) + offsetX + padding;
  const spriteHeight = FONT_SIZE * 2 + padding * 2;
  const canvas = document.createElement('canvas');
  canvas.width = Math.ceil(spriteWidth * density);
  canvas.height = Math.ceil(spriteHeight * density);
  const context = canvas.getContext('2d');
  context.scale(density, density);
  context.font = drawingContext.font;
  context.textAlign = 'left';
  context.textBaseline = 'top';
  context.fillStyle = '#000';
  context.fillText(character, offsetX, padding);
  return { canvas, width: spriteWidth, height: spriteHeight, offsetX, offsetY: padding };
}

// Reuse grid buckets each frame. Negative and out-of-frame cells are supported.
class NeighborGrid {
  constructor() {
    this.cellSize = Math.max(25, NEIGHBOR_DISTANCE);
    this.cells = new Map();
    this.bucketPool = [];
  }

  build(boids) {
    this.cells.clear();
    let used = 0;
    for (const boid of boids) {
      const key = `${Math.floor(boid.position.x / this.cellSize)},${Math.floor(boid.position.y / this.cellSize)}`;
      let bucket = this.cells.get(key);
      if (!bucket) {
        bucket = this.bucketPool[used];
        if (!bucket) this.bucketPool[used] = bucket = [];
        used++;
        bucket.length = 0;
        this.cells.set(key, bucket);
      }
      bucket.push(boid);
    }
  }

  collect(position, buckets) {
    buckets.length = 0;
    const column = Math.floor(position.x / this.cellSize);
    const row = Math.floor(position.y / this.cellSize);
    for (let y = row - 1; y <= row + 1; y++) {
      for (let x = column - 1; x <= column + 1; x++) {
        const bucket = this.cells.get(`${x},${y}`);
        if (bucket) buckets.push(bucket);
      }
    }
  }
}

// Flock class to manage the array of all the boids
class Flock {
  constructor() {
    // Initialize the array of boids
    this.boids = [];
    this.wanderSeed = random(10000);
    this.flockingBoids = [];
    this.grid = new NeighborGrid();
  }

  run() {
    const interacting = pointerInside && mouseX >= 0 && mouseX < width &&
      mouseY >= 0 && mouseY < height;
    const mouse = interacting ? createVector(mouseX, mouseY) : null;
    const now = millis();
    // A shared, smoothly changing heading lets the flock choose its own course.
    const wanderAngle = noise(this.wanderSeed, now * 0.0002) * Math.PI * 4;

    // Activate first so all birds use the same set of flocking neighbors.
    if (interacting) {
      for (const boid of this.boids) {
        const dx = boid.position.x - mouseX;
        const dy = boid.position.y - mouseY;
        if (dx * dx + dy * dy < INTERACTION_RADIUS * INTERACTION_RADIUS) {
          if (!boid.active) {
            boid.disturbedAt = now;
            boid.mouseEscape = p5.Vector.sub(boid.position, mouse);
            if (boid.mouseEscape.mag() === 0) boid.mouseEscape.set(1, -1);
            boid.mouseEscape.normalize();
            // Tilt the initial escape upward, then let autonomous flocking take over.
            boid.mouseEscape.y -= TAKEOFF_UPWARD_BIAS;
            boid.mouseEscape.normalize();
          }
          boid.active = true;
          boid.resting = false;
          boid.releasedAt = null;
        }
      }
    } else {
      for (const boid of this.boids) {
        if (boid.active) {
          boid.active = false;
          boid.releasedAt = now;
        }
      }
    }

    const flockingBoids = this.flockingBoids;
    flockingBoids.length = 0;
    for (const boid of this.boids) {
      if (!boid.resting && (boid.active || now - boid.releasedAt < MURMURATION_MS + HOME_TRANSITION_MS)) {
        flockingBoids.push(boid);
      }
    }
    this.grid.build(flockingBoids);
    // Calculate forces before updating positions, avoiding update-order bias.
    for (const boid of this.boids) {
      if (boid.resting) continue;
      if (boid.active) {
        boid.flock(flockingBoids, mouse, 1, wanderAngle, now, this.grid);
      } else {
        const elapsed = now - boid.releasedAt;
        const progress = Math.max(0, Math.min(1,
          (elapsed - MURMURATION_MS) / HOME_TRANSITION_MS));
        // Smoothstep avoids an abrupt change as the flock begins heading home.
        const homeWeight = progress * progress * (3 - 2 * progress);
        if (homeWeight < 1) boid.flock(flockingBoids, null, 1 - homeWeight, wanderAngle, now, this.grid);
        if (homeWeight > 0) boid.arrive(homeWeight);
      }
    }
    let moving = false;
    for (const boid of this.boids) {
      if (!boid.resting) {
        boid.update();
        moving = true;
      }
      boid.render();
    }
    return moving;
  }

  addBoid(b) {
    this.boids.push(b);
  }
}

class Boid {
  constructor(x, y, character) {
    this.character = character;
    this.home = createVector(x, y);
    this.position = this.home.copy();
    this.acceleration = createVector(0, 0);
    this.velocity = createVector(0, 0);
    this.active = false;
    this.releasedAt = null;
    this.disturbedAt = null;
    this.mouseEscape = createVector(0, 0);
    this.resting = true;
    this.maxSpeed = 3;
    this.maxForce = 0.05;
    this.glyph = null;
    this.separationForce = createVector(0, 0);
    this.alignmentForce = createVector(0, 0);
    this.cohesionForce = createVector(0, 0);
    this.neighborBuckets = [];
    this.wanderX = this.home.x * 0.01;
    this.wanderY = this.home.y * 0.01;
  }

  applyForce(force) {
    // We could add mass here if we want: A = F / M
    this.acceleration.add(force);
  }

  // Combine the flocking rules with mouse avoidance and individual home attraction
  flock(boids, mouse, strength = 1, wanderAngle = 0, now = millis(), grid = null) {
    this.calculateNeighborForces(boids, grid);
    const separation = this.separationForce.mult(3 * strength);
    const alignment = this.alignmentForce.mult(ALIGNMENT_WEIGHT * strength);
    const cohesion = this.cohesionForce.mult(COHESION_WEIGHT * strength);
    const homePull = this.seek(this.home).mult(FLOCK_HOME_WEIGHT * strength);

    // Respond briefly to the original disturbance, rather than continuously
    // accelerating away from the pointer or following its changing position.
    if (mouse && this.disturbedAt !== null) {
      const response = Math.max(0, 1 - (now - this.disturbedAt) / MOUSE_RESPONSE_MS);
      this.applyForce(this.mouseEscape.copy().mult(this.maxForce * 5 * response * response));
    }

    // Coherent noise gives the flock broad turns with slight individual variation,
    // rather than independent random kicks that would break the group apart.
    const variation = (noise(this.wanderX, this.wanderY, now * 0.0003) - 0.5) * 0.6;
    const angle = wanderAngle + variation;
    const desired = createVector(Math.cos(angle), Math.sin(angle)).mult(this.maxSpeed);
    const wander = desired.sub(this.velocity).limit(this.maxForce).mult(WANDER_WEIGHT * strength);

    this.applyForce(separation);
    this.applyForce(alignment);
    this.applyForce(cohesion);
    this.applyForce(homePull);
    this.applyForce(wander);
    this.applyForce(this.stayInFrame().mult(strength));
  }

  stayInFrame() {
    // Look ahead slightly so birds can bank before flying out of view.
    const ahead = this.position.copy().add(this.velocity.copy().mult(20));
    const pressure = distance => {
      const amount = Math.max(0, Math.min(2, (EDGE_ZONE - distance) / EDGE_ZONE));
      return amount * amount;
    };
    // Treat the ground as an elevated lower edge during flight. This steering
    // fades with the flocking forces so letters can still land in the paragraph.
    const groundY = height - GROUND_CLEARANCE;
    const inward = createVector(
      pressure(ahead.x) - pressure(width - ahead.x),
      pressure(ahead.y) - pressure(groundY - ahead.y)
    );
    // Pressure builds smoothly near and beyond an edge, without wrapping,
    // clamping positions, or reflecting velocity. It fades as birds land.
    return inward.limit(2).mult(this.maxForce * EDGE_WEIGHT);
  }

  arrive(strength = 1) {
    const toHome = p5.Vector.sub(this.home, this.position);

    // Sleep only once remaining motion is imperceptible. Never snap position.
    if (strength === 1 && toHome.mag() < 0.05 && this.velocity.mag() < 0.01) {
      this.velocity.mult(0);
      this.acceleration.mult(0);
      this.resting = true;
      return;
    }

    // Return directly home, slowing continuously as the distance decreases.
    const desired = toHome.mult(0.025).limit(this.maxSpeed);
    const steering = desired.sub(this.velocity).mult(0.16).limit(0.08);
    this.applyForce(steering.mult(strength));
  }

  // Method to update location
  update() {
    // Update velocity
    this.velocity.add(this.acceleration);

    // Limit speed
    this.velocity.limit(this.maxSpeed);
    this.position.add(this.velocity);

    // Reset acceleration to 0 each cycle
    this.acceleration.mult(0);
  }

  // A method that calculates and applies a steering force towards a target
  // STEER = DESIRED MINUS VELOCITY
  seek(target) {
    // A vector pointing from the location to the target
    let desired = p5.Vector.sub(target, this.position);

    // Normalize desired and scale to maximum speed
    desired.normalize();
    desired.mult(this.maxSpeed);

    // Steering = Desired minus Velocity
    let steer = p5.Vector.sub(desired, this.velocity);

    // Limit to maximum steering force
    steer.limit(this.maxForce);
    return steer;
  }

  render() {
    if (this.glyph) {
      const glyph = this.glyph;
      drawingContext.drawImage(glyph.canvas,
        this.position.x - glyph.offsetX, this.position.y - glyph.offsetY,
        glyph.width, glyph.height);
    } else {
      text(this.character, this.position.x, this.position.y);
    }
  }

  // Separation, alignment and cohesion share one distance calculation per pair.
  calculateNeighborForces(boids, grid) {
    const buckets = this.neighborBuckets;
    if (grid) grid.collect(this.position, buckets);
    else {
      buckets.length = 1;
      buckets[0] = boids;
    }
    let separationX = 0;
    let separationY = 0;
    let separationCount = 0;
    let velocityX = 0;
    let velocityY = 0;
    let positionX = 0;
    let positionY = 0;
    let neighborCount = 0;
    const radiusSquared = NEIGHBOR_DISTANCE * NEIGHBOR_DISTANCE;

    for (const bucket of buckets) {
      for (const other of bucket) {
        const dx = this.position.x - other.position.x;
        const dy = this.position.y - other.position.y;
        const distanceSquared = dx * dx + dy * dy;
        if (distanceSquared === 0) continue;
        if (distanceSquared < 25 * 25) {
          separationX += dx / distanceSquared;
          separationY += dy / distanceSquared;
          separationCount++;
        }
        if (distanceSquared < radiusSquared) {
          velocityX += other.velocity.x;
          velocityY += other.velocity.y;
          positionX += other.position.x;
          positionY += other.position.y;
          neighborCount++;
        }
      }
    }

    this.separationForce.set(0, 0);
    this.alignmentForce.set(0, 0);
    this.cohesionForce.set(0, 0);
    if (separationCount > 0 && (separationX !== 0 || separationY !== 0)) {
      this.setSteering(this.separationForce, separationX / separationCount, separationY / separationCount);
    }
    if (neighborCount > 0) {
      this.setSteering(this.alignmentForce, velocityX / neighborCount, velocityY / neighborCount);
      this.setSteering(this.cohesionForce,
        positionX / neighborCount - this.position.x,
        positionY / neighborCount - this.position.y);
    }
  }

  // Write into a reusable vector rather than allocating vectors for each neighbor.
  setSteering(force, dx, dy) {
    const length = Math.sqrt(dx * dx + dy * dy);
    const scale = length > 0 ? this.maxSpeed / length : 0;
    force.set(dx * scale - this.velocity.x, dy * scale - this.velocity.y);
    force.limit(this.maxForce);
  }
} // class Boid
