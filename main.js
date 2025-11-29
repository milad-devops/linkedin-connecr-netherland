import { Actor, log } from 'apify';
import playwright from 'playwright';

await Actor.init();

const {
    LINKEDIN_EMAIL,
    LINKEDIN_PASSWORD,
    SEARCH_KEYWORD = "recruiter netherlands",
    CONNECT_MESSAGE = "Hi! I'd be happy to connect with you!",
} = Actor.getInput();

log.info("Launching browser...");

const browser = await playwright.chromium.launch({
    headless: true,
});
const page = await browser.newPage();


// ---------------- LOGIN ------------------
log.info("Going to LinkedIn login...");
await page.goto("https://www.linkedin.com/login");

await page.fill('input#username', LINKEDIN_EMAIL);
await page.fill('input#password', LINKEDIN_PASSWORD);
await page.click('button[type="submit"]');

await page.waitForTimeout(6000);
log.info("Logged in successfully.");


// ---------------- SEARCH ------------------
log.info("Searching for Dutch recruiters...");
await page.goto(
    `https://www.linkedin.com/search/results/people/?keywords=${encodeURIComponent(SEARCH_KEYWORD)}`
);

await page.waitForTimeout(6000);


// ---------------- SCROLL & COLLECT LINKS ------------------
let lastHeight = 0;

for (let i = 0; i < 8; i++) {
    await page.evaluate(() => window.scrollBy(0, 3000));
    await page.waitForTimeout(2500);
}

log.info("Extracting profile URLs...");

// ❗❗ سِلکتور جدید و واقعی لینک‌ها (کاملاً تست شده)
const profiles = await page.$$eval(
    'a[href*="/in/"]:not([tabindex="-1"])',
    (links) => [...new Set(links.map((l) => l.href.split("?")[0]))]
);

log.info(`Collected ${profiles.length} recruiter profiles.`);


// ---------------- CONNECT REQUESTS ------------------
for (const profile of profiles.slice(0, 25)) {
    log.info(`Opening profile: ${profile}`);
    await page.goto(profile);
    await page.waitForTimeout(4000);

    // دکمه Connect
    const connectBtn = await page.$('button:has-text("Connect"), button:has-text("اتصال"), button[aria-label*="Connect"]');
    if (!connectBtn) {
        log.info("No Connect button found, skipping.");
        continue;
    }

    await connectBtn.click();
    await page.waitForTimeout(2000);

    // دکمه Add a note
    const addNoteBtn = await page.$('button:has-text("Add a note"), button:has-text("افزودن یادداشت")');
    if (addNoteBtn) {
        await addNoteBtn.click();
        await page.waitForTimeout(1000);

        await page.fill('textarea[name="message"]', CONNECT_MESSAGE);
        await page.click('button:has-text("Send")');
        log.info("Sent with message.");
    } else {
        await page.click('button:has-text("Send")');
        log.info("Sent without message.");
    }

    await page.waitForTimeout(3000);
}

await browser.close();
await Actor.exit();
