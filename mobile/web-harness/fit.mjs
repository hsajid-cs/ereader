import { chromium } from "playwright-core";
const email = process.env.EMAIL;
const browser = await chromium.launch({
  executablePath: process.env.CHROMIUM,
  args: ["--no-sandbox"],
});
const page = await browser.newPage({ viewport: { width: 390, height: 844 } });
await page.goto(`${process.env.APP ?? "http://localhost:8099"}/`);
await page.getByPlaceholder("Email").fill(email);
await page.getByPlaceholder("Password").fill("password123");
await page.getByText("Sign in", { exact: true }).click();
await page.getByText("Harness Test Book").first().waitFor();

const results = [];
for (const fontSize of [12, 18, 24, 32])
  for (const [lineHeight, margin] of [
    [1.3, 14],
    [1.8, 40],
  ])
    for (const serif of [true, false]) {
      await page.evaluate(
        ([f, l, m, s]) =>
          localStorage.setItem(
            "ereader.settings",
            JSON.stringify({ theme: "light", fontSize: f, lineHeight: l, margin: m, serif: s }),
          ),
        [fontSize, lineHeight, margin, serif],
      );
      await page.reload();
      await page
        .getByText("Harness Test Book")
        .first()
        .waitFor({ timeout: 8000 })
        .catch(async () => {
          console.log(
            "FAILED to show library; page text:",
            (await page.locator("body").innerText()).replace(/\n+/g, " | ").slice(0, 300),
          );
          await page.screenshot({ path: "fit-fail.png" });
          process.exit(1);
        });
      await page.getByText("Harness Test Book").first().click();
      await page.getByText(/Page \d+ of/).waitFor({ timeout: 15000 });
      await page.waitForTimeout(500);
      const total = Number(
        /of (\d+)/.exec(
          await page
            .getByText(/Page \d+ of/)
            .first()
            .innerText(),
        )[1],
      );
      for (let i = 0; i < total; i++) {
        await page.mouse.click(10, 400);
        await page.waitForTimeout(40);
      } // rewind to page 1
      let worstOverflow = -1e9,
        minFill = 1e9,
        measured = 0;
      for (let i = 0; i < total; i++) {
        const m = await page.evaluate(() => {
          const root = document.querySelector('[data-testid="reader-page"]');
          const limit = window.innerHeight - 36; // BOTTOM padding reserved for the footer
          if (!root || root.querySelector('[aria-label="Illustration"]')) return null;
          let bottom = 0;
          for (const el of root.querySelectorAll("*"))
            bottom = Math.max(bottom, el.getBoundingClientRect().bottom);
          return { bottom, limit };
        });
        if (m) {
          measured++;
          worstOverflow = Math.max(worstOverflow, m.bottom - m.limit);
          if (i < total - 1) minFill = Math.min(minFill, m.bottom / m.limit); // last page of a chapter can be short
        }
        await page.mouse.click(380, 400);
        await page.waitForTimeout(80);
      }
      results.push({
        fontSize,
        lineHeight,
        margin,
        serif,
        pages: total,
        measured,
        worstOverflowPx: Math.round(worstOverflow),
        minFillPct: Math.round(minFill * 100),
      });
      await page
        .getByText("Chapter", { exact: false })
        .first()
        .isVisible()
        .catch(() => {});
      await page.reload(); // back to library for the next config
    }
console.table(results);
await browser.close();
