const fs = require('fs');

let fileContent = fs.readFileSync('data/products.js', 'utf8');
let start = fileContent.indexOf('{');
let end = fileContent.lastIndexOf('}');
let D = JSON.parse(fileContent.substring(start, end + 1));

// Collect all unique categories from products
let catSlugs = new Set();
D.products.forEach(p => {
  p.categories.forEach(c => catSlugs.add(c));
});

// Helper to format name from slug
function formatName(slug) {
  return slug
    .split('-')
    .map((word, i) => i === 0 ? word.charAt(0).toUpperCase() + word.slice(1) : word)
    .join(' ');
}

// Add missing categories
catSlugs.forEach(slug => {
  if (!D.categories[slug]) {
    D.categories[slug] = {
      name: formatName(slug),
      slug: slug,
      description: '',
      image: '',
      order: {
        default: [],
        popularity: [],
        date: []
      },
      count: 0
    };
  }
});

// Clear out product arrays for auto-generated categories so we can rebuild them
catSlugs.forEach(slug => {
  // Only rebuild if it's an auto-generated one (no description/image) or we want to ensure correctness
  // Wait, let's just make sure EVERY product in the category is in the order arrays!
});

// Re-map all products to their categories
Object.keys(D.categories).forEach(slug => {
  const cat = D.categories[slug];
  // Clear the existing orders to rebuild them from scratch based on D.products
  // Actually, we should KEEP existing ordering if possible, but for missing ones just append.
  let currentProducts = new Set(cat.order.default);
  
  D.products.forEach(p => {
    if (p.categories.includes(slug)) {
      if (!currentProducts.has(p.id)) {
        cat.order.default.push(p.id);
        cat.order.popularity.push(p.id);
        if (cat.order.date) cat.order.date.push(p.id);
      }
    }
  });
  
  // Also clean up any products that were REMOVED from the category
  cat.order.default = cat.order.default.filter(id => {
    const p = D.products.find(prod => prod.id === id);
    return p && p.categories.includes(slug);
  });
  cat.order.popularity = cat.order.popularity.filter(id => {
    const p = D.products.find(prod => prod.id === id);
    return p && p.categories.includes(slug);
  });
  
  cat.count = cat.order.default.length;
});

const output = 'window.MEDIKEM_DATA = ' + JSON.stringify(D, null, 2) + ';';
fs.writeFileSync('data/products.js', output);
console.log('Successfully fixed categories!');
