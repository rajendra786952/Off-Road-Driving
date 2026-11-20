// The rewarded-ad flow used by every "watch an ad" button:
// show the ad -> only if AdMob confirmed the reward, apply it to the save ->
// tell the player what happened.
import { AdMobManager } from './AdMobManager';
import { notify } from '../ui/notice';
import { play } from '../audio/sound';

let inFlight = false;

/**
 * @param grant applies the reward and returns the confirmation text, or null if
 *   the reward no longer applies (already owned, already unlocked...). It is
 *   called at most once, and only after a completed ad.
 * @returns true when the reward was granted.
 */
export async function watchAdForReward(grant: () => string | null): Promise<boolean> {
  if (inFlight) return false; // a second tap while the ad is opening does nothing
  inFlight = true;
  try {
    const outcome = await AdMobManager.showRewarded();
    if (outcome === 'earned') {
      const message = grant();
      if (!message) return false;
      play('fuel');
      notify(message, 'reward');
      return true;
    }
    notify(outcome === 'closed' ? 'Ad skipped - no reward this time.' : 'No ad available right now. Try again in a moment.', 'info');
    return false;
  } finally {
    inFlight = false;
  }
}
