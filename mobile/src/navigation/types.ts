import type { Book } from "@ereader/shared";

export type RootStackParamList = {
  Tabs: undefined;
  Reader: { book: Book };
};

export type TabParamList = {
  Library: undefined;
  Collections: undefined;
  Stats: undefined;
  Settings: undefined;
};
