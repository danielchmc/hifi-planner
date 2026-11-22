/* HiFi Planner taxonomy rules: how the website's product types become HiFi Planner's catalogue structure.
   The only hand-edited part of the catalogue build (tools/catalog-build.js). The website's own data in mirror/ is never changed;
   these rules are applied on top of it every time the catalogue is built.

   The backbone is the website's category tree (from the product pages' breadcrumbs), identified by URL path, e.g.
   "/tv/projektor/". Every website product type has a stable English key (modelTypeKey, e.g. "VideoProjector").

   TYPES: what each type key is for HiFi Planner
     kind     what the product is: speaker, subwoofer, amplifier, source, converter, display, projector, headphones,
              cable, connector, mounting, power, module, accessory, furniture, media, other, bundle
     scope    diagram   = system gear with inputs/outputs, drawn as cards and wired
              pricelist = goes on proposals and price lists, no ports (mounts, plugs, grilles, furniture…)
              skip      = not offered in HiFi Planner (gift cards, records, ear tips…)
              A kind gives the default scope (KIND_SCOPE); a type can set its own.
     facets   facts the type label implies: active (true/false), wireless, battery, mount
              (floor/stand/wall/inwall/ceiling/outdoor), role (center, soundbar, pre, power, avr, compact, phono, headphone…),
              conn (cable connector, as in js/ports.js)
     cat      move the type to another category (a correction of the website's filing). The category may be one of
              ours (CATEGORIES below).

   A type key that is missing here is reported by the build as "unknown type" and gets kind "other". */

const KIND_SCOPE = {
  speaker: 'diagram', subwoofer: 'diagram', amplifier: 'diagram', source: 'diagram', converter: 'diagram', display: 'diagram',
  projector: 'diagram', headphones: 'diagram', module: 'pricelist', cable: 'pricelist', connector: 'pricelist', mounting: 'pricelist',
  power: 'pricelist', accessory: 'pricelist', furniture: 'pricelist', media: 'skip', other: 'skip', bundle: 'skip',
};

// categories HiFi Planner adds to the website's tree (used by the corrections below)
const CATEGORIES = [
  { id: '/hojtalere/vaeghojtaler/', title: 'Væghøjtaler', en: 'On-wall speakers', parent: '/hojtalere/' },
  { id: '/pladespiller/pladespillere/', title: 'Pladespillere', en: 'Turntables', parent: '/pladespiller/' },
  { id: '/tilbehor/opgraderinger/', title: 'Moduler & opgraderinger', en: 'Modules & upgrades', parent: '/tilbehor/' },
  { id: '/tilbehor/pladsholdere/', title: 'Pladsholdere', en: 'Stand-ins', parent: '/tilbehor/' }, // HiFi Planner's generic devices (any TV, any amplifier…)
];

