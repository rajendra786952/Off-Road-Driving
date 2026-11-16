// Visual palettes. Version 1 ships "green-valley" levels; the other three
// palettes are ready for the Desert / Snow / Jungle expansion (just set
// `theme` on a level).
export const THEMES = {
  'green-valley': {
    name: 'Green Valley',
    friction: 2.5, frictionStatic: 4.0,
    skyTop: 0x4a90d9, skyBottom: 0xd3ecf8, sun: 0xfff2b3,
    farHill: 0x9dbfd0, nearHill: 0x6faa7a,
    dirt: 0x7b5a3c, dirtDeep: 0x5a402a, grass: 0x4f9e3f, grassLight: 0x7ccf5f,
    leaf: 0x3d8f3a, trunk: 0x6b4a2b, rock: 0x8a8f95, bush: 0x3f8a44
  },
  'desert-storm': {
    name: 'Desert Storm',
    friction: 1.9, frictionStatic: 3.0,
    skyTop: 0xe0a35f, skyBottom: 0xf8e2b8, sun: 0xfff0c2,
    farHill: 0xd2a577, nearHill: 0xc08a58,
    dirt: 0xc28f56, dirtDeep: 0x9b6c3a, grass: 0xd9b36a, grassLight: 0xe9cc88,
    leaf: 0x8aa04a, trunk: 0x7a5a38, rock: 0xa87f5a, bush: 0x9aa855
  },
  'snow-mountain': {
    name: 'Snow Mountain',
    friction: 0.95, frictionStatic: 1.4,
    skyTop: 0x6c8fb8, skyBottom: 0xe6f1fa, sun: 0xffffff,
    farHill: 0xb6c9dc, nearHill: 0x9fb6cc,
    dirt: 0x8a8f9a, dirtDeep: 0x646a75, grass: 0xf2f7fb, grassLight: 0xffffff,
    leaf: 0x2f6b4f, trunk: 0x5c4a3a, rock: 0x7c8490, bush: 0xdfe9f1
  },
  'jungle-expedition': {
    name: 'Jungle Expedition',
    friction: 2.3, frictionStatic: 3.6,
    skyTop: 0x3f8f7a, skyBottom: 0xc9ecd0, sun: 0xfff2b3,
    farHill: 0x6fa58a, nearHill: 0x3f7f55,
    dirt: 0x6a4630, dirtDeep: 0x4a3022, grass: 0x2f8a3a, grassLight: 0x55b650,
    leaf: 0x1f7a3a, trunk: 0x5a3d24, rock: 0x707a70, bush: 0x2c7f3c
  }
};
