import feedparser
import xml.etree.ElementTree as ET
import requests

# Load raw XML because feedparser skips custom <image> tags
rss_url = "https://backloggd.com/u/wazwer/reviews/rss/"
rss_data = requests.get(rss_url).text

# Parse the feed with feedparser for title, link, etc.
feed = feedparser.parse(rss_data)

# Parse raw XML with ElementTree to extract image URLs
root = ET.fromstring(rss_data)

# Create a mapping from <link> to <image><url>
link_to_image = {}
for item in root.findall(".//item"):
    link = item.find("link").text
    image_url = None
    image_elem = item.find("image/url")
    if image_elem is not None:
        image_url = image_elem.text
    link_to_image[link] = image_url

# Write HTML output
with open("public/rss.html", "w", encoding="utf-8") as f:
    f.write("<div class='rss-feed'>\n")
    for entry in feed.entries[:5]:
        f.write("<div class='rss-entry'>\n")
        image_url = link_to_image.get(entry.link)
        if image_url:
            f.write(f"<img src='{image_url}' alt='cover' style='max-width:100px;' />\n")
        f.write(f"<p><a href='{entry.link}' target='_blank'>{entry.title}</a></p>\n")
        f.write("</div>\n")
    f.write("</div>")
