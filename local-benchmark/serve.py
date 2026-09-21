"""Loopback-only fixture server. Never serves private annotations or directory listings."""
import argparse
import json
from http.server import BaseHTTPRequestHandler, ThreadingHTTPServer
from pathlib import Path
from urllib.parse import parse_qsl, urlencode, urlsplit

ROOT = Path(__file__).resolve().parent


def main():
    parser = argparse.ArgumentParser()
    parser.add_argument("--port", type=int, default=8765)
    args = parser.parse_args()
    if not 1 <= args.port <= 65535:
        parser.error("port must be 1..65535")
    routes = json.loads((ROOT / "private/routes.json").read_text(encoding="utf-8"))

    class Handler(BaseHTTPRequestHandler):
        def do_HEAD(self):
            self.do_GET()

        def do_GET(self):
            parts = urlsplit(self.path)
            query = dict(parse_qsl(parts.query, keep_blank_values=True))
            path = parts.path.rstrip("/")
            if not path:
                self.send_response(302)
                self.send_header("Location", "/dev/")
                self.end_headers()
                return
            # Alias only a missing list page; unknown queries must not masquerade as valid pages.
            if path.endswith("/board/list") and set(query) <= {"board", "page"}:
                query.setdefault("board", "free")
                query.setdefault("page", "1")
            if path.endswith("/board/list") and "q" in query and set(query) <= {"board", "q"}:
                # Search is a navigation convenience, not an extra benchmark page.
                self.send_response(302)
                self.send_header("Location", path + "?board=free&page=1")
                self.end_headers()
                return
            key = path + ("?" + urlencode(sorted(query.items())) if query else "")
            if path in ["/assets/site.css", "/assets/site.js"] and not query:
                file = ROOT / "public" / path.lstrip("/")
                mime = "text/css" if path.endswith("css") else "text/javascript"
            elif key in routes:
                file = ROOT / "public" / routes[key]
                mime = "text/html"
            else:
                self.send_error(404, "Not found")
                return
            data = file.read_bytes()
            self.send_response(200)
            self.send_header("Content-Type", mime + "; charset=utf-8")
            self.send_header("Content-Length", str(len(data)))
            self.send_header("Cache-Control", "no-store")
            self.send_header("X-Content-Type-Options", "nosniff")
            self.send_header("Content-Security-Policy", "default-src 'self'; script-src 'self'; style-src 'self' 'unsafe-inline'; frame-src 'self'; connect-src 'self'; form-action 'self'; base-uri 'none'")
            self.end_headers()
            if self.command != "HEAD":
                self.wfile.write(data)

    server = ThreadingHTTPServer(("127.0.0.1", args.port), Handler)
    print(f"Local benchmark: http://127.0.0.1:{args.port}/dev/", flush=True)
    print(f"Evaluation entry: http://127.0.0.1:{args.port}/eval/", flush=True)
    try:
        server.serve_forever()
    except KeyboardInterrupt:
        pass
    finally:
        server.server_close()


if __name__ == "__main__":
    main()
