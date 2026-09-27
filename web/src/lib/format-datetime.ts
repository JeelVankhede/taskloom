/** A moment (DateTime, ISO string) as a date in the viewer's locale and timezone. */
export function formatDay(iso: string): string {
  return new Intl.DateTimeFormat(undefined, { dateStyle: 'medium' }).format(new Date(iso));
}
