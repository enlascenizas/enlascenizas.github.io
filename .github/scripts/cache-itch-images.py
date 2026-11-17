"""Copy the author's supplied public images into the deployed static site."""
from pathlib import Path
from urllib.request import Request, urlopen
import re
import time

root = Path('_site/en-el-abismo')
page = root / 'index.html'
html = page.read_text('utf8')
urls = list(dict.fromkeys(re.findall(r'https://img\.itch\.zone/[^"<>\s]+', html)))
folder = root / 'editorial'
folder.mkdir(exist_ok=True)
for index, url in enumerate(urls, 1):
    destination = folder / f'{index:02}.jpg'
    for attempt in range(3):
        try:
            request = Request(url, headers={'User-Agent': 'EnElAbismoWebsite/1.0'})
            with urlopen(request, timeout=40) as response:
                data = response.read()
                if response.status != 200 or not data.startswith(b'\xff\xd8'):
                    raise ValueError('Expected a JPEG image')
            destination.write_bytes(data)
            break
        except Exception:
            if attempt == 2:
                raise
            time.sleep(2)
    html = html.replace(url, f'editorial/{index:02}.jpg')
page.write_text(html, 'utf8')
print(f'Cached {len(urls)} author images locally.')
