import { clsx, type ClassValue } from 'clsx'
import { twMerge } from 'tailwind-merge'

export function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs))
}

export function formatError(error: any): string {
  if (!error) return '';
  if (typeof error === 'string') return error;
  if (typeof error === 'object') {
    return error.message || error.code || JSON.stringify(error);
  }
  return String(error);
}
