# Tattoo Consent Form site

A static site intended for GitHub Pages.

## Customize

1. Edit `terms.txt` to change the terms. It supports headings, paragraphs, bold, italics, links, block quotes, and ordered or unordered lists.
2. Edit the sections and questions in `questions.json` to add, remove, reorder, or change form content. Supported question types are `text`, `singleChoice`, `checkbox`, and `signature`. Text questions can use `text`, `number`, or `date` inputs, and a `singleChoice` question can include an `other` text field.
3. Update the `version` in `questions.json` whenever its questions change.
4. Update `TERMS_VERSION` in `app.js` whenever the terms change.

## Test locally

Because browsers do not allow `fetch()` from a page opened directly with `file://`, serve the folder locally. For example:

```sh
python -m http.server 8000
```

Then visit `http://localhost:8000`.

## Submission storage and Excel export

GitHub Pages is a static host and cannot modify an Excel file in the repository. This site stores submission history in the visitor's browser (`localStorage`) and downloads `tattoo-consent-submissions.xlsx` after each submission. The **Download Excel log** button exports the browser's complete local history again.

The Excel writer is pinned to SheetJS `0.20.3` from its official CDN. For a shared, authoritative log across visitors and devices, connect the form to a backend. Never put Google service-account credentials or another secret in frontend JavaScript; `.gitignore` does not protect a credential delivered to a browser.

## PDF email setup

The form sends each completed consent form to a Google Apps Script web app. The script creates a temporary Google Doc, converts it to PDF, emails the PDF, and moves the temporary document to trash.

1. Create a standalone project at `script.google.com`.
2. Copy `google-apps-script/Code.gs` and `google-apps-script/appsscript.json` into that project.
3. Set or confirm the fixed `RECIPIENT_EMAIL` in `Code.gs`.
4. Deploy the project as a web app that executes as you and is accessible to anyone who may submit the form.
5. Copy the deployed `/exec` URL into `PDF_EMAIL_ENDPOINT` in `app.js`.
6. Submit a test consent form and confirm the PDF arrives before publishing the site.

No Google credential file belongs in this repository. Apps Script handles authorization in the Google account that owns the deployment. The public endpoint has a fixed recipient and validates payload size, but it can still be targeted for spam; use a managed e-signature or protected backend if stronger abuse controls or identity verification are required.
