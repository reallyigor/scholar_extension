'use strict';

const {
  getArxivId,
  escapeHtml,
  authorLabel,
  paperUrl,
  extractTopCiting,
  mergeAuthorPapers,
} = require('../utils.js');

// ── getArxivId ──────────────────────────────────────────────────────────────

describe('getArxivId', () => {
  test('parses a standard /abs/ URL', () => {
    expect(getArxivId('https://arxiv.org/abs/2301.00001')).toBe('2301.00001');
  });

  test('ignores version suffix on /abs/ URL', () => {
    expect(getArxivId('https://arxiv.org/abs/2301.00001v2')).toBe('2301.00001');
    expect(getArxivId('https://arxiv.org/abs/2301.00001v10')).toBe('2301.00001');
  });

  test('parses a 5-digit arXiv ID', () => {
    expect(getArxivId('https://arxiv.org/abs/2405.12345')).toBe('2405.12345');
  });

  test('parses an /html/ URL', () => {
    expect(getArxivId('https://arxiv.org/html/2301.00001v1')).toBe('2301.00001');
  });

  test('returns null for a non-arXiv URL', () => {
    expect(getArxivId('https://google.com')).toBeNull();
  });

  test('returns null for an arXiv search URL (no ID)', () => {
    expect(getArxivId('https://arxiv.org/search/')).toBeNull();
  });

  test('parses a /pdf/ URL without version or extension', () => {
    expect(getArxivId('https://arxiv.org/pdf/2301.00001')).toBe('2301.00001');
  });

  test('parses a /pdf/ URL with version suffix', () => {
    expect(getArxivId('https://arxiv.org/pdf/2410.12557v3')).toBe('2410.12557');
  });

  test('parses a /pdf/ URL with .pdf extension', () => {
    expect(getArxivId('https://arxiv.org/pdf/2301.00001.pdf')).toBe('2301.00001');
  });

  test('parses a /pdf/ URL with version and .pdf extension', () => {
    expect(getArxivId('https://arxiv.org/pdf/2301.00001v2.pdf')).toBe('2301.00001');
  });

  test('returns null for null/undefined input', () => {
    expect(getArxivId(null)).toBeNull();
    expect(getArxivId(undefined)).toBeNull();
  });

  test('returns null for non-string input', () => {
    expect(getArxivId(42)).toBeNull();
  });
});

// ── escapeHtml ──────────────────────────────────────────────────────────────

describe('escapeHtml', () => {
  test('escapes ampersand', () => {
    expect(escapeHtml('A & B')).toBe('A &amp; B');
  });

  test('escapes less-than and greater-than', () => {
    expect(escapeHtml('<script>')).toBe('&lt;script&gt;');
  });

  test('escapes double quotes', () => {
    expect(escapeHtml('"quoted"')).toBe('&quot;quoted&quot;');
  });

  test('escapes single quotes', () => {
    expect(escapeHtml("it's")).toBe('it&#39;s');
  });

  test('leaves plain text unchanged', () => {
    expect(escapeHtml('Hello World')).toBe('Hello World');
  });

  test('handles an XSS payload', () => {
    const xss = '<img src=x onerror="alert(1)">';
    expect(escapeHtml(xss)).not.toContain('<');
    expect(escapeHtml(xss)).not.toContain('>');
  });

  test('coerces non-string to string', () => {
    expect(escapeHtml(42)).toBe('42');
  });

  test('handles empty string', () => {
    expect(escapeHtml('')).toBe('');
  });
});

// ── authorLabel ─────────────────────────────────────────────────────────────

describe('authorLabel', () => {
  test('returns empty string when no authors', () => {
    expect(authorLabel({ authors: [] })).toBe('');
  });

  test('returns single author name', () => {
    expect(authorLabel({ authors: [{ name: 'Alice' }] })).toBe('Alice');
  });

  test('joins two authors with comma', () => {
    expect(authorLabel({ authors: [{ name: 'Alice' }, { name: 'Bob' }] })).toBe('Alice, Bob');
  });

  test('uses "et al." for three or more authors', () => {
    const paper = { authors: [{ name: 'Alice' }, { name: 'Bob' }, { name: 'Carol' }] };
    expect(authorLabel(paper)).toBe('Alice et al.');
  });

  test('handles missing authors field', () => {
    expect(authorLabel({})).toBe('');
    expect(authorLabel(null)).toBe('');
  });

  test('skips authors with falsy name', () => {
    const paper = { authors: [{ name: '' }, { name: 'Bob' }] };
    expect(authorLabel(paper)).toBe('Bob');
  });
});

// ── paperUrl ────────────────────────────────────────────────────────────────

