/**
 * Scholar Lens – pure utility functions.
 *
 * Uses a UMD-style wrapper so the same file works:
 *   • in the browser (content script) → window.ScholarLensUtils
 *   • in Node.js (Jest tests)         → module.exports
 */
(function (exports) {
  'use strict';

  // ── URL parsing ───────────────────────────────────────────────────────────

  /**
   * Extract the bare arXiv ID (no version) from any arXiv URL.
   * Returns null if the URL is not a recognised arXiv paper page.
   *
   * Supported patterns:
   *   https://arxiv.org/abs/2301.00001
   *   https://arxiv.org/abs/2301.00001v2
   *   https://arxiv.org/html/2405.12345v1
   *   https://arxiv.org/pdf/2301.00001v3
   *   https://arxiv.org/pdf/2301.00001.pdf
   *   https://arxiv.org/pdf/2301.00001v3.pdf
   */
  function getArxivId(url) {
    if (typeof url !== 'string') return null;
    // Capture the numeric ID only; version suffix and .pdf extension are ignored.
    const m = url.match(/arxiv\.org\/(?:abs|html|pdf)\/(\d{4}\.\d{4,5})/);
    if (!m) return null;
    return m[1];
  }

  // ── HTML escaping ─────────────────────────────────────────────────────────

  /** Escape the five HTML-significant characters to prevent XSS. */
  function escapeHtml(str) {
    return String(str)
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;')
      .replace(/'/g, '&#39;');
  }

  // ── Author label ──────────────────────────────────────────────────────────

  /**
   * Return a short author string for a paper object.
   * { authors: [{ name: '...' }, ...] }
   */
  function authorLabel(paper) {
    const names = ((paper && paper.authors) || []).map(a => a.name).filter(Boolean);
    if (names.length === 0) return '';
    if (names.length <= 2)  return names.join(', ');
    return `${names[0]} et al.`;
  }

  // ── Paper URL ─────────────────────────────────────────────────────────────

  /**
   * Choose the best URL for a paper in priority order:
   *   1. arXiv abstract page (if ArXiv external ID present)
   *   2. DOI redirect
   *   3. Semantic Scholar paper page
   */
  function paperUrl(paper) {
    if (!paper) return '#';
    if (paper.externalIds && paper.externalIds.ArXiv) {
      return `https://arxiv.org/abs/${paper.externalIds.ArXiv}`;
    }
    if (paper.externalIds && paper.externalIds.DOI) {
      return `https://doi.org/${paper.externalIds.DOI}`;
    }
    return `https://www.semanticscholar.org/paper/${paper.paperId || ''}`;
  }

  // ── Sorting / filtering helpers ───────────────────────────────────────────

  /**
   * Given a raw citations API response, return up to `limit` citing papers
   * sorted by citation count (descending), excluding papers without a count.
   *
   * @param {object}  data   – raw response: { data: [{ citingPaper: {...} }] }
   * @param {number}  limit
   */
  function extractTopCiting(data, limit) {
    limit = limit || 5;
    return ((data && data.data) || [])
      .map(edge => edge.citingPaper)
      .filter(p => p && p.citationCount != null)
      .sort((a, b) => b.citationCount - a.citationCount)
      .slice(0, limit);
  }

  /**
   * Merge and deduplicate papers from multiple author responses.
   * Excludes the current paper (by paperId) and papers with no citation count.
   * Returns up to `limit` papers sorted by citation count (descending).
   *
   * @param {Array<Array>} authorPaperLists – array of paper arrays (one per author)
   * @param {string}       excludePaperId
   * @param {number}       limit
   */
  function mergeAuthorPapers(authorPaperLists, excludePaperId, limit) {
    limit = limit || 5;
    const seen = new Set([excludePaperId].filter(Boolean));
    const unique = [];

    for (const papers of authorPaperLists) {
      for (const p of (papers || [])) {
        if (p.paperId && !seen.has(p.paperId) && p.citationCount != null) {
          seen.add(p.paperId);
          unique.push(p);
        }
      }
    }

    return unique
      .sort((a, b) => b.citationCount - a.citationCount)
      .slice(0, limit);
  }

  // ── Exports ───────────────────────────────────────────────────────────────

  exports.getArxivId       = getArxivId;
  exports.escapeHtml       = escapeHtml;
  exports.authorLabel      = authorLabel;
  exports.paperUrl         = paperUrl;
  exports.extractTopCiting = extractTopCiting;
  exports.mergeAuthorPapers = mergeAuthorPapers;

})(typeof module !== 'undefined' ? module.exports : (window.ScholarLensUtils = {}));
