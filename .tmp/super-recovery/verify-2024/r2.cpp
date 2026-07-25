#include <bits/stdc++.h>
using namespace std;
int n, k;
int func(vector<int> &nums) {
    int ret = 0;
    for (int i = n; i > k; i--) {
        if (nums[i] > nums[i - k]) {
            swap(nums[i], nums[i - k]);
            ret++;
        }
    }
    return ret;
}
int main() {
    cin >> n >> k;
    vector<int> a(n + 1, 0);
    for (int i = 1; i <= n; i++)
        cin >> a[i];
    int counter = 0, previous = -1;
    while (counter != previous) {
        previous = counter;
        counter += func(a);
    }
    for (int i = 1; i <= n; i++)
        cout << a[i] << ",";
    cout << endl << counter << endl;
    return 0;
}
