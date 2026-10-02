import { sniffImageMime } from "./coverCache";

jest.mock("expo-file-system", () => ({ Directory: class {}, File: class {}, Paths: {} }));
jest.mock("../api/client", () => ({ fetchBinary: jest.fn() }));

test("sniffImageMime recognises common formats", () => {
  expect(sniffImageMime(new Uint8Array([0x89, 0x50, 0x4e, 0x47]))).toBe("image/png");
  expect(sniffImageMime(new Uint8Array([0xff, 0xd8, 0xff]))).toBe("image/jpeg");
  expect(sniffImageMime(new Uint8Array([0x47, 0x49, 0x46, 0x38]))).toBe("image/gif");
  expect(sniffImageMime(new Uint8Array([0x52, 0x49, 0x46, 0x46, 0, 0, 0, 0]))).toBe("image/webp");
  expect(sniffImageMime(new Uint8Array([1, 2, 3]))).toBe("image/jpeg");
});
