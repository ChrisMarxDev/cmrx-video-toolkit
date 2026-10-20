"""Generate original local media fixtures. No recordings or external assets."""
from pathlib import Path
import math
import subprocess

ROOT = Path(__file__).resolve().parents[1]
OUT = ROOT / 'assets/demo'

def main():
    OUT.mkdir(parents=True, exist_ok=True)
    if (OUT / 'palette-v3').exists() and all((OUT / name).exists() for name in ('image.png', 'loop.gif', 'clip.mp4')):
        return
    width, height, count = 320, 180, 24
    frames = bytearray()
    for frame in range(count):
        cx = 160 + 95 * math.sin(frame / count * math.tau)
        cy = 90 + 36 * math.cos(frame / count * math.tau)
        for y in range(height):
            for x in range(width):
                color = (237, 240, 243)
                if 28 < x < 292 and 28 < y < 152:
                    color = (40, 45, 52)
                if (x - cx) ** 2 + (y - cy) ** 2 < 22 ** 2:
                    color = (139, 158, 180)
                frames.extend(color)
    subprocess.run(['ffmpeg', '-v', 'error', '-y', '-f', 'rawvideo', '-pixel_format', 'rgb24',
        '-video_size', f'{width}x{height}', '-framerate', '12', '-i', 'pipe:0',
        '-an', '-c:v', 'libx264', '-pix_fmt', 'yuv420p', '-movflags', '+faststart',
        str(OUT/'clip.mp4')], input=frames, check=True)
    subprocess.run(['ffmpeg', '-v', 'error', '-y', '-i', str(OUT/'clip.mp4'),
        '-frames:v', '1', str(OUT/'image.png')], check=True)
    subprocess.run(['ffmpeg', '-v', 'error', '-y', '-i', str(OUT/'clip.mp4'),
        '-filter_complex', '[0:v]split[a][b];[a]palettegen[p];[b][p]paletteuse',
        '-loop', '0', str(OUT/'loop.gif')], check=True)
    (OUT / 'palette-v3').write_text('slate-blue\n')
    print('Generated original CMRX Video Toolkit image, GIF and video fixtures in', OUT)

if __name__ == '__main__':
    main()
