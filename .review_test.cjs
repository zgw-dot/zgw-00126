const { chromium } = require("playwright");

(async () => {
  const browser = await chromium.launch({ headless: true });
  const page = await browser.newPage();

  console.log("=== Test 1: Admin Statistics Page ===");
  await page.goto("http://localhost:5173/login");
  await page.fill("input[placeholder='用户名']", "admin");
  await page.fill("input[placeholder='密码']", "admin123");
  await page.click("button[type='submit']");
  await page.waitForURL("**/admin/dashboard");
  console.log("  Login succeeded");

  await page.goto("http://localhost:5173/admin/statistics");
  await page.waitForTimeout(2000);
  const h1Text = await page.textContent("h1");
  console.log("  H1:", h1Text);

  console.log("\n=== Test 2: Student Grades Page ===");
  await page.goto("http://localhost:5173/login");
  await page.fill("input[placeholder='用户名']", "student1");
  await page.fill("input[placeholder='密码']", "student123");
  await page.click("button[type='submit']");
  await page.waitForURL("**/student/dashboard");
  console.log("  Student login succeeded");
  await page.goto("http://localhost:5173/student/grades");
  await page.waitForTimeout(2000);
  const gh1 = await page.textContent("h1");
  console.log("  Student grades H1:", gh1);

  console.log("\n=== Test 3: Student route guard ===");
  await page.goto("http://localhost:5173/admin/statistics");
  await page.waitForTimeout(2000);
  console.log("  URL after guard:", page.url());

  await browser.close();
  console.log("\n=== Done ===");
})();
