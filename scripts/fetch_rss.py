# fetch_rss.py
import feedparser

feed_url = "https://backloggd.com/u/wazwer/reviews/rss/"
feed = feedparser.parse(feed_url)

with open("public/rss.html", "w", encoding="utf-8") as f:
    f.write("<div class='rss-feed'>\n")
    for entry in feed.entries[:5]:
        f.write(f"<p><a href='{entry.link}' target='_blank'>{entry.title}</a></p>\n")
        f.write(f"<p>{entry.pubDate}</p>\n")
        f.write(f"<p>{entry.description}</p>\n")
        
    f.write("</div>")
