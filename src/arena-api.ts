import browser from "webextension-polyfill";

// CLIENT_ID and REDIRECT removed - handled by background script
// console.log("Are.na Redirect URL:", REDIRECT); // Removed - not needed here

type Board = { id: number; title: string };

// Type for the response from the background script
interface TokenResponse {
    token: string | null;
    error?: string;
}


// Request token from background script
async function getTokenFromBackground(): Promise<string | null> {
    // console.log("Requesting token from background script...");
    try {
        const response: TokenResponse = await browser.runtime.sendMessage({ type: "GET_ARENA_TOKEN" });
        if (response.error) {
            console.error("Error received from background script:", response.error);
            return null;
        }
        if (response.token) {
            // console.log("Token received from background script."); // Less verbose
            return response.token;
        } else {
            // console.log("Background script reported no token (auth likely cancelled or failed).");
            return null;
        }
    } catch (error) {
        console.error("Error sending message to background script or processing response:", error);
        // This might happen if the background script is inactive or couldn't be reached.
        // Check extension logs/reloading might be necessary.
        return null;
    }
}

// Public function to ensure token is available
export async function ensureApiToken(): Promise<string | null> {
    return await getTokenFromBackground();
}

// --- User Info --- 

// Helper to get current user's info (including ID)
async function getUserInfo(token: string): Promise<{ id: number } | null> {
    // console.log("Fetching user info...");
    try {
        const res = await fetch(`https://api.are.na/v2/me`, {
            headers: { Authorization: `Bearer ${token}` }
        });

        if (!res.ok) {
            const errorText = await res.text();
            console.error("Failed to fetch user info:", res.status, errorText);
            return null;
        }

        const userData = await res.json();
        if (!userData || typeof userData.id !== 'number') {
            console.error("User ID not found in response:", userData);
            return null;
        }
        // console.log("User info obtained, ID:", userData.id);
        return { id: userData.id };

    } catch (error) {
        console.error("Error during user info fetch:", error);
        return null;
    }
}

// Helper to fetch user's 3 most recently updated channels
async function fetchUserRecentChannels(token: string, userId: number): Promise<Board[]> {
    // console.log(`Fetching 3 recent channels for user ID: ${userId}`);
    const url = `https://api.are.na/v2/users/${userId}/channels?sort=updated_at&direction=desc&per=3`;

    try {
        const res = await fetch(url, {
            headers: { Authorization: `Bearer ${token}` }
        });

        if (!res.ok) {
            const errorText = await res.text();
            console.error("Failed to fetch user channels:", res.status, errorText);
            return [];
        }

        const { channels } = await res.json();
        const recentBoards: Board[] = channels?.map((ch: any) => ({ id: ch.id, title: ch.title })) || [];
        // console.log(`Found ${recentBoards.length} recent channels.`);
        return recentBoards;

    } catch (error) {
        console.error("Error during user channel fetch:", error);
        return [];
    }
}

// Exported function to fetch and store initial recent boards if none exist locally
export async function populateInitialRecentBoards(token: string): Promise<void> {
    try {
        const currentRecents = await getRecentBoards();
        if (currentRecents.length > 0) {
            // console.log("Local recent boards already exist, skipping initial fetch.");
            return;
        }

        // console.log("No local recent boards found, fetching from API...");
        const userInfo = await getUserInfo(token);
        if (!userInfo) {
            console.error("Could not get user info to fetch initial boards.");
            return;
        }

        const apiRecentBoards = await fetchUserRecentChannels(token, userInfo.id);
        if (apiRecentBoards.length > 0) {
            // console.log(`Storing ${apiRecentBoards.length} fetched recent boards locally.`);
            await browser.storage.local.set({ recentBoards: apiRecentBoards });
        } else {
            // console.log("No recent boards found via API, local storage remains empty for now.");
        }

    } catch (error) {
        console.error("Error in populateInitialRecentBoards:", error);
        // Non-critical, the extension can proceed without initial recents
    }
}

