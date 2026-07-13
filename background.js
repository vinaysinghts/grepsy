// Logify Service Worker - background.js

chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
  if (message.action === "forceActivate") {
    handleForceActivate(message.tabId)
      .then((res) => sendResponse(res))
      .catch((err) => sendResponse({ success: false, error: err.message }));
    return true; // Keep channel open for async response
  }
});

async function handleForceActivate(tabId) {
  // 1. Probe the content type of the target tab first
  const results = await chrome.scripting.executeScript({
    target: { tabId: tabId },
    func: () => {
      const isPreOnly = document.body && document.body.children.length === 1 && document.body.firstElementChild.tagName === 'PRE';
      const hasNoChildren = document.body && document.body.children.length === 0;
      return {
        contentType: document.contentType || "",
        pathname: window.location.pathname.toLowerCase(),
        isRawText: isPreOnly || hasNoChildren,
        bodyTextLength: document.body ? document.body.innerText.length : 0
      };
    }
  });

  if (!results || !results[0] || !results[0].result) {
    throw new Error("Unable to access tab details.");
  }

  const { contentType, pathname, isRawText, bodyTextLength } = results[0].result;

  const isLog = pathname.endsWith('.log') || pathname.endsWith('.txt') || pathname.endsWith('.json') || pathname.endsWith('.yaml') || pathname.endsWith('.yml');
  const isPlain = contentType.startsWith('text/plain') || contentType.startsWith('application/json') || contentType.startsWith('text/yaml') || contentType.startsWith('application/x-yaml');

  // Strict check: Must look like raw plain text or have the correct file extension/content type
  if (!isLog && !isPlain && !isRawText) {
    throw new Error("Logify can only be applied to raw plain text, JSON, or YAML logs.");
  }

  if (bodyTextLength === 0) {
    throw new Error("The target tab has no text content to format.");
  }

  // 2. Set force activation flag in tab's global window
  await chrome.scripting.executeScript({
    target: { tabId: tabId },
    func: () => {
      window.LOGIFY_FORCE_ACTIVATE = true;
    }
  });

  // 3. Programmatically inject content styling and code
  await chrome.scripting.insertCSS({
    target: { tabId: tabId },
    files: ["content.css"]
  });

  await chrome.scripting.executeScript({
    target: { tabId: tabId },
    files: ["content.js"]
  });

  return { success: true };
}
