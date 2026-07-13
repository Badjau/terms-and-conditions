const TERMS_FILE = "terms.txt";
const QUESTIONS_FILE = "questions.json";
const TERMS_VERSION = "2026-07-13";
const STORAGE_KEY = "terms-and-conditions-acceptances";

const termsElement = document.querySelector("#terms");
const form = document.querySelector("#acceptance-form");
const questionsElement = document.querySelector("#questions");
const acceptButton = document.querySelector("#accept-button");
const exportButton = document.querySelector("#export-button");
const statusElement = document.querySelector("#status");

let formDefinition = null;

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

  if (!question.label || !["text", "singleChoice", "checkbox"].includes(question.type)) {
    throw new Error(`Question ${question.id} has an invalid label or type.`);
  }

  if (question.type === "singleChoice" && (!Array.isArray(question.options) || question.options.length < 2)) {
    throw new Error(`Question ${question.id} needs at least two options.`);
  }
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
  input.type = "text";
  input.required = Boolean(question.required);
  input.placeholder = question.placeholder || "";
  if (question.autocomplete) input.autocomplete = question.autocomplete;
  if (question.maxLength) input.maxLength = question.maxLength;

  group.append(label, input);
  return group;
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

function renderQuestions(definition) {
  if (!Array.isArray(definition.questions) || definition.questions.length === 0) {
    throw new Error("questions.json does not contain any questions.");
  }

  const ids = new Set();
  const fragment = document.createDocumentFragment();

  definition.questions.forEach((question) => {
    assertQuestion(question);
    if (ids.has(question.id)) throw new Error(`Question id ${question.id} is duplicated.`);
    ids.add(question.id);

    if (question.type === "text") fragment.append(createTextQuestion(question));
    if (question.type === "checkbox") fragment.append(createCheckboxQuestion(question));
    if (question.type === "singleChoice") fragment.append(createSingleChoiceQuestion(question));
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
  const ready = termsElement.dataset.loaded === "true" && questionsElement.dataset.loaded === "true";
  acceptButton.disabled = !ready || !form.checkValidity();
  exportButton.disabled = loadStoredAcceptances().length === 0;
}

function collectAnswers() {
  return formDefinition.questions.map((question) => {
    let value;
    const field = form.elements[question.id];

    if (question.type === "checkbox") {
      value = field.checked ? "Yes" : "No";
    } else if (question.type === "singleChoice" && field.value === "__other__") {
      value = `Other: ${form.elements[`${question.id}Other`].value.trim()}`;
    } else {
      value = field.value.trim();
    }

    return { id: question.id, label: question.label, value };
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
  const headers = ["Submitted at", "Terms version", "Questions version", ...questionIds.map((id) => questionColumns.get(id))];
  const worksheet = XLSX.utils.aoa_to_sheet([headers, ...rows], { cellDates: true });
  const workbook = XLSX.utils.book_new();

  worksheet["!cols"] = [
    { wch: 22 },
    { wch: 16 },
    { wch: 18 },
    ...questionIds.map((id) => ({ wch: Math.min(55, Math.max(14, questionColumns.get(id).length + 2)) }))
  ];
  worksheet["!autofilter"] = { ref: worksheet["!ref"] };
  XLSX.utils.book_append_sheet(workbook, worksheet, "Acceptances");
  XLSX.writeFile(workbook, "terms-acceptances.xlsx", { cellDates: true, compression: true });
}

async function loadTerms() {
  const response = await fetch(TERMS_FILE, { cache: "no-cache" });
  if (!response.ok) throw new Error(`Could not load ${TERMS_FILE}`);
  termsElement.innerHTML = renderMarkdown(await response.text());
  termsElement.dataset.loaded = "true";
  termsElement.setAttribute("aria-busy", "false");
}

async function loadQuestions() {
  const response = await fetch(QUESTIONS_FILE, { cache: "no-cache" });
  if (!response.ok) throw new Error(`Could not load ${QUESTIONS_FILE}`);
  formDefinition = await response.json();
  renderQuestions(formDefinition);
}

function showLoadError(error) {
  statusElement.textContent = error.message;
  statusElement.classList.add("error");
  termsElement.setAttribute("aria-busy", "false");
  questionsElement.setAttribute("aria-busy", "false");
}

form.addEventListener("input", updateButtonState);

form.addEventListener("submit", (event) => {
  event.preventDefault();
  statusElement.classList.remove("error");

  if (!form.reportValidity() || !formDefinition || termsElement.dataset.loaded !== "true") return;

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
    statusElement.textContent = "Your browser blocked local storage. The declaration was not saved.";
    statusElement.classList.add("error");
    return;
  }

  form.reset();
  document.querySelectorAll(".other-input").forEach((input) => {
    input.hidden = true;
    input.disabled = true;
    input.required = false;
  });
  updateButtonState();

  try {
    exportAcceptances(acceptances);
    statusElement.textContent = "Declaration saved. The updated Excel log has been downloaded.";
  } catch (error) {
    statusElement.textContent = `Declaration saved locally, but Excel export failed: ${error.message}`;
    statusElement.classList.add("error");
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
  .then(updateButtonState)
  .catch(showLoadError);
