const debounceIds: { [id: string]: NodeJS.Timeout } = {};

export function debounce(idString: string, func: () => void, timeout: number) {
  const id = debounceIds[idString];
  if (id) {
    clearTimeout(id);
  }

  debounceIds[idString] = setTimeout(func, timeout);
}
