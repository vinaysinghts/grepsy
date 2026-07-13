// Logify Settings Script - popup.js

document.addEventListener("DOMContentLoaded", async () => {
  const masterToggle = document.getElementById("master-toggle");
  const forceVirtualToggle = document.getElementById("force-virtual-toggle");
  const activateBtn = document.getElementById("activate-tab-btn");
  const statusBanner = document.getElementById("status-banner");

  let customErrorTerms = [];
  let customWarnTerms = [];

  // 1. Restore saved states from local storage
  try {
    const data = await chrome.storage.local.get({
      enabled: true,
      forceVirtualScroll: false,
      customErrorTerms: [],
      customWarnTerms: []
    });
    masterToggle.checked = data.enabled;
    forceVirtualToggle.checked = data.forceVirtualScroll;
    customErrorTerms = data.customErrorTerms;
    customWarnTerms = data.customWarnTerms;
  } catch (err) {
    console.error("Failed to load settings from storage:", err);
  }

  // 2. Attach listeners to save states on change
  masterToggle.addEventListener("change", () => {
    chrome.storage.local.set({ enabled: masterToggle.checked });
  });

  forceVirtualToggle.addEventListener("change", () => {
    chrome.storage.local.set({ forceVirtualScroll: forceVirtualToggle.checked });
  });

  // 3. Manual Activation
  activateBtn.addEventListener("click", async () => {
    // Disable button to prevent double-click issues
    activateBtn.disabled = true;
    activateBtn.textContent = "Checking Tab...";
    showStatus("", "hidden");

    try {
      const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
      if (!tab || !tab.id) {
        throw new Error("Unable to retrieve the active browser tab.");
      }

      // Check for restricted URLs (e.g. chrome://, edge://, extension pages)
      if (tab.url.startsWith("chrome://") || tab.url.startsWith("edge://") || tab.url.startsWith("about:") || tab.url.startsWith("chrome-extension://")) {
        throw new Error("Logify cannot run on browser internal systems.");
      }

      activateBtn.textContent = "Activating Logify...";
      
      // Dispatch message to background worker for suitability check and injection
      chrome.runtime.sendMessage(
        { action: "forceActivate", tabId: tab.id },
        (response) => {
          if (chrome.runtime.lastError) {
            showStatus(chrome.runtime.lastError.message, "error");
          } else if (response && response.success) {
            showStatus("Logify successfully applied to this tab!", "success");
            // Close popup after a short delay on success
            setTimeout(() => window.close(), 1500);
          } else {
            showStatus(response.error || "Incompatible log content.", "error");
          }
          resetActivateBtn();
        }
      );
    } catch (err) {
      showStatus(err.message, "error");
      resetActivateBtn();
    }
  });

  function resetActivateBtn() {
    activateBtn.disabled = false;
    activateBtn.innerHTML = `<span class="btn-icon">⚡</span> Activate on This Tab`;
  }

  function showStatus(message, type) {
    statusBanner.className = "status-banner";
    if (type === "hidden") {
      statusBanner.classList.add("hidden");
    } else {
      statusBanner.classList.add(type);
      statusBanner.textContent = message;
    }
  }

  // 4. Custom Keywords Management
  const errorListEl = document.getElementById("error-keywords-list");
  const warnListEl = document.getElementById("warn-keywords-list");
  const errorInput = document.getElementById("add-error-input");
  const warnInput = document.getElementById("add-warn-input");
  const addErrorBtn = document.getElementById("add-error-btn");
  const addWarnBtn = document.getElementById("add-warn-btn");

  function renderKeywords() {
    errorListEl.innerHTML = "";
    warnListEl.innerHTML = "";

    customErrorTerms.forEach((term, index) => {
      const chip = document.createElement("div");
      chip.className = "keyword-chip error-chip";
      chip.innerHTML = `
        <span>${term}</span>
        <span class="remove-keyword" data-type="error" data-idx="${index}">&times;</span>
      `;
      errorListEl.appendChild(chip);
    });

    customWarnTerms.forEach((term, index) => {
      const chip = document.createElement("div");
      chip.className = "keyword-chip warn-chip";
      chip.innerHTML = `
        <span>${term}</span>
        <span class="remove-keyword" data-type="warn" data-idx="${index}">&times;</span>
      `;
      warnListEl.appendChild(chip);
    });
  }

  // Initial render
  renderKeywords();

  // Add term handlers
  function addTerm(type) {
    const input = type === "error" ? errorInput : warnInput;
    const value = input.value.trim().toLowerCase();
    if (!value) return;

    if (type === "error") {
      if (!customErrorTerms.includes(value)) {
        customErrorTerms.push(value);
        chrome.storage.local.set({ customErrorTerms });
      }
    } else {
      if (!customWarnTerms.includes(value)) {
        customWarnTerms.push(value);
        chrome.storage.local.set({ customWarnTerms });
      }
    }
    input.value = "";
    renderKeywords();
  }

  addErrorBtn.addEventListener("click", () => addTerm("error"));
  addWarnBtn.addEventListener("click", () => addTerm("warn"));
  
  errorInput.addEventListener("keydown", (e) => {
    if (e.key === "Enter") addTerm("error");
  });
  warnInput.addEventListener("keydown", (e) => {
    if (e.key === "Enter") addTerm("warn");
  });

  // Remove term handler
  document.body.addEventListener("click", (e) => {
    if (e.target.classList.contains("remove-keyword")) {
      const type = e.target.dataset.type;
      const idx = parseInt(e.target.dataset.idx, 10);
      if (type === "error") {
        customErrorTerms.splice(idx, 1);
        chrome.storage.local.set({ customErrorTerms });
      } else {
        customWarnTerms.splice(idx, 1);
        chrome.storage.local.set({ customWarnTerms });
      }
      renderKeywords();
    }
  });
});
