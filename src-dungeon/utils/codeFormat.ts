// 轻量 C++ 代码格式化：题库里的 code 字段有的被压成一行，有的已格式化。
// - 单行代码：按 ; {} 断行 + 缩进（for 循环内的分号受保护）
// - 多行代码：只规范化缩进层级，不再断行（避免破坏原有换行和字符串字面量）
export function formatCppCode(raw: string): string {
  if (!raw) return '';

  // 多行代码：只规范化缩进，保留原有断行
  if (raw.includes('\n')) {
    let indent = 0;
    return raw
      .split('\n')
      .map((line) => {
        const trimmed = line.trim();
        if (!trimmed) return '';
        if (trimmed.startsWith('}')) indent = Math.max(0, indent - 1);
        const result = '  '.repeat(indent) + trimmed;
        if (trimmed.endsWith('{')) indent++;
        return result;
      })
      .filter(Boolean)
      .join('\n');
  }

  // 单行代码：断行 + 缩进
  // 保护 for(...) 内的分号
  const fors: string[] = [];
  let s = raw.replace(/for\s*\([^)]*\)/g, (m) => {
    fors.push(m);
    return `__FOR_PLACEHOLDER_${fors.length - 1}__`;
  });

  s = s.replace(/;/g, ';\n');
  s = s.replace(/{/g, '{\n');
  s = s.replace(/}/g, '\n}');

  s = s.replace(/__FOR_PLACEHOLDER_(\d+)__/g, (_, i) => fors[+i]);

  let indent = 0;
  return s
    .split('\n')
    .map((line) => {
      const trimmed = line.trim();
      if (!trimmed) return '';
      if (trimmed.startsWith('}')) indent = Math.max(0, indent - 1);
      const result = '  '.repeat(indent) + trimmed;
      if (trimmed.endsWith('{')) indent++;
      return result;
    })
    .filter(Boolean)
    .join('\n');
}
