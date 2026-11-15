#!/usr/bin/env python3
"""Loopback-only game/editor server. Run: python3 editor_server.py"""
import argparse
import errno
import hashlib
import json
import math
import os
from pathlib import Path
from http.server import SimpleHTTPRequestHandler, ThreadingHTTPServer
import threading
import time
from urllib.parse import urlsplit, parse_qs

ROOT = Path(__file__).resolve().parent
CHART = Path('Songs/pink-panther.chart.json')
LOCK = threading.Lock()


def revision(data):
    return hashlib.sha256(data).hexdigest()


def validate_notes(notes, duration):
    if not isinstance(notes, list) or not notes or len(notes) > 10000:
        raise ValueError('Chart must contain at least one note.')
    previous = None
    for value in notes:
        if isinstance(value, bool) or not isinstance(value, (float, int)) or not math.isfinite(value) or not 0 <= value <= duration:
            raise ValueError('Notes must be finite timestamps within the song.')
        if previous is not None and value <= previous:
            raise ValueError('Notes must be sorted with distinct timestamps.')
        previous = value


class Handler(SimpleHTTPRequestHandler):
    def __init__(self, *args, **kwargs):
        super().__init__(*args, directory=str(ROOT), **kwargs)

    def end_headers(self):
        self.send_header('Cache-Control', 'no-store')
        super().end_headers()

    def reply(self, code, payload):
        data = json.dumps(payload).encode()
        self.send_response(code)
        self.send_header('Content-Type', 'application/json')
        self.send_header('Content-Length', str(len(data)))
        self.end_headers()
        self.wfile.write(data)

    def local_request(self):
        host = self.headers.get('Host', '')
        return host in (f'127.0.0.1:{self.server.server_port}', f'localhost:{self.server.server_port}')

    def chart_path(self):
        song = parse_qs(urlsplit(self.path).query).get('song', ['medium'])[0]
        catalog = json.loads((ROOT / 'Songs/catalog.json').read_text())
        entry = next((item for item in catalog if item['id'] == song), None)
        if entry is None:
            raise ValueError('Unknown song')
        return ROOT / entry['chart']

    def do_GET(self):
        if not self.local_request():
            return self.reply(403, {'error': 'Use the localhost address shown in the terminal.'})
        if urlsplit(self.path).path == '/api/chart':
            try:
                with LOCK:
                    raw = self.chart_path().read_bytes()
                return self.reply(200, {'chart': json.loads(raw), 'revision': revision(raw)})
            except (OSError, ValueError):
                return self.reply(500, {'error': 'Could not read the chart.'})
        if any(part.startswith('.') for part in urlsplit(self.path).path.split('/')):
            return self.reply(404, {'error': 'Not found'})
        super().do_GET()

    def do_POST(self):
        host = self.headers.get('Host', '')
        if not self.local_request() or self.headers.get('Origin') != f'http://{host}':
            return self.reply(403, {'error': 'Save from the editor on this same localhost server.'})
        if urlsplit(self.path).path != '/api/chart':
            return self.reply(404, {'error': 'Not found'})
        if self.headers.get('Content-Type', '').split(';')[0] != 'application/json':
            return self.reply(415, {'error': 'Expected JSON'})
        try:
            length = int(self.headers.get('Content-Length', '0'))
            if not 0 < length <= 200000:
                return self.reply(413, {'error': 'Invalid chart size'})
            body = json.loads(self.rfile.read(length))
            if not isinstance(body, dict):
                raise ValueError('Expected a chart update.')
            with LOCK:
                path = self.chart_path()
                raw = path.read_bytes()
                if body.get('revision') != revision(raw):
                    return self.reply(409, {'error': 'Chart changed on disk. Export your draft, then reload the editor before saving.'})
                chart = json.loads(raw)
                validate_notes(body.get('notes'), chart['duration'])
                chart['notes'] = body['notes']
                chart['status'] = 'manually-edited'
                chart['method'] = 'Manually edited in the Triangle Hero chart editor.'
                chart['uncertainPassages'] = []
                data = (json.dumps(chart, indent=2, allow_nan=False) + '\n').encode()
                backup_dir = ROOT / 'Songs/.chart-backups'
                backup_dir.mkdir(exist_ok=True)
                (backup_dir / f'{path.stem}.{time.time_ns()}.json').write_bytes(raw)
                temporary = path.with_suffix('.json.tmp')
                try:
                    temporary.write_bytes(data)
                    os.replace(temporary, path)
                finally:
                    temporary.unlink(missing_ok=True)
            self.reply(200, {'chart': chart, 'revision': revision(data)})
        except (ValueError, TypeError, KeyError) as error:
            self.reply(400, {'error': str(error)})
        except OSError:
            self.reply(500, {'error': 'Could not save the chart. Your draft remains in the editor.'})


if __name__ == '__main__':
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument('--port', type=int, default=8000)
    args = parser.parse_args()
    try:
        server = ThreadingHTTPServer(('127.0.0.1', args.port), Handler)
    except OSError as error:
        hint = ' Try --port 8001.' if error.errno == errno.EADDRINUSE else ' Local server listening is unavailable in this environment.'
        parser.exit(1, f'Could not start server: {error}.{hint}\n')
    print(f'Editor: http://127.0.0.1:{args.port}/editor/\nGame:   http://127.0.0.1:{args.port}/', flush=True)
    try:
        server.serve_forever()
    except KeyboardInterrupt:
        pass
    finally:
        server.server_close()
