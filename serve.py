# Static file server that tells the browser never to cache, so a refresh always shows the latest page.
import http.server, sys
class NoCache(http.server.SimpleHTTPRequestHandler):
    def end_headers(self):
        self.send_header('Cache-Control', 'no-store, must-revalidate')
        self.send_header('Expires', '0')
        super().end_headers()
port = int(sys.argv[1]) if len(sys.argv) > 1 else 8781
http.server.ThreadingHTTPServer(('127.0.0.1', port), NoCache).serve_forever()
