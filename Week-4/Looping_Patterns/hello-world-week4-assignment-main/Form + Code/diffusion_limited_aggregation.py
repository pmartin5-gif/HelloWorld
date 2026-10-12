"""Animated Python port of the Form+Code Processing sketch.

Original: Casey Reas, Chandler McWilliams, and LUST,
Form+Code in Design, Art, and Architecture (2010).

Run: python3 diffusion_limited_aggregation.py
Close the window or press Escape to exit. Only Python and Tkinter are needed.
"""

import argparse
import math
import random
from dataclasses import dataclass


@dataclass
class Particle:
    x: int
    y: int
    stuck: bool = False


class Simulation:
    def __init__(self, width=512, height=350, particle_count=20000, seed=None):
        if width < 5 or height < 5:
            raise ValueError("Width and height must be at least 5.")
        if particle_count < 1:
            raise ValueError("Particle count must be positive.")
        self.width = width
        self.height = height
        self.random = random.Random(seed)
        self.field = bytearray(width * height)
        self.center = (width // 2, height // 2)
        self.field[self.center[0] + self.center[1] * width] = 1
        self.particles = []
        self.stuck_count = 0
        for _ in range(particle_count):
            particle = Particle(0, 0)
            self.reset(particle)
            self.particles.append(particle)

    def reset(self, particle):
        # Choose an empty pixel, as in the original sketch.
        while True:
            particle.x = self.random.randrange(self.width)
            particle.y = self.random.randrange(self.height)
            if not self.field[particle.y * self.width + particle.x]:
                return

    def alone(self, x, y):
        # Preserve the original sketch's edge checks.
        if x <= 1 or x >= self.width - 1 or y <= 1 or y >= self.height - 1:
            return True
        index = y * self.width + x
        width = self.width
        return not any(self.field[index + offset] for offset in (
            -width, -1, 1, width,
            -width - 1, width - 1, -width + 1, width + 1,
        ))

    def step(self):
        """Move each free particle once and return newly occupied pixels."""
        new_pixels = []
        for particle in self.particles:
            if particle.stuck:
                continue

            # Processing round(random(-1, 1)) gives -1/0/+1 with
            # probabilities 1/4, 1/2, 1/4. Python round uses different ties.
            particle.x += math.floor(self.random.uniform(-1, 1) + 0.5)
            particle.y += math.floor(self.random.uniform(-1, 1) + 0.5)

            if not (0 <= particle.x < self.width and 0 <= particle.y < self.height):
                self.reset(particle)
                continue

            if not self.alone(particle.x, particle.y):
                particle.stuck = True
                self.stuck_count += 1
                index = particle.y * self.width + particle.x
                if not self.field[index]:
                    new_pixels.append((particle.x, particle.y))
                self.field[index] = 1
        return new_pixels


def run_animation(simulation, scale=2):
    import tkinter as tk

    if scale < 1:
        raise ValueError("Scale must be positive.")
    app = tk.Tk()
    app.title("Diffusion-limited aggregation")
    app.resizable(False, False)
    display_width = simulation.width * scale
    display_height = simulation.height * scale
    canvas = tk.Canvas(app, width=display_width, height=display_height,
                       background="white", highlightthickness=0)
    canvas.pack()
    image = tk.PhotoImage(master=app, width=display_width, height=display_height)
    image.put("white", to=(0, 0, display_width, display_height))

    def paint_pixel(x, y):
        image.put("black", to=(x * scale, y * scale,
                               (x + 1) * scale, (y + 1) * scale))

    paint_pixel(*simulation.center)
    canvas.create_image(0, 0, anchor="nw", image=image)
    status = tk.StringVar(master=app, value="Starting simulation…")
    tk.Label(app, textvariable=status, anchor="w").pack(fill="x")
    app.bind("<Escape>", lambda event: app.destroy())
    updates = 0

    def draw():
        nonlocal updates
        # Frozen pixels stay black, so only new pixels need to be drawn.
        for x, y in simulation.step():
            paint_pixel(x, y)
        updates += 1
        status.set(f"Updates: {updates:,}    "
                   f"Stuck particles: {simulation.stuck_count:,} / "
                   f"{len(simulation.particles):,}    Escape to close")
        if simulation.stuck_count < len(simulation.particles):
            app.after(16, draw)

    app.after(16, draw)
    try:
        app.mainloop()
    except KeyboardInterrupt:
        app.destroy()


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--width", type=int, default=512,
                        help="Simulation grid width (default: 512).")
    parser.add_argument("--height", type=int, default=350,
                        help="Simulation grid height (default: 350).")
    parser.add_argument("--scale", type=int, default=2,
                        help="Display pixels per grid cell (default: 2).")
    parser.add_argument("--particles", type=int, default=20000,
                        help="Number of particles (default: 20000).")
    parser.add_argument("--seed", type=int, help="Optional repeatable random seed.")
    args = parser.parse_args()
    if args.scale < 1:
        parser.error("Scale must be positive.")
    try:
        simulation = Simulation(args.width, args.height, args.particles, args.seed)
    except ValueError as error:
        parser.error(str(error))
    run_animation(simulation, args.scale)


if __name__ == "__main__":
    main()
