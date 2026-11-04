const test = require('node:test');
const assert = require('node:assert');
const core = require('../src/core.js');

test('parseAmount reads the formats the store displays', () => {
  assert.strictEqual(core.parseAmount('S$1899.00'), 1899);
  assert.strictEqual(core.parseAmount('19,490 SmartPoints'), 19490);
  assert.strictEqual(core.parseAmount('Worth S$1,299.50'), 1299.5);
  assert.strictEqual(core.parseAmount('Sold out'), null);
  assert.strictEqual(core.parseAmount('S$0.00'), null);
  assert.strictEqual(core.parseAmount(null), null);
});

test('parseStreetInput accepts prices and treats empty as clear', () => {
  assert.deepStrictEqual(core.parseStreetInput('509'), { ok: true, price: 509 });
  assert.deepStrictEqual(core.parseStreetInput(' S$1,299.50 '), { ok: true, price: 1299.5 });
  assert.deepStrictEqual(core.parseStreetInput('$20'), { ok: true, price: 20 });
  assert.deepStrictEqual(core.parseStreetInput(''), { ok: true, price: null });
  for (const bad of ['0', 'abc', '-5', '1.234', '12 34x']) {
    assert.strictEqual(core.parseStreetInput(bad).ok, false, bad);
  }
});

test('evaluate uses the street price when one is saved', () => {
  const listed = core.evaluate({ name: 'Sony WH-1000XM6', listed: 649, points: 6140 });
  assert.strictEqual(listed.basis, 'list');
  assert.strictEqual(listed.value.toFixed(1), '105.7');

  const street = core.evaluate({ name: 'Sony WH-1000XM6', listed: 649, points: 6140, street: 509 });
  assert.strictEqual(street.basis, 'street');
  assert.strictEqual(street.value.toFixed(1), '82.9');
  assert.strictEqual(street.listValue.toFixed(1), '105.7');
});

test('evaluate keeps vouchers at face value even with a stale street price', () => {
  const voucher = core.evaluate({ name: '$100 eCapitaVoucher', listed: 100, points: 1500, street: 80 });
  assert.strictEqual(voucher.basis, 'face');
  assert.strictEqual(voucher.value.toFixed(1), '66.7');
});

test('tierCutoffs splits into thirds and keeps ties together', () => {
  const tier = core.tierCutoffs([60, 70, 80, 90, 100, 110]);
  assert.deepStrictEqual([60, 70, 80, 90, 100, 110].map(tier), ['low', 'low', 'mid', 'mid', 'high', 'high']);
  assert.strictEqual(core.tierCutoffs([1, 2])(2), 'mid');
  assert.strictEqual(core.tierCutoffs([5, 5, 5, 5])(5), 'mid');

  const ties = core.tierCutoffs([50, 80, 80, 80, 80, 120]);
  assert.strictEqual(new Set([80, 80, 80, 80].map(ties)).size, 1);
});

test('productKey matches a card name to the detail page title', () => {
  assert.strictEqual(core.productKey('  Apple  iPhone 18 Pro\n'), core.productKey('apple iphone 18 pro'));
});

test('searchLinks encodes the product name', () => {
  const [shopee, lazada, amazon] = core.searchLinks('Apple Watch (GPS, 42mm) & Band');
  const encoded = 'Apple%20Watch%20(GPS%2C%2042mm)%20%26%20Band';
  assert.strictEqual(shopee.url, `https://shopee.sg/search?keyword=${encoded}`);
  assert.strictEqual(lazada.url, `https://www.lazada.sg/catalog/?q=${encoded}`);
  assert.strictEqual(amazon.url, `https://www.amazon.sg/s?k=${encoded}`);
});

test('formatPrice only shows cents when there are some', () => {
  assert.strictEqual(core.formatPrice(509), 'S$509');
  assert.strictEqual(core.formatPrice(1299.5), 'S$1299.50');
});
