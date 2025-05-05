import browser from "webextension-polyfill";



// ---- Are.na Auth Logic ----
const CLIENT_ID = "ZMhCuoCSLMPEEHAv-ouY1Lk36bTwV-iNbJkL_q7zAjs";
// Calculate REDIRECT_URL within the background script context
let REDIRECT_URL: string;
try {
  REDIRECT_URL = browser.identity.getRedirectURL();
} catch (e) {
  console.error("Error getting redirect URL. Ensure 'identity' permission is in manifest.", e);
  REDIRECT_URL = ""; // Fallback or handle error appropriately
}


async function ensureToken(): Promise<string | null> {
    if (!REDIRECT_URL) {
        console.error("Cannot proceed with auth, Redirect URL is missing.");
        return null;
    }

    const storageResult = await browser.storage.local.get("token");

    try {
      const token = storageResult?.token as string | undefined; // Try accessing from logged result

      if (token) {
        return token;
      }
  
      const authUrl =
        `https://dev.are.na/oauth/authorize?response_type=code` +
        `&client_id=${CLIENT_ID}&redirect_uri=${encodeURIComponent(REDIRECT_URL)}`;
  
      // Make sure popups are not blocked for the extension
      const redirectUriWithCode = await browser.identity.launchWebAuthFlow({ url: authUrl, interactive: true });
  
      // --- Step 2: Exchange code for token --- 
      const codeMatch = new URL(redirectUriWithCode).searchParams.get("code");
      if (!codeMatch) {
          console.error("Could not extract code from redirect URL:", redirectUriWithCode);
          throw new Error("Authorization code extraction failed");
      }
  
      const code = codeMatch;
  
      const tokenUrl = `https://dev.are.na/oauth/token`;
      const tokenParams = new URLSearchParams({
          grant_type: "authorization_code",
          code: code,
          client_id: CLIENT_ID,
          redirect_uri: REDIRECT_URL // Must match the one used in the initial request
          // Note: Are.na doesn't typically require client_secret for this flow with installed apps
      });
  
      const tokenResponse = await fetch(tokenUrl, {
          method: "POST",
          headers: {
              "Content-Type": "application/x-www-form-urlencoded"
          },
          body: tokenParams.toString()
      });
  
      if (!tokenResponse.ok) {
          const errorText = await tokenResponse.text();
          console.error("Failed to exchange code for token:", tokenResponse.status, errorText);
          throw new Error(`Token exchange failed: ${tokenResponse.status}`);
      }
  
      const tokenData = await tokenResponse.json();
      const accessToken = tokenData.access_token;
  
      if (!accessToken) {
          console.error("Access token not found in token response:", tokenData);
          throw new Error("Access token missing from response");
      }
  
      await browser.storage.local.set({ token: accessToken });
      return accessToken;
    } catch (error) {
        console.error("Error in ensureToken (background):", error);
        // Check if user closed the auth window or other specific errors
        if (error instanceof Error && (error.message.includes("cancelled") || error.message.includes("closed"))) {
          return null; 
        }
        // Rethrow or handle other errors if needed
        return null;
    }
  }
// ---- End Auth Logic ----

browser.runtime.onInstalled.addListener(() => {
});

// Listen for messages from content scripts
// @ts-ignore - Linter struggles with async listener return type (true | undefined)
browser.runtime.onMessage.addListener((message, sender, sendResponse) => {
    // Type guard to safely check message structure
    if (typeof message !== 'object' || message === null || !('type' in message) || typeof message.type !== 'string') {
        console.warn("Received malformed message:", message);
        return; // Return undefined for sync handling
    }

    // Now safely access message.type
    if (message.type === "GET_ARENA_TOKEN") {
        // Call ensureToken and send the result back asynchronously
        ensureToken().then(token => {
            sendResponse({ token: token });
        }).catch(error => {
            console.error("Error handling GET_ARENA_TOKEN:", error);
            sendResponse({ token: null, error: error.message }); // Send error back
        });
        return true; // Indicate async response
    }

    // If message type is not handled, return undefined (sync handling)
    return;
});

