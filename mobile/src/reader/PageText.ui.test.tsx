import { fireEvent, render, screen } from "@testing-library/react-native";

import PageText from "./PageText";

const page = { start: 0, end: 22, chapterIndex: 0, text: "Hello brave new world." };

test("renders words, highlights marked ones and reports presses", async () => {
  const onWordPress = jest.fn();
  const onWordLongPress = jest.fn();
  await render(
    <PageText
      page={page}
      marks={[{ id: "m", start: 6, end: 11, color: "#ff0", isNote: false }]}
      selection={null}
      color="#000"
      fontSize={18}
      lineHeight={1.5}
      onWordPress={onWordPress}
      onWordLongPress={onWordLongPress}
    />,
  );
  const word = screen.getByText("brave ");
  expect(word.props.style.backgroundColor).toBe("#ff0aa");
  await fireEvent.press(word);
  expect(onWordPress.mock.calls[0][0]).toMatchObject({ start: 6, end: 12 });
  await fireEvent(screen.getByText("Hello "), "longPress");
  expect(onWordLongPress).toHaveBeenCalledWith(expect.objectContaining({ start: 0 }));
});
