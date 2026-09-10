const OPTION_PREFIX = /^\s*[A-D][.、．]\s*/i;

export function formatChoiceOption(option: string): string {
  const withoutPrefix = option.replace(OPTION_PREFIX, '').trim();
  const markdownCode = withoutPrefix.match(/^`([^`]*)`$/);
  return markdownCode ? markdownCode[1] : withoutPrefix;
}
