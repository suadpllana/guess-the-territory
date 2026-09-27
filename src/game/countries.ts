// Which features can be asked, how hard each one is, and who plays on Poki.

// Difficulty 1 (everyone knows it) .. 8 (tiny Pacific islands). The player's
// skill lives on the same scale, so questions track what they can answer.
const TIERS: [number, string][] = [
  [1, 'US BR CN RU AU IN CA IT JP GB FR MX ES DE'],
  [1.5, 'TR EG AR CL GL SA KR ZA NZ'],
  [2, 'PT GR SE NO ID TH VN PH PL UA IS MA NG KE MG CU IR PK CO PE'],
  [2.5, 'FI IE NL CH AT BE DK IL KP AF IQ VE KZ MN'],
  [3, 'DZ LY SD ET SO TZ CD AO NA MZ ZW BO PY UY EC CZ HU RO BG RS HR BY SY JO AE MY'],
  [3.5, 'TN GH CM CI SN ML NE TD MM LK NP BD YE OM TW JM LB'],
  [4, 'KH LA UZ TM KG TJ AZ GE AM KW QA LT LV EE SK SI BA ME AL MK MD GT HN NI CR PA DO HT PG FJ'],
  [4.5, 'SV BZ GY SR UG RW ZM MW BW SS ER DJ CG GA CF GQ BJ TG BF GN SL LR MR GM GW BI LS SZ BT BN TL CY LU PS XK'],
  [5.5, 'MT BS TT BH SG MV MU SC KM CV ST'],
  [6.5, 'AD LI MC SM VA BB GD LC VC DM AG KN'],
  [7.5, 'WS TO VU SB KI TV NR MH FM PW'],
];

export const DIFFICULTY = new Map<string, number>();
for (const [d, codes] of TIERS) for (const c of codes.split(' ')) DIFFICULTY.set(c, d);

// Poki's largest audiences first (traffic research, 2026). New players see
// these early so the first questions are ones they are likely to know.
export const POKI_AUDIENCE = (
  'US BR TR IN FR VN DE GB NL PL IT ES MX ID PH CA RO PT AR CO BE JP AU UA CZ GR EG SA TH RU MA DZ PK KR CL PE SE HU'
).split(' ');

// Very recognisable shapes, used to pad the opening rounds.
export const ICONIC = 'IT JP AU GB BR IN CL GL CA MX EG NZ'.split(' ');

export const MAX_DIFFICULTY = 8;
