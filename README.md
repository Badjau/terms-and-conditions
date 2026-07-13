# Terms and Conditions site

A dependency-free static site intended for GitHub Pages.

## Customize

1. Edit `terms.txt` to change the terms. It supports headings, paragraphs, bold, italics, links, block quotes, and ordered or unordered lists.
2. Update `TERMS_VERSION` in `app.js` whenever the terms change.
3. Replace the sample contact address in `terms.txt`.

## Test locally

Because browsers do not allow `fetch()` from a page opened directly with `file://`, serve the folder locally. For example:

```sh
python -m http.server 8000
```

Then visit `http://localhost:8000`.

## Acceptance storage

GitHub Pages is a static host and cannot modify a JSON file in the repository. This site stores acceptance history in the visitor's browser (`localStorage`) and downloads a JSON receipt when they accept. `acceptances.example.json` shows the receipt format.

For a shared, authoritative acceptance log, connect the form to a backend or form service. Do not put a GitHub token or other secret in frontend JavaScript.
