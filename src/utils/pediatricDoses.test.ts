import { describe, it, expect } from 'vitest';
import { SYRUP_DRUGS, computeDose, findSyrupDrug, detectConcentration, type DoseResult } from './pediatricDoses';

const drug = (id: string) => SYRUP_DRUGS.find(d => d.id === id)!;
const reg = (id: string, r: string) => drug(id).regimens.find(x => x.id === r)!;
const ok = (res: ReturnType<typeof computeDose>) => { if ('error' in res) throw new Error(res.error); return res as DoseResult; };

describe('computeDose', () => {
  it('paracetamol 10 kg @ 120mg/5ml → 100–150 mg = 4.2–6.3 ml, daily cap 75 mg/kg', () => {
    const r = ok(computeDose(reg('paracetamol', 'fever'), 120, 10, 12));
    expect(r.doseMg).toEqual([100, 150]);
    expect(r.doseMl).toEqual([4.2, 6.3]);
    expect(r.maxDayMg).toBe(750);
  });

  it('paracetamol caps single dose at 1000 mg for a heavy child', () => {
    const r = ok(computeDose(reg('paracetamol', 'fever'), 250, 80, 144));
    expect(r.doseMg).toEqual([800, 1000]);
    expect(r.maxDayMg).toBe(4000);
    expect(r.capped.length).toBe(1);
  });

  it('ibuprofen warns under 6 months and caps at 400 mg/dose', () => {
    expect(ok(computeDose(reg('ibuprofen', 'fever'), 100, 6, 4)).warnings.length).toBe(1);
    expect(ok(computeDose(reg('ibuprofen', 'fever'), 100, 50, 120)).doseMg).toEqual([250, 400]);
  });

  it('amoxicillin AOM 12 kg: 80–90 mg/kg/day ÷ 2 → 480–540 mg/dose', () => {
    const r = ok(computeDose(reg('amoxicillin', 'aom'), 250, 12, 24));
    expect(r.dayMg).toEqual([960, 1080]);
    expect(r.doseMg).toEqual([480, 540]);
    expect(r.doseMl).toEqual([9.6, 10.8]);
  });

  it('amoxicillin pneumonia respects 4 g/day cap', () => {
    const r = ok(computeDose(reg('amoxicillin', 'cap'), 400, 60, 144));
    expect(r.dayMg).toEqual([4000, 4000]);
    expect(r.doseMg).toEqual([2000, 2000]);
  });

  it('cefixime 15 kg once daily = 120 mg = 6 ml of 100mg/5ml', () => {
    const r = ok(computeDose(reg('cefixime', 'once'), 100, 15, 48));
    expect(r.doseMg).toEqual([120, 120]);
    expect(r.doseMl).toEqual([6, 6]);
  });

  it('age-based cetirizine: 3 yrs → 2.5 mg; 8 yrs → 5–10 mg; 1 yr → error', () => {
    expect(ok(computeDose(reg('cetirizine', 'allergy'), 5, null, 36)).doseMg).toEqual([2.5, 2.5]);
    expect(ok(computeDose(reg('cetirizine', 'allergy'), 5, null, 96)).doseMl).toEqual([5, 10]);
    expect('error' in computeDose(reg('cetirizine', 'allergy'), 5, null, 12)).toBe(true);
  });

  it('ondansetron weight bands: 15 kg → 2 mg, 15.5 kg → 4 mg, 7 kg → error', () => {
    expect(ok(computeDose(reg('ondansetron', 'ge'), 4, 15, null)).doseMg).toEqual([2, 2]);
    expect(ok(computeDose(reg('ondansetron', 'ge'), 4, 15.5, null)).doseMg).toEqual([4, 4]);
    expect('error' in computeDose(reg('ondansetron', 'ge'), 4, 7, null)).toBe(true);
  });

  it('metronidazole amoebiasis caps at 750 mg/dose', () => {
    const r = ok(computeDose(reg('metronidazole', 'amoeba'), 200, 60, 144));
    expect(r.doseMg[1]).toBe(750);
  });

  it('requires weight for weight-based regimens', () => {
    expect(computeDose(reg('amoxicillin', 'mild'), 250, null, 24)).toEqual({ error: 'أدخل وزن الطفل' });
  });
});

describe('findSyrupDrug', () => {
  const med = (nameEn: string, nameAr = '') => ({ nameEn, nameAr, activeIngredient: '', scientificName: '', category: '' });
  it('matches syrups only', () => {
    expect(findSyrupDrug(med('Amoxil 250mg/5ml susp'))?.id).toBe('amoxicillin');
    expect(findSyrupDrug(med('Amoxil 500mg caps'))).toBeNull();
  });
  it('routes augmentin away from plain amoxicillin', () => {
    expect(findSyrupDrug(med('Augmentin 457 susp'))?.id).toBe('augmentin');
    expect(findSyrupDrug(med('Amoxicillin clavulanate syrup'))?.id).toBe('augmentin');
  });
  it('keeps loratadine / desloratadine and cetirizine / levocetirizine apart', () => {
    expect(findSyrupDrug(med('Aerius desloratadine syrup'))?.id).toBe('desloratadine');
    expect(findSyrupDrug(med('Claritine loratadine syrup'))?.id).toBe('loratadine');
    expect(findSyrupDrug(med('Levocetirizine syrup'))).toBeNull();
  });
  it('matches Arabic names', () => {
    expect(findSyrupDrug(med('', 'شراب باراسيتامول 120'))?.id).toBe('paracetamol');
  });
});

describe('detectConcentration', () => {
  it('reads mg/5ml from name when it is a known strength', () => {
    expect(detectConcentration(SYRUP_DRUGS.find(d => d.id === 'amoxicillin')!, 'Amoxil 250 mg / 5 ml')).toBe(250);
    expect(detectConcentration(SYRUP_DRUGS.find(d => d.id === 'amoxicillin')!, 'Amoxil 333mg/5ml')).toBeNull();
  });
});
