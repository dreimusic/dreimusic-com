#!/usr/bin/env python3
"""Static file server that avoids os.getcwd() entirely (sandboxed cwd issue)."""
import functools
import http.server
import os

DIRECTORY = os.path.dirname(os.path.abspath(__file__))
PORT = 5175

handler = functools.partial(http.server.SimpleHTTPRequestHandler, directory=DIRECTORY)
httpd = http.server.ThreadingHTTPServer(("0.0.0.0", PORT), handler)
print(f"Serving {DIRECTORY} on port {PORT}")
httpd.serve_forever()
