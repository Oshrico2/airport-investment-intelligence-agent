import { collectNumbers, extractNumbers, ungroundedNumbers } from './grounding';

describe('grounding check', () => {
  it('reads plain, grouped, decimal, percent and scaled numbers', () => {
    expect(extractNumbers('21,143,295 passengers, 2.77% share, 21.1 million, 12.9 min, -0.76%').map((n) => n.value)).toEqual([21_143_295, 2.77, 21_100_000, 12.9, -0.76]);
  });

  it('collects numbers from objects and embedded strings', () => {
    expect(collectNumbers({ a: 1, b: ['x 437,565 y', { c: 2.5 }] }).sort()).toEqual([1, 2.5, 437_565].sort());
  });

  it('accepts figures that round from tool values at the written precision', () => {
    const tools = [{ passengers: 21_143_295, share: 2.77, growth: -0.76, lf: 81.6 }];
    expect(ungroundedNumbers('BOS had 21.1 million departing passengers (21,143,295), growth −0.76%, about 2.8% long-haul, LF 81.6%.', tools)).toEqual([]);
  });

  it('accepts approved methodology constants such as the 60/40 weights', () => {
    expect(ungroundedNumbers('Growth is weighted 60% and load factor 40%; the threshold is 500,000.', [{}])).toEqual([]);
  });

  it('flags figures that no tool produced, but exempts years and small counts', () => {
    const tools = [{ share: 2.77 }];
    expect(ungroundedNumbers('In 2025, 3 airports grew 14.2% and the share was 2.77%.', tools)).toEqual(['14.2']);
  });

  describe('approximate decade expressions (manual acceptance: SFO "low 80s")', () => {
    const sfo = [{ loadFactorPercent: 82.1 }, { loadFactorPercent: 83.2 }, { loadFactorPercent: 82.3 }, { peak: 89.4 }];

    it('accepts "low 80s" when the tool load factors are 82.1%, 83.2% and 82.3%', () => {
      expect(ungroundedNumbers('Load factors stayed in the low 80s in 2019, 2024 and 2025.', sfo)).toEqual([]);
    });

    it('accepts other decade forms that a tool value falls inside', () => {
      expect(ungroundedNumbers('in the 80s; low-80s; the high 80s at the June peak; low-to-high 80s', sfo)).toEqual([]);
      expect(ungroundedNumbers('mid-80s', [{ lf: 85.2 }])).toEqual([]);
      expect(ungroundedNumbers('mid to high 80s', [{ lf: 87.4 }])).toEqual([]);
    });

    it('flags a decade no tool value falls inside, naming the whole expression', () => {
      expect(ungroundedNumbers('Load factors were in the low 90s.', sfo)).toEqual(['low 90s']);
      expect(ungroundedNumbers('Load factors were in the mid 80s.', [{ lf: 82.3 }, { lf: 89.4 }])).toEqual(['mid 80s']);
      expect(ungroundedNumbers('passengers in the 70s', sfo)).toEqual(['70s']);
    });

    it('never lets a methodology constant ground a decade', () => {
      expect(ungroundedNumbers('scores in the low 50s', [{ score: 80.3 }])).toEqual(['low 50s']); // 50 is a score breakpoint, not a result
    });

    it('keeps exact figures strict next to approximate ones', () => {
      expect(ungroundedNumbers('Load factors were in the low 80s, about 80% on average.', sfo)).toEqual(['80']);
      expect(ungroundedNumbers('The low 80s load factor (82.3%) rose to 86.4%.', sfo)).toEqual(['86.4']);
      expect(ungroundedNumbers('80 seats per departure', sfo)).toEqual(['80']); // a bare 80 is not a decade
    });

    it('leaves decades of years and plain plural words alone', () => {
      expect(ungroundedNumbers('Unlike the 1990s, the 2020s show recovery.', sfo)).toEqual([]);
      expect(ungroundedNumbers('80sec', sfo)).toEqual(['80']);
    });
  });
});
