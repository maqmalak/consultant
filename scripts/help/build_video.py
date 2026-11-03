"""frames.json (screencast frames + timestamps) -> H.264 MP4. Long still gaps are capped so the video keeps moving."""
import json, subprocess, sys, imageio_ffmpeg
V = sys.argv[1]; out = sys.argv[2]
frames = json.load(open(f"{V}/" + (sys.argv[3] if len(sys.argv) > 3 else "frames.json")))
lines = []
for i, f in enumerate(frames):
	nxt = frames[i + 1]["t"] if i + 1 < len(frames) else f["t"] + 2
	d = min(max(nxt - f["t"], 0.02), 3.0)
	lines += [f"file '{f['file']}'", f"duration {d:.3f}"]
lines.append(f"file '{frames[-1]['file']}'")
open(f"{V}/concat_" + out.rsplit("/",1)[-1] + ".txt", "w").write("\n".join(lines))
subprocess.run([imageio_ffmpeg.get_ffmpeg_exe(), "-y", "-loglevel", "error", "-f", "concat", "-safe", "0", "-i", f"{V}/concat_" + out.rsplit("/",1)[-1] + ".txt",
	"-vf", "fps=30,scale=1440:900:flags=lanczos,format=yuv420p", "-c:v", "libx264", "-preset", "slow", "-crf", "20",
	"-movflags", "+faststart", out], check=True)
print("total", round(sum(float(l.split()[1]) for l in lines if l.startswith("duration")), 1), "s")
