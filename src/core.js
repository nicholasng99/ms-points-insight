// Pure calculations, shared by the content script and the Node tests.
(function (root) {
  function parseAmount(text) {
    const match = String(text || '').match(/\d[\d,]*(?:\.\d+)?/);
    if (!match) return null;
    const amount = Number(match[0].replace(/,/g, ''));
    return amount > 0 ? amount : null;
  }

  // Empty input means "clear the saved price", so it is valid with a null price.
  function parseStreetInput(text) {
    const cleaned = String(text || '').replace(/s\$|\$|,|\s/gi, '');
    if (cleaned === '') return { ok: true, price: null };
    if (!/^\d+(\.\d{1,2})?$/.test(cleaned) || Number(cleaned) <= 0) return { ok: false, price: null };
    return { ok: true, price: Number(cleaned) };
  }

  function valuePer1000(price, points) {
    return (price / points) * 1000;
  }

  function productKey(name) {
    return String(name || '').trim().replace(/\s+/g, ' ').toLowerCase();
  }

  function isVoucher(name) {
    return /voucher|gift\s*card/i.test(String(name || ''));
  }

  // Vouchers are always worth their face value, so a street price does not apply.
  function evaluate({ name, listed, points, street }) {
    const listValue = valuePer1000(listed, points);
    if (isVoucher(name)) return { basis: 'face', price: listed, value: listValue, listValue };
    if (street) return { basis: 'street', price: street, value: valuePer1000(street, points), listValue };
    return { basis: 'list', price: listed, value: listValue, listValue };
  }

  // Splits values into thirds. Equal values always land in the same tier.
  function tierCutoffs(values) {
    const sorted = [...values].sort((a, b) => a - b);
    if (sorted.length < 3) return () => 'mid';
    const low = sorted[Math.floor(sorted.length / 3)];
    const high = sorted[Math.ceil((sorted.length * 2) / 3)];
    if (low === high) return () => 'mid';
    return (value) => (value >= high ? 'high' : value < low ? 'low' : 'mid');
  }

  function searchLinks(name) {
    const query = encodeURIComponent(String(name || '').trim());
    return [
      { label: 'Shopee', url: `https://shopee.sg/search?keyword=${query}` },
      { label: 'Lazada', url: `https://www.lazada.sg/catalog/?q=${query}` },
      { label: 'Amazon', url: `https://www.amazon.sg/s?k=${query}` },
    ];
  }

  function formatPrice(price) {
    return `S$${Number.isInteger(price) ? price : price.toFixed(2)}`;
  }

  const api = {
    parseAmount,
    parseStreetInput,
    valuePer1000,
    productKey,
    isVoucher,
    evaluate,
    tierCutoffs,
    searchLinks,
    formatPrice,
  };

  if (typeof module !== 'undefined' && module.exports) module.exports = api;
  else root.PointsInsightCore = api;
})(typeof globalThis !== 'undefined' ? globalThis : this);
