#!/usr/bin/env python3
"""Generate sitemap.xml for the assembled GitHub Pages site.

Usage: python3 scripts/gen-sitemap.py <site-dir> <base-url>

Walks <site-dir> for .html pages and writes <site-dir>/sitemap.xml with one
<url> per page. Directory-index pages collapse to their directory URL; mdBook's
print.html and the 404 page are skipped. Run by the Site workflow after the book
and playground are assembled, so the sitemap always matches what actually shipped.
"""
import datetime
import os
import sys

site = sys.argv[1] if len(sys.argv) > 1 else "_site"
base = (sys.argv[2] if len(sys.argv) > 2 else "https://fatin-ishraq.github.io/ThoughtML").rstrip("/")

urls = set()
for root, _dirs, files in os.walk(site):
    for f in files:
        if not f.endswith(".html"):
            continue
        rel = os.path.relpath(os.path.join(root, f), site).replace(os.sep, "/")
        # Skip build artifacts and non-content pages.
        if rel.endswith("print.html") or rel == "404.html" or "/assets/" in rel:
            continue
        # The playground is a single-page app: index its landing URL only, not its
        # viewer template or the internal `vision*.html` mockups.
        if rel.startswith("playground/") and rel != "playground/index.html":
            continue
        if rel == "index.html":
            loc = base + "/"
        elif rel.endswith("/index.html"):
            loc = f"{base}/{rel[: -len('index.html')]}"
        else:
            loc = f"{base}/{rel}"
        urls.add(loc)

today = datetime.date.today().isoformat()
lines = [
    '<?xml version="1.0" encoding="UTF-8"?>',
    '<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">',
]
for u in sorted(urls):
    lines.append(f"  <url><loc>{u}</loc><lastmod>{today}</lastmod></url>")
lines.append("</urlset>")

with open(os.path.join(site, "sitemap.xml"), "w", encoding="utf-8") as fh:
    fh.write("\n".join(lines) + "\n")
print(f"sitemap.xml: {len(urls)} urls")
