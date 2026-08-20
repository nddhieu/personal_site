import os
import sys
import time
import socket
import threading
import webbrowser
from http.server import HTTPServer, SimpleHTTPRequestHandler

# Ensure working directory is always the script directory
BASE_DIR = os.path.dirname(os.path.abspath(__file__))
os.chdir(BASE_DIR)

class CustomHTTPRequestHandler(SimpleHTTPRequestHandler):
    def __init__(self, *args, **kwargs):
        super().__init__(*args, directory=BASE_DIR, **kwargs)

def find_available_port(start_port=4000, max_attempts=10):
    for port in range(start_port, start_port + max_attempts):
        with socket.socket(socket.AF_INET, socket.SOCK_STREAM) as s:
            try:
                s.bind(('127.0.0.1', port))
                return port
            except OSError:
                continue
    return start_port

def main():
    port = find_available_port(4000)
    url = f"http://127.0.0.1:{port}"
    
    server_address = ('127.0.0.1', port)
    httpd = HTTPServer(server_address, CustomHTTPRequestHandler)
    
    print("=" * 60)
    print(f"  ✦ Personal Site GUI Running at: {url} ✦")
    print(f"  Serving directory: {BASE_DIR}")
    print("=" * 60)
    print("\nOpening your browser automatically...\nPress Ctrl+C to stop the server.\n")

    # Automatically open browser after 0.5s
    threading.Timer(0.5, lambda: webbrowser.open(url)).start()
    
    try:
        httpd.serve_forever()
    except KeyboardInterrupt:
        print("\nStopping server...")
        httpd.server_close()

if __name__ == '__main__':
    main()