// --- Board Management ---

// Get recent boards from storage
export async function getRecentBoards(): Promise<Board[]> {
    try {
        const { recentBoards = [] } = (await browser.storage.local.get("recentBoards")) as { recentBoards?: Board[] };
        return recentBoards;
    } catch (error) {
        console.error("Error getting recent boards:", error);
        return [];
    }
}

// Search user's boards via API
export async function searchArenaBoards(token: string, term: string): Promise<Board[]> {
    if (!term?.trim()) return [];
    // console.log(`Searching for board: "${term}"`);

    try {
        const res = await fetch(`https://api.are.na/v2/search?q=${encodeURIComponent(term)}&per=10&type=channels`, {
            headers: { Authorization: `Bearer ${token}` }
        });

        if (!res.ok) {
            const errorText = await res.text();
            console.error("Board search failed:", res.status, errorText);
            // Propagate error or return empty? Returning empty for now.
            return []; 
        }

        const { channels } = await res.json();
        // Map API response to our Board type
        const foundBoards: Board[] = channels?.map((ch: any) => ({ id: ch.id, title: ch.title })) || [];
        // console.log(`Found ${foundBoards.length} boards matching "${term}"`);
        return foundBoards;

    } catch (error) {
        console.error("Error during board search fetch:", error);
        return [];
    }
}

// Save image URL to a specific board
export async function saveToBoard(
    token: string, 
    board: Board, 
    imageUrl: string, 
    pageUrl: string
): Promise<{success: boolean, message: string}> {
    // console.log(`Saving image to board: ${board.title} (${board.id}) from ${pageUrl}`); // Updated log (optional)
    try {
        const bodyPayload: { source: string; original_source_url?: string } = { 
            source: imageUrl 
        };
        
        if (pageUrl) {
            bodyPayload.original_source_url = pageUrl; // <-- Add original_source_url if present
        }

        const response = await fetch(`https://api.are.na/v2/channels/${board.id}/blocks`, {
            method: "POST",
            headers: { "Authorization": `Bearer ${token}`, "Content-Type": "application/json" },
            body: JSON.stringify(bodyPayload) // <-- Use the payload object
        });

        if (!response.ok) {
            const errorText = await response.text();
            console.error("Failed to save block:", response.status, errorText);
            return { success: false, message: `Error: ${response.status}` };
        }

        // console.log("Block saved successfully.");

        // Update recent boards list
        try {
            const { recentBoards = [] } = (await browser.storage.local.get("recentBoards")) as { recentBoards?: Board[] };
            const updated = [board, ...recentBoards.filter((b: Board) => b.id !== board.id)].slice(0, 3);
            await browser.storage.local.set({ recentBoards: updated });
            // console.log("Recent boards updated.");
        } catch (storageError) {
            console.error("Failed to update recent boards:", storageError);
            // Non-critical error, saving succeeded anyway
        }

        return { success: true, message: "Saved!" };

    } catch (error) {
        console.error("Error during saveToBoard fetch:", error);
        return { success: false, message: "Error saving block." };
    }
}


// --- Old / Deprecated --- 

// Old function - kept temporarily for reference if needed, but should be removed
/*
export async function pickBoardAndSave(imageUrl: string): Promise<{success: boolean, message: string}> { 
    console.log("pickBoardAndSave called with:", imageUrl);
    try {
        const token = await getTokenFromBackground();
        if (!token) {
            return { success: false, message: "Login required or failed." };
        }
        console.log("Token obtained via background.");

        // REMOVED chooseBoard LOGIC - should be handled by UI now
        // ... 

        // This function should no longer be called directly like this
        return { success: false, message: "Function deprecated" };

    } catch (error) {
        console.error("Error in pickBoardAndSave:", error);
        return { success: false, message: "Error saving." };
    }
}
*/

// chooseBoard function removed - now handled by UI