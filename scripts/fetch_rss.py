import feedparser
import xml.etree.ElementTree as ET
import requests

# Load raw RSS feed XML from Backloggd
rss_url = "https://backloggd.com/u/wazwer/reviews/rss/"
rss_data = requests.get(rss_url).text

# Parse the XML to access custom tags (like <image><url>)
root = ET.fromstring(rss_data)

# Parse the standard parts using feedparser
feed = feedparser.parse(rss_data)

# Map link -> image URL, description, pubDate
link_to_data = {}
for item in root.findall(".//item"):
    link = item.findtext("link")
    image_url = item.findtext("image/url")
    description = item.findtext("description")
    pub_date = item.findtext("pubDate")
    link_to_data[link] = {
        "image": image_url,
        "description": description,
        "pubDate": pub_date
    }

# Output HTML file
with open("public/rss.html", "w", encoding="utf-8") as f:
    f.write("<div class='rss-feed'>\n")
    for entry in feed.entries[:5]:
        data = link_to_data.get(entry.link, {})
        image = data.get("image")
        description = data.get("description", "").strip()
        pub_date = data.get("pubDate", "").strip()

        f.write("<div class='rss-entry' style='margin-bottom: 1em;'>\n")

        if image:
            f.write(f"<img src='{image}' alt='cover' style='max-width: 100px; display: block;' />\n")

        f.write(f"<p><a href='{entry.link}' target='_blank'><strong>{entry.title}</strong></a></p>\n")

        if pub_date:
            f.write(f"<p style='font-size: 0.9em; color: gray;'>{pub_date}</p>\n")

        if description:
            f.write(f"<p>{description}</p>\n")

        f.write("</div>\n")
    f.write("</div>\n")
