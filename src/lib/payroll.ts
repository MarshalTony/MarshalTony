/**
 * Uganda statutory deductions (resident individual, monthly). Confirm each financial year with URA / NSSF.
 *  PAYE: 0–235,000: nil · 235,001–335,000: 10% of excess over 235,000 ·
 *        335,001–410,000: 10,000 + 20% of excess over 335,000 ·
 *        above 410,000: 25,000 + 30% of excess over 410,000, plus 10% of income above 10,000,000.
 *  NSSF: employee 5% of gross (employer contributes a further 10%, not deducted from pay).
 */
export function payeMonthly(gross: number): number {
  let tax = 0;
  if (gross <= 235_000) tax = 0;
  else if (gross <= 335_000) tax = (gross - 235_000) * 0.1;
  else if (gross <= 410_000) tax = 10_000 + (gross - 335_000) * 0.2;
  else tax = 25_000 + (gross - 410_000) * 0.3;
  if (gross > 10_000_000) tax += (gross - 10_000_000) * 0.1;
  return Math.round(tax);
}

export const NSSF_EMPLOYEE_RATE = 0.05;
export const NSSF_EMPLOYER_RATE = 0.1;
export function nssfEmployee(gross: number) {
  return Math.round(gross * NSSF_EMPLOYEE_RATE);
}
