const { test, expect } = require('@playwright/test');

test('Professor Dashboard renders without SVG errors', async ({ page }) => {
  const errors = [];
  page.on('console', msg => {
    if (msg.type() === 'error') {
      errors.push(msg.text());
    }
  });
  page.on('pageerror', exception => {
    errors.push(exception.message);
  });

  // Use the port we start the server on
  await page.goto('http://localhost:8083/dashboard-test.html');

  // Wait for loading to finish (forced by harness)
  await expect(page.getByText('Total Students')).toBeVisible({ timeout: 5000 });

  // Check for specific SVG error text in console logs
  const svgError = errors.find(e => e.includes('Expected moveto path command'));
  if (svgError) {
      console.log("Found SVG Error:", svgError);
  }
  expect(svgError).toBeUndefined();

  // Check if stats are rendered (fallback value 0 is expected)
  // Correct syntax: locate first, then expect
  await expect(page.getByText('0').first()).toBeVisible();
});
