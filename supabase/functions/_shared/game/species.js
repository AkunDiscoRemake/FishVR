// 130+ fish species. Every species has its own body archetype, colouring,
// size range, fight behaviour, speed/power/stamina profile, rarity and value.
// Shared by client (models, catalogue, AI) and server (catch validation, value).

// Condition factor per body shape: weight(kg) = K * length(cm)^3 / 100000
export const SHAPES = {
  fusiform: { K: 1.1 }, bass: { K: 1.6 }, perch: { K: 1.3 }, pike: { K: 0.8 },
  carp: { K: 1.8 }, catfish: { K: 1.1 }, disc: { K: 2.4 }, eel: { K: 0.18 },
  tuna: { K: 2.0 }, billfish: { K: 0.9 }, shark: { K: 0.9 }, ray: { K: 1.2 },
  flatfish: { K: 1.4 }, puffer: { K: 2.6 }, angler: { K: 2.2 }, gar: { K: 0.6 },
  grouper: { K: 2.0 }, reef: { K: 2.2 }, sturgeon: { K: 0.75 }, ribbon: { K: 0.05 },
};

// Fight behaviour profiles drive the PERFECT! beat generator.
// yaw: lateral swing amplitude, pitch: vertical bias, lateral: chance of moving target,
// pull: base pull strength, tempo: window length factor (<1 = faster), rest: chance of approach/rest beats
export const BEHAVIORS = {
  runner: { yaw: 48, pitch: 10, lateral: 0.35, pull: 0.8, tempo: 0.85, rest: 0.18, jump: 0.05, dive: 0.1 },
  diver: { yaw: 28, pitch: 34, lateral: 0.25, pull: 0.85, tempo: 1.0, rest: 0.2, jump: 0.0, dive: 0.45 },
  jumper: { yaw: 38, pitch: 8, lateral: 0.35, pull: 0.65, tempo: 0.8, rest: 0.2, jump: 0.35, dive: 0.05 },
  zigzag: { yaw: 52, pitch: 12, lateral: 0.65, pull: 0.6, tempo: 0.75, rest: 0.15, jump: 0.05, dive: 0.1 },
  bulldog: { yaw: 22, pitch: 22, lateral: 0.15, pull: 1.0, tempo: 1.15, rest: 0.12, jump: 0.0, dive: 0.3 },
  sulker: { yaw: 18, pitch: 26, lateral: 0.1, pull: 0.7, tempo: 1.35, rest: 0.3, jump: 0.0, dive: 0.35 },
  erratic: { yaw: 55, pitch: 25, lateral: 0.5, pull: 0.75, tempo: 0.8, rest: 0.15, jump: 0.15, dive: 0.2 },
};