describe('paperUrl', () => {
  test('prefers arXiv URL when ArXiv external ID is present', () => {
    const paper = {
      paperId: 'abc123',
      externalIds: { ArXiv: '2301.00001', DOI: '10.1234/test' },
    };
    expect(paperUrl(paper)).toBe('https://arxiv.org/abs/2301.00001');
  });

  test('falls back to DOI URL when no ArXiv ID', () => {
    const paper = { paperId: 'abc123', externalIds: { DOI: '10.1234/test' } };
    expect(paperUrl(paper)).toBe('https://doi.org/10.1234/test');
  });

  test('falls back to Semantic Scholar URL when no external IDs', () => {
    const paper = { paperId: 'abc123', externalIds: {} };
    expect(paperUrl(paper)).toBe('https://www.semanticscholar.org/paper/abc123');
  });

  test('falls back to Semantic Scholar URL when externalIds is absent', () => {
    const paper = { paperId: 'abc123' };
    expect(paperUrl(paper)).toBe('https://www.semanticscholar.org/paper/abc123');
  });

  test('returns # for null input', () => {
    expect(paperUrl(null)).toBe('#');
  });
});

// ── extractTopCiting ────────────────────────────────────────────────────────

describe('extractTopCiting', () => {
  const makePaper = (id, cites) => ({ paperId: id, citationCount: cites, title: `Paper ${id}` });

  function makeResponse(papers) {
    return { data: papers.map(p => ({ citingPaper: p })) };
  }

  test('returns top 5 sorted by citation count', () => {
    const papers = [
      makePaper('a', 10),
      makePaper('b', 50),
      makePaper('c', 30),
      makePaper('d', 5),
      makePaper('e', 80),
      makePaper('f', 20),
    ];
    const result = extractTopCiting(makeResponse(papers), 5);
    expect(result).toHaveLength(5);
    expect(result[0].paperId).toBe('e'); // 80
    expect(result[1].paperId).toBe('b'); // 50
    expect(result[2].paperId).toBe('c'); // 30
  });

  test('excludes papers with null citationCount', () => {
    const papers = [
      makePaper('a', 10),
      { paperId: 'x', citationCount: null, title: 'No count' },
    ];
    const result = extractTopCiting(makeResponse(papers), 5);
    expect(result).toHaveLength(1);
    expect(result[0].paperId).toBe('a');
  });

  test('returns fewer than limit when not enough papers', () => {
    const papers = [makePaper('a', 10), makePaper('b', 5)];
    const result = extractTopCiting(makeResponse(papers), 5);
    expect(result).toHaveLength(2);
  });

  test('handles empty data array', () => {
    expect(extractTopCiting({ data: [] }, 5)).toEqual([]);
  });

  test('handles null / missing data', () => {
    expect(extractTopCiting(null, 5)).toEqual([]);
    expect(extractTopCiting({}, 5)).toEqual([]);
  });

  test('respects custom limit', () => {
    const papers = Array.from({ length: 10 }, (_, i) => makePaper(`p${i}`, i));
    expect(extractTopCiting(makeResponse(papers), 3)).toHaveLength(3);
  });
});

// ── mergeAuthorPapers ───────────────────────────────────────────────────────

describe('mergeAuthorPapers', () => {
  const makePaper = (id, cites) => ({ paperId: id, citationCount: cites, title: `Paper ${id}` });

  test('deduplicates papers that appear in multiple author lists', () => {
    const sharedPaper = makePaper('shared', 100);
    const list1 = [sharedPaper, makePaper('a', 50)];
    const list2 = [sharedPaper, makePaper('b', 30)];
    const result = mergeAuthorPapers([list1, list2], 'other', 5);
    // 'shared' should appear only once
    expect(result.filter(p => p.paperId === 'shared')).toHaveLength(1);
    expect(result).toHaveLength(3); // shared, a, b
  });

  test('excludes the current paper (excludePaperId)', () => {
    const current = makePaper('current', 999);
    const list = [current, makePaper('other', 10)];
    const result = mergeAuthorPapers([list], 'current', 5);
    expect(result.find(p => p.paperId === 'current')).toBeUndefined();
    expect(result).toHaveLength(1);
  });

  test('excludes papers with null citationCount', () => {
    const list = [
      makePaper('a', 10),
      { paperId: 'b', citationCount: null, title: 'No count' },
    ];
    const result = mergeAuthorPapers([list], null, 5);
    expect(result).toHaveLength(1);
    expect(result[0].paperId).toBe('a');
  });

  test('sorts by citation count descending', () => {
    const list1 = [makePaper('a', 5),  makePaper('b', 50)];
    const list2 = [makePaper('c', 20), makePaper('d', 100)];
    const result = mergeAuthorPapers([list1, list2], null, 5);
    expect(result[0].paperId).toBe('d'); // 100
    expect(result[1].paperId).toBe('b'); // 50
    expect(result[2].paperId).toBe('c'); // 20
  });

  test('respects the limit', () => {
    const list = Array.from({ length: 20 }, (_, i) => makePaper(`p${i}`, i));
    expect(mergeAuthorPapers([list], null, 5)).toHaveLength(5);
  });

  test('handles empty author lists', () => {
    expect(mergeAuthorPapers([], null, 5)).toEqual([]);
    expect(mergeAuthorPapers([[]], null, 5)).toEqual([]);
  });

  test('handles papers without paperId gracefully (skipped)', () => {
    const list = [
      { citationCount: 10, title: 'No ID' }, // no paperId
      makePaper('valid', 5),
    ];
    const result = mergeAuthorPapers([list], null, 5);
    expect(result).toHaveLength(1);
    expect(result[0].paperId).toBe('valid');
  });
});
