declare const __BUILD__: string;
declare const __ADS__: boolean;

/** Version and commit of this build; shown small in the pause menu. */
export const BUILD: string = __BUILD__;

/**
 * Ads switch. Off for Player Fit Test builds (`npm run poki`), on for release
 * builds (`npm run poki:ads`). Call sites stay in place either way.
 */
export const ADS: boolean = __ADS__;

export const DEV: boolean = import.meta.env.DEV;
