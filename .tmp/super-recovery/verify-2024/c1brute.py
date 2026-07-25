import sys
n=int(sys.argv[1])
res=[]
for k in range(2,n+1):
    x=n; ds=[]
    while x>0:
        ds.append(x%k); x//=k
    if len(ds)>=2 and len(set(ds))==len(ds):
        res.append(k)
print(-1 if not res else ' '.join(map(str,res)))
