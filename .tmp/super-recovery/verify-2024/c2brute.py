import sys
x,y,z=map(int,sys.argv[1:4])
days=[0,31,0,31,30,31,30,31,31,30,31,30,31]
def leap(n): return n%400==0 or (n%4==0 and n%100!=0)
w=(29 if leap(x) else 28) if y==2 else days[y]
v=x*y*(w-z+1)
def isprime(v):
    if v<2: return False
    i=2
    while i*i<=v:
        if v%i==0: return False
        i+=1
    return True
print('lucky' if isprime(v) else 'unlucky', f'(v={v})')
