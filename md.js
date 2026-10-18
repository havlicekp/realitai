// Minimální Markdown renderer pro DD reporty (vše escapováno).
const MD = (() => {
  const esc = s => s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
  function inline(s) {
    s = esc(s);
    s = s.replace(/`([^`]+)`/g, '<code>$1</code>');
    s = s.replace(/\*\*([^*]+)\*\*/g, '<strong>$1</strong>');
    s = s.replace(/(^|[^*\w])\*([^*\s][^*]*?)\*(?!\w)/g, '$1<em>$2</em>');
    s = s.replace(/\[([^\]]+)\]\((https?:[^)\s]+)\)/g, '<a href="$2" target="_blank" rel="noopener">$1</a>');
    s = s.replace(/(^|[\s(])(https?:\/\/[^\s<)]+)/g, '$1<a href="$2" target="_blank" rel="noopener">$2</a>');
    return s;
  }
  const LIST = /^\s*([-*+]|\d+[.)])\s+/;
  function render(md) {
    const L = md.replace(/\r/g, '').split('\n');
    const out = [];
    let i = 0;
    while (i < L.length) {
      const l = L[i];
      let m;
      if (/^```/.test(l)) {
        const buf = []; i++;
        while (i < L.length && !/^```\s*$/.test(L[i])) buf.push(L[i++]); // uzavírá jen ``` bez označení jazyka
        i++; out.push('<pre><code>' + esc(buf.join('\n')) + '</code></pre>'); continue;
      }
      if ((m = l.match(/^(#{1,6})\s+(.*)$/))) { out.push(`<h${m[1].length}>${inline(m[2])}</h${m[1].length}>`); i++; continue; }
      if (/^\s*(-{3,}|\*{3,})\s*$/.test(l)) { out.push('<hr>'); i++; continue; }
      if (/^\s*\|/.test(l) && i + 1 < L.length && /^\s*\|?\s*:?-{2,}/.test(L[i + 1])) {
        const rows = [];
        while (i < L.length && /^\s*\|/.test(L[i])) rows.push(L[i++]);
        const cells = r => r.trim().replace(/^\||\|$/g, '').split('|').map(c => c.trim());
        const head = cells(rows[0]), body = rows.slice(2).map(cells);
        out.push('<div class="md-table"><table><thead><tr>' + head.map(c => '<th>' + inline(c) + '</th>').join('') + '</tr></thead><tbody>' +
          body.map(r => '<tr>' + r.map(c => '<td>' + inline(c) + '</td>').join('') + '</tr>').join('') + '</tbody></table></div>');
        continue;
      }
      if (LIST.test(l)) {
        const ordered = /^\s*\d/.test(l), items = [];
        while (i < L.length && LIST.test(L[i])) {
          let it = L[i].replace(LIST, ''); i++;
          while (i < L.length && /^\s{2,}\S/.test(L[i]) && !LIST.test(L[i])) it += ' ' + L[i++].trim();
          items.push(it);
        }
        out.push((ordered ? '<ol>' : '<ul>') + items.map(x => '<li>' + inline(x) + '</li>').join('') + (ordered ? '</ol>' : '</ul>'));
        continue;
      }
      if (/^>\s?/.test(l)) {
        const buf = [];
        while (i < L.length && /^>\s?/.test(L[i])) buf.push(L[i++].replace(/^>\s?/, ''));
        out.push('<blockquote>' + render(buf.join('\n')) + '</blockquote>'); continue;
      }
      if (!l.trim()) { i++; continue; }
      const buf = [];
      while (i < L.length && L[i].trim() && !/^(#{1,6}\s|```|>)/.test(L[i]) && !LIST.test(L[i]) && !/^\s*\|/.test(L[i])) buf.push(L[i++]);
      if (!buf.length) buf.push(L[i++]);
      out.push('<p>' + inline(buf.join(' ')) + '</p>');
    }
    return out.join('\n');
  }
  return { render };
})();
if (typeof self !== 'undefined') self.MD = MD;
