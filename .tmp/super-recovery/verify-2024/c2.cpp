#include <iostream>
using namespace std;
const int MAXW = 753005;   // ① A
const int days[13] = {0, 31, 0, 31, 30, 31, 30, 31, 31, 30, 31, 30, 31};
int prime[MAXW], cnt;
bool not_prime[MAXW];
void linear_prime(int n) {
    --n;
    not_prime[0] = not_prime[1] = true;
    for (int i = 2; i <= n; i++) {
        if (not_prime[i] == false)
            prime[++cnt] = i;
        for (int j = 1; (j <= cnt) && (i * prime[j] <= n); j++) {  // ② C
            not_prime[i * prime[j]] = 1;
            if (i % prime[j] == 0)
                break;   // ③ D
        }
    }
}
bool check(int n) {
    return (n % 400 == 0 || (n % 4 == 0 && n % 100 != 0));  // ④ B
}
int main() {
    linear_prime(MAXW);
    int x, y, z, w;
    cin >> x >> y >> z;
    if (y == 2)   // ⑤ D
        w = check(x) ? 29 : 28;
    else
        w = days[y];
    if (not_prime[x * y * (w - z + 1)])
        cout << "unlucky" << endl;
    else
        cout << "lucky" << endl;
    return 0;
}
