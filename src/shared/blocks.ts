/**
 * Block registry. Ids are stored in saves, so never renumber — only append.
 * tiles: atlas tile index for [top, side, bottom]. shape "cross" = two crossed planes (plants).
 */
export type BlockDef = {
  id: number;
  name: string;
  solid: boolean; // collides
  opaque: boolean; // hides neighbour faces
  liquid?: boolean;
  cutout?: boolean; // alpha-tested (leaves, fence)
  shape?: "cube" | "cross";
  tiles: [number, number, number];
  farmable?: boolean; // can be tilled
};

export const B = {
  AIR: 0,
  GRASS: 1,
  DIRT: 2,
  BLACK_SOIL: 3,
  TILLED: 4,
  TILLED_WET: 5,
  STONE: 6,
  SAND: 7,
  WATER: 8,
  LOG: 9,
  LEAVES: 10,
  PLANKS: 11,
  THATCH: 12,
  WHITEWASH: 13,
  BRICK: 14,
  ROAD: 15,
  FENCE: 16,
  ROOF_TILE: 17,
  COBBLE: 18,
  SAFFRON: 19,
  BLUE_WOOD: 20,
  MARIGOLD: 21,
  TALL_GRASS: 22,
  BEDROCK: 23,
  RED_SOIL: 24,
  BANYAN_LEAVES: 25,
  HAY: 26,
} as const;
export type BlockId = (typeof B)[keyof typeof B];

// tile indices into the generated atlas (see client/engine/atlas.ts TILE_PAINTERS order)
export const T = {
  GRASS_TOP: 0,
  GRASS_SIDE: 1,
  DIRT: 2,
  BLACK_SOIL: 3,
  TILLED: 4,
  TILLED_WET: 5,
  STONE: 6,
  SAND: 7,
  WATER: 8,
  LOG_SIDE: 9,
  LOG_TOP: 10,
  LEAVES: 11,
  PLANKS: 12,
  THATCH: 13,
  WHITEWASH: 14,
  BRICK: 15,
  ROAD: 16,
  FENCE: 17,
  ROOF_TILE: 18,
  COBBLE: 19,
  SAFFRON: 20,
  BLUE_WOOD: 21,
  MARIGOLD: 22,
  TALL_GRASS: 23,
  BEDROCK: 24,
  RED_SOIL: 25,
  BANYAN_LEAVES: 26,
  HAY_TOP: 27,
  HAY_SIDE: 28,
  BLACK_SOIL_SIDE: 29,
} as const;
export const TILE_COUNT = 30;

const cube = (id: number, name: string, t: number | [number, number, number], extra: Partial<BlockDef> = {}): BlockDef => ({
  id,
  name,
  solid: true,
  opaque: true,
  shape: "cube",
  tiles: typeof t === "number" ? [t, t, t] : t,
  ...extra,
});

export const BLOCKS: BlockDef[] = [];
const add = (d: BlockDef) => (BLOCKS[d.id] = d);
add({ id: B.AIR, name: "Air", solid: false, opaque: false, tiles: [0, 0, 0] });
add(cube(B.GRASS, "Grass", [T.GRASS_TOP, T.GRASS_SIDE, T.DIRT], { farmable: true }));
add(cube(B.DIRT, "Dirt", T.DIRT, { farmable: true }));
add(cube(B.BLACK_SOIL, "Black soil", [T.BLACK_SOIL, T.BLACK_SOIL_SIDE, T.DIRT], { farmable: true }));
add(cube(B.TILLED, "Tilled soil", [T.TILLED, T.BLACK_SOIL_SIDE, T.DIRT]));
add(cube(B.TILLED_WET, "Watered soil", [T.TILLED_WET, T.BLACK_SOIL_SIDE, T.DIRT]));
add(cube(B.STONE, "Stone", T.STONE));
add(cube(B.SAND, "Sand", T.SAND));
add({ id: B.WATER, name: "Water", solid: false, opaque: false, liquid: true, shape: "cube", tiles: [T.WATER, T.WATER, T.WATER] });
add(cube(B.LOG, "Wood", [T.LOG_TOP, T.LOG_SIDE, T.LOG_TOP]));
add(cube(B.LEAVES, "Neem leaves", T.LEAVES, { opaque: false, cutout: true }));
add(cube(B.PLANKS, "Planks", T.PLANKS));
add(cube(B.THATCH, "Thatch", T.THATCH));
add(cube(B.WHITEWASH, "Whitewash", T.WHITEWASH));
add(cube(B.BRICK, "Brick", T.BRICK));
add(cube(B.ROAD, "Gravel road", T.ROAD));
add(cube(B.FENCE, "Fence", T.FENCE, { opaque: false, cutout: true }));
add(cube(B.ROOF_TILE, "Roof tiles", T.ROOF_TILE));
add(cube(B.COBBLE, "Cobblestone", T.COBBLE));
add(cube(B.SAFFRON, "Saffron cloth", T.SAFFRON));
add(cube(B.BLUE_WOOD, "Painted wood", T.BLUE_WOOD));
add({ id: B.MARIGOLD, name: "Marigold", solid: false, opaque: false, cutout: true, shape: "cross", tiles: [T.MARIGOLD, T.MARIGOLD, T.MARIGOLD] });
add({ id: B.TALL_GRASS, name: "Tall grass", solid: false, opaque: false, cutout: true, shape: "cross", tiles: [T.TALL_GRASS, T.TALL_GRASS, T.TALL_GRASS] });
add(cube(B.BEDROCK, "Bedrock", T.BEDROCK));
add(cube(B.RED_SOIL, "Red soil", T.RED_SOIL, { farmable: true }));
add(cube(B.BANYAN_LEAVES, "Banyan leaves", T.BANYAN_LEAVES, { opaque: false, cutout: true }));
add(cube(B.HAY, "Hay bale", [T.HAY_TOP, T.HAY_SIDE, T.HAY_TOP]));

export const block = (id: number) => BLOCKS[id] ?? BLOCKS[0];
