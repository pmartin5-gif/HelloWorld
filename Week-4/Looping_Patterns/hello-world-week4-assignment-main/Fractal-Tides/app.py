"""Fractal Tides: monochrome recursive growth. Run: python3 app.py."""

import argparse
from pathlib import Path
import time

from fractal_geometry import Fractal


def open_window(seed=None):
    import tkinter as tk
    from tkinter import filedialog, messagebox, ttk

    root = tk.Tk()
    root.title("Fractal Tides — organic growth")
    root.geometry("1100x820")
    root.minsize(720, 520)

    toolbar = ttk.Frame(root, padding=(12, 8))
    toolbar.pack(side="bottom", fill="x")
    canvas = tk.Canvas(root, background="white", highlightthickness=0)
    canvas.pack(fill="both", expand=True)

    speed = tk.DoubleVar(value=.7)
    zoom = tk.DoubleVar(value=1.35)
    status = tk.StringVar()
    paused = False
    model = Fractal(seed)
    items = []
    last_active_start = 0
    dirty = True
    last_time = time.perf_counter()

    def render():
        nonlocal dirty, last_active_start
        width, height = canvas.winfo_width(), canvas.winfo_height()
        base = min(width / 1000, height / 1000) * zoom.get()
        while len(items) < len(model.branches):
            branch = model.branches[len(items)]
            items.append(canvas.create_line(0, 0, 0, 0, fill="black",
                                            width=branch.stroke_width, capstyle="round"))
        # Completed lines are retained; only growing lines change each frame.
        indices = (range(len(model.branches)) if dirty else
                   range(last_active_start, len(model.branches)))
        for index in indices:
            branch = model.branches[index]
            coordinates = [coordinate for x, y in branch.visible_points()
                           for coordinate in (width / 2 + x * base, height / 2 + y * base)]
            canvas.coords(items[index], *coordinates)
        dirty = False
        last_active_start = len(model.branches) - len(model.active)
        state = "Complete" if model.completed else "Paused" if paused else "Growing"
        status.set(f"{state} · Generation {model.generation + 1}"
                   f" · {len(model.branches):,} branches")

    def restart(event=None):
        nonlocal model, paused, dirty, last_time, last_active_start
        model = Fractal(seed)
        canvas.delete("all")
        items.clear()
        last_active_start = 0
        dirty = True
        paused = False
        pause_button.config(text="Pause")
        last_time = time.perf_counter()
        render()

    def toggle_pause(event=None):
        nonlocal paused
        paused = not paused
        pause_button.config(text="Resume" if paused else "Pause")
        render()

    def change_view(event=None):
        nonlocal dirty
        dirty = True

    def save(event=None):
        destination = filedialog.asksaveasfilename(
            parent=root, title="Save fractal drawing", defaultextension=".svg",
            filetypes=[("Vector drawing", "*.svg")],
            initialfile="fractal-organic.svg",
        )
        if destination:
            try:
                model.save_svg(destination)
            except OSError as error:
                messagebox.showerror("Could not save", str(error))
            else:
                status.set(f"Saved {Path(destination).name}")

    def tick():
        nonlocal last_time, dirty
        now = time.perf_counter()
        dt = min(now - last_time, .1)
        last_time = now
        if not paused and not model.completed:
            model.advance(dt * speed.get())
            render()
        elif dirty:
            render()
        root.after(16, tick)

    controls = ttk.Frame(toolbar)
    controls.pack(fill="x")
    ttk.Button(controls, text="Restart", command=restart).pack(side="left", padx=4)
    pause_button = ttk.Button(controls, text="Pause", command=toggle_pause)
    pause_button.pack(side="left", padx=4)
    ttk.Label(controls, text="Speed").pack(side="left", padx=(12, 4))
    ttk.Scale(controls, from_=.15, to=3, variable=speed, length=100).pack(side="left")
    ttk.Label(controls, text="Zoom").pack(side="left", padx=(12, 4))
    ttk.Scale(controls, from_=.3, to=2, variable=zoom, command=change_view,
              length=100).pack(side="left")
    ttk.Button(controls, text="Save SVG", command=save).pack(side="right")
    ttk.Label(toolbar, textvariable=status).pack(anchor="w", pady=(6, 0))
    canvas.bind("<Configure>", change_view)
    root.bind("<space>", toggle_pause)
    root.bind("r", restart)
    root.bind("s", save)
    root.bind("<Escape>", lambda event: root.destroy())
    root.after(16, tick)
    try:
        root.mainloop()
    except KeyboardInterrupt:
        root.destroy()


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--seed", type=int, help="Optional repeatable growth pattern.")
    parser.add_argument("--export", type=Path,
                        help="Save a completed SVG without opening a window.")
    args = parser.parse_args()
    if args.export:
        model = Fractal(args.seed)
        model.advance(100)
        model.save_svg(args.export)
        print(f"Saved {args.export}")
    else:
        open_window(args.seed)


if __name__ == "__main__":
    main()
