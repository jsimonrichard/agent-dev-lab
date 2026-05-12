import { describe, expect, it } from 'bun:test';
import { renderPromptTemplate } from './render.js';

describe('renderPromptTemplate', () => {
  it('replaces known placeholders', () => {
    expect(renderPromptTemplate('Hello {{ name }}!', { name: 'Ada' })).toBe('Hello Ada!');
  });

  it('leaves unknown tokens unchanged', () => {
    expect(renderPromptTemplate('{{ unknown }}', {})).toBe('{{ unknown }}');
  });
});
