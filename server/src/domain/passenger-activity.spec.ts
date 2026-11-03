import { classifyRecord, isKnownServiceClass } from './passenger-activity';

describe('classifyRecord (N4, N9, O1)', () => {
  it('passenger service with reported passengers is a passenger record', () => {
    expect(classifyRecord('F', 120)).toBe('passenger');
    expect(classifyRecord('L', 3)).toBe('passenger');
  });
  it('all-cargo service is cargo-only even when aircraft configuration says passenger', () => {
    expect(classifyRecord('P', 0)).toBe('cargoOnly'); // Atlas Air case
    expect(classifyRecord('G', 2)).toBe('cargoOnly');
  });
  it('passenger service without passengers is neither passenger flight nor cargo', () => {
    expect(classifyRecord('L', 0)).toBe('passengerServiceNoPassengers');
  });
  it('only F, L, G, P are known classes', () => {
    expect(['F', 'L', 'G', 'P'].every(isKnownServiceClass)).toBe(true);
    expect(isKnownServiceClass('Z')).toBe(false);
  });
});
