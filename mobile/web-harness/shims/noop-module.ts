// Web test harness only: native modules with no browser equivalent.
export const speak = () => undefined;
export const stop = () => undefined;
export const setBrightnessAsync = async () => undefined;
export const useKeepAwake = () => undefined;
export const getDocumentAsync = async () => ({ canceled: true, assets: null });
