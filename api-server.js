require("dotenv").config();
const http = require("http");
const puppeteer = require("puppeteer");

const PORT = 3000;
const USER_DATA_DIR = process.env.CHROME_PROFILE_DIR || "D:/n8n-app/chrome-profile";
const TECHRUM_LOGIN = process.env.TECHRUM_LOGIN;
const TECHRUM_PASSWORD = process.env.TECHRUM_PASSWORD;

const server = http.createServer(async (req, res) => {
  res.setHeader("Access-Control-Allow-Origin", "*");
  res.setHeader("Access-Control-Allow-Methods", "POST, OPTIONS");
  res.setHeader("Access-Control-Allow-Headers", "Content-Type");

  if (req.method === "OPTIONS") {
    res.writeHead(200);
    res.end();
    return;
  }

  if (req.method === "POST" && req.url === "/api/post") {
    let body = "";
    req.on("data", chunk => body += chunk);
    req.on("end", async () => {
      let browser;
      try {
        let cleanBody = body.trim();
        if (cleanBody.startsWith('"') && cleanBody.endsWith('"')) {
          cleanBody = JSON.parse(cleanBody); // unescape string
        }
        if (cleanBody.startsWith("=")) cleanBody = cleanBody.slice(1);
        const { title, bbcode, forum_id } = JSON.parse(cleanBody);
        if (!title || !bbcode || !forum_id) {
          res.writeHead(400, { "Content-Type": "application/json" });
          res.end(JSON.stringify({ status: "error", message: "Thiếu title, bbcode hoặc forum_id" }));
          return;
        }

        console.log(`[POST] Bắt đầu đăng: "${title}" vào forum ${forum_id}`);

        browser = await puppeteer.launch({
          headless: "new",
          userDataDir: USER_DATA_DIR,
          args: ["--no-sandbox", "--start-maximized"],
        });

        const page = await browser.newPage();
        await page.setViewport({ width: 1366, height: 768 });

        // Kiểm tra đăng nhập
        console.log("[1] Kiểm tra đăng nhập...");
        await page.goto("https://www.techrum.vn/", { waitUntil: "networkidle2", timeout: 60000 });
        const isLoggedIn = await page.$(".p-navgroup--member");

        if (!isLoggedIn) {
          console.log("[1] Chưa đăng nhập, tiến hành login...");
          await page.goto("https://www.techrum.vn/login", { waitUntil: "networkidle0", timeout: 60000 });
          await page.waitForSelector('input[name="login"]', { timeout: 10000 });
          await page.type('input[name="login"]', TECHRUM_LOGIN, { delay: 50 });
          await page.type('input[name="password"]', TECHRUM_PASSWORD, { delay: 50 });
          await Promise.all([
            page.evaluate(() => {
              document.querySelector('form[action="/login/login"] button.button--primary').click();
            }),
            page.waitForNavigation({ waitUntil: "networkidle0", timeout: 30000 }),
          ]);
          const loginOk = await page.$(".p-navgroup--member");
          if (!loginOk) throw new Error("Đăng nhập thất bại!");
          console.log("[1] Đăng nhập thành công!");
        } else {
          console.log("[1] Đã đăng nhập sẵn (dùng session cũ).");
        }

        // Vào trang đăng bài
        console.log("[2] Vào trang đăng bài...");
        await page.goto(`https://www.techrum.vn/forums/${forum_id}/post-thread`, {
          waitUntil: "networkidle0", timeout: 60000
        });
        await page.waitForSelector('input[name="title"]', { timeout: 10000 });

        // Lấy token
        const formInfo = await page.evaluate(() => {
          const form = document.querySelector('form[data-xf-init*="ajax-submit"]');
          if (!form) return null;
          const tokenEl = form.querySelector('input[name="_xfToken"]');
          return {
            action: form.getAttribute("action"),
            token: tokenEl ? tokenEl.value : null,
          };
        });

        if (!formInfo?.token) throw new Error("Không tìm thấy form token");
        console.log("[3] Lấy token thành công, đang submit...");

        // Submit bài
        const result = await page.evaluate(async (action, t, b, token) => {
          const formData = new URLSearchParams();
          formData.append("title", t);
          formData.append("message", b);
          formData.append("watch_thread", "1");
          formData.append("_xfToken", token);
          formData.append("_xfRequestUri", action);
          formData.append("_xfWithData", "1");
          formData.append("_xfResponseType", "json");

          const res = await fetch("https://www.techrum.vn" + action, {
            method: "POST",
            headers: {
              "Content-Type": "application/x-www-form-urlencoded",
              "X-Requested-With": "XMLHttpRequest",
            },
            body: formData.toString(),
            credentials: "include",
          });

          const text = await res.text();
          try { return { ok: true, data: JSON.parse(text) }; }
          catch { return { ok: false, raw: text.substring(0, 300) }; }
        }, formInfo.action, title, bbcode, formInfo.token);

        if (!result.ok) throw new Error("Submit lỗi: " + result.raw);

        const redirectUrl = result.data.redirect || result.data._redirectTarget || result.data.redirectTarget;
        if (!redirectUrl) throw new Error("Không có redirect URL: " + JSON.stringify(result.data).substring(0, 200));

        let fullUrl = redirectUrl.startsWith("http") ? redirectUrl : "https://www.techrum.vn" + redirectUrl;
        fullUrl = fullUrl.replace(/\/threads\/.*\.(\d+\/?)$/, "/threads/.$1");

        console.log("✅ Đăng thành công:", fullUrl);

        res.writeHead(200, { "Content-Type": "application/json" });
        res.end(JSON.stringify({ status: "success", url: fullUrl }));

      } catch (err) {
        console.error("❌ Lỗi:", err.message);
        res.writeHead(500, { "Content-Type": "application/json" });
        res.end(JSON.stringify({ status: "error", message: err.message }));
      } finally {
        if (browser) await browser.close();
      }
    });
    
    return;
  }

  res.writeHead(404);
  res.end("Not found");
});

server.listen(PORT, () => {
  console.log(`✅ API Server chạy tại http://localhost:${PORT}`);
  console.log(`   CHROME_PROFILE_DIR: ${USER_DATA_DIR}`);
  console.log(`   TECHRUM_LOGIN: ${TECHRUM_LOGIN}`);
});