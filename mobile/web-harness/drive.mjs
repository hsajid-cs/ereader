import { chromium } from "playwright-core";

const email = process.env.EMAIL;
const out = process.env.OUT;
const browser = await chromium.launch({
  executablePath: process.env.CHROMIUM,
  args: ["--no-sandbox"],
});
const page = await browser.newPage({ viewport: { width: 390, height: 844 }, deviceScaleFactor: 2 });
const logs = [];
page.on("console", (m) => {
  if (m.type() === "error") logs.push(m.text().slice(0, 160));
});
page.on("pageerror", (e) => logs.push(`pageerror: ${e.message.slice(0, 300)}`));
const footer = async () =>
  (
    await page
      .getByText(/Page \d+ of/)
      .first()
      .innerText()
  ).trim();

await page.goto(`${process.env.APP ?? "http://localhost:8099"}/`);
await page.getByPlaceholder("Email").fill(email);
await page.getByPlaceholder("Password").fill("password123");
await page.getByText("Sign in", { exact: true }).click();
await page.getByText("Harness Test Book").first().waitFor({ timeout: 15000 });
await page.waitForTimeout(1200);
await page.screenshot({ path: `${out}/a-library.png` });

await page.getByText("Harness Test Book").first().click();
await page.getByText(/Page 1 of/).waitFor({ timeout: 15000 });
await page.waitForTimeout(800);
await page.screenshot({ path: `${out}/b-reader-p1.png` });
console.log("p1:", await footer());

await page.screenshot({ path: `${out}/b2-reader-annotated.png` });
// find the figure page
let n = 1;
while (n < 30 && (await page.getByLabel("Illustration").count()) === 0) {
  await page.mouse.click(370, 400);
  await page.waitForTimeout(150);
  n++;
}
console.log("figure page reached after taps:", n - 1, "|", await footer());
await page.screenshot({ path: `${out}/c-figure.png` });

await page.mouse.click(20, 400);
await page.waitForTimeout(300);
await page.mouse.click(20, 400);
await page.waitForTimeout(300);
// toolbar + settings
await page.mouse.click(195, 420);
await page.waitForTimeout(300);
await page.screenshot({ path: `${out}/f-toolbar.png` });
await page.getByText("Aa", { exact: true }).click();
await page.waitForTimeout(400);
await page.screenshot({ path: `${out}/g-settings.png` });
await page.mouse.click(195, 100); // dismiss the settings sheet via its backdrop
await page.waitForTimeout(300);
await page.getByText("☰").click();
await page.waitForTimeout(300);
await page.getByText("highlights", { exact: true }).click();
await page.waitForTimeout(500);
await page.screenshot({ path: `${out}/h-highlights.png` });
await page.getByText("Close", { exact: true }).click();
await page.waitForTimeout(300);
await page.getByText("‹").click();
await page.waitForTimeout(800);
await page.getByText("Stats", { exact: true }).click();
await page.waitForTimeout(1200);
await page.screenshot({ path: `${out}/i-stats.png` });
await page.getByText("Settings", { exact: true }).last().click();
await page.waitForTimeout(600);
await page.screenshot({ path: `${out}/j-settings.png` });
console.log(logs.slice(0, 10).join("\n") || "no console errors");
await browser.close();
