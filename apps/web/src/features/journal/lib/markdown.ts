function escapeHtml(value: string) {
  return value
    .replaceAll('&', '&amp;')
    .replaceAll('<', '&lt;')
    .replaceAll('>', '&gt;')
    .replaceAll('"', '&quot;')
    .replaceAll("'", '&#39;');
}

function formatInlineMarkdown(value: string) {
  return escapeHtml(value)
    .replace(/`([^`]+)`/g, '<code>$1</code>')
    .replace(/\*\*([^*]+)\*\*/g, '<strong>$1</strong>')
    .replace(/(^|[^*])\*([^*\n]+)\*(?!\*)/g, '$1<em>$2</em>');
}

export function renderJournalMarkdown(content: string) {
  const blocks: string[] = [];
  const paragraphLines: string[] = [];
  const listItems: string[] = [];

  const flushParagraph = () => {
    if (paragraphLines.length === 0) {
      return;
    }

    blocks.push(`<p>${paragraphLines.map(formatInlineMarkdown).join('<br />')}</p>`);
    paragraphLines.length = 0;
  };

  const flushList = () => {
    if (listItems.length === 0) {
      return;
    }

    blocks.push(
      `<ul>${listItems.map((item) => `<li>${formatInlineMarkdown(item)}</li>`).join('')}</ul>`,
    );
    listItems.length = 0;
  };

  for (const rawLine of content.trim().split('\n')) {
    const line = rawLine.trim();

    if (!line) {
      flushParagraph();
      flushList();
      continue;
    }

    // Check h3 before h2 so that "### " doesn't partially match "## ".
    // h1 ("# ") is intentionally unsupported because the entry title
    // already occupies that heading level in the detail view.
    if (line.startsWith('### ')) {
      flushParagraph();
      flushList();
      blocks.push(`<h3>${formatInlineMarkdown(line.slice(4))}</h3>`);
      continue;
    }

    if (line.startsWith('## ')) {
      flushParagraph();
      flushList();
      blocks.push(`<h2>${formatInlineMarkdown(line.slice(3))}</h2>`);
      continue;
    }

    if (line.startsWith('- ')) {
      flushParagraph();
      listItems.push(line.slice(2));
      continue;
    }

    flushList();
    paragraphLines.push(line);
  }

  flushParagraph();
  flushList();

  return blocks.join('');
}
