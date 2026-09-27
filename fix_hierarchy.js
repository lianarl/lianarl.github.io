const fs = require('fs');
let fileContent = fs.readFileSync('data/products.js', 'utf8');
let start = fileContent.indexOf('{');
let end = fileContent.lastIndexOf('}');
let D = JSON.parse(fileContent.substring(start, end + 1));

const html = fs.readFileSync('index.html', 'utf8');

// Parse parents and children
let currentParent = null;
let hierarchy = {};

// We can just find all category links
const regex = /<a [^>]*href="izdelki\.html\?kategorija=([^"]+)"/g;
let match;

// Wait, better to split by "mainnav__item"
const items = html.split('class="mainnav__item');
items.forEach(item => {
  const parentMatch = item.match(/class="mainnav__link"[^>]*href="izdelki\.html\?kategorija=([^"]+)"/);
  if (parentMatch) {
    const parentSlug = parentMatch[1];
    hierarchy[parentSlug] = new Set();
    const childMatches = [...item.matchAll(/<li><a href="izdelki\.html\?kategorija=([^"]+)"/g)];
    childMatches.forEach(m => {
      hierarchy[parentSlug].add(m[1]);
    });
  }
});

console.log('Parsed hierarchy:', Object.fromEntries(Object.entries(hierarchy).map(([k,v])=>[k, Array.from(v)])));

// Rebuild parent categories in D.categories
Object.keys(hierarchy).forEach(parentSlug => {
  const children = Array.from(hierarchy[parentSlug]);
  
  if (!D.categories[parentSlug]) {
    D.categories[parentSlug] = {
      name: parentSlug.split('-').map((w,i)=>i===0?w.charAt(0).toUpperCase()+w.slice(1):w).join(' '),
      slug: parentSlug,
      description: '',
      image: '',
      order: { default: [], popularity: [], date: [] },
      count: 0
    };
  }
  
  D.categories[parentSlug].children = children;
  
  let allIds = new Set();
  children.forEach(childSlug => {
    if (D.categories[childSlug]) {
      D.categories[childSlug].order.default.forEach(id => allIds.add(id));
    }
  });
  
  // also include any direct products if they exist
  if (D.categories[parentSlug].order.default) {
    D.categories[parentSlug].order.default.forEach(id => allIds.add(id));
  }
  
  D.categories[parentSlug].order.default = Array.from(allIds);
  D.categories[parentSlug].order.popularity = Array.from(allIds);
  D.categories[parentSlug].order.date = Array.from(allIds);
  D.categories[parentSlug].count = allIds.size;
});

const output = 'window.MEDIKEM_DATA = ' + JSON.stringify(D, null, 2) + ';';
fs.writeFileSync('data/products.js', output);
console.log('Successfully updated hierarchy!');
