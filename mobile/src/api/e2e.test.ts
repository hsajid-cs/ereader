/**
 * Opt-in end-to-end test of the API client against a running backend:
 *   E2E_SERVER=http://localhost:4001 npm test -w @ereader/mobile -- e2e
 */
const server = process.env.E2E_SERVER;
process.env.EXPO_PUBLIC_API_URL = server ?? "http://localhost:4000";

const mockStore = new Map<string, string>();
jest.mock("expo-secure-store", () => ({
  setItemAsync: async (k: string, v: string) => void mockStore.set(k, v),
  getItemAsync: async (k: string) => mockStore.get(k) ?? null,
  deleteItemAsync: async (k: string) => void mockStore.delete(k),
}));

const maybe = server ? describe : describe.skip;

maybe("api client against a live backend", () => {
  type Client = typeof import("./client");
  let client: Client;
  beforeAll(() => {
    client = jest.requireActual<Client>("./client");
  });

  const email = `e2e-${Date.now()}@example.com`;

  it("registers, authenticates and exercises the main endpoints", async () => {
    const { api, storeTokens } = client;
    const reg = await api.register(email, "password123", "E2E");
    await storeTokens(reg);
    expect((await api.me()).email).toBe(email);
    expect(await api.listBooks()).toEqual([]);

    const col = await api.createCollection("Favourites");
    expect((await api.listCollections()).map((c) => c.id)).toContain(col.id);

    expect((await api.setGoal(45)).dailyMinutesGoal).toBe(45);
    expect((await api.statsSummary()).goal.dailyMinutesGoal).toBe(45);
    await api
      .logSession({
        bookId: "x",
        startedAt: new Date().toISOString(),
        endedAt: new Date().toISOString(),
        durationSeconds: 60,
      })
      .catch(() => undefined);
  });

  it("refreshes an expired access token transparently", async () => {
    const { api, storeTokens } = client;
    await storeTokens({
      accessToken: "garbage",
      refreshToken: mockStore.get("ereader.refreshToken")!,
    });
    expect((await api.me()).email).toBe(email);
  });

  it("signs out when the refresh token is invalid", async () => {
    const { request, storeTokens, clearTokens } = client;
    await storeTokens({ accessToken: "garbage", refreshToken: "also-garbage" });
    await expect(request("/users/me")).rejects.toMatchObject({ status: 401 });
    await clearTokens();
  });

  it("changes the password and deletes the account", async () => {
    const { api, storeTokens } = client;
    const addr = `e2e-pw-${Date.now()}@example.com`;
    await storeTokens(await api.register(addr, "password123"));

    await expect(api.changePassword("wrong-password", "newpassword1")).rejects.toMatchObject({
      status: 403,
    });
    await storeTokens(await api.changePassword("password123", "newpassword1"));
    await expect(api.login(addr, "password123")).rejects.toMatchObject({ status: 401 });
    await storeTokens(await api.login(addr, "newpassword1"));

    await api.deleteAccount("newpassword1");
    await expect(api.login(addr, "newpassword1")).rejects.toMatchObject({ status: 401 });
  });
});