// order of the sections in the app (the website's order is not in its data); categories within a section follow product count
const SECTION_ORDER = ['/hojtalere/', '/stereo/', '/surround/', '/tv/', '/pladespiller/', '/horetelefoner/', '/kabler/', '/tilbehor/'];
// English names for the website's sections and categories (the website's own names are Danish)
const EN = {
  '/hojtalere/': 'Speakers', '/stereo/': 'HiFi', '/surround/': 'Surround', '/tv/': 'TV', '/pladespiller/': 'Turntables', '/horetelefoner/': 'Headphones', '/kabler/': 'Cables', '/tilbehor/': 'Accessories',
  '/hojtalere/gulvhojtaler/': 'Floorstanding', '/hojtalere/kompakt-hojtaler/': 'Compact', '/hojtalere/centerhojtaler/': 'Center', '/hojtalere/subwoofer/': 'Subwoofers',
  '/hojtalere/bluetooth-tradlos-hojtaler/': 'Wireless / Bluetooth', '/hojtalere/indbygning-udendors-hojtaler/': 'In-wall, in-ceiling & outdoor', '/hojtalere/systemer/': 'Speaker systems',
  '/stereo/forstarker/': 'Amplifiers', '/stereo/musikstreamer/': 'Streamers', '/stereo/cd-afspiller/': 'CD players', '/stereo/mini-anlag/': 'Compact systems', '/stereo/da-konverter/': 'DACs',
  '/stereo/dab-radio-fm-internet/': 'Radios', '/stereo/systemer/': 'Stereo systems', '/surround/surround-receiver/': 'AV receivers', '/surround/surround-processor/': 'AV processors',
  '/surround/blu-ray-afspiller/': 'Blu-ray players', '/surround/hjemmebio-system/': 'Home cinema systems', '/tv/tv/': 'TVs', '/tv/tv/oled/': 'OLED', '/tv/tv/qled/': 'QLED', '/tv/projektor/': 'Projectors',
  '/tv/soundbar-hojtaler-tv-lyd/': 'Soundbars / TV audio', '/pladespiller/riaa-forstaerker/': 'Phono stages', '/pladespiller/pickupper-erstatningsnale/': 'Cartridges & styli',
  '/pladespiller/tilbehoer/': 'Turntable accessories', '/pladespiller/vedligeholdelse/': 'Vinyl care', '/pladespiller/pladespiller-system/': 'Turntable systems',
  '/horetelefoner/on-ear-over-ear/': 'On-ear / over-ear', '/horetelefoner/in-ear/': 'In-ear', '/horetelefoner/head-fi/': 'Head-Fi', '/horetelefoner/horetelefon-forstarker/': 'Headphone amplifiers',
  '/horetelefoner/horetelefon-tilbehor/': 'Headphone accessories', '/horetelefoner/gaming-headset/': 'Gaming headsets', '/kabler/hojtaler-kabel/': 'Speaker cable', '/kabler/signal-kabel/': 'Interconnects',
  '/kabler/digital-kabel/': 'Digital cables', '/kabler/hdmi-kabel/': 'HDMI cables', '/kabler/minijack-kabel/': 'Minijack cables', '/kabler/subwoofer-kabel/': 'Subwoofer cables',
  '/kabler/hojtaler-stik/': 'Speaker plugs', '/kabler/strom-kabler/': 'Power', '/kabler/antenne-kabel-stik/': 'Antenna', '/kabler/diverse-kabel-stik-adapter/': 'Other cables & adapters',
  '/tilbehor/hojtaler-tilbehor/': 'Speaker accessories', '/tilbehor/tv-tilbehor/': 'TV accessories', '/tilbehor/mobler/': 'Furniture', '/tilbehor/mobel-tilbehor/': 'Furniture accessories',
  '/tilbehor/sonos-tilbehor/': 'Sonos accessories', '/tilbehor/fjernbetjening/': 'Remote controls', '/tilbehor/andet-tilbehor/': 'Other accessories',
};

