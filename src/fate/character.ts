// Fate Core character sheet data model and rules helpers.
// Stored on the character's Archivium item as obj_data.fate.

export const LADDER: { [rating: number]: string } = {
  8: 'Legendary',
  7: 'Epic',
  6: 'Fantastic',
  5: 'Superb',
  4: 'Great',
  3: 'Good',
  2: 'Fair',
  1: 'Average',
  0: 'Mediocre',
  [-1]: 'Poor',
  [-2]: 'Terrible',
};

export function ladderLabel(rating: number): string {
  const sign = rating > 0 ? '+' : '';
  return `${LADDER[rating] ?? 'Beyond the ladder'} (${sign}${rating})`;
}

export const CORE_SKILLS = [
  'Athletics', 'Burglary', 'Contacts', 'Crafts', 'Deceive', 'Drive',
  'Empathy', 'Fight', 'Investigate', 'Lore', 'Notice', 'Physique',
  'Provoke', 'Rapport', 'Resources', 'Shoot', 'Stealth', 'Will',
];

export const BASE_REFRESH = 3;
export const FREE_STUNTS = 3;
export const EXTRA_ASPECTS = 3;

export type Stunt = {
  name: string;
  description: string;
};

export type Consequences = {
  mild: string;
  moderate: string;
  severe: string;
  // Extra mild consequence slots granted by Superb (+5) or higher Physique / Will.
  mildPhysical: string;
  mildMental: string;
};

export type FateCharacter = {
  version: 1;
  system: 'core';
  highConcept: string;
  trouble: string;
  aspects: string[];
  skills: { [skill: string]: number };
  stunts: Stunt[];
  fatePoints: number | null;
  stress: {
    physical: boolean[];
    mental: boolean[];
  };
  consequences: Consequences;
  extras: string;
  description: string;
};

export function newCharacter(): FateCharacter {
  return {
    version: 1,
    system: 'core',
    highConcept: '',
    trouble: '',
    aspects: Array(EXTRA_ASPECTS).fill(''),
    skills: {},
    stunts: [],
    fatePoints: null,
    stress: { physical: [], mental: [] },
    consequences: { mild: '', moderate: '', severe: '', mildPhysical: '', mildMental: '' },
    extras: '',
    description: '',
  };
}

// Merge saved data over the defaults, so sheets saved by older versions of the
// form (or partially filled in elsewhere) still load with every field present.
export function normalizeCharacter(raw: any): FateCharacter {
  const base = newCharacter();
  if (!raw || typeof raw !== 'object') return base;
  const aspects: string[] = Array.isArray(raw.aspects) ? raw.aspects : [];
  return {
    ...base,
    ...raw,
    aspects: [...aspects, ...base.aspects].slice(0, Math.max(EXTRA_ASPECTS, aspects.length)),
    skills: { ...(raw.skills ?? {}) },
    stunts: Array.isArray(raw.stunts) ? raw.stunts : [],
    stress: { ...base.stress, ...(raw.stress ?? {}) },
    consequences: { ...base.consequences, ...(raw.consequences ?? {}) },
  };
}

export function skillRating(character: FateCharacter, skill: string): number {
  return character.skills[skill] ?? 0;
}

// Fate Core: 2 stress boxes, 3 at Average/Fair, 4 at Good or better.
export function stressBoxCount(rating: number): number {
  if (rating >= 3) return 4;
  if (rating >= 1) return 3;
  return 2;
}

export function physicalStressBoxes(character: FateCharacter): number {
  return stressBoxCount(skillRating(character, 'Physique'));
}

export function mentalStressBoxes(character: FateCharacter): number {
  return stressBoxCount(skillRating(character, 'Will'));
}

export function hasExtraMildPhysical(character: FateCharacter): boolean {
  return skillRating(character, 'Physique') >= 5;
}

export function hasExtraMildMental(character: FateCharacter): boolean {
  return skillRating(character, 'Will') >= 5;
}

// Each stunt beyond the free ones costs a point of refresh.
export function refresh(character: FateCharacter): number {
  return BASE_REFRESH - Math.max(0, character.stunts.length - FREE_STUNTS);
}

// Number of skills at each rating above Mediocre, highest first.
export function skillCounts(character: FateCharacter): { rating: number, count: number }[] {
  const ratings = Object.values(character.skills).filter(r => r > 0);
  const max = Math.max(0, ...ratings);
  const counts: { rating: number, count: number }[] = [];
  for (let rating = max; rating >= 1; rating--) {
    counts.push({ rating, count: ratings.filter(r => r === rating).length });
  }
  return counts;
}

// Problems with the sheet under the standard creation rules. These are advisory
// only; GMs routinely bend them, so the form never blocks saving on them.
export function validateCharacter(character: FateCharacter): string[] {
  const problems: string[] = [];

  const counts = skillCounts(character);
  for (let i = 0; i < counts.length - 1; i++) {
    const above = counts[i];
    const below = counts[i + 1];
    if (above.count > below.count) {
      problems.push(`Skill pyramid: ${above.count} skill(s) at ${ladderLabel(above.rating)} but only ${below.count} at ${ladderLabel(below.rating)}.`);
    }
  }

  if (refresh(character) < 1) {
    problems.push(`Too many stunts: refresh can't go below 1 (currently ${refresh(character)}).`);
  }

  return problems;
}
