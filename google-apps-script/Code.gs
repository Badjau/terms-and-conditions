const RECIPIENT_EMAIL = "franzvasquez4153@gmail.com";
const EMAIL_SUBJECT = "New Tattoo Consent Form";
const MAX_TERMS_LENGTH = 50000;
const MAX_SIGNATURE_LENGTH = 1500000;
const MAX_REQUEST_LENGTH = 2100000;

function doPost(event) {
  try {
    if (!event.postData || !event.postData.contents || event.postData.contents.length > MAX_REQUEST_LENGTH) {
      throw new Error("Request is missing or too large.");
    }
    const payload = JSON.parse(event.postData.contents);
    validatePayload(payload);
    const pdf = createDeclarationPdf(payload);
    const submitter = findAnswer(payload.answers, "fullName") || "Unknown submitter";

    MailApp.sendEmail({
      to: RECIPIENT_EMAIL,
      subject: `${EMAIL_SUBJECT}: ${submitter}`,
      body: `A tattoo consent form from ${submitter} is attached as a PDF.`,
      name: "Tattoo Consent Form",
      attachments: [pdf]
    });

    return jsonResponse({ ok: true });
  } catch (error) {
    console.error(error);
    return jsonResponse({ ok: false, error: error.message });
  }
}

function validatePayload(payload) {
  if (RECIPIENT_EMAIL === "recipient@example.com") {
    throw new Error("Recipient email is not configured.");
  }
  if (!payload || !Array.isArray(payload.answers) || !payload.submittedAt) {
    throw new Error("Invalid submission payload.");
  }
  if (!payload.termsText || payload.termsText.length > MAX_TERMS_LENGTH) {
    throw new Error("Terms content is missing or too large.");
  }
  if (!payload.signatureDataUrl || payload.signatureDataUrl.length > MAX_SIGNATURE_LENGTH) {
    throw new Error("Signature is missing or too large.");
  }
  if (!/^data:image\/png;base64,/.test(payload.signatureDataUrl)) {
    throw new Error("Signature must be a PNG data URL.");
  }
  if (payload.answers.length > 100 || payload.answers.some((answer) =>
    !answer || String(answer.label || "").length > 500 || String(answer.value || "").length > 5000 ||
    String(answer.sectionTitle || "").length > 200)) {
    throw new Error("Submission answers are invalid or too large.");
  }
}

function createDeclarationPdf(payload) {
  const safeName = sanitizeFileName(findAnswer(payload.answers, "fullName") || "submission");
  const document = DocumentApp.create(`Tattoo consent form - ${safeName}`);
  const documentId = document.getId();

  try {
    const body = document.getBody();
    body.setMarginTop(54).setMarginBottom(54).setMarginLeft(54).setMarginRight(54);
    body.appendParagraph(payload.termsTitle || "Tattoo Consent Form")
      .setHeading(DocumentApp.ParagraphHeading.TITLE);
    body.appendParagraph("by: tooless.pokes").editAsText().setItalic(true);
    body.appendParagraph(`Submitted: ${formatDate(payload.submittedAt)}`);
    body.appendParagraph(`Consent version: ${payload.termsVersion || "Unversioned"}`);
    body.appendParagraph(`Questions version: ${payload.questionsVersion || "Unversioned"}`);
    body.appendHorizontalRule();

    let currentSection = null;
    payload.answers.forEach((answer) => {
      const sectionTitle = answer.sectionTitle || "Responses";
      if (answer.sectionId !== currentSection) {
        currentSection = answer.sectionId;
        body.appendParagraph(sectionTitle).setHeading(DocumentApp.ParagraphHeading.HEADING1);
        if (answer.sectionId === "acknowledgement") {
          body.appendParagraph(payload.termsText);
        }
      }

      if (answer.id === "signature") {
        body.appendParagraph(answer.label).editAsText().setBold(true);
        appendSignature(body, payload.signatureDataUrl);
      } else {
        body.appendParagraph(answer.label).editAsText().setBold(true);
        const answerValue = answer.value === "" || answer.value === null || answer.value === undefined
          ? "No response"
          : String(answer.value);
        body.appendParagraph(answerValue);
      }
    });

    body.appendHorizontalRule();
    body.appendParagraph(`Browser: ${payload.browser || "Not provided"}`)
      .editAsText()
      .setForegroundColor("#666666")
      .setFontSize(8);

    document.saveAndClose();
    return DriveApp.getFileById(documentId)
      .getAs(MimeType.PDF)
      .setName(`tattoo-consent-${safeName}.pdf`);
  } finally {
    DriveApp.getFileById(documentId).setTrashed(true);
  }
}

function appendSignature(body, signatureDataUrl) {
  const signatureBytes = Utilities.base64Decode(signatureDataUrl.split(",")[1]);
  const signatureBlob = Utilities.newBlob(signatureBytes, "image/png", "signature.png");
  const signatureImage = body.appendImage(signatureBlob);
  if (signatureImage.getWidth() > 420) {
    const aspectRatio = signatureImage.getHeight() / signatureImage.getWidth();
    signatureImage.setWidth(420).setHeight(Math.round(420 * aspectRatio));
  }
}

function findAnswer(answers, id) {
  const answer = answers.find((item) => item.id === id);
  return answer && answer.value !== null && answer.value !== undefined ? String(answer.value) : "";
}

function sanitizeFileName(value) {
  return String(value)
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 80) || "submission";
}

function formatDate(value) {
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) throw new Error("Invalid submission date.");
  return Utilities.formatDate(date, Session.getScriptTimeZone(), "yyyy-MM-dd HH:mm:ss z");
}

function jsonResponse(data) {
  return ContentService.createTextOutput(JSON.stringify(data))
    .setMimeType(ContentService.MimeType.JSON);
}
