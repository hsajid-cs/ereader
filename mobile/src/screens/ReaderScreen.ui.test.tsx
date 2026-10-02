import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { fireEvent, render, screen, waitFor } from "@testing-library/react-native";

import { highlightColors } from "../theme";
import ReaderScreen from "./ReaderScreen";

const mockBook = {
  id: "b1",
  userId: "u",
  title: "Test Book",
  author: "A",
  format: "TXT",
  fileSizeBytes: 1,
  coverUrl: null,
  totalLocations: null,
  createdAt: "",
  updatedAt: "",
};
const mockCreate = jest.fn<Promise<void>, unknown[]>(async () => undefined);
const mockSaveProgress = jest.fn<Promise<void>, unknown[]>(async () => undefined);

jest.mock("@react-navigation/native", () => ({
  useRoute: () => ({ params: { book: mockBook } }),
  useNavigation: () => ({ goBack: jest.fn() }),
}));
jest.mock("expo-keep-awake", () => ({ useKeepAwake: () => undefined }));
jest.mock("expo-speech", () => ({ speak: jest.fn(), stop: jest.fn() }));
jest.mock("expo-brightness", () => ({ setBrightnessAsync: jest.fn(async () => undefined) }));
jest.mock("expo-secure-store", () => ({
  getItemAsync: async () => null,
  setItemAsync: async () => undefined,
  deleteItemAsync: async () => undefined,
}));
jest.mock("../reader/DrawingLayer", () => () => null);
jest.mock("./PdfReaderScreen", () => () => null);
jest.mock("../reader/bookCache", () => ({
  loadBook: async () => ({
    chapters: [
      {
        title: "Chapter One",
        text: Array.from(
          { length: 30 },
          (_, i) =>
            `Paragraph ${i} has some quite ordinary words in it for the reader to paginate.`,
        ).join("\n\n"),
      },
    ],
  }),
}));
jest.mock("../offline/data", () => ({
  loadAnnotations: async () => [],
  loadProgress: async () => null,
  createAnnotation: (...args: unknown[]) => mockCreate(...args),
  deleteAnnotation: jest.fn(async () => undefined),
  saveProgress: (...args: unknown[]) => mockSaveProgress(...args),
  logSession: jest.fn(async () => undefined),
}));

function renderReader() {
  const qc = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  return render(
    <QueryClientProvider client={qc}>
      <ReaderScreen />
    </QueryClientProvider>,
  );
}

async function openFirstPage() {
  await renderReader();
  await fireEvent(screen.getByTestId("reader-area"), "layout", {
    nativeEvent: { layout: { x: 0, y: 0, width: 360, height: 640 } },
  });
  await waitFor(() => expect(screen.getByText(/Page 1 of/)).toBeTruthy());
}

test("paginates the book and turns pages with the right tap zone", async () => {
  await openFirstPage();
  const footer = screen.getByText(/Page 1 of (\d+)/).props.children.join("");
  expect(Number(/of (\d+)/.exec(footer)?.[1])).toBeGreaterThan(3);

  await fireEvent.press(screen.getByTestId("reader-page"), { nativeEvent: { pageX: 340 } });
  await waitFor(() => expect(screen.getByText(/Page 2 of/)).toBeTruthy());

  await fireEvent.press(screen.getByTestId("reader-page"), { nativeEvent: { pageX: 10 } });
  await waitFor(() => expect(screen.getByText(/Page 1 of/)).toBeTruthy());
});

test("long-press then tap extends a selection and creates a highlight with exact offsets", async () => {
  await openFirstPage();
  const pageBefore = screen.getByText(/Page 1 of/);
  await fireEvent(screen.getAllByText("Paragraph ")[0], "longPress");
  await waitFor(() => expect(screen.getByText("Define")).toBeTruthy());

  // Tapping another word extends the selection instead of turning the page.
  await fireEvent.press(screen.getAllByText("has ")[0], { nativeEvent: { pageX: 340 } });
  expect(screen.getByText(/Page 1 of/)).toBe(pageBefore);

  await fireEvent.press(screen.getByTestId(`highlight-${highlightColors[0]}`));
  await waitFor(() => expect(mockCreate).toHaveBeenCalledTimes(1));
  // "Paragraph 0 has " is 16 characters starting at offset 0.
  expect(mockCreate).toHaveBeenCalledWith("b1", {
    type: "HIGHLIGHT",
    locationStart: "0",
    locationEnd: "16",
    color: highlightColors[0],
  });
  await waitFor(() => expect(screen.queryByText("Define")).toBeNull());
});
