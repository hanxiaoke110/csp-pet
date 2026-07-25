#include <bits/stdc++.h>
using namespace std;
int x, y;
unsigned int n;
int main() {
    cin >> n >> x >> y;
    unsigned int mask = 0xff;
    int x8 = x << 3;
    int y8 = y << 3;
    unsigned int nx = (n >> x8) & mask, ny = (n >> y8) & mask;
    n &= (~(mask << x8));
    n &= (~(mask << y8));
    n |= (nx << y8);
    n |= (ny << x8);
    cout << "0x";
    cout << std::hex << n << endl;
    // debug for Q19
    cerr << "nx=" << std::hex << nx << " ny=" << ny << "\n";
    return 0;
}