const T = (kind, facets, extra) => Object.assign({ kind, facets: facets || {} }, extra || {});
const TYPES = {
  // speakers
  FloorStandingLoudspeaker: T('speaker', { active: false, mount: 'floor' }),
  FloorstandingSpeakerActive: T('speaker', { active: true, mount: 'floor' }),
  CompactLoudSpeaker: T('speaker', { active: false, mount: 'stand' }),
  CompactSpeakerActive: T('speaker', { active: true, mount: 'stand' }),
  Onwallloudspeaker: T('speaker', { active: false, mount: 'wall' }, { cat: '/hojtalere/vaeghojtaler/' }), // website: under Kompakt højtaler
  Center: T('speaker', { active: false, role: 'center' }),
  InCeilingLoudspeaker: T('speaker', { active: false, mount: 'ceiling' }),
  InWallLoudspeakers: T('speaker', { active: false, mount: 'inwall' }),
  OutdoorLoudspeaker: T('speaker', { mount: 'outdoor' }),
  WirelessLoudspeaker: T('speaker', { active: true, wireless: true }),
  WirelessLoudspeakerWithBattery: T('speaker', { active: true, wireless: true, battery: true }),
  Soundbar: T('speaker', { active: true, role: 'soundbar' }),
  Subwoofer: T('subwoofer', { active: true }),
  PassiveSubwoofer: T('subwoofer', { active: false }),
  WirelessSubwoofer: T('subwoofer', { active: true, wireless: true }),
  // amplifiers
  IntegratedAmplifier: T('amplifier', { role: 'integrated' }),
  Stereoamplifierwithstreaming: T('amplifier', { role: 'integrated', streaming: true }),
  PreAmplifier: T('amplifier', { role: 'pre' }),
  Wirelesspreamp: T('amplifier', { role: 'pre', wireless: true }),
  PowerAmplifier: T('amplifier', { role: 'power' }),
  PowerAmplifierInstallation: T('amplifier', { role: 'power', ci: true }),
  MultiChannelPowerAmplifier: T('amplifier', { role: 'power', multichannel: true }),
  MultiRoomAmplifier: T('amplifier', { role: 'multiroom', streaming: true }),
  Receiver: T('amplifier', { role: 'receiver' }),
  HomeCinemaReceiver: T('amplifier', { role: 'avr', multichannel: true }),
  HomeCinemaPreAmplifier: T('amplifier', { role: 'avpre', multichannel: true }),
  Musicsystem: T('amplifier', { role: 'compact' }),
  Musicsystemwithstreaming: T('amplifier', { role: 'compact', streaming: true }),
  HeadphoneAmplifier: T('amplifier', { role: 'headphone' }),
  RiaaAmplifier: T('amplifier', { role: 'phono' }),
  // sources and converters
  MusicStreamer: T('source', { role: 'streamer', streaming: true }),
  MusicStreamerAndRadio: T('source', { role: 'streamer', streaming: true }),
  BluetoothReceiver: T('source', { role: 'bluetooth', wireless: true }),
  Wirelessadaptor: T('source', { role: 'wireless', wireless: true }, { cat: '/stereo/musikstreamer/' }), // website: under Diverse kabler
  CDPlayer: T('source', { role: 'cd' }),
  Turntable: T('source', { role: 'turntable' }, { cat: '/pladespiller/pladespillere/' }), // website: on the section itself
  Radio: T('source', { role: 'radio' }),
  BluRayPlayer: T('source', { role: 'bluray' }),
  DAConverter: T('converter', { role: 'dac' }),
  // screens
  OLEDTV: T('display', { tech: 'OLED' }), QDOLED: T('display', { tech: 'QD-OLED' }), QLEDTV: T('display', { tech: 'QLED' }),
  NeoQLED: T('display', { tech: 'Neo QLED' }), MiniLED: T('display', { tech: 'Mini LED' }), LEDTV: T('display', { tech: 'LED' }),
  TrueRGB: T('display', { tech: 'True RGB' }), MicroRGB: T('display', { tech: 'Micro RGB' }),
  VideoProjector: T('projector'),
  // headphones
  Headfi: T('headphones', { wired: true }), HeadfiInEar: T('headphones', { wired: true, inear: true }), Headphone: T('headphones'),
  Wirelessheadset: T('headphones', { wireless: true }), WirelessInEarHeadphone: T('headphones', { wireless: true, inear: true }),
  ActiveInEarHeadphone: T('headphones', { inear: true }), GamingHeadset: T('headphones', { role: 'gaming' }),
  // cables (conn as in js/ports.js); the website says itself when a cable is sold by the metre (variant kind "metre")
  LoudSpeakerCable: T('cable', { conn: 'speaker' }), SignalCable: T('cable', { conn: 'rca' }), HDMIcable: T('cable', { conn: 'hdmi' }),
  Opticalcabel: T('cable', { conn: 'optical' }), CoaxialCabel: T('cable', { conn: 'coax' }), DigitalCable: T('cable', { conn: 'coax' }),
  MiniJackCable: T('cable', { conn: 'minijack' }), SubwooferCable: T('cable', { conn: 'sub' }), USBCabel: T('cable', { conn: 'usb' }),
  Networkcabel: T('cable', { conn: 'ethernet' }), AesEbuCabel: T('cable', { conn: 'xlr' }), YSplitYAdapter: T('cable', { conn: 'rca' }),
  AntennaCable: T('cable', { conn: 'antenna' }), PowerCable: T('cable', { conn: 'power' }, { cat: '/kabler/strom-kabler/' }), // website: on Kabler itself
  Cable: T('cable', {}, { cat: '/kabler/diverse-kabel-stik-adapter/' }), // website: on Kabler itself
  // plugs and adapters
  BananaPlug: T('connector'), Spade: T('connector'), Plug: T('connector'), AntennaPlug: T('connector'), Adapter: T('connector'),
  SwitchBox: T('connector', {}, { cat: '/kabler/diverse-kabel-stik-adapter/' }), // website: on Tilbehør itself
  // power
  Powerfilter: T('power'), PowerSupply: T('power'), NoiseFilter: T('power', {}, { cat: '/kabler/strom-kabler/' }), Battery: T('power'),
  // modules, upgrades, room correction
  MDCModule: T('module', {}, { cat: '/tilbehor/opgraderinger/' }), Upgrade: T('module', {}, { cat: '/tilbehor/opgraderinger/' }),
  License: T('module', { role: 'roomcorrection' }, { cat: '/tilbehor/opgraderinger/' }),
  Microphone: T('module', { role: 'roomcorrection' }, { cat: '/tilbehor/opgraderinger/' }), // calibration microphones (Dirac)
  // mounting
  LoudspeakerStand: T('mounting', { mount: 'floor' }), TableStand: T('mounting', { mount: 'table' }), WallMountForLoudspeakers: T('mounting', { mount: 'wall' }),
  WallBracketForSonos: T('mounting', { mount: 'wall' }), WallBracket: T('mounting', { mount: 'wall' }, { cat: '/tilbehor/andet-tilbehor/' }),
  CeilingMount: T('mounting', { mount: 'ceiling' }), TvBracket: T('mounting', { mount: 'wall' }), AdjustableWallmount: T('mounting', { mount: 'wall' }),
  FloorStand: T('mounting', { mount: 'floor' }), MountingBracket: T('mounting'), Backbox: T('mounting', { mount: 'ceiling', ci: true }),
  InstallationFramePreMountKit: T('mounting', { ci: true }),
  // accessories
  FrontGrill: T('accessory'), Cover: T('accessory'), DampingFeet: T('accessory'), Spikes: T('accessory'), LoudSpeakersAccessories: T('accessory'),
  RemoteControl: T('accessory'), Rack: T('accessory'), 'TV-frame': T('accessory'), Other: T('accessory'),
  CableCovering: T('accessory', {}, { cat: '/tilbehor/andet-tilbehor/' }), // website: on Tilbehør itself
  MCpickup: T('accessory', { role: 'cartridge' }), MMpickup: T('accessory', { role: 'cartridge' }), DJpickup: T('accessory', { role: 'cartridge' }),
  ReplacementStylus: T('accessory', { role: 'stylus' }), TurntableAccessories: T('accessory'),
  // accessories the website sells with products (vinyl care with turntables, cases with headphones, port plugs with speakers): on the
  // price list, so "Gør tilbuddet færdigt" can offer them (they were 'skip' until 2026-11-22)
  TurntableMaintenance: T('accessory', {}, { scope: 'pricelist' }), HeadphoneAccessories: T('accessory', {}, { scope: 'pricelist' }), FoamBungs: T('accessory', {}, { scope: 'pricelist' }),
  // furniture
  Furniture: T('furniture'), FurnitureAccessories: T('furniture'), Fabricdoor: T('furniture'), Woodendoor: T('furniture'), Drawer: T('furniture'),
  Foot: T('furniture'), Shelf: T('furniture'), TopCover: T('furniture'),
  // records, gift cards
  CD: T('media', {}, { cat: '/tilbehor/andet-tilbehor/' }), LPdisc: T('media'), Giftcard: T('other', {}, { cat: '/tilbehor/andet-tilbehor/' }),
  // packages: become parts lists, not products
  TVStereo: T('bundle'), StereoSystem: T('bundle'), LoudSpeakerSystem: T('bundle'), InstallationSystem: T('bundle'), HomeCinemaSystem: T('bundle'),
  TurntableSystem: T('bundle'), SoundbarSystem: T('bundle'), Speakerswithaccessories: T('bundle'), HiFiFurniture: T('bundle'), FurnitureSystem: T('bundle'),
};

module.exports = { KIND_SCOPE, CATEGORIES, TYPES, SECTION_ORDER, EN };
