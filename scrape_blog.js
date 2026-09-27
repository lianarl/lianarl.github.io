const fs = require('fs');

async function buildBlog() {
  console.log('Fetching blog posts...');
  const res = await fetch('https://www.medikem.si/wp-json/wp/v2/posts?_embed=true&per_page=12');
  const posts = await res.json();
  
  let html = `
<main id="main" class="main container page-content">
  <div class="page-content__inner">
    <h1 class="page-title">Blog in novice</h1>
    <div class="blog-grid" style="display: grid; grid-template-columns: repeat(auto-fill, minmax(300px, 1fr)); gap: 30px; margin-top: 40px;">
`;

  for (const post of posts) {
    const title = post.title.rendered;
    const excerpt = post.excerpt.rendered.replace(/<[^>]+>/g, '').substring(0, 120) + '...';
    const link = post.link;
    const date = new Date(post.date).toLocaleDateString('sl-SI');
    
    let imgUrl = 'assets/img/hero/incrediwear.webp'; // fallback
    if (post._embedded && post._embedded['wp:featuredmedia'] && post._embedded['wp:featuredmedia'][0]) {
      imgUrl = post._embedded['wp:featuredmedia'][0].source_url;
    }
    
    html += `
      <article class="blog-card" style="border: 1px solid #eaeaea; border-radius: 12px; overflow: hidden; display: flex; flex-direction: column; transition: transform 0.3s ease, box-shadow 0.3s ease;">
        <a href="${link}" target="_blank" style="display: block; height: 200px; overflow: hidden;">
          <img src="${imgUrl}" alt="${title}" style="width: 100%; height: 100%; object-fit: cover; transition: transform 0.3s ease;" onmouseover="this.style.transform='scale(1.05)'" onmouseout="this.style.transform='scale(1)'">
        </a>
        <div style="padding: 20px; flex-grow: 1; display: flex; flex-direction: column;">
          <time style="font-size: 0.85rem; color: #888; margin-bottom: 10px;">${date}</time>
          <h2 style="font-size: 1.25rem; margin-bottom: 10px; line-height: 1.4;"><a href="${link}" target="_blank" style="color: inherit; text-decoration: none;">${title}</a></h2>
          <p style="font-size: 0.95rem; color: #555; line-height: 1.5; margin-bottom: 20px; flex-grow: 1;">${excerpt}</p>
          <a href="${link}" target="_blank" style="display: inline-block; padding: 10px 20px; background: #e4573d; color: white; border-radius: 6px; text-decoration: none; font-weight: 500; align-self: flex-start;">Preberi več</a>
        </div>
      </article>
    `;
  }
  
  html += `
    </div>
  </div>
</main>
`;

  let localHtml = fs.readFileSync('blog.html', 'utf8');
  localHtml = localHtml.replace(/<main id="main"[\s\S]*?<\/main>/i, html);
  fs.writeFileSync('blog.html', localHtml);
  console.log('Successfully updated blog.html');
}

buildBlog();
