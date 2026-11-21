import type {AuteurLensPresetId, SceneTopology} from '../../core/index.ts';
import type {LensAuditChecklist} from './types.ts';

// ---------------------------------------------------------------------------
// Topology-Filtered 5-Lens Script Supervisor Audit Checklists
// ---------------------------------------------------------------------------

export function getLensAuditChecklist(
  preset: AuteurLensPresetId,
  topology: SceneTopology
): LensAuditChecklist {
  const isMontage = topology === 'discontinuous_montage';
  const isOner = topology === 'continuous_oner';

  switch (preset) {
    case 'lens1_spatial_optics': {
      if (isMontage) {
        return {
          preset,
          lens: 'Lens 1: Spatial & Optics',
          topology,
          topologyNote:
            'Discontinuous montage topology: cross-cut inheritance is severed; evaluate each Macro-State as a self-contained visual shot.',
          suppressedChecks: [
            'Cross-cut 180-degree eyeline parity between consecutive montage Macro-States',
            'S0 -> S1 posture/prop carryover across independent montage cuts',
            'Numbered camera slot recall/hold continuity ([CAM 01] ->)',
          ],
          checks: [
            'Viewport coordinate purity: zero banned `stage-left`/`stage-right` terms; separate screen placement (`frame-left/center/right` + `FG/MG/BG`) from yaw (`facing screen-*`) within each shot.',
            'Plain unnumbered `[CAM]` tags: montage cuts use unnumbered `[CAM]` descriptors rather than persistent numbered camera slots.',
            'Self-contained shot anchoring: every Macro-State line explicitly establishes its subject, setting (or declared `LOC##` token), and light cue via its Sub-States.',
            'Within-shot action visibility & direction: every `[ACT]` Sub-State is physically visible from that Macro-State line’s `[CAM]` Sub-State framing with coherent internal screen direction.',
          ],
        };
      }

      const checks = [
        'Viewport coordinate purity: zero banned `stage-left`/`stage-right` terms; separate position (`frame-left/center/right` + `FG/MG/BG`) from anatomical yaw (`facing screen-left/right`, `in profile-left/right`, `back to camera`).',
        '180-degree axis & eyeline parity: if Subject A is `frame-left` facing `screen-right`, reverse coverage places Subject B `frame-right` facing `screen-left` unless crossed via a neutral frontal/POV shot or arcing camera move.',
        'Action visibility vs. active `resolvedCamera.effectiveFraming`: confirm every `[ACT]` detail (eye glance, palm press, hand gesture) is physically visible from the active camera angle.',
        'Clean S0 -> S1 handoff: Macro-State S1 opens with the exact camera framing, viewport layout, posture, and hand grips locked in `[OPENING]`.',
        isOner
          ? 'Continuous oner camera discipline: maintain a single numbered `[CAM 01]` slot throughout; lines 2+ must hold (`[CAM 01] ->`) or use operator motion verbs (`PAN`, `TRACKING`, `CRANING`, `PUSHING`), never static shot-scale re-declarations.'
          : 'Camera numbering & oner continuity: established numbered camera slots (`[CAM 01]`, `[CAM 02]`) hold/recall via bare `[CAM 01] ->` or move via operator verbs, never re-declaring static shot scales.',
        'Spatial fence for 3+ subjects: complex multi-character frames or mark swaps use an explicit inline `[BLOCK]` Sub-State to lock viewport coordinates.',
      ];

      return {
        preset,
        lens: 'Lens 1: Spatial & Optics',
        topology,
        topologyNote: isOner
          ? 'Continuous oner topology: strict unbroken S0 -> S1 -> ... -> Sn spatial inheritance on a single numbered camera slot.'
          : 'Continuous scene topology: enforce 180-degree axis, eyeline parity, S0 -> S1 handoff, and numbered camera slot persistence.',
        suppressedChecks: [],
        checks,
      };
    }

    case 'lens2_temporal_pacing_wear': {
      if (isMontage) {
        return {
          preset,
          lens: 'Lens 2: Temporal, Pacing & Wear',
          topology,
          topologyNote:
            'Discontinuous montage topology: Macro-States represent independent moments with no cross-state wear or kinetic carryover.',
          suppressedChecks: [
            'Cross-state physical wear persistence (sweat/blood/mud repetition across unrelated shots)',
            'Continuous S_{n-1} -> S_n posture/kinetic carryover between cuts',
          ],
          checks: [
            'Cut-latency floor: total montage cuts must not exceed `Duration(s) / 2.0` (each cut needs ~1.5s-2.5s to visually stabilize and read).',
            'Self-contained shot readability: each montage Macro-State line packs a single clear visual moment without cramming multiple incompatible time jumps into its Sub-States.',
            'Within-shot kinetic plausibility: motion across the `[ACT]` Sub-States of a single Macro-State line is physically continuous and achievable within its brief shot window.',
          ],
        };
      }

      return {
        preset,
        lens: 'Lens 2: Temporal, Pacing & Wear',
        topology,
        topologyNote:
          'Continuous scene topology: check Macro-State-to-duration tempo calibration, kinetic continuity, and physical wear repetition.',
        suppressedChecks: [],
        checks: [
          'Cut-latency floor: editorial cut count must not exceed `Duration(s) / 2.0` (~1.5s-2.5s per cut to stabilize).',
          'Anti-float Macro-State-to-duration calibration: combat/chase oners target 0.8s-1.2s per Macro-State; tactical standoffs 1.5s-2.0s; dramatic dialogue 2.5s-4.0s; slow horror/noir 4.0s-6.0s+.',
          'Physical wear persistence (Repetition Mandate): accumulated baggage (sweat, blood, mud, bruises, soaked fabric, fatigue) is restated in an `[ACT]` Sub-State on every visible Macro-State line until cleaned or resolved.',
          'Plausible kinetic transitions: posture and location changes (`seated -> standing`, `crouching -> lunging`) follow physically connected momentum with zero teleporting between consecutive Macro-State lines.',
        ],
      };
    }

    case 'lens3_props_inventory': {
      if (isMontage) {
        return {
          preset,
          lens: 'Lens 3: Props & Inventory',
          topology,
          topologyNote:
            'Discontinuous montage topology: props do not persist across independent shots; verify within-shot hand clarity only.',
          suppressedChecks: [
            'Cross-state prop persistence and carryover across montage cuts',
            'Cross-cut prop repetition on camera recalls',
          ],
          checks: [
            'Within-shot explicit hand allocation: any prop held or manipulated in an `[ACT]` or `[PROP]` Sub-State of a montage Macro-State line names the exact hand (`left hand`, `right hand`, `both hands`).',
            'Zero within-shot hand collisions: a subject cannot grip two conflicting props in the same hand across the Sub-States of a single Macro-State line.',
            'Self-contained prop & wardrobe anchoring: each independent montage shot clearly states the hero prop or wardrobe cue visible in that moment.',
          ],
        };
      }

      return {
        preset,
        lens: 'Lens 3: Props & Inventory',
        topology,
        topologyNote:
          'Continuous scene topology: enforce strict hand allocation, unbroken prop lifecycles, and restatement across cuts.',
        suppressedChecks: [],
        checks: [
          'Explicit hand allocation: every held prop names the exact hand (`in his right hand`, `under her left palm`, `in both hands`) consistent with `[LOGIC]` and `[OPENING]`.',
          'Unbroken prop lifecycle: props follow `Stored -> Picked Up -> Held -> Used -> Released/Put Down` with zero ghost props appearing or vanishing.',
          'Zero hand collisions: a character cannot grab a second prop with an occupied hand unless they explicitly release or transfer the first item.',
          'Repetition across cuts & recalls: when returning to a subject after a cut or bare recall (`[CAM 01] ->`), key held props are restated concisely in `[ACT]`.',
        ],
      };
    }

    case 'lens4_acoustics_voice': {
      return {
        preset,
        lens: 'Lens 4: Acoustics & Voice',
        topology,
        topologyNote: isMontage
          ? 'Discontinuous montage topology: keep each `<foley>` Sub-State punchy and self-contained while isolating continuous ambience in `[AESTHETIC]`.'
          : 'Verify curly-brace dialogue Sub-State syntax, Macro-State resolution, selective `<foley>` Sub-States, and room tone isolation.',
        suppressedChecks: [],
        checks: [
          'Macro-State resolution rule: no `[EXECUTION]` Macro-State line has spoken `{dialogue}` as its final Sub-State—always chain an `[ACT]` or `<foley>` Sub-State after it.',
          'Curly-brace dialogue lock: spoken dialogue Sub-States strictly use `Speaker says (delivery) {line}` (optional `in Language`, `(O.S.)`, `(V.O.)`), never quotation marks or legacy `[DIAL]`/`[AUDIO]`.',
          'Room tone isolation: continuous background ambience (rain, ballast hum, wind, traffic) stays in `[AESTHETIC]` (`Audio:`) and is not spammed as a `<foley>` Sub-State on every Macro-State line.',
          'Selective diegetic `<foley>`: use `<sound>` only for distinct physical friction, impacts, or off-screen triggers (restate persistent discrete sounds explicitly).',
          'Subtitle guard: when spoken dialogue exists and captions are unwanted, `[LOGIC]` ends with `No subtitles appear on screen.`',
          'Opt-in score & on-screen text: `(score)` and `【text】` appear only when explicitly intended.',
        ],
      };
    }

    case 'lens5_blocks_grammar': {
      const checks = [
        'Multimodal reference isolation: keep `@image`/`@audio`/`@video` bindings in `[INTENT]`, `[CHARACTERS]`, `[REFERENCES]`, or `[CONTINUITY PROTOCOL]`, never inside `[EXECUTION]`.',
        'Frozen `[OPENING]` purity: zero `[TAG]` tokens, zero motion verbs, and zero audio cues—strictly 2-4 sentences of motionless $t=0$ plain prose.',
        'Flowing `[INTENT]`: one concise directorial sentence starting with `"Create ..."`, never a play-by-play shot list.',
        'Zero lookbook bleed: `[EXECUTION]` does not restate static wardrobe, lens stock, color palette, or room architecture already locked in `[AESTHETIC]` (use declared shorthand tokens like `LOC01` when referencing settings).',
        'Single-Dimension Law: each `->`-separated Sub-State directs strictly one optical, spatial, physical, or acoustic dimension.',
      ];

      if (isMontage) {
        checks.push(
          'Montage contract alignment: confirm `[LOGIC]` states independent-shot montage behavior and each `[EXECUTION]` Macro-State line uses a plain unnumbered `[CAM]` Sub-State with self-contained subject/light/location cues.'
        );
      }

      return {
        preset,
        lens: 'Lens 5: Blocks & Grammar',
        topology,
        topologyNote: isMontage
          ? 'Discontinuous montage topology: allow concise per-state subject/light/location anchoring (or `LOC##` tokens) while preventing static lookbook bleed.'
          : 'Verify Phase Partition Law, Block Orthogonality, Single-Dimension Law, and canonical v0.4.0 syntax purity.',
        suppressedChecks: [],
        checks,
      };
    }
  }
}
