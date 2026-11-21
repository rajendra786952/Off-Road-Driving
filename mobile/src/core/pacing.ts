// Frame pacing. The physics always runs at a fixed 60 steps per second; this decides how
// often a frame is *drawn*.
//
//  - A 90 or 120 Hz screen calls the loop 90 or 120 times a second. Drawing that often is
//    wasted work for this game, so frames are drawn 60 times a second at most.
//  - A phone that cannot hold 60 does not run at a steady 45: it alternates between 16 ms
//    and 33 ms frames, which looks like stutter. In "auto" the pacer notices that and drops
//    to a steady 30, which looks smoother and halves the drawing work.
//
// No React and no timers in here, so it is unit tested (tests/pacing.test.ts).

export type FrameRateSetting = 'auto' | '60' | '30';

const WARMUP_FRAMES = 90; // the first second and a half of a run is not judged (loading hitches)
const WINDOW_FRAMES = 120; // judge two seconds at a time
const LATE_MS = 21; // a 60 Hz frame that took longer than this missed its slot
const LATE_SHARE = 0.3; // this share of late frames makes a window "bad"
const BAD_WINDOWS = 2; // this many bad windows in a row switch to 30

/** What "auto" settled on earlier in this app session, so the next run starts there. */
let sessionTarget: 60 | 30 = 60;

export function resetPacingMemory(): void {
  sessionTarget = 60;
}

export class FramePacer {
  target: 60 | 30;
  private readonly auto: boolean;
  private lastDraw = -1;
  private seen = 0;
  private frames = 0;
  private late = 0;
  private bad = 0;

  constructor(setting: FrameRateSetting) {
    this.auto = setting === 'auto';
    this.target = setting === '30' ? 30 : setting === '60' ? 60 : sessionTarget;
  }

  /**
   * Call from every animation-frame callback with its timestamp (ms). Returns the time since
   * the last drawn frame when this callback should draw, or 0 when it should be skipped.
   */
  begin(t: number): number {
    if (this.lastDraw < 0) {
      this.lastDraw = t;
      return 1000 / 60;
    }
    const dt = t - this.lastDraw;
    // 2 ms of slack: callbacks arrive a little early or late around the screen's refresh
    if (dt < 1000 / this.target - 2) return 0;
    this.lastDraw = t;
    return dt;
  }

  /** Call once per drawn frame while the car is being driven. Returns true when it just switched to 30. */
  observe(dt: number): boolean {
    if (!this.auto || this.target !== 60) return false;
    if (this.seen < WARMUP_FRAMES) {
      this.seen++;
      return false;
    }
    this.frames++;
    if (dt > LATE_MS) this.late++;
    if (this.frames < WINDOW_FRAMES) return false;
    this.bad = this.late / this.frames > LATE_SHARE ? this.bad + 1 : 0;
    this.frames = this.late = 0;
    if (this.bad < BAD_WINDOWS) return false;
    this.target = 30;
    sessionTarget = 30;
    return true;
  }

  /** After a pause the next frame must not count as a long one. */
  resume(): void {
    this.lastDraw = -1;
  }
}
