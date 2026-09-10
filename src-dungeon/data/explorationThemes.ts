export interface ExplorationTheme {
  dungeonId: string;
  name: string;
  surface: string;
  fog: string;
  fogEdge: string;
  wallTop: string;
  wallEdge: string;
  regionTints: Record<1 | 2 | 3, { visible: string; revealed: string }>;
}

export const EXPLORATION_THEMES: Record<string, ExplorationTheme> = {
  'dungeon-01': {
    dungeonId: 'dungeon-01', name: '玄武水庭', surface: '/dungeon-exploration/themes/dungeon-01-water-court.webp',
    fog: '#020b0c', fogEdge: '#72d9c5', wallTop: '#163633', wallEdge: '#6aa99c',
    regionTints: {
      1: { visible: 'rgba(41, 123, 109, .18)', revealed: 'rgba(2, 22, 22, .68)' },
      2: { visible: 'rgba(36, 102, 112, .24)', revealed: 'rgba(2, 18, 25, .7)' },
      3: { visible: 'rgba(126, 104, 50, .17)', revealed: 'rgba(20, 18, 11, .68)' },
    },
  },
  'dungeon-02': {
    dungeonId: 'dungeon-02', name: '数术机关殿', surface: '/dungeon-exploration/themes/dungeon-02-numeral-hall.webp',
    fog: '#0d0a05', fogEdge: '#e2a842', wallTop: '#3b3022', wallEdge: '#ba8842',
    regionTints: { 1: { visible: 'rgba(160,105,25,.12)', revealed: 'rgba(22,14,5,.68)' }, 2: { visible: 'rgba(182,129,34,.18)', revealed: 'rgba(25,16,5,.7)' }, 3: { visible: 'rgba(215,164,59,.2)', revealed: 'rgba(30,20,6,.7)' } },
  },
  'dungeon-03': {
    dungeonId: 'dungeon-03', name: '灵码晶洞', surface: '/dungeon-exploration/themes/dungeon-03-code-cavern.webp',
    fog: '#020611', fogEdge: '#48baff', wallTop: '#111d30', wallEdge: '#396ba1',
    regionTints: { 1: { visible: 'rgba(27,87,153,.12)', revealed: 'rgba(2,7,20,.7)' }, 2: { visible: 'rgba(24,112,175,.16)', revealed: 'rgba(3,8,23,.72)' }, 3: { visible: 'rgba(153,45,48,.13)', revealed: 'rgba(20,4,10,.72)' } },
  },
  'dungeon-04': {
    dungeonId: 'dungeon-04', name: '万木根域', surface: '/dungeon-exploration/themes/dungeon-04-forest.webp',
    fog: '#051008', fogEdge: '#8bd47d', wallTop: '#253721', wallEdge: '#79a864',
    regionTints: { 1: { visible: 'rgba(51,128,58,.1)', revealed: 'rgba(5,21,8,.66)' }, 2: { visible: 'rgba(28,109,76,.15)', revealed: 'rgba(4,20,13,.69)' }, 3: { visible: 'rgba(136,119,40,.14)', revealed: 'rgba(20,18,6,.69)' } },
  },
  'dungeon-05': {
    dungeonId: 'dungeon-05', name: '算法天阶', surface: '/dungeon-exploration/themes/dungeon-05-algorithm-tower.webp',
    fog: '#070b0d', fogEdge: '#5ad9e8', wallTop: '#2f3434', wallEdge: '#d1b56b',
    regionTints: { 1: { visible: 'rgba(67,145,156,.1)', revealed: 'rgba(8,17,20,.66)' }, 2: { visible: 'rgba(43,123,151,.14)', revealed: 'rgba(6,15,22,.69)' }, 3: { visible: 'rgba(172,129,39,.12)', revealed: 'rgba(22,17,7,.68)' } },
  },
  'dungeon-06': {
    dungeonId: 'dungeon-06', name: '天算星台', surface: '/dungeon-exploration/themes/dungeon-06-celestial-platform.webp',
    fog: '#030612', fogEdge: '#9bc7ff', wallTop: '#17233d', wallEdge: '#b6a576',
    regionTints: { 1: { visible: 'rgba(43,92,158,.1)', revealed: 'rgba(4,8,23,.68)' }, 2: { visible: 'rgba(72,65,155,.13)', revealed: 'rgba(8,7,25,.7)' }, 3: { visible: 'rgba(150,75,137,.12)', revealed: 'rgba(21,6,20,.69)' } },
  },
  'dungeon-07': {
    dungeonId: 'dungeon-07', name: '真题古战场', surface: '/dungeon-exploration/themes/dungeon-07-exam-field.webp',
    fog: '#0a0b0c', fogEdge: '#d8c28d', wallTop: '#393b3b', wallEdge: '#9c8b69',
    regionTints: { 1: { visible: 'rgba(49,85,119,.1)', revealed: 'rgba(8,12,17,.66)' }, 2: { visible: 'rgba(125,54,42,.1)', revealed: 'rgba(19,8,7,.68)' }, 3: { visible: 'rgba(50,105,88,.11)', revealed: 'rgba(6,18,14,.69)' } },
  },
  'dungeon-08': {
    dungeonId: 'dungeon-08', name: '五行龙魂境', surface: '/dungeon-exploration/themes/dungeon-08-dragon-sanctuary.webp',
    fog: '#090a0c', fogEdge: '#f1cf73', wallTop: '#39383a', wallEdge: '#d0b15b',
    regionTints: { 1: { visible: 'rgba(46,122,137,.09)', revealed: 'rgba(6,15,18,.66)' }, 2: { visible: 'rgba(139,75,45,.1)', revealed: 'rgba(20,9,6,.68)' }, 3: { visible: 'rgba(185,142,48,.13)', revealed: 'rgba(22,16,5,.68)' } },
  },
};

export function getExplorationTheme(dungeonId: string): ExplorationTheme {
  return EXPLORATION_THEMES[dungeonId] || EXPLORATION_THEMES['dungeon-01'];
}
