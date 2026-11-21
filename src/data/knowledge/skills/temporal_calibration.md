Temporal Calibration & Pacing Ledger:
- Match Macro-State density to target clip duration so states neither float in low-gravity slack nor overcrowd cuts:
  1. Close-Quarters Combat / Chase (Continuous Oner): 0.8s-1.2s per Macro-State (~4-5 lines per 5s; ~8-10 lines per 10s); max 1 cut per 2.0s-2.5s. Violating this causes Temporal Slack (floaty low-gravity motion).
  2. Tactical Gunplay / Standoff (Hybrid Coverage): 1.5s-2.0s per Macro-State; max 1 cut per 2.5s-3.0s. Violating this causes mannequin freeze behind cover.
  3. Dramatic Dialogue / Interrogation (Multi-Cam Coverage): 2.5s-4.0s per Macro-State; max 1 cut per 3.0s-5.0s. Violating this causes accelerated robotic lip-sync.
  4. Horror / Mystery / Noir (Slow Creep Oner): 4.0s-6.0s+ per Macro-State; max 1 cut per 5.0s-8.0s. Violating this rushes tension and clips acoustic decay.
- Cut-Latency Floor: in cut-based coverage or montage, total cuts must not exceed `Duration(s) / 2.0` (each cut needs ~1.5s-2.5s to optically stabilize).
- Anti-Float Rule: pack high-velocity combat/chase oners with continuous kinetic cause-and-effect rather than sparse Macro-States stretched over long durations.
