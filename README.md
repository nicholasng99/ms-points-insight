# Points Insight

A Chrome extension for the [MoneySmart Rewards Store](https://www.moneysmart.sg/store/). It shows how many dollars each item is worth per 1,000 SmartPoints, so you can compare rewards at a glance. A higher number means better value.

## Install

1. Open `chrome://extensions`.
2. Turn on **Developer mode**.
3. Click **Load unpacked** and choose this folder.
4. Open the [store listing](https://www.moneysmart.sg/store/products).

After changing the code, click the reload icon on the extension card and refresh the store.

## Use

- **Value badge.** Each card shows S$ per 1,000 points. Green is the top third of the items loaded on the page, red is the bottom third.
- **Street price.** Use the Shopee, Lazada and Amazon links to check prices, then click **Set price**. The badge switches to your price and keeps the list value beside it, along with the date you saved it. Leave the box empty and save to go back to the list price.
- **Ranking.** Click **Rank by value** for a best first list, and **Load all items** to include the whole store. Click a row to find that card on the page.
- **Product pages.** These show the same value and share your saved street price.

## Good to know

- The S$ figure on the store is a list price, so an unadjusted value can flatter an item. The top of the ranking is mostly items with high list prices, which are the first ones worth checking.
- Vouchers use their face value and do not take a street price.
- Points and miles conversions are skipped because the store shows no S$ value for them.
- The ranking and colours only cover items loaded on the current page, so filters and categories change them.
- Items are matched by name, so a saved price is lost if the store renames a product.
- Street prices stay in your browser through `chrome.storage.local`. The extension sends nothing anywhere and only runs on the store pages.
- The extension depends on the store's CSS class names. If the badges disappear after a site update, start with the selectors in `src/content.js`.

## Develop

The calculations live in `src/core.js` and the page integration in `src/content.js`.

```bash
npm test
```
