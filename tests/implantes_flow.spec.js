const { test, expect } = require('@playwright/test');

test.describe('Clínica Colombiana de Implantes Dentales - E2E Suite', () => {
  test('Test 1: App Loads, Surgical Facilities Render & Hub Switcher Active', async ({ page }) => {
    await page.goto('http://localhost:3005');
    await expect(page).toHaveTitle(/Clínica Colombiana de Implantes Dentales/i);

    const brand = page.locator('.brand-logo');
    await expect(brand).toContainText('CLÍNICA COLOMBIANA DE IMPLANTES');

    // Facilities
    await expect(page.locator('.facility-card')).toContainText('Tomógrafo 3D Cone Beam');
    await expect(page.locator('.facility-card')).toContainText('Cirugía Guiada Digital');

    // Hub Switcher
    const switchHub = page.locator('.btn-switch-hub');
    await expect(switchHub).toBeVisible();
    await expect(page.locator('.switcher-menu a[href="http://localhost:3004"]')).toBeAttached();
  });

  test('Test 2: Calculator Computes Titanium Implant Investment & Financing', async ({ page }) => {
    await page.goto('http://localhost:3005');
    await page.selectOption('#calc-treatment', 'implante_simple');
    await page.fill('#calc-qty', '2');

    await expect(page.locator('#res-total-cop')).toContainText('$5.000.000 COP');
    await expect(page.locator('#res-monthly-cop')).toContainText('$416.667 COP/mes');
  });

  test('Test 3: Surgical Triage Funnel with Dr. Felipe Captures Bone Status & Lead into SQLite', async ({ page }) => {
    await page.goto('http://localhost:3005');

    // User asks for All-on-4 full arch
    await page.fill('#user-input', 'Hola doctor, necesito saber sobre dientes fijos en un dia con All-on-4');
    await page.click('#send-btn');

    const stream = page.locator('#chat-stream');
    await expect(stream).toContainText('All-on-4 y carga inmediata');

    // User provides bone/scanner status
    await page.fill('#user-input', 'No tengo tomografia reciente, pero me faltan varios dientes arriba');
    await page.click('#send-btn');
    await expect(stream).toContainText('tomógrafo Cone Beam 3D');

    // User provides date
    await page.fill('#user-input', 'El próximo martes en la mañana');
    await page.click('#send-btn');
    await expect(stream).toContainText('nombre completo y número de teléfono o WhatsApp');

    // User contact
    await page.fill('#user-input', 'Rodrigo Barrientos, 318 901 4455');
    await page.click('#send-btn');
    await expect(stream).toContainText('ha quedado agendada');

    // Verify in Admin Modal
    await page.click('.btn-admin');
    const adminModal = page.locator('#admin-modal');
    await expect(adminModal).toBeVisible();
    await expect(page.locator('#leads-tbody')).toContainText('Rodrigo Barrientos');
    await expect(page.locator('#leads-tbody')).toContainText('Rehabilitación Total All-on-4');
  });
});

