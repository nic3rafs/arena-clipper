import browser from "webextension-polyfill";

// ---- Are.na Auth Logic ----
const CLIENT_ID = "ZMhCuoCSLMPEEHAv-ouY1Lk36bTwV-iNbJkL_q7zAjs";

let REDIRECT_URL: string;
try {
  REDIRECT_URL = browser.identity.getRedirectURL();
  // console.log("REDIRECT_URL", REDIRECT_URL); // Keep commented for occasional debugging if needed
} catch (e) {
  console.error("Error getting redirect URL. Ensure 'identity' permission is in manifest.", e);
  REDIRECT_URL = "";
}

async function ensureToken(): Promise<string | null> {
    if (!REDIRECT_URL) {
        console.error("Cannot proceed with auth, Redirect URL is missing.");
        return null;
    }

    const storageResult = await browser.storage.local.get("token");

    try {
      const token = storageResult?.token as string | undefined;

      if (token) {
        return token;
      }
  
      const authUrl =
        `https://dev.are.na/oauth/authorize?response_type=code` +
        `&client_id=${CLIENT_ID}&redirect_uri=${encodeURIComponent(REDIRECT_URL)}`;
  
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
          redirect_uri: REDIRECT_URL
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
        if (error instanceof Error && (error.message.includes("cancelled") || error.message.includes("closed"))) {
          return null; 
        }
        return null;
    }
  }
// ---- End Auth Logic ----

browser.runtime.onInstalled.addListener(() => {
  // Perform any setup on installation if needed
});

// Listen for messages from content scripts
// @ts-ignore - Linter struggles with async listener return type (true | undefined)
browser.runtime.onMessage.addListener((message, sender, sendResponse) => {
    if (typeof message !== 'object' || message === null || !('type' in message) || typeof message.type !== 'string') {
        console.warn("Received malformed message:", message);
        // Synchronous return path (effectively returns undefined)
        return;
    }

    if (message.type === "GET_ARENA_TOKEN") {
        // Asynchronous path: Start the async operation and return true immediately.
        ensureToken().then(token => {
            sendResponse({ token: token });
        }).catch(error => {
            console.error("Error handling GET_ARENA_TOKEN:", error);
            sendResponse({ token: null, error: error.message });
        });
        return true; 
    }

    // If message type is not GET_ARENA_TOKEN, do nothing and let the function end.
    // This is implicitly a synchronous return path (returns undefined).
});

