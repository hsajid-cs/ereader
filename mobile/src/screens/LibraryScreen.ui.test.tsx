import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { fireEvent, render, screen, waitFor } from "@testing-library/react-native";

import LibraryScreen from "./LibraryScreen";

const book = (id: string, title: string, createdAt: string) => ({
  id,
  userId: "u",
  title,
  author: "Someone",
  format: "EPUB",
  fileSizeBytes: 1,
  coverUrl: null,
  totalLocations: null,
  createdAt,
  updatedAt: createdAt,
});
const mockNavigate = jest.fn();

jest.mock("@react-navigation/native", () => ({
  useNavigation: () => ({ navigate: mockNavigate }),
  useRoute: () => ({ params: undefined }),
}));
jest.mock("expo-document-picker", () => ({ getDocumentAsync: jest.fn() }));
jest.mock("expo-secure-store", () => ({
  getItemAsync: async () => null,
  setItemAsync: async () => undefined,
  deleteItemAsync: async () => undefined,
}));
jest.mock("../reader/bookCache", () => ({ evictBook: jest.fn() }));
jest.mock("../offline/store", () => ({
  cached: (_key: string, fetcher: () => Promise<unknown>) => fetcher(),
}));
jest.mock("../offline/data", () => ({
  loadProgress: async (id: string) =>
    id === "done"
      ? { location: "1", percentage: 100 }
      : id === "half"
        ? { location: "1", percentage: 40 }
        : null,
}));
jest.mock("../api/client", () => ({
  api: {
    listBooks: async () => [
      book("new", "Fresh Book", "2026-03-01"),
      book("half", "Half Read", "2026-02-01"),
      book("done", "Done Book", "2026-01-01"),
    ],
    listCollections: async () => [
      { id: "c1", userId: "u", name: "Sci-Fi", createdAt: "", updatedAt: "" },
    ],
  },
  coverSource: () => null,
}));

function renderLibrary() {
  const qc = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  return render(
    <QueryClientProvider client={qc}>
      <LibraryScreen />
    </QueryClientProvider>,
  );
}

test("lists books with progress labels and opens the reader", async () => {
  await renderLibrary();
  await waitFor(() => expect(screen.getAllByText("Fresh Book").length).toBeGreaterThan(0));
  await waitFor(() => expect(screen.getByText("40% read")).toBeTruthy());
  // "Finished" is both a filter chip and the status label of the completed book.
  expect(screen.getAllByText("Finished")).toHaveLength(2);
  expect(screen.getByText("Sci-Fi")).toBeTruthy();

  await fireEvent.press(screen.getAllByText("Half Read")[0]);
  expect(mockNavigate).toHaveBeenCalledWith("Reader", {
    book: expect.objectContaining({ id: "half" }),
  });
});

test("filters by reading state", async () => {
  await renderLibrary();
  await waitFor(() => expect(screen.getByText("40% read")).toBeTruthy());

  await fireEvent.press(screen.getAllByText("Finished")[0]); // the filter chip comes first
  await waitFor(() => expect(screen.queryAllByText("Half Read")).toHaveLength(0));
  expect(screen.getAllByText("Done Book").length).toBeGreaterThan(0);
  expect(screen.queryAllByText("Fresh Book")).toHaveLength(0);

  await fireEvent.press(screen.getByText("Unread"));
  await waitFor(() => expect(screen.getAllByText("Fresh Book").length).toBeGreaterThan(0));
  expect(screen.queryAllByText("Done Book")).toHaveLength(0);
});
