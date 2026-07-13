const TERMS_FILE = "terms.txt";
const QUESTIONS_FILE = "questions.json";
const TERMS_VERSION = "2026-07-13-tattoo-consent";
const STORAGE_KEY = "terms-and-conditions-acceptances";
const PDF_EMAIL_ENDPOINT = "https://script.google.com/macros/s/AKfycbxcuKIVr_Lw6UU740FZSFB-WQKaCv6HCdQCyFtUsmMFPqp1rCDAaoSe9W67gcrWTsEq/exec";

const form = document.querySelector("#acceptance-form");
const questionsElement = document.querySelector("#questions");
const acceptButton = document.querySelector("#accept-button");
const exportButton = document.querySelector("#export-button");
const statusElement = document.querySelector("#status");

let formDefinition = null;
let termsMarkdown = null;
const signaturePads = new Map();

function escapeHtml(value) {
  return value
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#039;");
}

function inlineMarkdown(value) {
  return escapeHtml(value)
    .replace(/`([^`]+)`/g, "<code>$1</code>")
    .replace(/\*\*([^*]+)\*\*/g, "<strong>$1</strong>")
    .replace(/\*([^*]+)\*/g, "<em>$1</em>")
    .replace(/\[([^\]]+)\]\((https?:\/\/[^\s)]+)\)/g, '<a href="$2" target="_blank" rel="noopener noreferrer">$1</a>');
}

function renderMarkdown(markdown) {
  const lines = markdown.replaceAll("\r\n", "\n").split("\n");
  const output = [];
  let listType = null;

  function closeList() {
    if (listType) output.push(`</${listType}>`);
    listType = null;
  }

  for (const rawLine of lines) {
    const line = rawLine.trim();
    const heading = line.match(/^(#{1,3})\s+(.+)$/);
    const unordered = line.match(/^[-*]\s+(.+)$/);
    const ordered = line.match(/^\d+\.\s+(.+)$/);

    if (heading) {
      closeList();
      const level = heading[1].length;
      output.push(`<h${level}>${inlineMarkdown(heading[2])}</h${level}>`);
    } else if (unordered || ordered) {
      const nextListType = unordered ? "ul" : "ol";
      if (listType !== nextListType) {
        closeList();
        listType = nextListType;
        output.push(`<${listType}>`);
      }
      output.push(`<li>${inlineMarkdown((unordered || ordered)[1])}</li>`);
    } else if (line.startsWith("> ")) {
      closeList();
      output.push(`<blockquote>${inlineMarkdown(line.slice(2))}</blockquote>`);
    } else if (line) {
      closeList();
      output.push(`<p>${inlineMarkdown(line)}</p>`);
    } else {
      closeList();
    }
  }

  closeList();
  return output.join("\n");
}

function assertQuestion(question) {
  if (!question || !/^[A-Za-z][A-Za-z0-9_-]*$/.test(question.id || "")) {
    throw new Error("Every question needs a unique, safe id.");
  }

  if (!question.label || !["text", "singleChoice", "checkbox", "signature"].includes(question.type)) {
    throw new Error(`Question ${question.id} has an invalid label or type.`);
  }

  if (question.type === "singleChoice" && (!Array.isArray(question.options) || question.options.length < 2)) {
    throw new Error(`Question ${question.id} needs at least two options.`);
  }
}

function createSignatureQuestion(question) {
  const group = document.createElement("fieldset");
  const legend = document.createElement("legend");
  const canvas = document.createElement("canvas");
  const controls = document.createElement("div");
  const help = document.createElement("p");
  const clearButton = document.createElement("button");
  const context = canvas.getContext("2d");
  let drawing = false;
  let hasInk = false;

  group.className = "question question-signature";
  legend.textContent = question.label;
  canvas.className = "signature-pad";
  canvas.width = 1200;
  canvas.height = 360;
  canvas.setAttribute("role", "img");
  canvas.setAttribute("aria-label", `${question.label} drawing area`);
  help.className = "field-help";
  help.textContent = question.helpText || "Sign using your mouse, stylus, or finger.";
  clearButton.className = "clear-signature";
  clearButton.type = "button";
  clearButton.textContent = "Clear signature";
  controls.className = "signature-controls";
  controls.append(help, clearButton);

  if (!context) throw new Error("This browser does not support the signature pad.");

  context.lineCap = "round";
  context.lineJoin = "round";
  context.lineWidth = 5;
  context.strokeStyle = "#18212f";

  function pointFromEvent(event) {
    const bounds = canvas.getBoundingClientRect();
    return {
      x: (event.clientX - bounds.left) * (canvas.width / bounds.width),
      y: (event.clientY - bounds.top) * (canvas.height / bounds.height)
    };
  }

  canvas.addEventListener("pointerdown", (event) => {
    drawing = true;
    hasInk = true;
    canvas.setPointerCapture(event.pointerId);
    const point = pointFromEvent(event);
    context.beginPath();
    context.moveTo(point.x, point.y);
    context.lineTo(point.x + 0.1, point.y + 0.1);
    context.stroke();
    updateButtonState();
  });

  canvas.addEventListener("pointermove", (event) => {
    if (!drawing) return;
    const point = pointFromEvent(event);
    context.lineTo(point.x, point.y);
    context.stroke();
  });

  function stopDrawing(event) {
    if (!drawing) return;
    drawing = false;
    context.closePath();
    if (canvas.hasPointerCapture(event.pointerId)) canvas.releasePointerCapture(event.pointerId);
  }

  canvas.addEventListener("pointerup", stopDrawing);
  canvas.addEventListener("pointercancel", stopDrawing);

  clearButton.addEventListener("click", () => {
    context.clearRect(0, 0, canvas.width, canvas.height);
    hasInk = false;
    updateButtonState();
  });

  signaturePads.set(question.id, {
    canvas,
    clear() {
      context.clearRect(0, 0, canvas.width, canvas.height);
      hasInk = false;
    },
    hasInk: () => hasInk,
    toDataUrl: () => canvas.toDataURL("image/png")
  });

  group.append(legend, canvas, controls);
  return group;
}

function createTextQuestion(question) {
  const group = document.createElement("div");
  const label = document.createElement("label");
  const input = document.createElement("input");

  group.className = "question question-text";
  label.htmlFor = question.id;
  label.textContent = question.label;
  input.id = question.id;
  input.name = question.id;
  input.type = ["text", "number", "date"].includes(question.inputType) ? question.inputType : "text";
  input.required = Boolean(question.required);
  input.placeholder = question.placeholder || "";
  if (question.autocomplete) input.autocomplete = question.autocomplete;
  if (question.maxLength) input.maxLength = question.maxLength;
  if (question.min !== undefined) input.min = resolveInputDateValue(question.min);
  if (question.max !== undefined) input.max = resolveInputDateValue(question.max);
  if (question.step !== undefined) input.step = question.step;
  if (question.defaultValue !== undefined) {
    const defaultValue = resolveInputDateValue(question.defaultValue);
    input.value = defaultValue;
    input.defaultValue = defaultValue;
  }

  group.append(label, input);
  return group;
}

function todayAsInputDate() {
  const now = new Date();
  const localDate = new Date(now.getTime() - now.getTimezoneOffset() * 60000);
  return localDate.toISOString().slice(0, 10);
}

function resolveInputDateValue(value) {
  return value === "today" ? todayAsInputDate() : String(value);
}

function formatInputDate(value) {
  const match = /^(\d{4})-(\d{2})-(\d{2})$/.exec(value);
  return match ? `${match[2]}/${match[3]}/${match[1]}` : value;
}

function createCheckboxQuestion(question) {
  const group = document.createElement("div");
  const label = document.createElement("label");
  const input = document.createElement("input");
  const text = document.createElement("span");

  group.className = "question question-checkbox";
  label.className = "confirmation";
  label.htmlFor = question.id;
  input.id = question.id;
  input.name = question.id;
  input.type = "checkbox";
  input.required = Boolean(question.required);
  text.textContent = question.label;

  label.append(input, text);
  group.append(label);
  return group;
}

function createSingleChoiceQuestion(question) {
  const fieldset = document.createElement("fieldset");
  const legend = document.createElement("legend");
  const options = document.createElement("div");
  const otherInput = question.other ? document.createElement("input") : null;

  fieldset.className = "question question-choice";
  legend.textContent = question.label;
  options.className = "choice-options";

  const choices = [...question.options];
  if (question.other) choices.push({ value: "__other__", label: question.other.label || "Other" });

  choices.forEach((choice, index) => {
    const label = document.createElement("label");
    const input = document.createElement("input");
    const text = document.createElement("span");

    input.type = "radio";
    input.name = question.id;
    input.value = choice.value;
    input.required = Boolean(question.required) && index === 0;
    input.id = `${question.id}-${index + 1}`;
    text.textContent = choice.label;
    label.htmlFor = input.id;
    label.append(input, text);
    options.append(label);
  });

  if (otherInput) {
    otherInput.className = "other-input";
    otherInput.name = `${question.id}Other`;
    otherInput.type = "text";
    otherInput.placeholder = question.other.placeholder || "Please specify";
    otherInput.hidden = true;
    otherInput.disabled = true;
    otherInput.maxLength = question.other.maxLength || 250;

    options.addEventListener("change", () => {
      const selected = form.elements[question.id].value;
      const usesOther = selected === "__other__";
      otherInput.hidden = !usesOther;
      otherInput.disabled = !usesOther;
      otherInput.required = usesOther;
      if (!usesOther) otherInput.value = "";
      updateButtonState();
    });
  }

  fieldset.append(legend, options);
  if (otherInput) fieldset.append(otherInput);
  return fieldset;
}

function getConfiguredQuestions(definition = formDefinition) {
  if (!definition || !Array.isArray(definition.sections)) return [];
  return definition.sections.flatMap((section) =>
    (section.questions || []).map((question) => ({
      ...question,
      sectionId: section.id,
      sectionTitle: section.title
    }))
  );
}

function createQuestionElement(question) {
  if (question.type === "text") return createTextQuestion(question);
  if (question.type === "checkbox") return createCheckboxQuestion(question);
  if (question.type === "singleChoice") return createSingleChoiceQuestion(question);
  if (question.type === "signature") return createSignatureQuestion(question);
  throw new Error(`Question ${question.id} has an unsupported type.`);
}

function renderQuestions(definition) {
  if (!Array.isArray(definition.sections) || definition.sections.length === 0) {
    throw new Error("questions.json does not contain any sections.");
  }

  const ids = new Set();
  const fragment = document.createDocumentFragment();

  definition.sections.forEach((section) => {
    if (!section.id || !section.title || !Array.isArray(section.questions)) {
      throw new Error("Every form section needs an id, title, and questions array.");
    }

    const sectionElement = document.createElement("section");
    const heading = document.createElement("h2");
    const fields = document.createElement("div");
    sectionElement.className = "form-section";
    sectionElement.dataset.section = section.id;
    heading.textContent = section.title;
    fields.className = "section-fields";
    sectionElement.append(heading);

    if (section.includeTerms) {
      if (termsMarkdown === null) throw new Error("The waiver text has not loaded.");
      const terms = document.createElement("article");
      terms.id = "terms";
      terms.className = "waiver-text";
      terms.innerHTML = renderMarkdown(termsMarkdown);
      sectionElement.append(terms);
    }

    section.questions.forEach((question) => {
      assertQuestion(question);
      if (ids.has(question.id)) throw new Error(`Question id ${question.id} is duplicated.`);
      ids.add(question.id);
      fields.append(createQuestionElement(question));
    });

    sectionElement.append(fields);
    fragment.append(sectionElement);
  });

  questionsElement.replaceChildren(fragment);
  questionsElement.dataset.loaded = "true";
  questionsElement.setAttribute("aria-busy", "false");
  acceptButton.textContent = definition.submitLabel || "Submit";
}

function loadStoredAcceptances() {
  try {
    const saved = JSON.parse(localStorage.getItem(STORAGE_KEY) || "[]");
    return Array.isArray(saved) ? saved : [];
  } catch {
    return [];
  }
}

function updateButtonState() {
  const ready = termsMarkdown !== null && questionsElement.dataset.loaded === "true";
  acceptButton.disabled = !ready || !form.checkValidity() || !requiredSignaturesComplete();
  exportButton.disabled = loadStoredAcceptances().length === 0;
}

function requiredSignaturesComplete() {
  return getConfiguredQuestions()
    .filter((question) => question.type === "signature" && question.required)
    .every((question) => signaturePads.get(question.id)?.hasInk());
}

function collectAnswers() {
  return getConfiguredQuestions().map((question) => {
    let value;
    const field = form.elements[question.id];

    if (question.type === "signature") {
      value = signaturePads.get(question.id)?.hasInk() ? "Signed" : "Not signed";
    } else if (question.type === "checkbox") {
      value = field.checked ? "Yes" : "No";
    } else if (question.type === "singleChoice" && field.value === "__other__") {
      value = `Other: ${form.elements[`${question.id}Other`].value.trim()}`;
    } else {
      value = field.value.trim();
      if (question.inputType === "date") value = formatInputDate(value);
      if (question.inputType === "number" && value !== "") value = Number(value);
    }

    return {
      id: question.id,
      label: question.label,
      value,
      sectionId: question.sectionId,
      sectionTitle: question.sectionTitle
    };
  });
}

function getSignatureDataUrl() {
  const signatureQuestion = getConfiguredQuestions().find((question) => question.type === "signature");
  if (!signatureQuestion) return null;
  const signaturePad = signaturePads.get(signatureQuestion.id);
  return signaturePad?.hasInk() ? signaturePad.toDataUrl() : null;
}

async function sendPdfEmail(acceptance) {
  if (!PDF_EMAIL_ENDPOINT.startsWith("https://script.google.com/macros/s/")) {
    throw new Error("PDF email endpoint is not configured in app.js.");
  }

  const payload = {
    ...acceptance,
    termsTitle: document.querySelector("#page-title").textContent.trim(),
    termsText: document.querySelector("#terms").innerText.trim(),
    signatureDataUrl: getSignatureDataUrl(),
    browser: navigator.userAgent
  };

  await fetch(PDF_EMAIL_ENDPOINT, {
    method: "POST",
    mode: "no-cors",
    headers: { "Content-Type": "text/plain;charset=utf-8" },
    body: JSON.stringify(payload)
  });
}

function exportAcceptances(acceptances) {
  if (!window.XLSX) throw new Error("The Excel export library did not load.");

  const questionColumns = new Map();
  acceptances.forEach((acceptance) => {
    (acceptance.answers || []).forEach((answer) => questionColumns.set(answer.id, answer.label));
  });

  const questionIds = [...questionColumns.keys()];
  const rows = acceptances.map((acceptance) => {
    const answers = new Map((acceptance.answers || []).map((answer) => [answer.id, answer.value]));
    return [
      new Date(acceptance.submittedAt),
      acceptance.termsVersion,
      acceptance.questionsVersion,
      ...questionIds.map((id) => answers.get(id) ?? "")
    ];
  });
  const headers = ["Submitted at", "Consent version", "Questions version", ...questionIds.map((id) => questionColumns.get(id))];
  const worksheet = XLSX.utils.aoa_to_sheet([headers, ...rows], { cellDates: true });
  const workbook = XLSX.utils.book_new();

  worksheet["!cols"] = [
    { wch: 22 },
    { wch: 16 },
    { wch: 18 },
    ...questionIds.map((id) => ({ wch: Math.min(55, Math.max(14, questionColumns.get(id).length + 2)) }))
  ];
  worksheet["!autofilter"] = { ref: worksheet["!ref"] };
  XLSX.utils.book_append_sheet(workbook, worksheet, "Consent Forms");
  XLSX.writeFile(workbook, "tattoo-consent-submissions.xlsx", { cellDates: true, compression: true });
}

async function loadTerms() {
  const response = await fetch(TERMS_FILE, { cache: "no-cache" });
  if (!response.ok) throw new Error(`Could not load ${TERMS_FILE}`);
  termsMarkdown = await response.text();
}

async function loadQuestions() {
  const response = await fetch(QUESTIONS_FILE, { cache: "no-cache" });
  if (!response.ok) throw new Error(`Could not load ${QUESTIONS_FILE}`);
  formDefinition = await response.json();
}

function showLoadError(error) {
  statusElement.textContent = error.message;
  statusElement.classList.add("error");
  questionsElement.setAttribute("aria-busy", "false");
}

form.addEventListener("input", updateButtonState);

form.addEventListener("submit", async (event) => {
  event.preventDefault();
  statusElement.classList.remove("error");

  if (!form.reportValidity() || !requiredSignaturesComplete() || !formDefinition || termsMarkdown === null) return;

  const acceptance = {
    submittedAt: new Date().toISOString(),
    termsVersion: TERMS_VERSION,
    questionsVersion: formDefinition.version || "unversioned",
    answers: collectAnswers()
  };
  const acceptances = loadStoredAcceptances();
  acceptances.push(acceptance);

  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(acceptances));
  } catch (error) {
    statusElement.textContent = "Your browser blocked local storage. The consent form was not saved.";
    statusElement.classList.add("error");
    return;
  }

  let excelExported = false;
  try {
    exportAcceptances(acceptances);
    excelExported = true;
  } catch (error) {
    statusElement.textContent = `Declaration saved locally, but Excel export failed: ${error.message}`;
    statusElement.classList.add("error");
  }

  acceptButton.disabled = true;
  acceptButton.textContent = "Sending PDF...";
  let emailRequested = false;
  try {
    await sendPdfEmail(acceptance);
    emailRequested = true;
  } catch (error) {
    statusElement.textContent = `${excelExported ? "Excel downloaded. " : ""}${error.message}`;
    statusElement.classList.add("error");
  }

  form.reset();
  document.querySelectorAll(".other-input").forEach((input) => {
    input.hidden = true;
    input.disabled = true;
    input.required = false;
  });
  signaturePads.forEach((signaturePad) => signaturePad.clear());
  acceptButton.textContent = formDefinition.submitLabel || "Submit";
  updateButtonState();

  if (excelExported && emailRequested) {
    statusElement.textContent = "Declaration saved, Excel downloaded, and the PDF email request was sent.";
    statusElement.classList.remove("error");
  }
});

exportButton.addEventListener("click", () => {
  try {
    exportAcceptances(loadStoredAcceptances());
    statusElement.textContent = "The Excel log has been downloaded.";
    statusElement.classList.remove("error");
  } catch (error) {
    statusElement.textContent = error.message;
    statusElement.classList.add("error");
  }
});

Promise.all([loadTerms(), loadQuestions()])
  .then(() => {
    renderQuestions(formDefinition);
    updateButtonState();
  })
  .catch(showLoadError);