// id, name, scientific, worlds, rarity, shape, body, belly, pattern, patternColor, fin,
// lenMin(cm), lenMax(cm), speed, power, stamina, behaviour, baseValue, flags
const RAW = [
  // ---------------- LAKE ----------------
  ['bluegill', 'Bluegill', 'Lepomis macrochirus', 'lake', 'C', 'disc', 0x4c6b5a, 0xe8a64a, 'bars', 0x2b3d34, 0x3b4f5c, 12, 30, 0.45, 0.25, 0.35, 'zigzag', 8, 'earflap'],
  ['pumpkinseed', 'Pumpkinseed', 'Lepomis gibbosus', 'lake', 'C', 'disc', 0x8a9a4a, 0xf0a030, 'spots', 0x3a8acf, 0x8a7a3a, 10, 25, 0.45, 0.22, 0.3, 'zigzag', 9, 'earflap'],
  ['yellow_perch', 'Yellow Perch', 'Perca flavescens', 'lake', 'C', 'perch', 0xc9b23a, 0xf4ecc0, 'bars', 0x3d4a1a, 0xe07a2a, 15, 40, 0.5, 0.3, 0.35, 'zigzag', 10, 'spines'],
  ['largemouth_bass', 'Largemouth Bass', 'Micropterus salmoides', 'lake river', 'C', 'bass', 0x5f7b3c, 0xe9e6c4, 'stripes', 0x2b3a19, 0x55663a, 25, 75, 0.55, 0.55, 0.5, 'jumper', 22, 'bigmouth'],
  ['smallmouth_bass', 'Smallmouth Bass', 'Micropterus dolomieu', 'lake river', 'U', 'bass', 0x8a6e3c, 0xe2d6a8, 'bars', 0x4a3a1c, 0x7a5e30, 25, 65, 0.6, 0.55, 0.6, 'jumper', 34, ''],
  ['black_crappie', 'Black Crappie', 'Pomoxis nigromaculatus', 'lake', 'U', 'disc', 0x9aa592, 0xe6eadf, 'mottled', 0x2a2f2a, 0x5a5f55, 15, 40, 0.45, 0.3, 0.35, 'zigzag', 30, ''],
  ['white_crappie', 'White Crappie', 'Pomoxis annularis', 'lake', 'C', 'disc', 0xb7c2b5, 0xf3f5ef, 'bars', 0x56625a, 0x8a948a, 15, 40, 0.45, 0.28, 0.3, 'zigzag', 12, ''],
  ['northern_pike', 'Northern Pike', 'Esox lucius', 'lake river', 'U', 'pike', 0x4f6a3a, 0xe8e5c7, 'spots', 0xd9d48a, 0x8a5a2a, 45, 130, 0.8, 0.65, 0.55, 'runner', 55, 'teeth'],
  ['muskellunge', 'Muskellunge', 'Esox masquinongy', 'lake', 'R', 'pike', 0x8a8d55, 0xeeeacc, 'bars', 0x4a4f2a, 0x8a5a2a, 70, 160, 0.85, 0.8, 0.75, 'runner', 160, 'teeth'],
  ['walleye', 'Walleye', 'Sander vitreus', 'lake river', 'U', 'perch', 0x9a8a3e, 0xf2eed8, 'mottled', 0x4a3f1a, 0x7a6a3a, 30, 80, 0.55, 0.45, 0.45, 'sulker', 38, 'bigeye spines'],
  ['common_carp', 'Common Carp', 'Cyprinus carpio', 'lake river', 'C', 'carp', 0x8a6a2e, 0xe8d090, 'scales', 0x5a4018, 0x6a4a28, 35, 110, 0.4, 0.75, 0.75, 'bulldog', 20, 'barbels'],
  ['mirror_carp', 'Mirror Carp', 'Cyprinus carpio carpio', 'lake', 'U', 'carp', 0x8e7a3a, 0xead8a0, 'patches', 0xc8a858, 0x6a4a28, 40, 110, 0.4, 0.8, 0.8, 'bulldog', 45, 'barbels'],
  ['grass_carp', 'Grass Carp', 'Ctenopharyngodon idella', 'lake river', 'U', 'carp', 0x6a7a5a, 0xdcd8c0, 'scales', 0x3e4a32, 0x5a6050, 50, 140, 0.55, 0.75, 0.8, 'runner', 40, ''],
  ['channel_catfish', 'Channel Catfish', 'Ictalurus punctatus', 'lake river', 'C', 'catfish', 0x6a7280, 0xe4e4e0, 'spots', 0x2a2e36, 0x50565e, 35, 110, 0.45, 0.65, 0.65, 'bulldog', 22, 'whiskers'],
  ['blue_catfish', 'Blue Catfish', 'Ictalurus furcatus', 'lake river', 'R', 'catfish', 0x5a7090, 0xe8ecf0, 'plain', 0x3a4a60, 0x4a5a70, 60, 160, 0.45, 0.9, 0.85, 'bulldog', 140, 'whiskers'],
  ['flathead_catfish', 'Flathead Catfish', 'Pylodictis olivaris', 'lake river', 'R', 'catfish', 0x8a7a3a, 0xe8dca8, 'mottled', 0x4a3a1a, 0x6a5a2a, 50, 150, 0.4, 0.9, 0.8, 'sulker', 130, 'whiskers flathead'],
  ['lake_trout', 'Lake Trout', 'Salvelinus namaycush', 'lake', 'U', 'fusiform', 0x5a6a62, 0xeae6da, 'spots', 0xe6e6d0, 0x6a7066, 40, 120, 0.6, 0.6, 0.7, 'diver', 48, ''],
  ['brook_trout', 'Brook Trout', 'Salvelinus fontinalis', 'lake river', 'U', 'fusiform', 0x4a5a3a, 0xe86a2a, 'vermic', 0xc8c890, 0xd06a3a, 20, 55, 0.65, 0.4, 0.45, 'jumper', 42, 'redspots'],
  ['golden_trout', 'Golden Trout', 'Oncorhynchus aguabonita', 'lake', 'R', 'fusiform', 0xd8b030, 0xe84a2a, 'parr', 0x6a5a2a, 0xe0a030, 20, 50, 0.7, 0.4, 0.5, 'jumper', 120, ''],
  ['tench', 'Tench', 'Tinca tinca', 'lake', 'C', 'carp', 0x5a6a2a, 0xa8a050, 'plain', 0x3a4a1a, 0x3a4a22, 25, 70, 0.35, 0.6, 0.6, 'sulker', 14, 'redeye'],
  ['rudd', 'Rudd', 'Scardinius erythrophthalmus', 'lake', 'C', 'carp', 0xa89a5a, 0xeae0b8, 'scales', 0x8a7a3a, 0xe0402a, 15, 45, 0.5, 0.3, 0.35, 'zigzag', 9, ''],
  ['common_bream', 'Common Bream', 'Abramis brama', 'lake river', 'C', 'disc', 0x9a8a5a, 0xe2dcc0, 'scales', 0x6a5a3a, 0x5a5048, 30, 80, 0.35, 0.45, 0.45, 'sulker', 12, ''],
  ['burbot', 'Burbot', 'Lota lota', 'lake river', 'U', 'catfish', 0x6a5a2a, 0xd8d0a0, 'mottled', 0x2a2410, 0x5a4a22, 30, 100, 0.4, 0.5, 0.6, 'sulker', 36, 'chinbarbel'],
  ['bowfin', 'Bowfin', 'Amia calva', 'lake river', 'R', 'pike', 0x5a6a3a, 0xc8c8a0, 'mottled', 0x2a3a1a, 0x4a7a3a, 45, 100, 0.65, 0.75, 0.75, 'erratic', 95, 'longdorsal eyespot'],
  ['longnose_gar', 'Longnose Gar', 'Lepisosteus osseus', 'lake river', 'U', 'gar', 0x7a7a4a, 0xe8e4c8, 'spots', 0x3a3a1a, 0x6a6a3a, 60, 180, 0.7, 0.55, 0.6, 'runner', 40, 'snout'],
  ['alligator_gar', 'Alligator Gar', 'Atractosteus spatula', 'lake river', 'E', 'gar', 0x6a6a3a, 0xe0dcc0, 'mottled', 0x3a3a1a, 0x5a5a2e, 120, 280, 0.6, 1.0, 0.95, 'bulldog', 420, 'snout teeth'],
  ['koi', 'Koi', 'Cyprinus rubrofuscus', 'lake', 'E', 'carp', 0xf2f0ea, 0xfaf8f4, 'patches', 0xe8501a, 0xf4f0e8, 40, 90, 0.4, 0.6, 0.65, 'sulker', 380, 'barbels longfins'],
  ['lake_sturgeon', 'Lake Sturgeon', 'Acipenser fulvescens', 'lake river', 'E', 'sturgeon', 0x6a6050, 0xdcd8c8, 'plain', 0x3a3428, 0x5a5040, 90, 220, 0.45, 0.95, 1.0, 'bulldog', 460, 'scutes whiskers'],
  ['albino_muskellunge', 'Ghost Muskellunge', 'Esox masquinongy (albino)', 'lake', 'L', 'pike', 0xf0ece4, 0xffffff, 'bars', 0xd8d0c4, 0xf0c8c0, 120, 175, 0.9, 0.95, 0.95, 'runner', 2600, 'teeth albino'],
  ['golden_mirror_carp', 'Golden Emperor Carp', 'Cyprinus carpio aureus', 'lake', 'L', 'carp', 0xe8b828, 0xfff0a0, 'patches', 0xffd860, 0xe0a020, 80, 125, 0.5, 1.0, 1.0, 'bulldog', 2400, 'barbels gold'],

  // ---------------- RIVER ----------------
  ['rainbow_trout', 'Rainbow Trout', 'Oncorhynchus mykiss', 'river lake', 'C', 'fusiform', 0x6a7a5a, 0xf0ece4, 'spots', 0x1a1a14, 0x7a8a6a, 25, 75, 0.7, 0.45, 0.5, 'jumper', 18, 'redband'],
  ['brown_trout', 'Brown Trout', 'Salmo trutta', 'river', 'C', 'fusiform', 0x8a6a3a, 0xf2e2b0, 'spots', 0x2a1a0a, 0x7a5a30, 25, 80, 0.65, 0.5, 0.55, 'runner', 20, 'redspots'],
  ['cutthroat_trout', 'Cutthroat Trout', 'Oncorhynchus clarkii', 'river', 'U', 'fusiform', 0x8a8a5a, 0xf0d8a8, 'spots', 0x1a1a10, 0x8a7a50, 25, 70, 0.65, 0.45, 0.5, 'jumper', 34, 'throatslash'],
  ['atlantic_salmon', 'Atlantic Salmon', 'Salmo salar', 'river ocean', 'R', 'fusiform', 0x6a7a8a, 0xf4f4f0, 'spots', 0x1a1a22, 0x5a6a7a, 60, 140, 0.85, 0.75, 0.85, 'jumper', 150, ''],
  ['chinook_salmon', 'Chinook Salmon', 'Oncorhynchus tshawytscha', 'river ocean', 'R', 'fusiform', 0x5a6a7a, 0xeeeeea, 'spots', 0x1a1a1a, 0x4a5a6a, 70, 150, 0.8, 0.85, 0.85, 'runner', 170, 'kype'],
  ['coho_salmon', 'Coho Salmon', 'Oncorhynchus kisutch', 'river', 'U', 'fusiform', 0x5a7a9a, 0xe8e8e8, 'spots', 0x1a1a22, 0x6a7a8a, 45, 90, 0.8, 0.6, 0.65, 'jumper', 55, ''],
  ['sockeye_salmon', 'Sockeye Salmon', 'Oncorhynchus nerka', 'river', 'U', 'fusiform', 0xd83020, 0xe85a3a, 'gradient', 0x2a5a3a, 0x3a6a3a, 45, 80, 0.75, 0.55, 0.65, 'runner', 60, 'greenhead kype'],
  ['steelhead', 'Steelhead', 'Oncorhynchus mykiss irideus', 'river', 'R', 'fusiform', 0x7a8a9a, 0xf4f4f4, 'spots', 0x22262a, 0x7a8a9a, 55, 110, 0.9, 0.7, 0.8, 'jumper', 135, 'redband'],
  ['arctic_grayling', 'Arctic Grayling', 'Thymallus arcticus', 'river', 'U', 'fusiform', 0x7a7a8a, 0xdcd8e0, 'spots', 0x2a2a3a, 0x8a5a9a, 25, 60, 0.6, 0.35, 0.4, 'zigzag', 46, 'sail'],
  ['european_chub', 'Chub', 'Squalius cephalus', 'river', 'C', 'carp', 0x6a6a5a, 0xe4e0d0, 'scales', 0x3a3a2a, 0xd07a4a, 25, 60, 0.5, 0.4, 0.4, 'runner', 10, ''],
  ['barbel', 'Barbel', 'Barbus barbus', 'river', 'U', 'carp', 0x8a7a4a, 0xe4d8b0, 'plain', 0x5a4a2a, 0xb06a3a, 30, 90, 0.55, 0.65, 0.75, 'bulldog', 38, 'barbels'],
  ['zander', 'Zander', 'Sander lucioperca', 'river lake', 'U', 'perch', 0x8a8a7a, 0xf0f0e8, 'bars', 0x3a3a2a, 0x6a6a5a, 40, 100, 0.6, 0.55, 0.5, 'sulker', 42, 'bigeye spines'],
  ['european_perch', 'European Perch', 'Perca fluviatilis', 'river lake', 'C', 'perch', 0x7a8a3a, 0xf0e8c8, 'bars', 0x2a3a10, 0xe0502a, 15, 45, 0.5, 0.3, 0.35, 'zigzag', 9, 'spines'],
  ['asp', 'Asp', 'Leuciscus aspius', 'river', 'U', 'fusiform', 0x6a7a8a, 0xf0f4f6, 'plain', 0x3a4a5a, 0x8a8a9a, 40, 90, 0.85, 0.5, 0.5, 'runner', 35, ''],
  ['huchen', 'Huchen', 'Hucho hucho', 'river', 'E', 'fusiform', 0x8a6a5a, 0xeee0d8, 'spots', 0x2a1a1a, 0x8a5a4a, 70, 150, 0.8, 0.9, 0.9, 'runner', 440, ''],
  ['siberian_taimen', 'Siberian Taimen', 'Hucho taimen', 'river', 'L', 'fusiform', 0x7a4a3a, 0xe8c8b0, 'spots', 0x1a0a0a, 0xc0402a, 110, 200, 0.85, 1.0, 1.0, 'runner', 3200, 'redtail'],
  ['white_sturgeon', 'White Sturgeon', 'Acipenser transmontanus', 'river ocean', 'E', 'sturgeon', 0x7a7a72, 0xe8e8e0, 'plain', 0x4a4a42, 0x6a6a62, 120, 300, 0.45, 1.0, 1.0, 'bulldog', 520, 'scutes whiskers'],
  ['beluga_sturgeon', 'Beluga Sturgeon', 'Huso huso', 'river', 'L', 'sturgeon', 0x8a8a8a, 0xf0f0f0, 'plain', 0x5a5a5a, 0x7a7a7a, 180, 400, 0.4, 1.0, 1.0, 'bulldog', 4200, 'scutes whiskers'],
  ['american_shad', 'American Shad', 'Alosa sapidissima', 'river ocean', 'C', 'fusiform', 0x6a8aa0, 0xf4f6f8, 'spots', 0x2a3a4a, 0x8a9aaa, 30, 60, 0.75, 0.35, 0.4, 'jumper', 11, ''],
  ['sauger', 'Sauger', 'Sander canadensis', 'river', 'C', 'perch', 0x9a8a5a, 0xf0e8d0, 'mottled', 0x3a2a10, 0x8a7a4a, 25, 55, 0.5, 0.35, 0.4, 'sulker', 13, 'spines'],
  ['freshwater_drum', 'Freshwater Drum', 'Aplodinotus grunniens', 'river lake', 'C', 'bass', 0x9a9a8a, 0xf0f0e8, 'plain', 0x5a5a4a, 0x8a8a7a, 30, 75, 0.45, 0.55, 0.5, 'bulldog', 12, 'hump'],
  ['american_eel', 'American Eel', 'Anguilla rostrata', 'river', 'U', 'eel', 0x5a5a2a, 0xd8d0a0, 'plain', 0x2a2a10, 0x4a4a22, 50, 130, 0.55, 0.5, 0.7, 'erratic', 36, ''],
  ['european_eel', 'European Eel', 'Anguilla anguilla', 'river lake', 'U', 'eel', 0x4a4a2a, 0xe0d8a8, 'plain', 0x1a1a0a, 0x3a3a1a, 50, 130, 0.55, 0.5, 0.7, 'erratic', 40, ''],
  ['wels_catfish', 'Wels Catfish', 'Silurus glanis', 'river lake', 'E', 'catfish', 0x4a4a3a, 0xd8d8c8, 'mottled', 0x1a1a10, 0x3a3a2a, 120, 270, 0.45, 1.0, 0.95, 'bulldog', 480, 'whiskers longwhiskers'],
  ['dolly_varden', 'Dolly Varden', 'Salvelinus malma', 'river', 'U', 'fusiform', 0x5a6a5a, 0xe8b090, 'spots', 0xe87a5a, 0x6a6a5a, 25, 65, 0.6, 0.4, 0.5, 'diver', 38, ''],
  ['golden_mahseer', 'Golden Mahseer', 'Tor putitora', 'river', 'R', 'carp', 0xd8a840, 0xf4e0a0, 'scales', 0xa07a20, 0xd08a40, 60, 150, 0.7, 0.9, 0.85, 'runner', 190, 'barbels'],
  ['goliath_tigerfish', 'Goliath Tigerfish', 'Hydrocynus goliath', 'river tropical', 'E', 'fusiform', 0xb0b4b8, 0xf4f4f4, 'stripes', 0x2a2a2a, 0xd03a2a, 70, 150, 0.9, 0.95, 0.85, 'runner', 500, 'teeth'],
  ['paddlefish', 'American Paddlefish', 'Polyodon spathula', 'river', 'R', 'sturgeon', 0x5a6a7a, 0xe0e4e8, 'plain', 0x3a4a5a, 0x4a5a6a, 90, 210, 0.5, 0.8, 0.85, 'sulker', 210, 'paddle'],

  // ---------------- OCEAN (coastal / offshore) ----------------
  ['atlantic_mackerel', 'Atlantic Mackerel', 'Scomber scombrus', 'ocean', 'C', 'tuna', 0x2a6a6a, 0xf0f4f4, 'tigerstripe', 0x0a2020, 0x3a5a5a, 25, 50, 0.85, 0.35, 0.4, 'runner', 9, 'finlets'],
  ['atlantic_cod', 'Atlantic Cod', 'Gadus morhua', 'ocean deep', 'C', 'fusiform', 0x8a8a5a, 0xf0ecd8, 'mottled', 0x4a4a2a, 0x7a7a4a, 40, 140, 0.4, 0.6, 0.55, 'sulker', 18, 'chinbarbel lateral'],
  ['haddock', 'Haddock', 'Melanogrammus aeglefinus', 'ocean', 'C', 'fusiform', 0x6a6a72, 0xeeeef2, 'plain', 0x2a2a30, 0x4a4a52, 30, 80, 0.45, 0.4, 0.4, 'sulker', 12, 'thumbprint lateral'],
  ['pollock', 'Pollock', 'Pollachius virens', 'ocean', 'C', 'fusiform', 0x3a5a3a, 0xe4ead8, 'plain', 0x1a2a1a, 0x3a4a3a, 35, 110, 0.65, 0.5, 0.5, 'diver', 14, 'lateral'],
  ['european_seabass', 'European Seabass', 'Dicentrarchus labrax', 'ocean', 'C', 'bass', 0x8a96a4, 0xf4f6f8, 'plain', 0x4a5664, 0x6a7684, 30, 100, 0.65, 0.5, 0.5, 'runner', 22, 'spines'],
  ['striped_bass', 'Striped Bass', 'Morone saxatilis', 'ocean river', 'U', 'bass', 0x8a9aa4, 0xf6f8f8, 'stripes', 0x1a2228, 0x6a7a84, 45, 150, 0.7, 0.7, 0.7, 'runner', 50, ''],
  ['bluefish', 'Bluefish', 'Pomatomus saltatrix', 'ocean', 'U', 'tuna', 0x3a7a9a, 0xe8f0f4, 'plain', 0x1a4a6a, 0x4a6a7a, 40, 110, 0.85, 0.65, 0.6, 'zigzag', 40, 'teeth'],
  ['red_drum', 'Red Drum', 'Sciaenops ocellatus', 'ocean', 'U', 'bass', 0xb8703a, 0xf0e0c8, 'eyespot', 0x1a0a0a, 0xa86030, 45, 150, 0.6, 0.75, 0.7, 'bulldog', 46, ''],
  ['black_drum', 'Black Drum', 'Pogonias cromis', 'ocean', 'C', 'bass', 0x4a4a48, 0xb8b8b0, 'bars', 0x1a1a18, 0x2a2a28, 40, 120, 0.4, 0.7, 0.6, 'bulldog', 20, 'hump chinbarbel'],
  ['summer_flounder', 'Summer Flounder', 'Paralichthys dentatus', 'ocean', 'U', 'flatfish', 0x8a7a5a, 0xf0ece0, 'eyespot', 0x3a2a1a, 0x7a6a4a, 35, 95, 0.4, 0.55, 0.55, 'sulker', 40, ''],
  ['atlantic_halibut', 'Atlantic Halibut', 'Hippoglossus hippoglossus', 'ocean deep', 'R', 'flatfish', 0x5a5a4a, 0xf4f4f0, 'mottled', 0x2a2a1a, 0x4a4a3a, 80, 250, 0.45, 0.95, 0.95, 'bulldog', 220, ''],
  ['sheepshead', 'Sheepshead', 'Archosargus probatocephalus', 'ocean', 'C', 'bass', 0xc8c8c0, 0xf0f0ea, 'bars', 0x1a1a1a, 0x5a5a5a, 30, 75, 0.45, 0.5, 0.5, 'bulldog', 16, 'teeth spines'],
  ['tarpon', 'Tarpon', 'Megalops atlanticus', 'ocean tropical', 'R', 'fusiform', 0xb0bcc8, 0xf8f8fa, 'scales', 0x6a7a8a, 0x5a6a7a, 120, 250, 0.85, 0.85, 0.9, 'jumper', 230, 'bigscales upturned'],
  ['bonefish', 'Bonefish', 'Albula vulpes', 'ocean tropical', 'U', 'fusiform', 0xb4c0c8, 0xf6f8fa, 'stripes', 0x8a96a0, 0x8a96a0, 40, 90, 0.95, 0.5, 0.55, 'runner', 48, 'snout'],
  ['yellowtail_amberjack', 'Yellowtail Amberjack', 'Seriola lalandi', 'ocean', 'U', 'tuna', 0x4a6a8a, 0xf0f2f4, 'stripes', 0xe8d040, 0xe8c840, 60, 150, 0.85, 0.75, 0.7, 'runner', 58, ''],
  ['greater_amberjack', 'Greater Amberjack', 'Seriola dumerili', 'ocean deep', 'R', 'tuna', 0x8a8a6a, 0xf0ece0, 'stripes', 0xb0903a, 0x8a7a50, 80, 190, 0.8, 0.95, 0.85, 'diver', 200, ''],
  ['bluefin_tuna', 'Atlantic Bluefin Tuna', 'Thunnus thynnus', 'ocean', 'E', 'tuna', 0x1a2a5a, 0xe8ecf0, 'gradient', 0x6a8aaa, 0x2a3a6a, 150, 330, 0.95, 1.0, 1.0, 'runner', 780, 'finlets'],
  ['yellowfin_tuna', 'Yellowfin Tuna', 'Thunnus albacares', 'ocean tropical', 'R', 'tuna', 0x1a3060, 0xf0f2f6, 'stripes', 0xe8d040, 0xf0d030, 80, 220, 0.95, 0.85, 0.9, 'runner', 210, 'finlets longfins'],
  ['skipjack_tuna', 'Skipjack Tuna', 'Katsuwonus pelamis', 'ocean', 'U', 'tuna', 0x2a3a6a, 0xeaeef4, 'stripes', 0x3a4a5a, 0x2a3a5a, 40, 100, 0.9, 0.5, 0.55, 'runner', 34, 'finlets'],
  ['atlantic_bonito', 'Atlantic Bonito', 'Sarda sarda', 'ocean', 'U', 'tuna', 0x3a5a7a, 0xeef0f2, 'tigerstripe', 0x1a2a3a, 0x3a4a5a, 40, 90, 0.9, 0.5, 0.5, 'zigzag', 32, 'finlets'],
  ['cobia', 'Cobia', 'Rachycentron canadum', 'ocean tropical', 'R', 'shark', 0x4a3a2a, 0xe8e0d0, 'stripes', 0xd8d0c0, 0x3a2a1a, 70, 200, 0.7, 0.85, 0.85, 'bulldog', 180, 'flathead'],
  ['blue_marlin', 'Atlantic Blue Marlin', 'Makaira nigricans', 'ocean', 'L', 'billfish', 0x1a2a6a, 0xf0f4f8, 'bars', 0x6aa0e0, 0x1a2a5a, 250, 450, 1.0, 1.0, 1.0, 'jumper', 4800, 'bill'],
  ['swordfish', 'Swordfish', 'Xiphias gladius', 'ocean deep', 'E', 'billfish', 0x3a3a4a, 0xd8d8e0, 'gradient', 0x6a5a6a, 0x2a2a3a, 180, 430, 0.9, 1.0, 0.95, 'diver', 820, 'sword'],
  ['sailfish', 'Indo-Pacific Sailfish', 'Istiophorus platypterus', 'ocean tropical', 'E', 'billfish', 0x1a3a7a, 0xf0f4f8, 'bars', 0x8ac0ff, 0x1a2a6a, 170, 330, 1.0, 0.8, 0.85, 'jumper', 700, 'bill sail'],
  ['shortfin_mako', 'Shortfin Mako Shark', 'Isurus oxyrinchus', 'ocean', 'E', 'shark', 0x2a4a8a, 0xf0f4f8, 'gradient', 0x6a7a9a, 0x2a3a6a, 180, 380, 1.0, 0.95, 0.9, 'jumper', 760, 'teeth'],
  ['blue_shark', 'Blue Shark', 'Prionace glauca', 'ocean', 'R', 'shark', 0x2a5ac0, 0xf4f6fa, 'gradient', 0x6a90e0, 0x2a4aa0, 180, 380, 0.75, 0.8, 0.8, 'runner', 190, 'longfins'],
  ['garfish', 'Garfish', 'Belone belone', 'ocean', 'C', 'gar', 0x2a6a5a, 0xf0f4f2, 'plain', 0x1a3a3a, 0x3a5a5a, 40, 90, 0.85, 0.25, 0.35, 'jumper', 10, 'snout'],
  ['spanish_mackerel', 'Spanish Mackerel', 'Scomberomorus maculatus', 'ocean', 'U', 'tuna', 0x4a6a8a, 0xf2f4f6, 'spots', 0xd8b040, 0x4a5a6a, 40, 90, 0.9, 0.45, 0.45, 'runner', 30, 'finlets teeth'],
  ['wahoo', 'Wahoo', 'Acanthocybium solandri', 'ocean tropical', 'R', 'pike', 0x2a4a7a, 0xe8eef4, 'bars', 0x3a6ab0, 0x2a3a5a, 100, 220, 1.0, 0.75, 0.75, 'runner', 205, 'finlets snout'],
  ['john_dory', 'John Dory', 'Zeus faber', 'ocean', 'U', 'disc', 0x9a8a6a, 0xd8ccb0, 'eyespot', 0x1a1a1a, 0x7a6a50, 25, 65, 0.3, 0.3, 0.35, 'sulker', 44, 'spines longdorsal'],
  ['thornback_ray', 'Thornback Ray', 'Raja clavata', 'ocean', 'U', 'ray', 0x8a7a5a, 0xf4f0e8, 'spots', 0x3a2a1a, 0x7a6a4a, 50, 105, 0.4, 0.6, 0.6, 'sulker', 38, 'thorns'],
  ['conger_eel', 'Conger Eel', 'Conger conger', 'ocean deep', 'U', 'eel', 0x4a4a4a, 0xc8c8c0, 'plain', 0x2a2a2a, 0x3a3a3a, 90, 260, 0.5, 0.75, 0.8, 'bulldog', 48, ''],

  // ---------------- DEEP SEA ----------------
  ['anglerfish', 'Humpback Anglerfish', 'Melanocetus johnsonii', 'deep', 'R', 'angler', 0x2a1a1a, 0x3a2a2a, 'plain', 0x1a0a0a, 0x2a1a1a, 10, 25, 0.25, 0.55, 0.7, 'sulker', 160, 'lure glow teeth'],
  ['black_dragonfish', 'Black Dragonfish', 'Idiacanthus atlanticus', 'deep', 'R', 'eel', 0x0a0a10, 0x1a1a22, 'photophores', 0x40c0ff, 0x0a0a10, 30, 55, 0.55, 0.35, 0.5, 'erratic', 150, 'glow teeth chinbarbel'],
  ['viperfish', 'Sloane\'s Viperfish', 'Chauliodus sloani', 'deep', 'R', 'eel', 0x1a2a3a, 0x2a3a4a, 'photophores', 0x60e0ff, 0x1a2a3a, 20, 35, 0.6, 0.35, 0.45, 'erratic', 145, 'glow teeth'],
  ['gulper_eel', 'Gulper Eel', 'Eurypharynx pelecanoides', 'deep', 'E', 'eel', 0x0a0a0a, 0x1a1a1a, 'plain', 0x0a0a0a, 0x1a1a1a, 60, 100, 0.45, 0.6, 0.75, 'erratic', 600, 'glow bigmouth'],
  ['giant_oarfish', 'Giant Oarfish', 'Regalecus glesne', 'deep ocean', 'L', 'ribbon', 0xd8dce4, 0xf0f2f6, 'spots', 0x5a6a8a, 0xe0302a, 400, 800, 0.55, 0.95, 1.0, 'sulker', 5000, 'crest'],
  ['coelacanth', 'Coelacanth', 'Latimeria chalumnae', 'deep', 'L', 'grouper', 0x2a3a6a, 0x4a5a8a, 'spots', 0xe0e8f0, 0x2a3a6a, 120, 200, 0.5, 0.95, 1.0, 'bulldog', 4500, 'lobefins'],
  ['giant_grenadier', 'Giant Grenadier', 'Albatrossia pectoralis', 'deep', 'U', 'eel', 0x6a5a5a, 0x8a7a7a, 'plain', 0x3a2a2a, 0x5a4a4a, 60, 150, 0.35, 0.55, 0.6, 'sulker', 40, 'bigeye rattail'],
  ['sablefish', 'Sablefish', 'Anoplopoma fimbria', 'deep', 'C', 'fusiform', 0x3a3a42, 0xb0b0b8, 'plain', 0x1a1a22, 0x2a2a32, 40, 110, 0.5, 0.5, 0.55, 'diver', 22, ''],
  ['orange_roughy', 'Orange Roughy', 'Hoplostethus atlanticus', 'deep', 'U', 'bass', 0xe0602a, 0xf0904a, 'plain', 0xa04020, 0xd05a2a, 30, 75, 0.35, 0.45, 0.55, 'sulker', 46, 'bigeye spines'],
  ['blobfish', 'Blobfish', 'Psychrolutes marcidus', 'deep', 'R', 'puffer', 0xe8b0b0, 0xf0c8c8, 'plain', 0xc89090, 0xe0a0a0, 20, 35, 0.15, 0.3, 0.5, 'sulker', 175, 'blob'],
  ['opah', 'Opah', 'Lampris guttatus', 'deep ocean', 'E', 'disc', 0x8a3a5a, 0xc87a8a, 'spots', 0xf0f0f0, 0xe0302a, 80, 200, 0.6, 0.85, 0.9, 'diver', 560, 'longfins'],
  ['greenland_shark', 'Greenland Shark', 'Somniosus microcephalus', 'deep', 'E', 'shark', 0x4a4a4a, 0x6a6a6a, 'mottled', 0x2a2a2a, 0x3a3a3a, 250, 640, 0.25, 1.0, 1.0, 'sulker', 900, ''],
  ['frilled_shark', 'Frilled Shark', 'Chlamydoselachus anguineus', 'deep', 'E', 'eel', 0x4a3a2a, 0x6a5a4a, 'plain', 0x2a1a0a, 0x3a2a1a, 100, 200, 0.5, 0.7, 0.8, 'erratic', 640, 'frills teeth'],
  ['lanternfish', 'Lanternfish', 'Myctophum punctatum', 'deep', 'C', 'fusiform', 0x2a3a4a, 0x8a9aaa, 'photophores', 0x60e0ff, 0x2a3a4a, 5, 12, 0.6, 0.1, 0.2, 'zigzag', 8, 'glow bigeye'],
  ['hatchetfish', 'Silver Hatchetfish', 'Argyropelecus aculeatus', 'deep', 'C', 'disc', 0xc0c8d8, 0xf0f4ff, 'photophores', 0x60c0ff, 0x8a96aa, 5, 10, 0.45, 0.1, 0.2, 'zigzag', 9, 'glow bigeye'],
  ['barreleye', 'Barreleye', 'Macropinna microstoma', 'deep', 'R', 'fusiform', 0x3a3a3a, 0x5a5a5a, 'plain', 0x1a1a1a, 0x2a2a2a, 10, 18, 0.3, 0.2, 0.35, 'sulker', 155, 'dome'],
  ['bluntnose_sixgill', 'Bluntnose Sixgill Shark', 'Hexanchus griseus', 'deep', 'R', 'shark', 0x4a4a44, 0x7a7a72, 'plain', 0x2a2a24, 0x3a3a34, 300, 480, 0.4, 1.0, 0.95, 'bulldog', 240, ''],
  ['atlantic_wolffish', 'Atlantic Wolffish', 'Anarhichas lupus', 'deep ocean', 'U', 'eel', 0x6a6a7a, 0xb0b0b8, 'bars', 0x2a2a3a, 0x5a5a6a, 60, 150, 0.4, 0.7, 0.65, 'bulldog', 44, 'teeth'],
  ['spotted_ratfish', 'Spotted Ratfish', 'Hydrolagus colliei', 'deep', 'U', 'shark', 0x8a7a8a, 0xc8c0d0, 'spots', 0xf0f0f0, 0x6a5a6a, 40, 95, 0.4, 0.35, 0.45, 'erratic', 42, 'bigeye rattail'],
  ['warsaw_grouper', 'Warsaw Grouper', 'Hyporthodus nigritus', 'deep', 'E', 'grouper', 0x3a2a2a, 0x6a5a5a, 'plain', 0x1a0a0a, 0x2a1a1a, 120, 230, 0.35, 1.0, 0.95, 'bulldog', 620, ''],
  ['fangtooth', 'Common Fangtooth', 'Anoplogaster cornuta', 'deep', 'U', 'angler', 0x3a2a2a, 0x4a3a3a, 'plain', 0x1a1010, 0x2a1a1a, 10, 18, 0.35, 0.3, 0.4, 'erratic', 50, 'teeth bigmouth'],
  ['abyssal_leviathan', 'Abyssal Leviathan', 'Profundus rex (undescribed)', 'deep', 'L', 'angler', 0x1a1030, 0x2a2050, 'photophores', 0xa060ff, 0x3a2060, 180, 320, 0.6, 1.0, 1.0, 'erratic', 5000, 'lure glow teeth'],

  // ---------------- TROPICAL ----------------
  ['clownfish', 'Ocellaris Clownfish', 'Amphiprion ocellaris', 'tropical', 'C', 'reef', 0xf06a1a, 0xf07a2a, 'bands', 0xffffff, 0xf06a1a, 6, 11, 0.45, 0.1, 0.25, 'zigzag', 12, 'blackedge'],
  ['blue_tang', 'Blue Tang', 'Paracanthurus hepatus', 'tropical', 'C', 'reef', 0x1a4ad8, 0x2a5ae0, 'tangmask', 0x0a0a2a, 0xf0d020, 15, 30, 0.6, 0.2, 0.3, 'zigzag', 14, ''],
  ['mandarinfish', 'Mandarinfish', 'Synchiropus splendidus', 'tropical', 'R', 'reef', 0x1a6ad0, 0x2a8ad0, 'psychedelic', 0xf08a1a, 0x1a4ab0, 5, 8, 0.4, 0.1, 0.3, 'erratic', 150, ''],
  ['lionfish', 'Red Lionfish', 'Pterois volitans', 'tropical', 'U', 'reef', 0xc04a2a, 0xf0e0d0, 'bars', 0xf8f0e8, 0xc06a4a, 20, 45, 0.3, 0.3, 0.4, 'sulker', 45, 'lionfins'],
  ['parrotfish', 'Stoplight Parrotfish', 'Sparisoma viride', 'tropical', 'C', 'bass', 0x2ab08a, 0x6ad0b0, 'scales', 0xe86aa0, 0x2a8ad0, 25, 60, 0.5, 0.45, 0.45, 'runner', 16, 'beak'],
  ['queen_angelfish', 'Queen Angelfish', 'Holacanthus ciliaris', 'tropical', 'U', 'disc', 0x2aa0d0, 0xe8d03a, 'gradient', 0xf0e020, 0xf0d020, 20, 45, 0.45, 0.25, 0.35, 'zigzag', 40, 'longfins crown'],
  ['moorish_idol', 'Moorish Idol', 'Zanclus cornutus', 'tropical', 'U', 'disc', 0xf0f0e8, 0xf0e8a0, 'bands', 0x0a0a0a, 0xf0d030, 15, 23, 0.45, 0.15, 0.3, 'zigzag', 42, 'pennant snout'],
  ['goliath_grouper', 'Atlantic Goliath Grouper', 'Epinephelus itajara', 'tropical ocean', 'E', 'grouper', 0x6a6040, 0xa89a70, 'mottled', 0x2a2410, 0x5a5030, 150, 250, 0.35, 1.0, 1.0, 'bulldog', 700, ''],
  ['red_snapper', 'Red Snapper', 'Lutjanus campechanus', 'tropical ocean', 'C', 'bass', 0xd84a3a, 0xf0b0a0, 'plain', 0xa83a2a, 0xd05040, 35, 100, 0.55, 0.55, 0.55, 'diver', 24, ''],
  ['mahi_mahi', 'Mahi-Mahi', 'Coryphaena hippurus', 'tropical ocean', 'R', 'fusiform', 0x2ab06a, 0xf0e030, 'spots', 0x1a6ad0, 0x2a8ad0, 70, 180, 0.95, 0.75, 0.75, 'jumper', 185, 'bluntface longdorsal'],
  ['giant_trevally', 'Giant Trevally', 'Caranx ignobilis', 'tropical', 'R', 'tuna', 0x7a8090, 0xd8dce4, 'plain', 0x3a3a4a, 0x2a2a3a, 70, 170, 0.85, 0.95, 0.85, 'bulldog', 195, 'bluntface'],
  ['great_barracuda', 'Great Barracuda', 'Sphyraena barracuda', 'tropical ocean', 'U', 'pike', 0x7a8a9a, 0xeef2f4, 'spots', 0x1a1a2a, 0x5a6a7a, 60, 170, 0.95, 0.6, 0.55, 'runner', 50, 'teeth'],
  ['napoleon_wrasse', 'Humphead Wrasse', 'Cheilinus undulatus', 'tropical', 'E', 'grouper', 0x2a8a8a, 0x5ab0a0, 'psychedelic', 0x1a4a6a, 0x2a7a8a, 90, 200, 0.4, 0.95, 0.9, 'bulldog', 650, 'hump'],
  ['picasso_triggerfish', 'Picasso Triggerfish', 'Rhinecanthus aculeatus', 'tropical', 'U', 'reef', 0xd8ccb0, 0xf0ece0, 'psychedelic', 0x1a3a8a, 0xd8ccb0, 15, 30, 0.4, 0.3, 0.4, 'bulldog', 38, 'spines'],
  ['pufferfish', 'Guineafowl Puffer', 'Arothron meleagris', 'tropical', 'C', 'puffer', 0x2a2a2a, 0x3a3a3a, 'spots', 0xf8f8f8, 0x2a2a2a, 15, 50, 0.25, 0.25, 0.4, 'sulker', 14, ''],
  ['silver_arowana', 'Silver Arowana', 'Osteoglossum bicirrhosum', 'tropical', 'R', 'pike', 0xc0c8d0, 0xf0f4f8, 'scales', 0x8a96a8, 0xa0a8b8, 60, 120, 0.75, 0.6, 0.65, 'jumper', 175, 'bigscales upturned chinbarbel'],
  ['arapaima', 'Arapaima', 'Arapaima gigas', 'tropical', 'L', 'pike', 0x5a6a4a, 0xd04a3a, 'scales', 0xd04a3a, 0xc03a2a, 200, 350, 0.6, 1.0, 1.0, 'bulldog', 4400, 'bigscales'],
  ['peacock_bass', 'Peacock Bass', 'Cichla ocellaris', 'tropical', 'U', 'bass', 0xa8b030, 0xf0d050, 'bars', 0x1a1a10, 0xe04a2a, 30, 75, 0.7, 0.65, 0.6, 'runner', 48, 'eyespot hump'],
  ['red_bellied_piranha', 'Red-bellied Piranha', 'Pygocentrus nattereri', 'tropical', 'C', 'disc', 0x8a96a4, 0xe0402a, 'spots', 0xc8ccd0, 0x5a5a6a, 15, 33, 0.65, 0.3, 0.3, 'erratic', 15, 'teeth'],
  ['discus', 'Discus', 'Symphysodon aequifasciatus', 'tropical', 'U', 'disc', 0x8a4a2a, 0xd07a3a, 'psychedelic', 0x2a8ad0, 0x8a4a2a, 12, 20, 0.35, 0.15, 0.3, 'zigzag', 36, ''],
  ['emperor_angelfish', 'Emperor Angelfish', 'Pomacanthus imperator', 'tropical', 'R', 'disc', 0x1a3a9a, 0xf0d020, 'stripes', 0xf0e030, 0xf0d020, 25, 40, 0.45, 0.3, 0.4, 'zigzag', 140, 'mask'],
  ['golden_dorado', 'Golden Dorado', 'Salminus brasiliensis', 'tropical river', 'R', 'fusiform', 0xe0b030, 0xf0d070, 'stripes', 0x6a4a10, 0xe04a2a, 60, 100, 0.9, 0.8, 0.75, 'jumper', 190, 'teeth'],
  ['spotted_eagle_ray', 'Spotted Eagle Ray', 'Aetobatus narinari', 'tropical ocean', 'R', 'ray', 0x1a2a4a, 0xf4f4f4, 'spots', 0xf4f4f4, 0x1a2a4a, 100, 300, 0.7, 0.85, 0.85, 'runner', 200, 'longtail'],
  ['green_moray', 'Green Moray', 'Gymnothorax funebris', 'tropical', 'U', 'eel', 0x4a7a2a, 0x6a8a3a, 'plain', 0x2a4a1a, 0x4a7a2a, 80, 250, 0.45, 0.75, 0.7, 'bulldog', 46, 'teeth'],
  ['rainbow_runner', 'Rainbow Runner', 'Elagatis bipinnulata', 'tropical ocean', 'U', 'tuna', 0x2a6ab0, 0xe8f0e8, 'stripes', 0xf0e040, 0x3a7ab0, 50, 120, 0.9, 0.55, 0.55, 'runner', 42, ''],
  ['yellow_tang', 'Yellow Tang', 'Zebrasoma flavescens', 'tropical', 'C', 'reef', 0xf8e030, 0xf8e850, 'plain', 0xe8d020, 0xf8e030, 12, 20, 0.5, 0.15, 0.25, 'zigzag', 11, 'snout'],
  ['bluefin_trevally', 'Bluefin Trevally', 'Caranx melampygus', 'tropical', 'U', 'tuna', 0x8aa0c0, 0xe8ecf4, 'spots', 0x2a4a8a, 0x3a8ae0, 40, 100, 0.85, 0.6, 0.6, 'zigzag', 44, ''],
  ['coral_trout', 'Coral Trout', 'Plectropomus leopardus', 'tropical', 'U', 'grouper', 0xd8402a, 0xe86a4a, 'spots', 0x40b0ff, 0xc03a2a, 35, 80, 0.55, 0.6, 0.55, 'diver', 48, ''],
  ['bigeye_trevally', 'Bigeye Trevally', 'Caranx sexfasciatus', 'tropical', 'C', 'tuna', 0x8a9aa8, 0xeaeef2, 'plain', 0x4a5a6a, 0x5a6a7a, 30, 85, 0.75, 0.45, 0.45, 'zigzag', 18, 'bigeye'],
  ['tiger_shark', 'Tiger Shark', 'Galeocerdo cuvier', 'tropical ocean', 'E', 'shark', 0x6a6a5a, 0xe8e8e0, 'bars', 0x3a3a2a, 0x5a5a4a, 250, 450, 0.7, 1.0, 0.95, 'bulldog', 740, 'teeth'],
  ['dragon_koi_lagoon', 'Celestial Dragonet', 'Callionymus caelestis (undescribed)', 'tropical', 'L', 'reef', 0x3a1ad8, 0xf04ab0, 'psychedelic', 0x40ffe0, 0xf0d020, 40, 70, 0.9, 0.9, 1.0, 'erratic', 3800, 'longfins glow crown'],
];

