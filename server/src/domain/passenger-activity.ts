/**
 * BTS T-100 service-class classification (docs/SCORING.md §4).
 * Codes: BTS lookup L_SERVICE_CLASS / L_AIRCRAFT_CONFIG, retrieved 2026-11-03.
 */
export const PASSENGER_SERVICE_CLASSES = ['F', 'L'] as const; // F scheduled, L charter / non-scheduled
export const CARGO_ONLY_CLASSES = ['G', 'P'] as const; // scheduled / non-scheduled all-cargo
export const KNOWN_AIRCRAFT_CONFIGS = ['0', '1', '2', '3', '4', '9'] as const;

export type ServiceClass = (typeof PASSENGER_SERVICE_CLASSES)[number] | (typeof CARGO_ONLY_CLASSES)[number];
export type RecordKind = 'passenger' | 'cargoOnly' | 'passengerServiceNoPassengers';

export function isKnownServiceClass(c: string): c is ServiceClass {
  return (PASSENGER_SERVICE_CLASSES as readonly string[]).includes(c) || (CARGO_ONLY_CLASSES as readonly string[]).includes(c);
}

/**
 * passenger record  = class F/L with reported passengers (any aircraft configuration)
 * cargo-only record = class G/P
 * F/L rows with 0 passengers are kept apart: they are neither passenger flights nor cargo-only service.
 * Unknown classes are rejected by the refresh validation before this is ever called (R11′: no guessing).
 */
export function classifyRecord(serviceClass: ServiceClass, passengers: number): RecordKind {
  if (serviceClass === 'G' || serviceClass === 'P') return 'cargoOnly';
  return passengers > 0 ? 'passenger' : 'passengerServiceNoPassengers';
}
