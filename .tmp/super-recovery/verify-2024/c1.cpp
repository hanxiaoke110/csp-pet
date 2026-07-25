#include <iostream>
#include <vector>
using namespace std;
const int MAXN = 100000;
int n;
int vis[MAXN], a[MAXN];
vector<int> ans;
int check(int k) {
    int x = n, top = 0;
    for (int i = 0; i <= k; i++) vis[i] = 0;
    while (x > 0) {          // ① A
        a[++top] = x % k;    // ② B
        x = x / k;           // ③ A
    }
    if (top < 2)
        return 0;
    for (int i = 1; i <= top; i++) {
        if (vis[a[i]] == 1)  // ④ D
            return 0;
        vis[a[i]] = 1;
    }
    return 1;
}
int main() {
    cin >> n;
    for (int i = 2; i <= n; i++) {   // ⑤ C
        if (check(i))
            ans.push_back(i);
    }
    if (ans.empty()) {
        cout << -1;
    }
    for (int i = 0; i < (int)ans.size(); i++)
        cout << ans[i] << " ";
    return 0;
}
