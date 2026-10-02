import { fireEvent, render, screen, waitFor } from "@testing-library/react-native";

import AuthScreen from "./AuthScreen";

const mockSignIn = jest.fn();
const mockSignUp = jest.fn();

jest.mock("../store/auth", () => ({
  useAuth: () => ({ signIn: mockSignIn, signUp: mockSignUp }),
}));

beforeEach(() => {
  mockSignIn.mockReset();
  mockSignUp.mockReset();
});

test("signs in with trimmed email and shows server errors", async () => {
  mockSignIn.mockRejectedValueOnce(new Error("Invalid email or password"));
  await render(<AuthScreen />);
  await fireEvent.changeText(screen.getByPlaceholderText("Email"), "  me@example.com ");
  await fireEvent.changeText(screen.getByPlaceholderText("Password"), "secret123");
  await fireEvent.press(screen.getByText("Sign in"));
  await waitFor(() => expect(screen.getByText("Invalid email or password")).toBeTruthy());
  expect(mockSignIn).toHaveBeenCalledWith("me@example.com", "secret123");
});

test("switches to registration", async () => {
  mockSignUp.mockResolvedValueOnce(undefined);
  await render(<AuthScreen />);
  await fireEvent.press(screen.getByText("Need an account? Register"));
  await fireEvent.changeText(screen.getByPlaceholderText("Email"), "new@example.com");
  await fireEvent.changeText(screen.getByPlaceholderText("Password"), "password123");
  await fireEvent.press(screen.getByText("Create account"));
  await waitFor(() => expect(mockSignUp).toHaveBeenCalledWith("new@example.com", "password123"));
});
