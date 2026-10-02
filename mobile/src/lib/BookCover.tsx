import type { Book } from "@ereader/shared";
import { useState } from "react";
import { Image, StyleSheet, Text, View, type ViewStyle } from "react-native";

import { coverSource } from "../api/client";
import { coverColor } from "./library";

/** Real cover when the server has one, otherwise a coloured title tile. */
export default function BookCover({ book, style }: { book: Book; style: ViewStyle }) {
  const [failed, setFailed] = useState(false);
  const source = failed ? null : coverSource(book);
  return (
    <View style={[style, styles.base, { backgroundColor: coverColor(book.title) }]}>
      {source ? (
        <Image
          source={source}
          style={StyleSheet.absoluteFill}
          resizeMode="cover"
          onError={() => setFailed(true)}
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
