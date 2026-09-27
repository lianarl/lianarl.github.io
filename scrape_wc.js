const fs = require('fs');

async function syncProducts() {
  console.log('Fetching products from WooCommerce Store API...');
  let allProducts = [];
  let page = 1;
  while (true) {
    try {
      const res = await fetch(`https://www.medikem.si/wp-json/wc/store/products?per_page=100&page=${page}`);
      const data = await res.json();
      if (!Array.isArray(data) || data.length === 0) {
        break; // No more products
      }
      console.log(`Fetched page ${page} with ${data.length} products`);
      allProducts.push(...data);
      page++;
    } catch (err) {
      console.error('Error fetching page', page, err);
      break;
    }
  }

  console.log(`Total fetched products: ${allProducts.length}`);

  // Load existing products.js to keep categories and structure
  let fileContent = fs.readFileSync('data/products.js', 'utf8');
  let start = fileContent.indexOf('{');
  let end = fileContent.lastIndexOf('}');
  let dataStr = fileContent.substring(start, end + 1);
  let D;
  try {
    D = JSON.parse(dataStr);
  } catch (e) {
    console.error('Failed to parse existing data/products.js');
    return;
  }

  // Create map of existing products by slug to retain any custom fields if needed
  const existingBySlug = new Map();
  if (D.products) {
    D.products.forEach(p => existingBySlug.set(p.slug, p));
  }

  const mappedProducts = allProducts.map(p => {
    const existing = existingBySlug.get(p.slug) || {};
    
    // Map the new fields
    const newProduct = {
      id: p.slug, // The frontend uses slug as id in some places, so keep it consistent with what we had
      slug: p.slug,
      name: p.name,
      brand: '', // WC store API does not easily expose brand, or it's in attributes
      sku: p.sku || '',
      url: p.permalink,
      type: p.type,
      price: parseInt(p.prices?.price || '0') / 10^p.prices?.currency_minor_unit,
      priceMax: parseInt(p.prices?.sale_price || p.prices?.regular_price || '0') / 10^p.prices?.currency_minor_unit,
      regular: parseInt(p.prices?.regular_price || '0') / 10^p.prices?.currency_minor_unit,
      inStock: p.is_in_stock,
      info: '',
      short: p.short_description || '',
      description: p.description || '',
      details: [],
      attributes: [],
      gallery: p.images ? p.images.map(img => ({
        sm: img.thumbnail || img.src,
        md: img.src,
        lg: img.src
      })) : [],
      rating: parseFloat(p.average_rating || '0'),
      reviewCount: p.review_count || 0,
      categories: p.categories ? p.categories.map(c => c.slug) : []
    };
    
    // Fix price math
    const divisor = Math.pow(10, p.prices?.currency_minor_unit || 2);
    newProduct.price = parseInt(p.prices?.price || '0') / divisor;
    newProduct.priceMax = parseInt(p.prices?.regular_price || p.prices?.price || '0') / divisor;
    newProduct.regular = parseInt(p.prices?.regular_price || '0') / divisor;
    
    return { ...existing, ...newProduct };
  });

  D.products = mappedProducts;

  // Re-write counts and default order in categories based on the newly synced products
  const productsByCat = {};
  mappedProducts.forEach(p => {
    p.categories.forEach(cSlug => {
      if (!productsByCat[cSlug]) productsByCat[cSlug] = [];
      productsByCat[cSlug].push(p.id);
    });
  });

  Object.keys(D.categories).forEach(cSlug => {
    const cat = D.categories[cSlug];
    const catItems = productsByCat[cSlug] || [];
    cat.count = catItems.length;
    // ensure order object exists
    if (!cat.order) cat.order = {};
    cat.order.default = catItems;
    // populate popularity with same items if missing
    if (!cat.order.popularity || cat.order.popularity.length !== catItems.length) {
      cat.order.popularity = [...catItems];
    }
  });

  // Calculate parent counts and aggregate child products into parent categories
  Object.keys(D.categories).forEach(cSlug => {
    const cat = D.categories[cSlug];
    if (cat.children && cat.children.length > 0) {
      let allIds = new Set(cat.order?.default || []);
      
      // Traverse immediate children (we assume max depth 2 here)
      cat.children.forEach(childSlug => {
        const childItems = productsByCat[childSlug] || [];
        childItems.forEach(id => allIds.add(id));
      });
      
      cat.count = allIds.size;
      cat.order.default = Array.from(allIds);
      cat.order.popularity = Array.from(allIds);
    }
  });

  const output = 'window.MEDIKEM_DATA = ' + JSON.stringify(D, null, 2) + ';';
  fs.writeFileSync('data/products.js', output);
  console.log('Successfully updated data/products.js');
}

syncProducts();
