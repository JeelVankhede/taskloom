/**
 * Browsers name some zones with legacy IANA links (Chrome and Node report India as
 * Asia/Calcutta) that PostgreSQL's zone list does not have, so the database would reject them.
 * Each maps to its current name. Checked against postgres:18: after mapping, every zone the
 * browser lists is one PostgreSQL accepts.
 */
const CURRENT_NAME: Record<string, string> = {
  'Africa/Asmera': 'Africa/Asmara',
  'America/Buenos_Aires': 'America/Argentina/Buenos_Aires',
  'America/Catamarca': 'America/Argentina/Catamarca',
  'America/Cordoba': 'America/Argentina/Cordoba',
  'America/Godthab': 'America/Nuuk',
  'America/Indianapolis': 'America/Indiana/Indianapolis',
  'America/Jujuy': 'America/Argentina/Jujuy',
  'America/Louisville': 'America/Kentucky/Louisville',
  'America/Mendoza': 'America/Argentina/Mendoza',
  'Asia/Calcutta': 'Asia/Kolkata',
  'Asia/Katmandu': 'Asia/Kathmandu',
  'Asia/Rangoon': 'Asia/Yangon',
  'Asia/Saigon': 'Asia/Ho_Chi_Minh',
  'Atlantic/Faeroe': 'Atlantic/Faroe',
  'Europe/Kiev': 'Europe/Kyiv',
  'Pacific/Enderbury': 'Pacific/Kanton',
  'Pacific/Ponape': 'Pacific/Pohnpei',
  'Pacific/Truk': 'Pacific/Chuuk',
};

export const currentZoneName = (zone: string): string => CURRENT_NAME[zone] ?? zone;

/** Every zone the browser knows, by current name, sorted, plus UTC (some browsers omit it). */
export const TIMEZONES: string[] = [
  ...new Set(['UTC', ...Intl.supportedValuesOf('timeZone').map(currentZoneName)]),
].sort((a, b) => (a === 'UTC' ? -1 : b === 'UTC' ? 1 : a.localeCompare(b)));

/** The browser's own timezone by its current name, when the list has it; otherwise UTC. */
export function browserTimezone(): string {
  const zone = currentZoneName(Intl.DateTimeFormat().resolvedOptions().timeZone);
  return TIMEZONES.includes(zone) ? zone : 'UTC';
}
