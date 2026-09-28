import { afterEach, describe, expect, it, vi } from 'vitest';
import { browserTimezone, currentZoneName, TIMEZONES } from './timezones';

afterEach(() => vi.restoreAllMocks());

describe('timezones', () => {
  it('uses current names for legacy links PostgreSQL rejects', () => {
    expect(currentZoneName('Asia/Calcutta')).toBe('Asia/Kolkata');
    expect(currentZoneName('Europe/Kiev')).toBe('Europe/Kyiv');
    expect(currentZoneName('Europe/Berlin')).toBe('Europe/Berlin');
  });

  it('lists no legacy names, and starts with UTC', () => {
    expect(TIMEZONES).not.toContain('Asia/Calcutta');
    expect(TIMEZONES).toContain('Asia/Kolkata');
    expect(TIMEZONES[0]).toBe('UTC');
    expect(new Set(TIMEZONES).size).toBe(TIMEZONES.length);
  });

  it('defaults a browser in India to Asia/Kolkata', () => {
    vi.spyOn(Intl.DateTimeFormat.prototype, 'resolvedOptions').mockReturnValue({
      timeZone: 'Asia/Calcutta',
    } as Intl.ResolvedDateTimeFormatOptions);
    expect(browserTimezone()).toBe('Asia/Kolkata');
  });
});
