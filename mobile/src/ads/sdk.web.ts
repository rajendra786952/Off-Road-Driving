// Browser build: no SDK. Development builds simulate ads (see FullScreenAd.web.ts).
export async function initSdk(): Promise<boolean> {
  return __DEV__;
}
