// Guess the player's country offline: time zone first (very reliable), then
// the region in the browser language. No network request involved.
import { TZ_TABLE } from '../data/tz';

let zones: Map<string, string> | null = null;
function zoneTable(): Map<string, string> {
  if (zones) return zones;
  zones = new Map();
  for (const group of TZ_TABLE.split(';')) {
    const [region, list] = group.split('|');
    for (const item of list.split(',')) {
      const [city, cc] = item.split('=');
      zones.set(`${region}/${city}`, cc);
    }
  }
  return zones;
}

export function detectHome(valid: (code: string) => boolean): string | null {
  const q = new URLSearchParams(location.search).get('home');
  if (q && valid(q.toUpperCase())) return q.toUpperCase();
  try {
    const tz = Intl.DateTimeFormat().resolvedOptions().timeZone;
    const cc = tz ? zoneTable().get(tz) : undefined;
    if (cc && valid(cc)) return cc;
  } catch {
    // no Intl time zone support
  }
  const langs = [...(navigator.languages || []), navigator.language || ''];
  for (const l of langs) {
    const m = /[-_]([A-Za-z]{2})(?:[-_]|$)/.exec(l);
    if (m && valid(m[1].toUpperCase())) return m[1].toUpperCase();
  }
  return null;
}
