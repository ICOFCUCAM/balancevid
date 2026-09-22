/**
 * The article as Markdown.  [Doctrine U-14]
 *
 * The citable form: quotable in text, diffable, and readable where video is
 * not -- in a search result, an email, a footnote, a court filing.
 */

import { formatTimecode } from '../domain/time.js';
import type { Article, ArticleExchange } from './types.js';

export function renderMarkdown(article: Article): string {
  const lines: string[] = [];

  lines.push(`# ${article.title}`, '');
  lines.push(`> ${article.attribution}`, '');
  lines.push(
    `${article.stats.exchanges} exchange${article.stats.exchanges === 1 ? '' : 's'}` +
    ` · source runs ${formatTimecode(article.source.durationFrames)}` +
    ` · ${Math.round(article.stats.sourceRatio * 100)}% of the finished video is source material`,
    '',
  );
  lines.push('---', '');

  for (const exchange of article.exchanges) {
    lines.push(...exchangeMarkdown(exchange));
  }

  lines.push('---', '', '## How this was made', '');
  if (article.provenance.transcriptionEngine) {
    lines.push(
      `Transcribed with \`${article.provenance.transcriptionEngine}\`` +
      (article.provenance.transcriptionModel ? ` (${article.provenance.transcriptionModel})` : '') +
      (article.provenance.transcriptVersion ? `, transcript v${article.provenance.transcriptVersion}` : '') +
      '.',
      '',
    );
  }
  for (const note of article.provenance.notes) lines.push(`- ${note}`);
  lines.push('', `_Generated ${article.generatedAt.slice(0, 10)} from conversation \`${article.conversationId}\`._`, '');

  return lines.join('\n');
}

function exchangeMarkdown(exchange: ArticleExchange): string[] {
  const lines: string[] = [];
  lines.push(`## ${exchange.index}. ${titleCase(exchange.typeLabel)} — ${exchange.timecode}`, '');

  if (exchange.claim) {
    lines.push('**The claim**', '');
    lines.push(`> ${exchange.claim.text}`, '');
    lines.push(`<small>Source at ${exchange.claim.timecode}</small>`, '');
  } else if (exchange.context) {
    lines.push('**At this point the source says**', '');
    lines.push(`> ${exchange.context}`, '');
  }

  lines.push('**The response**', '');
  if (exchange.response.text) {
    lines.push(exchange.response.text, '');
  } else {
    lines.push(
      `_${formatTimecode(exchange.response.durationFrames)} of spoken response; no transcript available._`,
      '',
    );
  }

  if (exchange.citations?.length) {
    lines.push('**Evidence**', '');
    for (const citation of exchange.citations) {
      const parts: string[] = [citation.url ? `[${citation.title}](${citation.url})` : citation.title];
      if (citation.page !== undefined) parts.push(`p. ${citation.page}`);
      parts.push(`retrieved ${citation.retrievedAt.slice(0, 10)}`);
      if (citation.contentHash) parts.push(`sha256 \`${citation.contentHash.slice(0, 12)}\``);
      if (!citation.archived) parts.push('**not archived**');
      lines.push(`- ${parts.join(' · ')}`);
      if (citation.quote) lines.push(`  > ${citation.quote}`);
    }
    lines.push('');
  }

  if (exchange.outputTimecode) {
    lines.push(`<small>In the finished video at ${exchange.outputTimecode}</small>`, '');
  }
  return lines;
}

function titleCase(label: string): string {
  return label.charAt(0) + label.slice(1).toLocaleLowerCase();
}
