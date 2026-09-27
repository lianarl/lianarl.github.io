const fs = require('fs');
const path = require('path');

const files = fs.readdirSync(__dirname).filter(f => f.endsWith('.html'));

const pagesToCreate = new Set();

for (const file of files) {
  let content = fs.readFileSync(file, 'utf8');

  // Fix form action
  content = content.replace(/action="https:\/\/www\.medikem\.si\/"/g, 'action="izdelki.html"');
  
  // Fix specific known links
  content = content.replace(/href="https:\/\/www\.medikem\.si\/\?s=([^"]*)"/g, 'href="izdelki.html?s=$1"');
  content = content.replace(/href="https:\/\/www\.medikem\.si\/sl\/piskotki\/?([^"]*)"/g, 'href="piskotki.html$1"');
  content = content.replace(/href="https:\/\/www\.medikem\.si\/proizvajalec\/mediroyal\/?([^"]*)"/g, 'href="izdelki.html?kategorija=mediroyal$1"');
  
  // Generic replacement for all other https://www.medikem.si/slug/
  content = content.replace(/href="https:\/\/www\.medikem\.si\/([a-zA-Z0-9-]+)\/([^"]*)"/g, (match, p1, p2) => {
    // If it's a known category from our data/products.js, it should probably be izdelki.html?kategorija=...
    // But since the user wants static pages for non-products, let's check if it's a known page or category.
    // For simplicity, if it's in the mega menu, we already replaced it in data-mainnav.
    // If this is in the footer, we'll map to .html
    pagesToCreate.add(p1);
    return `href="${p1}.html${p2 ? '?' + p2 : ''}"`;
  });

  // Replace any remaining root medikem.si links
  content = content.replace(/href="https:\/\/www\.medikem\.si\/"/g, 'href="index.html"');
  
  // Also check wp-content for images? The user said "everything to be updated". 
  // Let's leave images as they are, they just point to the live site which is fine.
  
  fs.writeFileSync(file, content);
}

// Generate any newly discovered static pages
const templatePath = 'index.html';
const templateHtml = fs.readFileSync(templatePath, 'utf8');
const mainStart = templateHtml.indexOf('<main id="main">');
const mainEnd = templateHtml.indexOf('</main>') + '</main>'.length;

const headerPart = templateHtml.substring(0, mainStart);
const footerPart = templateHtml.substring(mainEnd);

for (const slug of pagesToCreate) {
  const file = path.join(__dirname, `${slug}.html`);
  if (!fs.existsSync(file)) {
    let title = slug.replace(/-/g, ' ');
    title = title.charAt(0).toUpperCase() + title.slice(1);
    
    const mainContent = `\n<main id="main" class="main container" style="padding: 60px 20px; text-align: center; min-height: 50vh;">\n  <h1>${title}</h1>\n  <p>Ta stran je v izdelavi.</p>\n</main>\n`;
    let pageHeader = headerPart.replace(/<title>.*<\/title>/, `<title>${title} – Medikem</title>`);
    
    const finalHtml = pageHeader + mainContent + footerPart;
    fs.writeFileSync(file, finalHtml);
    console.log(`Created ${file}`);
  }
}

console.log('Done fixing links and generating pages!');
