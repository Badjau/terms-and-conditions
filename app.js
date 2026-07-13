const TERMS_FILE = "terms.txt";
const TERMS_VERSION = "2026-07-13";
const STORAGE_KEY = "terms-and-conditions-acceptances";

const termsElement = document.querySelector("#terms");
const form = document.querySelector("#acceptance-form");
const nameInput = document.querySelector("#full-name");
const agreementInput = document.querySelector("#agreement");
const acceptButton = document.querySelector("#accept-button");
const statusElement = document.querySelector("#status");

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

function updateButtonState() {
  acceptButton.disabled = !(
    nameInput.value.trim().length > 0 &&
    agreementInput.checked &&
    termsElement.dataset.loaded === "true"
  );
}

function loadStoredAcceptances() {
  try {
    const saved = JSON.parse(localStorage.getItem(STORAGE_KEY) || "[]");
    return Array.isArray(saved) ? saved : [];
  } catch {
    return [];
  }
}

function downloadReceipt(receipt) {
  const blob = new Blob([`${JSON.stringify(receipt, null, 2)}\n`], {
    type: "application/json"
  });
  const url = URL.createObjectURL(blob);
  const link = document.createElement("a");
  const safeName = receipt.name.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "") || "user";

  link.href = url;
  link.download = `acceptance-${safeName}-${receipt.acceptedAt.slice(0, 10)}.json`;
  document.body.append(link);
  link.click();
  link.remove();
  URL.revokeObjectURL(url);
}

async function loadTerms() {
  try {
    const response = await fetch(TERMS_FILE, { cache: "no-cache" });
    if (!response.ok) throw new Error(`Could not load ${TERMS_FILE}`);
    termsElement.innerHTML = renderMarkdown(await response.text());
    termsElement.dataset.loaded = "true";
    termsElement.setAttribute("aria-busy", "false");
    updateButtonState();
  } catch (error) {
    termsElement.innerHTML = `<p>Terms could not be loaded. Please refresh the page.</p>`;
    termsElement.setAttribute("aria-busy", "false");
    statusElement.textContent = error.message;
    statusElement.classList.add("error");
  }
}

form.addEventListener("input", updateButtonState);

form.addEventListener("submit", (event) => {
  event.preventDefault();
  statusElement.classList.remove("error");

  if (!form.reportValidity() || termsElement.dataset.loaded !== "true") return;

  const receipt = {
    name: nameInput.value.trim(),
    accepted: true,
    acceptedAt: new Date().toISOString(),
    termsVersion: TERMS_VERSION,
    termsFile: TERMS_FILE
  };

  try {
    const acceptances = loadStoredAcceptances();
    acceptances.push(receipt);
    localStorage.setItem(STORAGE_KEY, JSON.stringify(acceptances));
    downloadReceipt(receipt);
    statusElement.textContent = "Terms accepted. Your JSON receipt has been downloaded.";
    form.reset();
    updateButtonState();
  } catch {
    statusElement.textContent = "Your browser blocked local storage. Please enable it and try again.";
    statusElement.classList.add("error");
  }
});

loadTerms();
