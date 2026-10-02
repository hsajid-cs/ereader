module.exports = {
  testEnvironment: "node",
  transform: { "^.+\\.[jt]sx?$": ["babel-jest", { presets: ["babel-preset-expo"] }] },
  // expo's EXPO_PUBLIC_* env shim is ESM and must be transformed.
  transformIgnorePatterns: ["/node_modules/(?!expo/virtual)"],
  testPathIgnorePatterns: ["/node_modules/", "\\.ui\\.test\\.tsx$"],
};
