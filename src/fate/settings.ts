import { ARCHIVIUM_URL } from '../App';

// Per-campaign settings for this app, stored on the universe as obj_data.fateSettings.

export type TurnOrderMode = 'initiative' | 'popcorn';

export type FateSettings = {
  // How conflicts decide who acts next.
  turnOrder: TurnOrderMode;
};

export const FATE_SETTINGS_KEY = 'fateSettings';

export const DEFAULT_SETTINGS: FateSettings = {
  turnOrder: 'initiative',
};

export const TURN_ORDER_OPTIONS: { mode: TurnOrderMode, label: string, description: string }[] = [
  {
    mode: 'initiative',
    label: 'Initiative (Fate Core)',
    description: 'Turns go in a fixed order: highest Notice first in physical conflicts (ties by Athletics, then Physique), highest Empathy in mental ones (ties by Rapport, then Will). The GM steps through them.',
  },
  {
    mode: 'popcorn',
    label: 'Popcorn (Fate Condensed)',
    description: "Whoever just acted picks who goes next from those who haven't acted this round; the last to act picks who starts the next round.",
  },
];

export function readSettings(universeObjData: unknown): FateSettings {
  const stored = universeObjData && typeof universeObjData === 'object'
    ? (universeObjData as Record<string, unknown>)[FATE_SETTINGS_KEY]
    : undefined;
  const settings = stored && typeof stored === 'object' ? stored as Partial<FateSettings> : {};
  return {
    turnOrder: TURN_ORDER_OPTIONS.some(o => o.mode === settings.turnOrder) ? settings.turnOrder! : DEFAULT_SETTINGS.turnOrder,
  };
}

const universeUrl = (campaign: string) => `${ARCHIVIUM_URL}/api/universes/${campaign}`;

export async function fetchSettings(campaign: string): Promise<FateSettings> {
  const response = await fetch(universeUrl(campaign), { credentials: 'include' });
  if (!response.ok) throw new Error(`Could not load the campaign (${response.status}).`);
  const data = await response.json();
  return readSettings(typeof data.obj_data === 'string' ? JSON.parse(data.obj_data) : data.obj_data);
}

// Saves changes over the freshest copy of the settings, keeping any keys this
// version of the app doesn't know about. The data endpoint merges top-level keys,
// so the rest of the universe's obj_data is untouched.
export async function saveSettings(campaign: string, changes: Partial<FateSettings>): Promise<FateSettings> {
  const response = await fetch(universeUrl(campaign), { credentials: 'include' });
  if (!response.ok) throw new Error(`Could not load the campaign (${response.status}).`);
  const data = await response.json();
  const objData = (typeof data.obj_data === 'string' ? JSON.parse(data.obj_data) : data.obj_data) ?? {};
  const stored = objData[FATE_SETTINGS_KEY] && typeof objData[FATE_SETTINGS_KEY] === 'object' ? objData[FATE_SETTINGS_KEY] : {};
  const next = { ...stored, ...changes };
  const save = await fetch(`${universeUrl(campaign)}/data`, {
    credentials: 'include',
    method: 'PUT',
    headers: {
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({ [FATE_SETTINGS_KEY]: next }),
  });
  if (!save.ok) throw new Error(`Could not save the settings (${save.status}).`);
  return readSettings({ [FATE_SETTINGS_KEY]: next });
}
