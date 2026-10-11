
import csv
from pathlib import Path

import matplotlib.pyplot as plt
import numpy as np

benchmark_dir = Path(__file__).resolve().parent
summary_path = benchmark_dir / "benchmark_summary.csv"
graphs_dir = benchmark_dir / "graphs"
graphs_dir.mkdir(exist_ok=True)

light_counts = [50, 100, 250, 500, 1000]
renderer_names = ["Naive", "Forward+", "Clustered Deferred"]

data = {}

with summary_path.open(newline="", encoding="utf-8-sig") as file:
    for row in csv.DictReader(file):
        data[(row["Renderer"], int(row["Lights"]))] = float(row["MedianMs"])

x = np.arange(len(light_counts))
width = 0.25

fig, ax = plt.subplots(figsize=(11, 6))

for i, name in enumerate(renderer_names):
    values = [data[(name, count)] for count in light_counts]
    ax.bar(x + (i - 1) * width, values, width, label=name)

ax.set_title("GPU Rendering Performance: Three Rendering Approaches")
ax.set_xlabel("Number of Lights")
ax.set_ylabel("Median GPU Time (ms)")
ax.set_xticks(x)
ax.set_xticklabels(light_counts)
ax.legend()
ax.grid(axis="y", alpha=0.25)
ax.set_axisbelow(True)

fig.tight_layout()
fig.savefig(graphs_dir / "gpu_time_all_renderers.png", dpi=200)
plt.close(fig)

fig, ax = plt.subplots(figsize=(11, 6))
width = 0.35

for i, name in enumerate(renderer_names[1:]):
    values = [data[(name, count)] for count in light_counts]
    ax.bar(x + (i - 0.5) * width, values, width, label=name)

ax.set_title("GPU Rendering Performance: Forward+ vs. Clustered Deferred")
ax.set_xlabel("Number of Lights")
ax.set_ylabel("Median GPU Time (ms)")
ax.set_xticks(x)
ax.set_xticklabels(light_counts)
ax.legend()
ax.grid(axis="y", alpha=0.25)
ax.set_axisbelow(True)

fig.tight_layout()
fig.savefig(graphs_dir / "gpu_time_optimized_renderers.png", dpi=200)
plt.close(fig)

print("Generated graphs:")
print(graphs_dir / "gpu_time_all_renderers.png")
print(graphs_dir / "gpu_time_optimized_renderers.png")
