export function numberToWords(num: number): string {
  if (num === 0) return "ZERO ONLY";
  
  const a = ['', 'ONE ', 'TWO ', 'THREE ', 'FOUR ', 'FIVE ', 'SIX ', 'SEVEN ', 'EIGHT ', 'NINE ', 'TEN ', 'ELEVEN ', 'TWELVE ', 'THIRTEEN ', 'FOURTEEN ', 'FIFTEEN ', 'SIXTEEN ', 'SEVENTEEN ', 'EIGHTEEN ', 'NINETEEN '];
  const b = ['', '', 'TWENTY', 'THIRTY', 'FORTY', 'FIFTY', 'SIXTY', 'SEVENTY', 'EIGHTY', 'NINETY'];
  
  const n = ('000000000' + num.toFixed(2).split('.')[0]).substr(-9).match(/^(\d{2})(\d{2})(\d{2})(\d{1})(\d{2})$/);
  if (!n) return "";
  
  let str = '';
  // Convert standard Western millions/thousands (since we used 000,000,000)
  // Actually the regex matches:
  // n[1]: 10 millions
  // n[2]: 100 thousands
  // n[3]: thousands
  // n[4]: hundreds
  // n[5]: tens & units
  // Wait, let's just use millions instead of Lakh/Crore
  // Better regex for 000,000,000 is /^(\d{3})(\d{3})(\d{3})$/ but let's do a simple one:
  const mil = Math.floor(num / 1000000);
  const thou = Math.floor((num % 1000000) / 1000);
  const rest = Math.floor(num % 1000);

  function convertGroup(n: number): string {
    let res = '';
    const h = Math.floor(n / 100);
    const r = n % 100;
    if (h > 0) res += a[h] + 'HUNDRED ';
    if (r > 0) {
      if (h > 0) res += 'AND ';
      if (r < 20) res += a[r];
      else {
        res += b[Math.floor(r / 10)] + ' ';
        if (r % 10 > 0) res += a[r % 10];
      }
    }
    return res;
  }

  if (mil > 0) str += convertGroup(mil) + 'MILLION ';
  if (thou > 0) str += convertGroup(thou) + 'THOUSAND ';
  if (rest > 0) str += convertGroup(rest);

  const cents = parseInt(num.toFixed(2).split('.')[1]);
  let centsStr = '';
  if (cents > 0) {
    centsStr = ' AND CENTS ' + convertGroup(cents);
  }
  
  return 'RINGGIT MALAYSIA ' + (str + centsStr).trim() + ' ONLY';
}
