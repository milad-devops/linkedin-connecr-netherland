import { Actor, log } from 'apify';
import { chromium } from 'playwright';

async function humanDelay(min = 800, max = 1800) {
    await new Promise(res => setTimeout(res, min + Math.random() * (max - min)));
}

async function linkedinLogin(page, email, password) {
    log.info("Going to LinkedIn login...");
    await page.goto("https://www.linkedin.com/login", { waitUntil: "networkidle" });

    await page.fill('#username', email);
    await humanDelay();
    await page.fill('#password', password);
    await humanDelay();

    await Promise.all([
        page.click("button[type=submit]"),
        page.waitForNavigation({ waitUntil: "networkidle", timeout: 20000 })
    ]);

    if (page.url().includes("/feed")) {
        log.info("Logged in successfully.");
        return true;
    }

    log.error("Login failed. Captcha or incorrect credentials.");
    return false;
}

async function searchRecruiters(page) {
    log.info("Searching for Dutch recruiters...");
    await page.goto("https://www.linkedin.com/search/results/people/?keywords=recruiter%20netherlands", { waitUntil: "networkidle" });

    await humanDelay(2000, 4000);

    const profiles = new Set();

    for (let i = 0; i < 3; i++) {
        const links = await page.$$eval("a.app-aware-link", els =>
            els.map(e => e.href).filter(h => h.includes("/in/"))
        );

        links.forEach(l => profiles.add(l));

        await page.mouse.wheel(0, 1500);
        await humanDelay(2000, 3000);
    }

    return [...profiles];
}

async function sendConnect(page, url, message) {
    try {
        log.info("Opening profile: " + url);
        await page.goto(url, { waitUntil: "networkidle" });
        await humanDelay(2500, 4000);

        let connect = await page.$("//button[contains(., 'Connect')]");

        if (!connect) {
            const moreBtn = await page.$("//button[contains(., 'More')]");
            if (moreBtn) {
                await moreBtn.click();
                await humanDelay();
                connect = await page.$("//div[contains(text(), 'Connect')]");
            }
        }

        if (!connect) return { ok: false, error: "Connect button missing" };

        await connect.click();
        await humanDelay(1500, 2500);

        const noteBtn = await page.$("//button[contains(., 'Add a note')]");
        if (noteBtn) {
            await noteBtn.click();
            await humanDelay();
            await page.fill("textarea", message);
            await humanDelay();
        }

        const sendBtn = await page.$("//button[contains(., 'Send')]");
        if (!sendBtn) return { ok: false, error: "No Send button" };

        await sendBtn.click();
        await humanDelay(2000, 4000);

        return { ok: true };
    } catch (e) {
        return { ok: false, error: e.message };
    }
}

Actor.main(async () => {
    const { email, password, connectMessage, dailyLimit } = await Actor.getInput();

    const browser = await chromium.launch({ headless: true });
    const page = await browser.newPage();

    const logged = await linkedinLogin(page, email, password);
    if (!logged) throw new Error("LinkedIn login failed.");

    const profiles = await searchRecruiters(page);

    log.info(`Collected ${profiles.length} recruiter profiles.`);

    let sent = 0;

    for (const profile of profiles) {
        if (sent >= dailyLimit) break;

        const result = await sendConnect(page, profile, connectMessage || "");
        log.info(`Result: ${profile} => ${JSON.stringify(result)}`);

        await Actor.pushData({
            profile,
            ...result,
            timestamp: new Date().toISOString()
        });

        if (result.ok) sent++;

        await humanDelay(30000, 45000); // 30–45s delay
    }

    log.info("Done.");
    await browser.close();
});
