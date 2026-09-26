import { humanize, toneOf } from './status-tones';

describe('status tones', () => {
  it('maps statuses explicitly, fixing the prototype substring bugs', () => {
    // Prototype: "OVERSTOCK" contained "stock" → success; "AT CAPACITY" matched nothing.
    expect(toneOf('OVERSTOCK')).toBe('info');
    expect(toneOf('OUT_OF_STOCK')).toBe('danger');
    expect(toneOf('LOW_STOCK')).toBe('warning');
    expect(toneOf('IN_STOCK')).toBe('success');
  });

  it('never guesses a tone for unknown values', () => {
    expect(toneOf('SOMETHING_NEW')).toBe('neutral');
    expect(toneOf(null)).toBe('neutral');
  });

  it('humanizes enum values', () => {
    expect(humanize('PUTAWAY_PENDING')).toBe('Putaway pending');
    expect(humanize('IN_TRANSIT')).toBe('In transit');
    expect(humanize('')).toBe('');
  });
});
