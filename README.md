# Terms and Conditions site

A static site intended for GitHub Pages.

## Customize

1. Edit `terms.txt` to change the terms. It supports headings, paragraphs, bold, italics, links, block quotes, and ordered or unordered lists.
2. Edit `questions.json` to add, remove, reorder, or change form questions. Supported types are `text`, `singleChoice`, and `checkbox`. A `singleChoice` question can include an `other` text field.
3. Update the `version` in `questions.json` whenever its questions change.
4. Update `TERMS_VERSION` in `app.js` whenever the terms change.
5. Replace the sample contact address in `terms.txt`.

## Test locally

Because browsers do not allow `fetch()` from a page opened directly with `file://`, serve the folder locally. For example:

```sh
python -m http.server 8000
```

Then visit `http://localhost:8000`.

## Acceptance storage and Excel export

GitHub Pages is a static host and cannot modify an Excel file in the repository. This site stores acceptance history in the visitor's browser (`localStorage`) and downloads `terms-acceptances.xlsx` after each submission. The **Download Excel log** button exports the browser's complete local history again.

The Excel writer is pinned to SheetJS `0.20.3` from its official CDN. For a shared, authoritative log across visitors and devices, connect the form to a backend. Never put Google service-account credentials or another secret in frontend JavaScript; `.gitignore` does not protect a credential delivered to a browser.
