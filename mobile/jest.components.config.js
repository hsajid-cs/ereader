module.exports = {
  preset: "jest-expo",
  moduleNameMapper: { "^expo/src/winter(/.*)?$": "<rootDir>/jest.expo-winter-stub.js" },
  testMatch: ["**/*.ui.test.tsx"],
  transformIgnorePatterns: [
    "node_modules/(?!((jest-)?react-native|@react-native(-community)?|expo(nent)?|@expo(nent)?/.*|@expo-google-fonts/.*|react-navigation|@react-navigation/.*|@shopify/react-native-skia|zustand|@tanstack/.*))",
  ],
};
