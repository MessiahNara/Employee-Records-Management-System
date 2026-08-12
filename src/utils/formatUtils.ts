export function formatEmployeeNameForFolder(firstName: string, lastName: string, middleName?: string | null): string {
  let surname = lastName.trim().toUpperCase();
  let first = firstName.trim().toUpperCase();
  const middle = middleName ? middleName.trim().toUpperCase() : '';

  let suffix = '';
  const suffixRegex = /(?:,|\s)+(JR\.?|SR\.?|I{2,3}|IV|V|VI{1,3})$/i;

  let match = surname.match(suffixRegex);
  if (match) {
    let rawSuffix = match[1].toUpperCase();
    if (['JR', 'JR.', 'SR', 'SR.'].includes(rawSuffix)) {
      suffix = rawSuffix.replace(/\.?$/, '.');
    } else {
      suffix = rawSuffix;
    }
    surname = surname.replace(suffixRegex, '').trim();
  } else {
    match = first.match(suffixRegex);
    if (match) {
      let rawSuffix = match[1].toUpperCase();
      if (['JR', 'JR.', 'SR', 'SR.'].includes(rawSuffix)) {
        suffix = rawSuffix.replace(/\.?$/, '.');
      } else {
        suffix = rawSuffix;
      }
      first = first.replace(suffixRegex, '').trim();
    }
  }

  let formatted = surname;
  if (suffix) {
    formatted += `, ${suffix}`;
  }
  formatted += `, ${first}`;
  if (middle) {
    formatted += ` ${middle}`;
  }
  return formatted;
}
