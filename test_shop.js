const fs = require('fs');
const jsdom = require("jsdom");
const { JSDOM } = jsdom;

let fileContent = fs.readFileSync('data/products.js', 'utf8');
let start = fileContent.indexOf('{');
let end = fileContent.lastIndexOf('}');
global.window = {};
global.window.MEDIKEM_DATA = JSON.parse(fileContent.substring(start, end + 1));

const dom = new JSDOM(`<!DOCTYPE html><html><body><div data-listing>
  <div data-crumbs></div>
  <h1 data-cat-title></h1>
  <div data-cat-intro></div>
  <div data-cat-media></div>
  <div data-subcats></div>
  <div data-filters-shell></div>
  <div data-grid></div>
  <div data-empty hidden></div>
</div></body></html>`, {
  url: "http://localhost/izdelki.html?kategorija=izposoja-medicinskih-pripomockov"
});
global.document = dom.window.document;
global.window = dom.window;
global.window.MEDIKEM_DATA = JSON.parse(fileContent.substring(start, end + 1));
global.history = dom.window.history;
global.location = dom.window.location;

// stub M
global.window.Medikem = {
  createPanel: () => ({ open: ()=>{}, close: ()=>{} }),
  reducedMotion: { matches: false }
};
global.M = global.window.Medikem;

let shopCode = fs.readFileSync('js/shop.js', 'utf8');
eval(shopCode);

try {
  console.log("GRID HTML length:", document.querySelector('[data-grid]').innerHTML.length);
} catch(e) {
  console.error("ERROR", e);
}
