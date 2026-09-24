import { describe, expect, it } from 'vitest';
import { slugify } from '../src/aggregate/slug.js';

describe('slugify', () => {
  it('lowercases and replaces spaces with hyphens', () => {
    expect(slugify('Quote Builder demo')).toBe('quote-builder-demo');
  });

  it('strips accents', () => {
    expect(slugify('Adrià Sánchez')).toBe('adria-sanchez');
  });

  it('collapses non-alphanumeric runs into a single hyphen', () => {
    expect(slugify('My Site!! (prod)')).toBe('my-site-prod');
  });

  it('trims leading/trailing hyphens', () => {
    expect(slugify('--Website--')).toBe('website');
  });
});
