import type { PartnerAccessoryPrimitive } from '../types/partnerAccessory';

// Fixed local geometry, shared by SVG and Phaser. Catalogs supply colors and
// bounded timing only; they cannot inject SVG, URLs or executable drawing code.
export type AccessoryInk = 'main' | 'accent' | 'white' | 'none';
export interface AccessoryShape {
  points: readonly (readonly [number, number])[];
  fill: AccessoryInk; stroke: AccessoryInk; width: number; closed: boolean;
}
const polygon = (points: AccessoryShape['points'], fill: AccessoryInk = 'main', stroke: AccessoryInk = 'accent', width = 2): AccessoryShape => ({ points, fill, stroke, width, closed: true });
const line = (points: AccessoryShape['points'], stroke: AccessoryInk = 'accent', width = 2): AccessoryShape => ({ points, fill: 'none', stroke, width, closed: false });
const oval = (cx: number, cy: number, rx: number, ry: number, fill: AccessoryInk, stroke: AccessoryInk = 'accent', angle = 0): AccessoryShape => polygon(Array.from({ length: 28 }, (_, i) => {
  const a = i / 28 * Math.PI * 2, x = Math.cos(a) * rx, y = Math.sin(a) * ry;
  return [cx + x * Math.cos(angle) - y * Math.sin(angle), cy + x * Math.sin(angle) + y * Math.cos(angle)] as const;
}), fill, stroke);
const diamond = (x: number, y: number, rx: number, ry: number, fill: AccessoryInk = 'main') => polygon([[x, y - ry], [x + rx, y], [x, y + ry], [x - rx, y]], fill);
const ART: Partial<Record<PartnerAccessoryPrimitive, readonly AccessoryShape[]>> = {
  crystal: [polygon([[50, 5], [77, 29], [69, 70], [50, 96], [31, 70], [23, 29]]), line([[50, 5], [39, 34], [50, 96], [61, 34], [50, 5]]), line([[23, 29], [77, 29], [50, 48], [23, 29]]), diamond(50, 34, 9, 14, 'white')],
  butterfly: [oval(28, 34, 22, 28, 'main', 'accent', -.5), oval(72, 34, 22, 28, 'main', 'accent', .5), oval(31, 69, 17, 21, 'accent', 'main', .5), oval(69, 69, 17, 21, 'accent', 'main', -.5), oval(50, 51, 5, 27, 'white', 'main'), line([[50, 29], [40, 15], [33, 14]], 'accent', 3), line([[50, 29], [60, 15], [67, 14]], 'accent', 3), diamond(25, 32, 5, 8, 'white'), diamond(75, 32, 5, 8, 'white')],
  wing: [polygon([[48, 57], [34, 29], [8, 9], [14, 39], [3, 33], [17, 62], [9, 61], [31, 84], [48, 70]]), polygon([[52, 57], [66, 29], [92, 9], [86, 39], [97, 33], [83, 62], [91, 61], [69, 84], [52, 70]]), line([[12, 19], [32, 51], [45, 65]]), line([[88, 19], [68, 51], [55, 65]]), diamond(50, 61, 7, 12, 'accent')],
  moon: [polygon([[67, 6], [48, 5], [29, 14], [17, 30], [12, 49], [18, 70], [34, 86], [54, 94], [77, 87], [91, 71], [73, 77], [54, 71], [42, 57], [39, 39], [47, 20]]), diamond(75, 30, 10, 16, 'white'), diamond(88, 54, 5, 8, 'accent')],
  rune: [diamond(50, 50, 35, 43, 'none'), line([[31, 32], [50, 19], [69, 32], [50, 46], [31, 32], [31, 67], [50, 82], [69, 67], [69, 32]], 'main', 5), line([[50, 46], [50, 82]], 'white', 3)],
  petal: [polygon([[50, 94], [22, 69], [12, 45], [16, 22], [31, 8], [50, 19], [69, 8], [84, 22], [88, 45], [78, 69]], 'main'), line([[50, 88], [50, 35]], 'accent', 3)],
  bubble: [oval(50, 50, 39, 39, 'none', 'main'), oval(50, 50, 31, 31, 'none', 'accent'), oval(35, 28, 8, 5, 'white', 'white', -.6), diamond(76, 75, 6, 9, 'accent')],
};
export function accessoryGlyphShapes(primitive: PartnerAccessoryPrimitive) { return ART[primitive]; }
export function accessoryInk(ink: AccessoryInk, color: string, accent: string) {
  return ink === 'main' ? color : ink === 'accent' ? accent : ink === 'white' ? '#ffffff' : 'none';
}

// An unflattened 100×100 motif; renderers project it onto their ground plane.
export function haloMotif(primitive: PartnerAccessoryPrimitive, time: number, duration: number): AccessoryShape[] {
  const phase = time / duration * Math.PI * 2;
  const result: AccessoryShape[] = [];
  if (primitive === 'solar') {
    result.push(oval(50, 50, 34, 34, 'none', 'accent'));
    for (let i = 0; i < 12; i++) {
      const a = phase + i * Math.PI / 6, b = a + .07;
      result.push(polygon([[50 + Math.cos(a) * 39, 50 + Math.sin(a) * 39], [50 + Math.cos(b) * 50, 50 + Math.sin(b) * 50], [50 + Math.cos(a + .14) * 39, 50 + Math.sin(a + .14) * 39]], i % 2 ? 'main' : 'accent'));
    }
  } else if (primitive === 'circuit') {
    const octagon = Array.from({ length: 8 }, (_, i) => [50 + Math.cos(i * Math.PI / 4 + phase * .3) * 42, 50 + Math.sin(i * Math.PI / 4 + phase * .3) * 42] as const);
    result.push(polygon(octagon, 'none', 'accent'));
    for (let i = 0; i < 4; i++) {
      const a = i * Math.PI / 2 + phase * .3;
      const x = 50 + Math.cos(a) * 42, y = 50 + Math.sin(a) * 42;
      result.push(line([[50 + Math.cos(a) * 25, 50 + Math.sin(a) * 25], [x, y], [x + Math.cos(a + .5) * 8, y + Math.sin(a + .5) * 8]], 'main', 3));
      result.push(diamond(x, y, 4, 4, 'white'));
    }
  } else if (primitive === 'lotus') {
    for (let i = 0; i < 8; i++) {
      const a = i * Math.PI / 4 + phase * .15;
      const points = [[0, 3], [-11, 25], [-6, 42], [0, 49], [6, 42], [11, 25]].map(([x, y]) => [50 + x * Math.cos(a) - y * Math.sin(a), 50 + x * Math.sin(a) + y * Math.cos(a)] as const);
      result.push(polygon(points, 'none', i % 2 ? 'main' : 'accent'));
    }
    result.push(oval(50, 50, 11, 11, 'none', 'white'));
  }
  return result;
}
