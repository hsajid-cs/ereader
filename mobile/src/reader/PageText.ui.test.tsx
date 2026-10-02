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

test("renders a figure page as an image from the book's image map", async () => {
  const figure = { start: 0, end: 10, chapterIndex: 0, text: "￼img0￼", figure: true };
  await render(
    <PageText
      page={figure}
      marks={[]}
      selection={null}
      color="#000"
      fontSize={18}
      lineHeight={1.5}
      images={{ img0: "data:image/png;base64,AAAA" }}
      imageHeight={400}
      onWordPress={jest.fn()}
      onWordLongPress={jest.fn()}
    />,
  );
  const image = screen.getByLabelText("Illustration");
  expect(image.props.source).toEqual({ uri: "data:image/png;base64,AAAA" });
  expect(image.props.style).toMatchObject({ height: 400 });
});
