// Added by an LLM agent (P2-16): shared dataset helper for the three exposer
// extensions (node-exposer, edge-exposer, node-interaction-exposer). Previously
// each had its own getData() -> dataset loop with the same `if (!value)` falsy
// bug that deleted numeric 0 (e.g. rotation: 0, width multipliers).
// The single fix: only null/undefined/'' clear the attribute; 0 and false stay.

/** Values that clear a dataset attribute. Everything else (incl. 0) is kept. */
export function isEmptyDatasetValue(value: unknown): boolean {
  return value === null || value === undefined || value === ''
}

/** Expand an exposed key into [datasetKey, value] pairs (objects fan out). */
export function expandDatasetPairs(
  data: Record<string, unknown>,
  exposedKey: string
): Array<[string, string]> {
  const raw = data[exposedKey]
  const pairs: Array<[string, unknown]> = raw !== null && typeof raw === 'object' && !Array.isArray(raw)
    ? Object.entries(raw as Record<string, unknown>)
    : [[exposedKey, raw]]
  return pairs as Array<[string, string]>
}

/** Write expanded pairs onto an element's dataset, honouring empty semantics. */
export function writeDataset(
  element: HTMLElement | SVGElement,
  data: Record<string, unknown>,
  exposedKeys: string[],
  keyPrefix = ''
): void {
  const dataset = (element as HTMLElement).dataset
  if (!dataset) return
  for (const exposedKey of exposedKeys) {
    for (const [key, value] of expandDatasetPairs(data, exposedKey)) {
      const datasetKey = keyPrefix
        ? keyPrefix + key.charAt(0).toUpperCase() + key.slice(1)
        : key
      if (isEmptyDatasetValue(value)) delete dataset[datasetKey]
      else dataset[datasetKey] = String(value)
    }
  }
}

/** Remove all dataset keys previously written for the given exposed keys. */
export function clearDataset(element: HTMLElement | SVGElement, keys: string[]): void {
  const dataset = (element as HTMLElement).dataset
  if (!dataset) return
  for (const key of keys) {
    try { delete dataset[key] } catch { /* ignore */ }
  }
}
