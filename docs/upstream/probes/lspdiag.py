import json,subprocess,sys,os
binp,root,files=sys.argv[1],os.path.abspath(sys.argv[2]),sys.argv[3:]
p=subprocess.Popen([binp],stdin=subprocess.PIPE,stdout=subprocess.PIPE,stderr=subprocess.DEVNULL)
def send(m):
    b=json.dumps(m).encode();p.stdin.write(b"Content-Length: %d\r\n\r\n"%len(b)+b);p.stdin.flush()
def recv(want):
    while True:
        h=b""
        while not h.endswith(b"\r\n\r\n"): h+=p.stdout.read(1)
        n=int([l for l in h.split(b"\r\n") if l.lower().startswith(b"content-length")][0].split(b":")[1])
        m=json.loads(p.stdout.read(n))
        if m.get("id")==want and "method" not in m: return m
        if "method" in m and "id" in m: send({"jsonrpc":"2.0","id":m["id"],"result":None})
send({"jsonrpc":"2.0","id":1,"method":"initialize","params":{"rootUri":"file://"+root,"capabilities":{"textDocument":{"diagnostic":{}}},"workspaceFolders":[{"uri":"file://"+root,"name":"p"}]}})
recv(1);send({"jsonrpc":"2.0","method":"initialized","params":{}})
import time; time.sleep(1.5)
for i,f in enumerate(files):
    send({"jsonrpc":"2.0","id":10+i,"method":"textDocument/diagnostic","params":{"textDocument":{"uri":"file://"+os.path.join(root,f)}}})
    r=recv(10+i)
    for d in r["result"].get("items",[]): print(f, d["range"]["start"], d.get("code"), d["message"])
p.kill()
