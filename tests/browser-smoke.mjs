import { access, mkdir } from "node:fs/promises";
import { chromium } from "playwright-core";

const candidates = [
  "C:/Program Files/Google/Chrome/Application/chrome.exe",
  "C:/Program Files (x86)/Google/Chrome/Application/chrome.exe",
  "C:/Program Files/Microsoft/Edge/Application/msedge.exe",
];

let executablePath;
for (const candidate of candidates) {
  try {
    await access(candidate);
    executablePath = candidate;
    break;
  } catch {
    // Try the next installed browser.
  }
}

if (!executablePath) throw new Error("找不到可用的 Chrome 或 Edge。");

const baseUrl = process.env.TEST_BASE_URL ?? "http://127.0.0.1:5173/";
await mkdir("outputs", { recursive: true });
const browser = await chromium.launch({ executablePath, headless: true });

async function enterDemo(page, nickname) {
  await page.goto(baseUrl, { waitUntil: "networkidle" });
  await page.getByLabel("你的暱稱").fill(nickname);
  await page.getByRole("button", { name: "先玩本機示範" }).click();
  await page.getByText("房間 DEMO01").waitFor();
  await page.getByRole("button", { name: /開始任務/ }).click();
  await page.getByText("任務就緒").waitFor();
}

try {
  const desktop = await browser.newPage({ viewport: { width: 1440, height: 960 }, deviceScaleFactor: 1 });
  await enterDemo(desktop, "桌面測試員");
  const cells = desktop.getByRole("gridcell");
  await cells.nth(0).click();
  await desktop.getByText("拆雷進行中").waitFor();
  const desktopHidden = desktop.getByRole("gridcell", { name: /未翻開/ }).first();
  await desktopHidden.click({ button: "right" });
  await desktop.getByRole("gridcell", { name: /已插旗/ }).first().waitFor();
  await desktop.getByLabel("輸入訊息").fill("桌面同步測試完成");
  await desktop.getByRole("button", { name: "傳送訊息" }).click();
  await desktop.getByText("桌面同步測試完成").waitFor();
  await desktop.screenshot({ path: "outputs/browser-desktop.png", fullPage: true });

  const mobile = await browser.newPage({ viewport: { width: 390, height: 844 }, deviceScaleFactor: 1 });
  await enterDemo(mobile, "手機測試員");
  await mobile.getByRole("gridcell").nth(4).click();
  const mobileHidden = mobile.getByRole("gridcell", { name: /未翻開/ }).first();
  await mobileHidden.dispatchEvent("pointerdown");
  await mobile.waitForTimeout(550);
  await mobileHidden.dispatchEvent("pointerup");
  await mobile.getByRole("gridcell", { name: /已插旗/ }).first().waitFor();
  await mobile.getByRole("button", { name: /小隊通訊/ }).click();
  await mobile.locator(".chat-panel.mobile-open").waitFor();
  await mobile.getByLabel("輸入訊息").fill("手機聊天室測試完成");
  await mobile.getByRole("button", { name: "傳送訊息" }).click();
  await mobile.getByText("手機聊天室測試完成").waitFor();
  await mobile.screenshot({ path: "outputs/browser-mobile.png", fullPage: true });

  console.log("Browser smoke tests passed for desktop and mobile.");
} finally {
  await browser.close();
}
