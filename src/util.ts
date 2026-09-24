const debounceIds: { [id: string]: NodeJS.Timeout } = {};

export function debounce(idString: string, func: () => void, timeout: number) {
  const id = debounceIds[idString];
  if (id) {
    clearTimeout(id);
  }

  debounceIds[idString] = setTimeout(func, timeout);
}

// Archivium's shortname rules (archivium src/api/models/universe.ts validateShortname).
const RESERVED_SHORTNAMES = ['create', 'news', '_home', '_public'];

function isValidShortname(shortname: string): boolean {
  return shortname.length >= 3 && shortname.length <= 64
    && /^[a-zA-Z0-9-]+$/.test(shortname)
    && !/^-|-$/.test(shortname)
    && !RESERVED_SHORTNAMES.includes(shortname);
}

// A shortname suggested from a title, the way Archivium's own forms fill it in
// (archivium src/static/scripts/shortname.js); empty if the title can't make a valid one.
export function toShortname(title: string): string {
  const shortname = title.toLowerCase()
    .replace(/[\s()]/g, '-')
    .replace(/[^a-z0-9-]+/g, '')
    .replace(/-+/g, '-')
    .replace(/^-|-$/g, '')
    .substring(0, 64);
  return isValidShortname(shortname) ? shortname : '';
}
