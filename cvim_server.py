#!/usr/bin/python2.7

# works with python 2.7.6
# in case of a compatibility problem. https://python-future.org/quickstart.html -- pip install future 

'''
USAGE: ./cvim_server.py
If you want to use native Vim to edit text boxes
you must be running this script. To begin editing,
first map the editWithVim (e.g. "imap <C-o> editWithVim") mapping.
By default, this script will spawn a gvim ("gvim -f"), but this action
can be changed via the "vimcommand" cVimrc option
'''

import os
import sys
import shlex
from json import loads
import subprocess
from tempfile import mkstemp
from BaseHTTPServer import HTTPServer, BaseHTTPRequestHandler
from SocketServer import ThreadingMixIn
from  BaseHTTPServer import HTTPServer
from SimpleHTTPServer import SimpleHTTPRequestHandler
from time import sleep


reload(sys)
sys.setdefaultencoding('utf8')
print sys.getdefaultencoding()

PORT = 8001
VIM_COMMAND = 'gvim -f'


def edit_file(content, line, column):
    
    fd, fn = mkstemp(suffix='.html', prefix='cvim-', text=True)
    os.write(fd, content.encode('utf8'))
    os.close(fd)
    command = VIM_COMMAND + " " + fn + ' -c "call cursor(' + str(line) + ',' + str(column) + ')"'
    subprocess.Popen(shlex.split(command)).wait()
    text = None
    with open(fn, 'r') as f:
        text = f.read()
    #os.unlink(fn)
    return text
    
class ThreadingServer(ThreadingMixIn, HTTPServer):
    pass


class CvimServer(SimpleHTTPRequestHandler):
    def do_POST(self):
        length = int(self.headers['Content-Length'])
        content = loads(self.rfile.read(length).decode('utf8'))
        self.send_response(200)
        self.send_header('Content-Type', 'text/plain')
        self.end_headers()

        # Block XMLHttpRequests originating from non-Chrome extensions
        if not self.headers.get('Origin', '').startswith('chrome-extension'):
            edit = ''
        else:
            edit = edit_file(content['data'], content['line'], content['column'])

        self.wfile.write(edit.encode('utf8'))


def init_server(server_class=HTTPServer, handler_class=BaseHTTPRequestHandler):
    ThreadingServer(('127.0.0.1', PORT), CvimServer).serve_forever()

try:
    init_server()
except KeyboardInterrupt:
    exit


