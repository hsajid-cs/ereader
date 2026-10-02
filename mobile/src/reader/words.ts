export interface Word {
  text: string;
  start: number;
  end: number;
}

/** Splits text into words (with trailing whitespace/punctuation kept attached) and global offsets. */
export function tokenizeWords(text: string, baseOffset: number): Word[] {
  const words: Word[] = [];
  const re = /\S+\s*/g;
  let m: RegExpExecArray | null;
  while ((m = re.exec(text))) {
    words.push({
      text: m[0],
      start: baseOffset + m.index,
      end: baseOffset + m.index + m[0].length,
    });
  }
  return words;
}

/** Bare word for dictionary lookup: strips surrounding punctuation. */
export function cleanWord(word: string): string {
  return word.replace(/^[^\p{L}\p{N}]+|[^\p{L}\p{N}]+$/gu, "").toLowerCase();
}
