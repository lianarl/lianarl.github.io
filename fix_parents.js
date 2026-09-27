const fs = require('fs');

function fixParents() {
  const html = fs.readFileSync('index.html', 'utf8');
  
  let fileContent = fs.readFileSync('data/products.js', 'utf8');
  let start = fileContent.indexOf('{');
  let end = fileContent.lastIndexOf('}');
  let dataStr = fileContent.substring(start, end + 1);
  let D = JSON.parse(dataStr);
  
  // Regex to match mainnav items with their children
  const navBlocks = html.split('<li class="mainnav__item');
  
  for (let i = 1; i < navBlocks.length; i++) {
    const block = navBlocks[i];
    
    // Find parent category slug
    const parentMatch = block.match(/<a class="mainnav__link"[^>]+href="izdelki\.html\?kategorija=([^"]+)"/);
    if (!parentMatch) continue;
    
    const parentSlug = parentMatch[1];
    if (!D.categories[parentSlug]) continue;
    
    // Reset children array
    D.categories[parentSlug].children = [];
    
    // Find children category slugs
    const megaLinksBlockMatch = block.match(/<ul class="mega__links"[^>]*>([\s\S]*?)<\/ul>/);
    if (megaLinksBlockMatch) {
      const linksHtml = megaLinksBlockMatch[1];
      const childMatches = [...linksHtml.matchAll(/href="izdelki\.html\?kategorija=([^"]+)"/g)];
      
      for (const m of childMatches) {
        const childSlug = m[1];
        if (D.categories[childSlug]) {
          D.categories[childSlug].parent = parentSlug;
          if (!D.categories[parentSlug].children.includes(childSlug)) {
            D.categories[parentSlug].children.push(childSlug);
          }
        }
      }
    }
  }

  // Recalculate counts and order.default
  const productsByCat = {};
  D.products.forEach(p => {
    p.categories.forEach(cSlug => {
      if (!productsByCat[cSlug]) productsByCat[cSlug] = [];
      productsByCat[cSlug].push(p.id);
    });
  });

  Object.keys(D.categories).forEach(cSlug => {
    const cat = D.categories[cSlug];
    const catItems = productsByCat[cSlug] || [];
    cat.count = catItems.length;
    if (!cat.order) cat.order = {};
    cat.order.default = [...catItems];
    cat.order.popularity = [...catItems];
    cat.order.date = [...catItems];
  });

  Object.keys(D.categories).forEach(cSlug => {
    const cat = D.categories[cSlug];
    if (cat.children && cat.children.length > 0) {
      let allIds = new Set(cat.order?.default || []);
      cat.children.forEach(childSlug => {
        const childItems = productsByCat[childSlug] || [];
        childItems.forEach(id => allIds.add(id));
      });
      cat.count = allIds.size;
      cat.order.default = Array.from(allIds);
      cat.order.popularity = Array.from(allIds);
      cat.order.date = Array.from(allIds);
    }
  });

  const output = 'window.MEDIKEM_DATA = ' + JSON.stringify(D, null, 2) + ';';
  fs.writeFileSync('data/products.js', output);
  console.log('Fixed parents and counts!');
}

fixParents();
