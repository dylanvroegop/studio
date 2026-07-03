const SENTENCE_START_PATTERN = /(^|[.!?]\s+|\n+\s*)([a-zà-öø-ÿ])/g;

export function capitalizeSentenceStarts(value: string): string {
  return value.replace(SENTENCE_START_PATTERN, (_, prefix: string, letter: string) => {
    return `${prefix}${letter.toUpperCase()}`;
  });
}
