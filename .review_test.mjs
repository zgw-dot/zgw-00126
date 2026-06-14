const { chromium } = require("playwright");

(async () => {
  const browser = await chromium.launch({ headless: true });
  const page = await browser.newPage();

  // Test 1: Login as admin and access statistics page
  console.log("=== Test 1: Admin Statistics Page ===");
  await page.goto("http://localhost:5173/login");
  await page.fill("input[placeholder='用户名']", "admin");
  await page.fill("input[placeholder='密码']", "admin123");
  await page.click("button[type='submit']");
  await page.waitForURL("**/admin/dashboard");
  console.log("  Login succeeded");

  await page.goto("http://localhost:5173/admin/statistics");
  await page.waitForTimeout(2000);
  const hasStatsHeading = await page.textContent("h1");
  console.log("  Statistics page h1:", hasStatsHeading);
  const hasGenButton = await page.textContent("button:has-text('生成报告')");
  console.log("  Generate button found:", !!hasGenButton);

  // Test 2: Student grades page
  console.log("\n=== Test 2: Student Grades Page ===");
  await page.goto("http://localhost:5173/login");
  await page.fill("input[placeholder='用户名']", "student1");
  await page.fill("input[placeholder='密码']", "student123");
  await page.click("button[type='submit']");
  await page.waitForURL("**/student/dashboard");
  console.log("  Student login succeeded");

  await page.goto("http://localhost:5173/student/grades");
  await page.waitForTimeout(2000);
  const gradesH1 = await page.textContent("h1");
  console.log("  Grades page h1:", gradesH1);

  // Test 3: Student tries to access admin statistics (frontend route guard)
  console.log("\n=== Test 3: Student 403 Route Guard ===");
  await page.goto("http://localhost:5173/admin/statistics");
  await page.waitForTimeout(2000);
  const currentUrl = page.url();
  console.log("  After accessing admin page, URL is:", currentUrl);
  const isRedirected = currentUrl.includes("student/dashboard");
  console.log("  Redirected to student dashboard:", isRedirected);

  await browser.close();
  console.log("\n=== All tests done ===");
})();
