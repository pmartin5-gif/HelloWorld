import math
import random

import py5


particles = []


class Particle:
    def __init__(self, x, y):
        # Random, constant acceleration.
        angle = random.uniform(0, math.tau)
        self.ax = math.cos(angle) / 250
        self.ay = math.sin(angle) / 250

        # Initial velocity points right and upward.
        speed = random.random()
        angle = random.uniform(-math.pi / 2, 0)
        self.vx = math.cos(angle) * speed
        self.vy = math.sin(angle) * speed

        self.x = x
        self.y = y
        self.history = []

    def update(self):
        self.vx += self.ax
        self.vy += self.ay
        self.x += self.vx
        self.y += self.vy

        # Save a position every 10 frames, up to 1,000 positions.
        if py5.frame_count % 10 == 0 and len(self.history) < 1000:
            self.history.append((self.x, self.y))

    def draw(self):
        self.draw_arrow_head(scale=10)

        py5.no_fill()
        py5.stroke(0, 100)
        py5.begin_shape()

        for x, y in self.history:
            py5.vertex(x, y)

        if self.history:
            py5.vertex(self.x, self.y)

        py5.end_shape()

    def draw_arrow_head(self, scale):
        py5.push_matrix()
        py5.translate(self.x, self.y)
        py5.rotate(math.atan2(self.vy, self.vx))

        length = math.hypot(self.vx, self.vy) * scale

        # Equivalent to map(length, 0, 10, 0, 1) * 4.
        arrow_size = length / 10 * 4

        py5.stroke(0, 100)
        py5.fill(0, 100)
        py5.line(0, 0, length - arrow_size, 0)

        py5.no_stroke()
        py5.begin_shape()
        py5.vertex(length, 0)
        py5.vertex(length - arrow_size, arrow_size / 2)
        py5.vertex(length - arrow_size, -arrow_size / 2)
        py5.end_shape(py5.CLOSE)

        py5.pop_matrix()


def setup():
    py5.size(1024, 768)
    py5.smooth()

    particles.extend(
        Particle(100, py5.height - 100)
        for _ in range(1000)
    )


def draw():
    py5.background(255)

    for particle in particles:
        particle.update()
        particle.draw()


if __name__ == "__main__":
    py5.run_sketch()
