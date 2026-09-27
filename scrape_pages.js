const fs = require('fs');
const sanitizeHtml = require('sanitize-html');
const { JSDOM } = require('jsdom');

const pagesToScrape = [
  'kontakt',
  'o-podjetju',
  'splosni-pogoji-poslovanja',
  'nacin-placila',
  'nakup-in-dostava',
  'reklamacije',
  'varovanje-osebnih-podatkov',
  'poslovalnice',
  'poslovalnica-muta',
  'poslovalnica-ravne-na-koroskem',
  'zzzs-narocilnica-za-izdajo-in-izposojo-pripomockov',
  'piskotki'
];

async function run() {
  for (const slug of pagesToScrape) {
    console.log(`Fetching ${slug}...`);
    try {
      const res = await fetch(`https://www.medikem.si/wp-json/wp/v2/pages?slug=${slug}`);
      const data = await res.json();
      if (!data || data.length === 0) {
        console.log(`Page ${slug} not found via API`);
        continue;
      }
      
      const pageData = data[0];
      const title = pageData.title.rendered;
      const rawHtml = pageData.content.rendered;
      
      // We will parse with JSDOM first to remove unwanted Elementor junk (like empty wrappers)
      const dom = new JSDOM(rawHtml);
      const doc = dom.window.document;
      
      // Clean up common Elementor clutter before sanitizing
      // (sanitizeHtml will strip tags, but might leave empty text nodes or weird spacing)
      
      const cleanHtml = sanitizeHtml(rawHtml, {
        allowedTags: ['h1', 'h2', 'h3', 'h4', 'h5', 'h6', 'p', 'a', 'ul', 'ol', 'li', 'b', 'i', 'strong', 'em', 'strike', 'br', 'img', 'table', 'thead', 'tbody', 'tr', 'th', 'td', 'blockquote'],
        allowedAttributes: {
          'a': [ 'href', 'target' ],
          'img': [ 'src', 'alt', 'width', 'height' ]
        },
        exclusiveFilter: function(frame) {
          // Remove empty paragraphs
          if (frame.tag === 'p' && !frame.text.trim()) {
            return true;
          }
          return false;
        }
      });
      
      // Wrap it in a nice container for our frontend
      const newMainContent = `
<main id="main" class="main container page-content">
  <div class="page-content__inner">
    <h1 class="page-title">${title}</h1>
    <div class="page-body">
      ${cleanHtml}
    </div>
  </div>
</main>`;

      // Now we read the local file and replace the existing <main> tag
      const filename = `${slug}.html`;
      if (!fs.existsSync(filename)) {
        console.log(`Local file ${filename} not found`);
        continue;
      }
      
      let localHtml = fs.readFileSync(filename, 'utf8');
      
      // Replace <main ...> ... </main>
      // We use a regex to match the entire main block
      localHtml = localHtml.replace(/<main id="main"[\s\S]*?<\/main>/i, newMainContent);
      
      // Also update the <title> tag
      localHtml = localHtml.replace(/<title>.*?<\/title>/i, `<title>${title} – Medikem</title>`);
      
      fs.writeFileSync(filename, localHtml);
      console.log(`Successfully updated ${filename}`);
      
    } catch (e) {
      console.error(`Error processing ${slug}:`, e);
    }
  }
}

run();
