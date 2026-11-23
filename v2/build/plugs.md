# Plugs: male/female and mono/stereo

Written by `tools/catalog-build.js`. Rules in `js/ports.js` (`plug`, `cablePlugs`, `plugIssues`) and `tools/cable-ends.js` (`derivePlugs`). Set anything wrong by hand in the Editor: a cable's ends (M/F, mono/stereo) or a port's plug.

## Cables

59 from the website's cable type, 29 from the name, 5 guessed (stereo, male–male), 9 set by hand

### Cables that could not be decided (5)

- Essentials Wireless Audio Adapter (ESSWIRCONNECTBK): RCA ×2 M ↔ Minijack 3.5 mm stereo M — website type: Trådløs adapter
- Essentials Classic Minijack1 2m (ESSCL1MJ200): Minijack 3.5 mm stereo M ↔ Minijack 3.5 mm stereo M — website type: none
- Essentials Basic Minijack1 2m (essentials-basic-minijack1-2m): Minijack 3.5 mm stereo M ↔ Minijack 3.5 mm stereo M — website type: none
- Essentials Basic Minijack1 1m (essentials-basic-minijack1-1m): Minijack 3.5 mm stereo M ↔ Minijack 3.5 mm stereo M — website type: none
- Essentials Basic Minijack1 0.5m (essentials-basic-minijack1-0-5m): Minijack 3.5 mm stereo M ↔ Minijack 3.5 mm stereo M — website type: none

## Device ports

Sockets on devices are female (XLR outputs male); a port is stereo unless it carries a mono signal (sub, coaxial, digital, video, trigger, AES, mic) or its label names one channel (L, R, LFE, MONO).

### Ports decided on weak grounds (22)

Their signal does not say whether they are mono or stereo (a minijack that could be a headphone output or a trigger, a port marked "other").

- Vestlyd M6C Active (vestlyd-m6c-active): IN JACK IN TRS → Jack 6.35 mm stereo F (signal "jack")
- Vestlyd M8C Active (vestlyd-m8c-active): IN JACK IN TRS → Jack 6.35 mm stereo F (signal "jack")
- Bluesound Node N132 (bluesound-node-n132): OUT JACK OUT → Jack 6.35 mm stereo F (signal "jack")
- Denon Home 150 (denon-home-150): IN MINIJACK IN → Minijack 3.5 mm stereo F (signal "minijack")
- Sennheiser HDV 820 (sennheiser-hdv-820): OUT MINIJACK OUT → Minijack 3.5 mm stereo F (signal "minijack")
- Sennheiser HDV 820 (sennheiser-hdv-820): OUT MINIJACK OUT → Minijack 3.5 mm stereo F (signal "minijack")
- Soundboks Soundboks 4 (USB-C) (soundboks-soundboks-4-usb-c): IN JACK IN → Jack 6.35 mm stereo F (signal "jack")
- Soundboks Soundboks 4 (USB-C) (soundboks-soundboks-4-usb-c): OUT JACK OUT → Jack 6.35 mm stereo F (signal "jack")
- Sonos Five (sonos-five): IN MINIJACK IN → Minijack 3.5 mm stereo F (signal "minijack")
- Marshall Bromley 750 (marshall-bromley-750): OUT MINIJACK OUT → Minijack 3.5 mm stereo F (signal "minijack")
- Marshall Bromley 450 (marshall-bromley-450): IN INPUT 1 TRS IN → Jack 6.35 mm stereo F (signal "jack")
- Marshall Bromley 450 (marshall-bromley-450): IN INPUT 2 TRS IN → Jack 6.35 mm stereo F (signal "jack")
- Marshall Bromley 450 (marshall-bromley-450): OUT AUX OUT → Minijack 3.5 mm stereo F (signal "minijack")
- Hisense PT1 (hisense-pt1): OUT MINIJACK OUT → Minijack 3.5 mm stereo F (signal "minijack")
- AudioQuest DragonFly Copper (audioquest-dragonfly-copper): OUT MINIJACK OUT → Minijack 3.5 mm stereo F (signal "minijack")
- Hisense C3 (hisense-c3): OUT MINIJACK OUT → Minijack 3.5 mm stereo F (signal "minijack")
- Marshall Bromley 150 (marshall-bromley-150): OUT MINIJACK OUT → Minijack 3.5 mm stereo F (signal "minijack")
- Hisense C2 Ultra (hisense-c2-ultra): OUT MINIJACK OUT → Minijack 3.5 mm stereo F (signal "minijack")
- Hisense C3 Ultra Max (hisense-c3-ultra-max): OUT MINIJACK OUT → Minijack 3.5 mm stereo F (signal "minijack")
- Hisense C3 Ultra (hisense-c3-ultra): OUT MINIJACK OUT → Minijack 3.5 mm stereo F (signal "minijack")
- Hisense C3 Pro (hisense-c3-pro): OUT MINIJACK OUT → Minijack 3.5 mm stereo F (signal "minijack")
- Hisense C2 Pro (hisense-c2-pro): OUT MINIJACK OUT → Minijack 3.5 mm stereo F (signal "minijack")

### Adapters and wireless boxes (8 ports)

These often have a fixed cable ending in plugs (male) rather than sockets. The rules cannot see that: check them.

- Bluesound HUB (CB130) (bluesound-hub-cb130): IN COAXIAL IN → RCA ×1 F
- Bluesound HUB (CB130) (bluesound-hub-cb130): IN LINE IN → RCA ×2 F
- Bluesound HUB (CB130) (bluesound-hub-cb130): IN PHONO IN MM → RCA ×2 F
- Essentials BT2 Connect (essentials-bt2-connect): OUT LINE OUT → RCA ×2 F
- Essentials BT1 Connect (essentials-bt1-connect): OUT LINE OUT → RCA ×2 F
- Essentials BT3 Connect (essentials-bt3-connect): IN LINE IN → RCA ×2 F
- Essentials BT3 Connect (essentials-bt3-connect): OUT LINE OUT → RCA ×2 F
- KEF KW1 (kef-kw1): IN LINE IN → RCA ×2 F
