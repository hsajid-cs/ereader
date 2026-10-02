import { memo, useMemo } from "react";
import { Text, type GestureResponderEvent } from "react-native";

import type { Page } from "./types";
import { paragraphSpans, type Mark } from "./segments";
import { tokenizeWords, type Word } from "./words";

interface Props {
  page: Page;
  marks: Mark[];
  selection: { start: number; end: number } | null;
  color: string;
  fontSize: number;
  lineHeight: number;
  fontFamily?: string;
  onWordPress: (word: Word, e: GestureResponderEvent) => void;
  onWordLongPress: (word: Word) => void;
}

function PageText({
  page,
  marks,
  selection,
  color,
  fontSize,
  lineHeight,
  fontFamily,
  onWordPress,
  onWordLongPress,
}: Props) {
  const paragraphs = useMemo(
    () =>
      paragraphSpans(page.text, page.start).map((span) => ({
        span,
        words: tokenizeWords(span.text, span.start),
      })),
    [page.text, page.start],
  );

  return (
    <>
      {paragraphs.map(({ span, words }) => (
        <Text
          key={span.start}
          style={{
            color,
            fontSize,
            lineHeight: fontSize * lineHeight,
            fontFamily,
            marginBottom: fontSize * 0.5,
          }}
        >
          {words.map((w) => {
            const mark = [...marks].reverse().find((m) => m.start < w.end && m.end > w.start);
            const selected = !!selection && selection.start < w.end && selection.end > w.start;
            return (
              <Text
                key={w.start}
                onPress={(e) => onWordPress(w, e)}
                onLongPress={() => onWordLongPress(w)}
                style={{
                  backgroundColor: selected
                    ? "#4f8cff66"
                    : mark?.color
                      ? mark.color + "aa"
                      : undefined,
                  color: mark?.color ? "#111" : color,
                  textDecorationLine: mark?.isNote ? "underline" : "none",
                }}
              >
                {w.text}
              </Text>
            );
          })}
        </Text>
      ))}
    </>
  );
}

export default memo(PageText);
