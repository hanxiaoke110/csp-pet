// One-off repair: restore the OCR-garbled code of gesp-2023-06-2-15 in the
// reviewed export, verified against the official paper crop
// reports/gesp-sources/crops/2023-06-2-q15.png.
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..');
const file = path.join(root, '.tmp/reviewed-question-bank.json');
const data = JSON.parse(fs.readFileSync(file, 'utf8'));

const FIXED_CODE = `#include <iostream>
using namespace std;
int main() {
    for (char x = 'A'; x <= 'D'; x++)
        if ((x != 'A') + (x == 'C') + (x == 'D') + (x != 'D') == 3)
            cout << x;
    return 0;
}`;

const q = data.questions['gesp-2023-06-2-15'];
if (!q) throw new Error('gesp-2023-06-2-15 not found in reviewed export');
q.code = FIXED_CODE;
fs.writeFileSync(file, JSON.stringify(data, null, 2));
console.log('gesp-2023-06-2-15 code repaired.');
