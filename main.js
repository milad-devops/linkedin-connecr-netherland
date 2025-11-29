import { Actor, log } from 'apify';
import playwright from 'playwright';

await Actor.init();

const input = await Actor.getInput();
const LINKEDIN_EMAIL = input.LINKEDIN_EMAIL || process.env.LINKEDIN_EMAIL;
const LINKEDIN_PASSWORD = input.LINKEDIN_PASSWORD || process.env.LINKEDIN_PASSWORD;
const SEARCH_KEYWORD = input.SEARCH_KEYWORD || 'recruiter netherlands';
const CONNECT_MESSAGE = input.CONNECT_MESSAGE || 'Hi! Let’s connect.';

if (!LINKEDIN_EMAIL || !LINKEDIN_PASSWORD) throw new Error("LINKEDIN_EMAIL or LINKEDIN_PASSWORD not provided!");

log.info("Launching browser...");
const browser = await playwright.chromium.launch({ headless: true });
const page = await browser.newPage();

// LOGIN
await page.goto('https://www.linkedin.com/login');
await page.fill('input#username', LINKEDIN_EMAIL);
await page.fill('input#password', LINKEDIN_PASSWORD);
await page.click('button[type="submit"]');
await page.waitForTimeout(6000);
log.info("Logged in successfully.");

// SEARCH
const searchUrl = `https://www.linkedin.com/search/results/people/?keywords=${encodeURIComponent(SEARCH_KEYWORD)}&origin=GLOBAL_SEARCH_HEADER`;
await page.goto(searchUrl);
await page.waitForTimeout(6000);

// SCROLL UNTIL NO NEW RESULTS
let previousHeight;
for (let i = 0; i < 15; i++) {
    previousHeight = await page.evaluate('document.body.scrollHeight');
    await page.evaluate('window.scrollTo(0, document.body.scrollHeight)');
    await page.waitForTimeout(3000);
    const newHeight = await page.evaluate('document.body.scrollHeight');
    if (newHeight === previousHeight) break;
}

// EXTRACT PROFILE LINKS
const profiles = await page.$$eval('a[data-control-name="search_srp_result"]', (links) =>
    [...new Set(links.map(a => a.href.split("?")[0]))]
);

log.info(`Collected ${profiles.length} recruiter profiles.`);

// SEND CONNECT REQUESTS
for (const profile of profiles.slice(0, 25)) {
    log.info(`Opening profile: ${profile}`);
    await page.goto(profile);
    await page.waitForTimeout(4000);

    const connectBtn = await page.$('button:has-text("Connect"), button[aria-label*="Connect"]');
    if (!connectBtn) continue;

    await connectBtn.click();
    await page.waitForTimeout(2000);

    const addNoteBtn = await page.$('button:has-text("Add a note")');
    if (addNoteBtn) {
        await addNoteBtn.click();
        await page.waitForTimeout(1000);
        await page.fill('textarea[name="message"]', CONNECT_MESSAGE);
        await page.click('button:has-text("Send")');
    } else {
        await page.click('button:has-text("Send")');
    }

    await page.waitForTimeout(3000);
}

await browser.close();
await Actor.exit();
