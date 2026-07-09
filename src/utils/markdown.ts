import DOMPurify from 'dompurify';

// 把 gitee raw 等远程仓库图片链接 .../public/course-data/X 转为本地 /course-data/X，
// 避免依赖远程图床导致图片加载失败/原样显示 markdown。本地不存在则保留原 URL。
export function normalizeImageUrl(url: string): string {
  if (!url) return url;
  const m = String(url).match(/\/public\/(course-data\/[^?#)]+)/);
  return m ? '/' + m[1] : url;
}

export function escapeHtml(text: string): string {
  if (!text) return '';
  return text
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#039;');
}

// Render code text — code blocks use explicit <br> for line breaks
export function renderCodeText(text: string): { __html: string } {
  if (!text) return { __html: '' };
  let html = escapeHtml(text);

  // Replace ``` code blocks with <pre> — convert \n to <br> inside code
  html = html.replace(/```(\w*)\n([\s\S]*?)```/g, (_, _lang, code) => {
    const lines = code.split('\n').map((l: string) => l || ' '); // empty lines get a space
    return '<pre class="code-block"><code>' + lines.join('<br>') + '</code></pre>';
  });

  // Image syntax ![alt](url) — only outside <pre> blocks (skip if inside code)
  html = html.replace(/(<pre[\s\S]*?<\/pre>)|!\[([^\]]*)\]\(([^)]+)\)/g, (_match, pre, alt, url) => {
    if (pre) return pre; // inside <pre>, leave untouched
    return `<img src="${normalizeImageUrl(url)}" alt="${alt}" style="max-width:100%;border-radius:8px;margin:8px 0" />`;
  });

  // Replace newlines with <br> only in non-code parts (which are outside <pre>)
  html = html.replace(/\n/g, '<br>');

  // Inline code
  html = html.replace(/`([^`]+)`/g, '<code>$1</code>');

  return { __html: DOMPurify.sanitize(html) };
}

// Full markdown rendering for AI coach & course content
export function renderMarkdown(text: string): string {
  if (!text) return '';
  let html = escapeHtml(text);

  // Replace ``` code blocks with <pre> — convert \n to <br> inside code
  html = html.replace(/```(\w*)\n([\s\S]*?)```/g, (_, _lang, code) => {
    const lines = code.split('\n').map((l: string) => l || ' ');
    return '<pre class="code-block"><code>' + lines.join('<br>') + '</code></pre>';
  });

  html = html.replace(/`([^`]+)`/g, '<code>$1</code>');
  html = html.replace(/\*\*([^*]+)\*\*/g, '<strong>$1</strong>');
  html = html.replace(/\*([^*]+)\*/g, '<em>$1</em>');
  html = html.replace(/^### (.+)$/gm, '<h3>$1</h3>');
  html = html.replace(/^## (.+)$/gm, '<h2>$1</h2>');
  html = html.replace(/^# (.+)$/gm, '<h1>$1</h1>');
  html = html.replace(/^- (.+)$/gm, '<li>$1</li>');
  html = html.replace(/((?:<li>.*<\/li>\n?)+)/g, '<ul>$1</ul>');
  html = html.replace(/\n\n/g, '</p><p>');
  html = html.replace(/\n/g, '<br>');
  html = '<p>' + html + '</p>';
  html = html.replace(/<p><pre>/g, '<pre>').replace(/<\/pre><\/p>/g, '</pre>');
  return DOMPurify.sanitize(html);
}
