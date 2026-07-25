#include <iostream>
#include <vector>
#include <queue>
using namespace std;
const int MAXN = 200001;
int main() {
    int n, m, l, r, w;
    cin >> n >> m;
    vector<int> dist(MAXN, -1);
    vector<bool> vis(MAXN, false);
    vector<vector<pair<int, int>>> go(MAXN);
    for (int i = 1; i <= m; i++) {
        cin >> l >> r >> w;
        go[l].push_back(make_pair(r + 1, w));
        go[r + 1].push_back(make_pair(l, -w));
    }
    queue<int> q;
    dist[1] = 0, vis[1] = true;
    q.push(1);
    while (!q.empty()) {
        int x = q.front(); q.pop();
        for (auto i : go[x]) {
            if (!vis[i.first]) {
                vis[i.first] = true;
                dist[i.first] = dist[x] + i.second;
                q.push(i.first);
            }
        }
    }
    if (dist[n + 1] == -1) cout << "sorry" << endl;
    else cout << dist[n + 1] << endl;
    return 0;
}
