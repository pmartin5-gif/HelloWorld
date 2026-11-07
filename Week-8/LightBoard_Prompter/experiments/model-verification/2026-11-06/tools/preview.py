#!/usr/bin/env python3
"""Quick reusable composition preview. Requires clang++; no image packages."""
import argparse
import hashlib
import json
from pathlib import Path
import shutil
import struct
import subprocess
import time
import zlib

from lightboard import ROOT, validate_function


def png_sheet(frames, output, scale=8):
    rows = []
    for y in range(32):
        row = b''.join(b''.join(frame[(y*32+x)*3:(y*32+x+1)*3]*scale
                               for x in range(32)) for frame in frames)
        rows.extend([b'\0'+row]*scale)
    def chunk(kind, payload):
        return (struct.pack('!I',len(payload))+kind+payload+
                struct.pack('!I',zlib.crc32(kind+payload)&0xffffffff))
    header = struct.pack('!2I5B',32*scale*len(frames),32*scale,8,2,0,0,0)
    output.write_bytes(b'\x89PNG\r\n\x1a\n'+chunk(b'IHDR',header)+
                       chunk(b'IDAT',zlib.compress(b''.join(rows)))+chunk(b'IEND',b''))


def preview(code, output, times):
    started = time.monotonic()
    if not times or len(times)>8 or times != sorted(times) or times[0]<0 or times[-1]>30000:
        raise ValueError('Choose 1–8 ascending sample times between 0 and 30000 ms')
    function = validate_function(code.read_bytes().decode())
    header = ROOT/'preview_gfx.h'
    key = hashlib.sha256((function+','.join(map(str,times))).encode()+header.read_bytes()).hexdigest()[:20]
    cache = ROOT/'cache'/'preview'/key
    cache.mkdir(parents=True,exist_ok=True)
    executable = cache/'render'
    reused = executable.exists()
    if not reused:
        compiler = shutil.which('clang++')
        if not compiler:
            raise RuntimeError('clang++ unavailable; skip this optional preview')
        (cache/'animation.cpp').write_text(function)
        source = ('#include "preview_gfx.h"\n#include "animation.cpp"\n'
                  'int main(){ unsigned long times[]={'+','.join(map(str,times))+'}; '
                  'int i=0; for(unsigned long clock=0;i<'+str(len(times))+';clock+=33){'
                  'previewNow=clock;restState(clock);'
                  'while(i<'+str(len(times))+' && clock>=times[i]){'
                  'display.save(std::to_string(i)+".ppm");i++;}}}\n')
        # Keep the driver simple: only simulate selected frames and write pixels.
        (cache/'driver.cpp').write_text(source)
        subprocess.run([compiler,'-std=c++17','-O0','-I',str(ROOT),str(cache/'driver.cpp'),
                        '-o',str(executable)],check=True,capture_output=True,text=True,timeout=15)
    subprocess.run([str(executable)],cwd=cache,check=True,timeout=5)
    frames = []
    for i in range(len(times)):
        data=(cache/f'{i}.ppm').read_bytes().split(b'\n',3)[3]
        if len(data)!=32*32*3:
            raise RuntimeError('Preview returned invalid pixels')
        frames.append(data)
    output.parent.mkdir(parents=True,exist_ok=True)
    png_sheet(frames,output)
    result={'preview':str(output),'sample_times_ms':times,'cached_host_renderer':reused,
            'seconds':round(time.monotonic()-started,3),
            'limitation':'Simplified drawing mock; not ESP32, PxMatrix scan timing, or physical LED glow'}
    output.with_suffix('.json').write_text(json.dumps(result,indent=2)+'\n')
    return result


if __name__=='__main__':
    parser=argparse.ArgumentParser(description=__doc__)
    parser.add_argument('--code',type=Path,required=True)
    parser.add_argument('--output',type=Path,default=ROOT/'cache'/'preview.png')
    parser.add_argument('--times-ms',type=int,nargs='+',default=[100,1000,3000,6000])
    args=parser.parse_args()
    try:
        print(json.dumps(preview(args.code,args.output,args.times_ms),indent=2))
    except (OSError,ValueError,RuntimeError,subprocess.SubprocessError) as exc:
        detail=getattr(exc,'stderr',None) or str(exc)
        parser.exit(1,'Preview unavailable (do not rebuild the preview framework): '+detail+'\n')
