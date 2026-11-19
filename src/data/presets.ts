export interface ScriptPreset {
  id: string;
  title: string;
  topology: string;
  summary: string;
  content: string;
}

export const SCRIPT_PRESETS: ScriptPreset[] = [
  {
    id: 'interrogation-coverage',
    title: 'Interrogation Room Coverage',
    topology: 'Multi-Cam Coverage',
    summary: 'Three-subject neo-noir dialogue coverage with [BLOCK], (O.S.) dialogue, and [CAM 01] recall.',
    content: `[INTENT]
Create a tense neo-noir thriller scene set in a dim concrete interrogation room, featuring detectives Miller and Park pressing a defiant suspect named Ray across a steel table.

[LOGIC]
Keep the table as the axis, with Miller and Park on one side facing screen-right and Ray opposite facing screen-left. Preserve the lit cigarette in Ray's right hand and the manila folder under Miller's left palm until someone moves them. No subtitles appear on screen.

[AESTHETIC]
Medium: 35mm film, 2.39:1 anamorphic, muted charcoal and amber tungsten
Lighting: single amber overhead downlight, deep falloff into the corners
Location: concrete interrogation room, scuffed linoleum floor, steel table bolted down, one-way mirror
Wardrobe: Miller in a rumpled beige trench coat; Park in a grey suit with a loosened tie; Ray in an orange mechanic's jumpsuit with cuffed wrists
Audio: fluorescent ballast hum, muffled hallway footsteps

[OPENING]
MS at eye level, framed over Miller's shoulder toward Ray seated across the steel table. Frame-left foreground, Miller sits facing screen-right with his left palm pressed on a manila folder. Frame-left background, Park stands against the wall facing screen-right, arms folded. Frame-right midground, Ray slouches facing screen-left in the amber downlight, a lit cigarette pinched in his cuffed right hand.

[EXECUTION]
[CAM 01] MS, OTS Miller -> [BLOCK] Miller frame-left FG facing screen-right; Park frame-left BG facing screen-right; Ray frame-right MG facing screen-left -> [ACT] Miller slides the manila folder across the steel with his left palm while smoke curls from the cigarette in Ray's right hand -> Miller says {Look at the dates, Ray.} -> [ACT] Park shifts his weight against the wall, arms still folded
[CAM 02] CU on Ray -> [ACT] Ray tilts his head back facing screen-left and exhales smoke through narrowed eyes, cuffed wrists resting on the table, cigarette pinched in his right hand -> Ray says (unhurried) {Dates don't mean a thing.} -> Miller says (O.S., flat) {They mean twenty years.} -> [ACT] Ray taps ash onto the steel with his right hand
[CAM 01] -> [ACT] Miller leans forward and plants both palms flat on the folder -> [ACT] Park, in the background, uncrosses his arms and takes one step toward the table -> <steel table groaning under Miller's weight>`,
  },
  {
    id: 'subway-train-oner',
    title: 'Subway Train Fight Oner',
    topology: 'Continuous Moving Oner',
    summary: 'High-tempo 5-beat combat oner with @image bindings, operator transitions, and centrifugal physics.',
    content: `[INTENT]
Create a gritty 35mm neo-noir action scene captured as an unbroken tracking oner inside a violently swaying subterranean express train, featuring @image1 as Mark and @image2 as Robert locked in a lethal hand-to-hand struggle.

[LOGIC]
Maintain continuous Steadicam persistence down the narrow center aisle without cuts, anchoring combat exchanges to the centrifugal sway of the carriage. Preserve a strict 180-degree axis with Mark frame-left facing screen-right and Robert frame-right facing screen-left until the overhead pivot. Track hand allocations strictly, clamping Mark's left hand to the overhead grab rail during the swing.

[AESTHETIC]
Medium: 35mm anamorphic film, fine halide grain, optical barrel distortion, shallow focal plane
Palette: desaturated industrial teal, tungsten amber bleed, bruised shadow tones, oxidized steel
Lighting: flickering overhead fluorescent tubes interspersed with rhythmic orange tunnel beacons through scratched windows
Location: narrow center aisle of an R46 commuter railcar, ribbed aluminum siding, overhead stainless steel grab bars, polycarbonate rear partition doors
Wardrobe: Mark in a sweat-damped cream waffle-knit henley, charcoal ripstop trousers, scuffed tactical boots; Robert in a matte-black ballistic armor carrier over a slate-gray combat shirt, hard-knuckle gloves, black cargo trousers
Audio: low-frequency railway chassis roar, metallic wheel flange squeal on curved rails, rattling ceiling panels

[OPENING]
Waist-level two-shot framed down the narrow center aisle between aluminum stanchions. Frame-left, Mark crouches in a low defensive stance facing screen-right, his bruised right forearm clamped upward against Robert's heavy left forearm. Frame-right, Robert looms in a squared clinch facing screen-left, gloved right fist cocked at his ribs under buzzing fluorescent tubes.

[EXECUTION]
[CAM 01] Waist-level MS, tracking backward down the aisle -> [ACT] Mark deflects Robert's descending hammerfist with his right forearm -> <sharp bone-on-forearm crack> -> [ACT] Robert pivots on his right heel and drives a horizontal elbow toward Mark's temple while Mark ducks inward, jamming the elbow joint with his open left palm -> <heavy fabric scuff>
[CAM 01] TRACKING BACKWARD IN RHYTHMIC SWAY -> [ACT] Robert drives a double palm-heel strike into Mark's sternum, forcing him two steps back -> [ACT] Mark absorbs the impact through his heels and counters with a right uppercut into Robert's armored solar plexus -> <hollow thud on ballistic plate> -> [ACT] Robert winces, boots skidding on the ridged rubber floor
[CAM 01] TILTING TO A DUTCH ANGLE AS THE CARRIAGE BANKS RIGHT -> <piercing wheel flange screech on curved track> -> [ACT] Centrifugal pull hurls both fighters against the frame-left seats, breaking their clinch -> [ACT] Robert catches a stanchion with his left hand and lunges forward with a looping right cross
[CAM 01] CRANING DOWN AND ARCING TO FLANK MARK -> [ACT] Mark reaches upward and clamps his bare left hand onto the overhead steel grab rail -> <ringing slap on steel tubing> -> [ACT] Mark hoists his weight on his left arm, tucks under Robert's overextended punch, and hooks his right arm behind Robert's vest strap -> <strained steel creak>
[CAM 01] PUSHING HARD FORWARD TOWARD THE REAR DOORS -> [ACT] Mark releases the rail with his left hand, twists his hips, and hurls Robert backward down the vestibule -> [ACT] Robert crashes spine-first into the polycarbonate partition doors -> <explosive crystalline spiderweb crack> -> [ACT] Robert slumps against the fractured glass as Mark plants both boots in the aisle, chest heaving`,
  },
  {
    id: 'forest-pov-horror',
    title: 'POV Forest Horror',
    topology: 'POV Handheld Oner',
    summary: 'Unbroken 1980s found-footage POV with dual flashlight hand-tracking and off-screen foley trigger.',
    content: `[INTENT]
Create a 1980s found-footage horror scene set at night in a fog-bound forest beside a black lake, featuring investigators Arthur and Rosa as they confront a towering creature half-hidden among the trunks.

[LOGIC]
Maintain continuous first-person POV without cuts and a stable woodland geography. Keep Arthur's flashlight in his right hand and Rosa's in her left, with beams falling off over distance and casting hard shadows. No subtitles appear on screen.

[AESTHETIC]
Medium: 1980s camcorder video, magnetic tape tracking noise, soft grain
Palette: pitch black, damp pine green, cold moonlight silver, tungsten yellow
Lighting: narrow flashlight beams, cold moonlight through the canopy
Location: mist-choked evergreen forest, damp pine needles, black lake shore
Wardrobe: Arthur in a dark denim jacket; Rosa in a navy flannel shirt
Audio: wind in the canopy, distant water lapping

[OPENING]
POV handheld MS at eye level, looking through damp boughs toward a black lake shore. Frame-right, Arthur stands in profile-left with a flashlight in his right hand, its beam fixed on swirling fog. Frame-left, Rosa stands with a second flashlight in her left hand, her gaze turned back toward the trees.

[EXECUTION]
[CAM 01] POV handheld MS, eye-level -> [ACT] Arthur, flashlight in his right hand, sweeps the beam left across tangled roots and wades forward through shallow mud -> <wet boots sucking at shallow mud>
[CAM 01] POV PAN LEFT to Rosa -> [ACT] Rosa, flashlight in her left hand, takes a hesitant step back and clutches her collar with her right hand -> Rosa says (whispering, breathless) {Did you hear that?} -> <low wood-snapping vibration in the canopy> -> [ACT] Rosa freezes, her right hand clamped over her mouth
[CAM 01] POV PAN RIGHT back to a two-shot -> [ACT] Arthur, flashlight in his right hand, halts, raises his left palm, and holds the beam on a towering silhouette between the trunks -> Arthur says (quietly) {Don't run.} -> [ACT] Rosa, flashlight in her left hand, retreats two steps, breath hitching`,
  },
  {
    id: 'heist-montage',
    title: '1970s Heist Montage',
    topology: 'Discontinuous Montage',
    summary: 'Elliptical rapid-cut teaser using unnumbered [CAM] shots and dynamic [LIGHT] strobes.',
    content: `[INTENT]
Create a kinetic 1970s heist-thriller teaser built from rapid independent shots of a getaway driver, a safecracker, and a lookout in the hour before a bank job.

[LOGIC]
Treat every shot as an independent moment with no inherited posture or props, give each line its own subject, light, and location, and keep screen direction consistent within each shot.

[AESTHETIC]
Medium: 16mm film, heavy grain, warm halation
Palette: mustard yellow, oxblood red, smoke grey
Lighting: hard tungsten practicals, dusk sodium streetlight
Wardrobe: driver in a tan leather jacket and driving gloves; safecracker in a rumpled brown suit and wire glasses; lookout in a green parka with a fur hood
Audio: rain on metal, distant traffic

[OPENING]
Low-angle MCU through a rain-streaked windshield. Frame-center, the driver sits at the wheel, gloved hands at ten and two, eyes fixed on a bank entrance across the street.

[EXECUTION]
[CAM] Low-angle MCU through a rain-streaked windshield -> [ACT] The driver in the tan leather jacket tightens his gloved grip on the wheel and glances at the rearview mirror -> <engine catching>
[CAM] ECU on a brass dial in a dim vault -> [ACT] The safecracker in the brown suit, wire glasses glinting, presses his ear to the safe door and turns the dial a quarter turn with his right fingertips -> <tumblers clicking>
[CAM] WS from a rooftop at dusk under sodium streetlight -> [ACT] The lookout in the green parka raises binoculars in both hands and tracks a patrol car sliding past below -> <distant siren swelling and fading>
[CAM] CU on the driver's eyes in the rearview mirror -> [LIGHT] red and blue patrol-car strobes sweep across his face -> [ACT] The driver's pupils narrow as he shifts into gear with his right hand`,
  },
];

export const BLANK_SCRIPT_TEMPLATE = `[INTENT]
Create a cinematic scene set in a concrete hallway, featuring two characters confronting a hidden truth.

[LOGIC]
Maintain a stable 180-degree axis across all coverage and track held props explicitly between hands. No subtitles appear on screen.

[AESTHETIC]
Medium: 35mm film, naturalistic grain
Palette: cool slate, tungsten amber
Lighting: overhead practical key, soft shadow falloff
Location: narrow poured-concrete corridor, painted steel doorframe
Wardrobe: Character A in a charcoal coat; Character B in a dark wool sweater
Audio: faint electrical hum, distant street rumble

[OPENING]
MS at eye level down the corridor. Frame-left, Character A stands facing screen-right with a folded envelope in their right hand. Frame-right, Character B stands opposite facing screen-left.

[EXECUTION]
[CAM 01] MS, eye level -> [ACT] Character A lifts the folded envelope in their right hand and holds it between them -> <crisp paper crease>`;

export const DEFAULT_PRESET = SCRIPT_PRESETS[0];
