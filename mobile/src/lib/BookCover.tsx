import type { Book } from "@ereader/shared";
import { useEffect, useState } from "react";
import { Image, StyleSheet, Text, View, type ViewStyle } from "react-native";

import { coverColor } from "./library";
import { loadCover } from "./coverCache";

/** Real cover when the server has one, otherwise a coloured title tile. */
export default function BookCover({ book, style }: { book: Book; style: ViewStyle }) {
  const [uri, setUri] = useState<string | null>(null);

  useEffect(() => {
    let alive = true;
    setUri(null);
    void loadCover(book).then((u) => alive && setUri(u));
    return () => {
      alive = false;
    };
  }, [book]);

  return (
    <View style={[style, styles.base, { backgroundColor: coverColor(book.title) }]}>
      {uri ? (
        <Image
          source={{ uri }}
          style={StyleSheet.absoluteFill}
          resizeMode="cover"
          accessibilityLabel={`Cover of ${book.title}`}
        />
      ) : (
        <Text style={styles.text} numberOfLines={4}>
          {book.title}
        </Text>
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  base: { overflow: "hidden", justifyContent: "center", padding: 6 },
  text: { color: "#fff", fontSize: 10, fontWeight: "700" },
});