export const SPECIES = RAW.map((r, index) => {
  const [id, name, sci, worlds, rarity, shape, body, belly, pattern, patternColor, fin, lenMin, lenMax, speed, power, stamina, behavior, value, flags] = r;
  const avgLen = (lenMin + lenMax) / 2;
  const K = SHAPES[shape].K;
  return {
    index,
    id, name, sci,
    worlds: worlds.split(' '),
    rarity, shape, behavior,
    colors: { body, belly, pattern: patternColor, fin },
    pattern,
    lenMin, lenMax,
    speed, power, stamina,
    baseValue: value,
    flags: flags ? flags.split(' ') : [],
    avgWeight: (K * avgLen * avgLen * avgLen) / 100000,
  };
});

export const SPECIES_BY_ID = Object.fromEntries(SPECIES.map((s) => [s.id, s]));

/** Weight in kg for a given length (cm). */
export function weightForLength(species, lengthCm) {
  const K = SHAPES[species.shape].K;
  return (K * lengthCm * lengthCm * lengthCm) / 100000;
}

/** 0..1 difficulty used by fight tolerance and AI. */
export function speciesDifficulty(species, weightKg) {
  const RAR = { C: 0, U: 0.08, R: 0.16, E: 0.26, L: 0.38 };
  const sizeFactor = Math.min(1, Math.log10(1 + weightKg / Math.max(0.05, species.avgWeight)) / Math.log10(4));
  return Math.min(1, 0.15 + (species.speed + species.power + species.stamina) / 3 * 0.45 + RAR[species.rarity] + sizeFactor * 0.1);
}
