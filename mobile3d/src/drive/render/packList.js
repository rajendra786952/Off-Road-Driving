// What the asset pack contains and how the game uses it. Plain data with no imports, so tests
// and tools can read it without loading the renderer.
/** Every model in the pack: name -> folder. */
export const PACK_MODELS = {
  cow: 'animals', deer: 'animals', elephant: 'animals', goat: 'animals',
  stone_steel_bridge: 'bridges', wooden_bridge: 'bridges',
  city_house_01: 'buildings', industrial_shed_02: 'buildings', office_tower_01: 'buildings', office_tower_02: 'buildings', skyscraper_03: 'buildings', village_house_02: 'buildings', warehouse_01: 'buildings',
  construction_crane: 'landmarks', lighthouse: 'landmarks', water_tower: 'landmarks',
  barrel: 'props', chevron_sign: 'props', crate: 'props', road_barrier: 'props', street_lamp: 'props', traffic_cone: 'props', tunnel_portal: 'props', wood_fence_section: 'props',
  boulder_01: 'rocks', boulder_02: 'rocks', boulder_03: 'rocks', boulder_04: 'rocks', cliff_piece_01: 'rocks', cliff_piece_02: 'rocks',
  jungle_tree_01: 'trees', jungle_tree_02: 'trees', palm_tree_01: 'trees', palm_tree_02: 'trees', pine_tree_01: 'trees',
  offroad_jeep: 'vehicles'
};
/** Which building models stand in for each kind of building the track asks for. */
export const PACK_BUILDINGS = {
  tower: ['office_tower_01', 'office_tower_02', 'skyscraper_03'],
  shed: ['warehouse_01', 'industrial_shed_02'],
  house: ['city_house_01', 'village_house_02']
};
/** Tree templates the track's areas name (tracks/coast.js `kinds`), with how much to enlarge the model. */
export const PACK_TREES = { pk_palm1: ['palm_tree_01', 1.35], pk_palm2: ['palm_tree_02', 1.5], pk_jungle1: ['jungle_tree_01', 1.9], pk_jungle2: ['jungle_tree_02', 2.2], pk_pine: ['pine_tree_01', 1.25] };
export const PACK_GROUND = ['grass', 'dirt', 'mud', 'rock', 'gravel', 'sand', 'asphalt'];
