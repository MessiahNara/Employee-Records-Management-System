/**
 * Date utility functions for consistent date formatting
 */

/**
 * Format a date string to DD/MM/YYYY format
 * @param dateString - ISO date string or Date object
 * @returns Formatted date string in DD/MM/YYYY format
 */
export function formatDateDDMMYYYY(dateString: string | Date | null | undefined): string {
  if (!dateString) return '—';
  if (typeof dateString === 'string' && dateString.trim().toLowerCase() === 'until revoked') {
    return 'Until revoked';
  }

  try {
    const date = new Date(dateString);
    if (isNaN(date.getTime())) return '—';
    if (date.getFullYear() === 9999) return 'Until revoked';

    const day = String(date.getDate()).padStart(2, '0');
    const month = String(date.getMonth() + 1).padStart(2, '0');
    const year = date.getFullYear();

    return `${day}/${month}/${year}`;
  } catch (error) {
    console.error('Error formatting date:', error);
    return '—';
  }
}

/**
 * Format a date string to MM/DD/YYYY format (M/D/Y)
 * @param dateString - ISO date string or Date object
 * @returns Formatted date string in MM/DD/YYYY format
 */
export function formatDateMDY(dateString: string | Date | null | undefined): string {
  if (!dateString) return '—';
  if (typeof dateString === 'string' && dateString.trim().toLowerCase() === 'until revoked') {
    return 'Until revoked';
  }

  try {
    const date = new Date(dateString);
    if (isNaN(date.getTime())) return '—';
    if (date.getFullYear() === 9999) return 'Until revoked';

    const month = String(date.getMonth() + 1).padStart(2, '0');
    const day = String(date.getDate()).padStart(2, '0');
    const year = date.getFullYear();

    return `${month}/${day}/${year}`;
  } catch (error) {
    console.error('Error formatting date:', error);
    return '—';
  }
}

/**
 * Format a date string to "MONTH DD, YYYY" format (e.g. JANUARY 30, 2026)
 * @param dateString - ISO date string or Date object
 * @returns Formatted date string in long month uppercase format
 */
export function formatDateLong(dateString: string | Date | null | undefined): string {
  if (!dateString) return '—';

  try {
    const date = new Date(dateString);
    if (isNaN(date.getTime())) return '—';
    if (date.getFullYear() === 9999) return 'Until revoked';

    return date.toLocaleDateString('en-US', {
      month: 'long',
      day: 'numeric',
      year: 'numeric',
    }).toUpperCase(); // → JANUARY 30, 2026
  } catch (error) {
    console.error('Error formatting date:', error);
    return '—';
  }
}

/**
 * Convert ISO date string or Date object to YYYY-MM-DD format for HTML date inputs
 * @param date - ISO date string or Date object
 * @returns Date string in YYYY-MM-DD format
 */
export function convertToDateInputFormat(date: string | Date | null | undefined): string {
  if (!date) return '';

  try {
    const dateObj = new Date(date);
    if (isNaN(dateObj.getTime())) return '';

    if (dateObj.getFullYear() === 9999) {
      return 'Until revoked';
    }

    const year = dateObj.getFullYear();
    const month = String(dateObj.getMonth() + 1).padStart(2, '0');
    const day = String(dateObj.getDate()).padStart(2, '0');

    return `${year}-${month}-${day}`;
  } catch (error) {
    console.error('Error converting date to input format:', error);
    return '';
  }
}
