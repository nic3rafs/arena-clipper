import { searchArenaBoards, type Board } from "../arena-api"; // Need this for searching
import '../style.css'; // Import the CSS file directly
import browser from "webextension-polyfill"; // Import the browser object

// Define Board type if needed (might be better in a shared types file later)
// type Board = { id: number; title: string }; // Removed - now imported

let activeOverlay: { img: HTMLImageElement, box: HTMLDivElement, timerId: number | null } | null = null;

function removeOverlay(immediate = false) {
  if (!activeOverlay) return;

  if (activeOverlay.timerId) {
    clearTimeout(activeOverlay.timerId);
    activeOverlay.timerId = null;
  }

  const overlayToRemove = activeOverlay; // Capture the current overlay context

  const doRemove = () => {
    if (overlayToRemove.box.parentNode) {
        overlayToRemove.box.parentNode.removeChild(overlayToRemove.box);
    }
    delete overlayToRemove.img.dataset.arenaOverlay; // Clean up dataset marker
    if (activeOverlay === overlayToRemove) { // Only nullify if it's still the active one
        activeOverlay = null;
    }
  };

  if (immediate) {
    doRemove();
  } else {
    // Add a small delay to allow moving mouse from image to button
    activeOverlay.timerId = setTimeout(doRemove, 100) as any as number;
  }
}

function createOverlay(img: HTMLImageElement) {
  // If overlay exists for *this* image and timer is running, clear timer
  if (activeOverlay?.img === img && activeOverlay.timerId) {
      clearTimeout(activeOverlay.timerId);
      activeOverlay.timerId = null;
      return; // Don't recreate if it's the same image
  }

  // If overlay exists for a *different* image, remove it immediately
  if (activeOverlay && activeOverlay.img !== img) {
      removeOverlay(true);
  }

  // If overlay already exists for this image (no timer), do nothing
  if (img.dataset.arenaOverlay) return;


  img.dataset.arenaOverlay = "1";

  // Container
  const box = document.createElement("div");
  box.className = "arena-overlay";
  box.style.position = "absolute";

  // --- Calculate Position using getBoundingClientRect ---
  const buttonWidthEstimate = 40; // Width of the button container itself initially
  const imgRect = img.getBoundingClientRect();
  const scrollX = window.scrollX;
  const scrollY = window.scrollY;
  
  // Calculate desired top position (relative to document) - Place near image top
  let finalTop = scrollY + imgRect.top + 5;
  
  // Calculate desired left position (relative to document) - Place near image top-right
  let finalLeft = scrollX + imgRect.right - buttonWidthEstimate; // Aim for top-right initially
  
  // Prevent negative coordinates if somehow calculated
  finalTop = Math.max(0, finalTop);
  finalLeft = Math.max(0, finalLeft);
  
  // Apply final calculated position
  box.style.top = finalTop + "px";
  box.style.left = finalLeft + "px";
  // --- End Position Calculation ---

  // One button
  const btn = document.createElement("button");
  btn.className = "arena-save-button"; // Add class for styling/selection
  btn.dataset.evt = "arena";
  btn.setAttribute("aria-label", "Save to Are.na");

  // Use browser.runtime.getURL to access the SVG file in the extension package
  const logoUrl = browser.runtime.getURL("arena-logo.svg");
  // Create image and status span separately
  const imgElement = document.createElement("img");
  imgElement.src = logoUrl;
  imgElement.alt = "Save to Are.na";
  imgElement.classList.add("arena-logo-icon"); // Add class for specific targeting

  const statusSpan = document.createElement("span");
  statusSpan.classList.add("arena-status-text");
  statusSpan.style.display = "none"; // Initially hidden

  btn.append(imgElement);
  btn.append(statusSpan);
  box.append(btn);

  // --- Board Selector UI (Hidden by default) ---
  const boardSelector = document.createElement("div");
  boardSelector.className = "arena-board-selector";
  boardSelector.style.display = "none"; // Initially hidden
  boardSelector.innerHTML = `
    <div class="arena-board-selector-header">Choose Board</div>
    <div class="arena-board-selector-recents">
        <div class="arena-list-title">Recent:</div>
        <ul class="arena-board-list arena-recent-list"></ul>
    </div>
    <div class="arena-board-selector-search">
        <input type="search" placeholder="Search boards..." class="arena-search-input" />
        <div class="arena-list-title arena-search-results-title" style="display: none;">Search Results:</div>
        <ul class="arena-board-list arena-search-results-list"></ul>
        <div class="arena-search-message"></div>
    </div>
    <button class="arena-cancel-button">Cancel</button>
  `;
  box.append(boardSelector);

  box.addEventListener("click", e => {
    console.log("Overlay clicked! Target:", e.target, "CurrentTarget:", e.currentTarget);
    const tgt = e.target as HTMLElement;
    
    // Check if the click happened on or inside the save button
    const saveButtonClicked = tgt.closest<HTMLButtonElement>('.arena-save-button'); // Specify type
    if (saveButtonClicked && saveButtonClicked.dataset.evt) { // Check dataset exists
        e.stopPropagation(); // Stop event from bubbling to underlying elements
        e.preventDefault();  // Prevent default action (e.g., following link)

        const buttonElement = saveButtonClicked as HTMLButtonElement; // We know it's a button
        // Dispatch event to trigger the handler (which will then call showBoardSelector)
        document.dispatchEvent(
          new CustomEvent(`image:${buttonElement.dataset.evt}`, { // Use button's dataset evt
            detail: {
               imgSrc: img.src,
               buttonElement: buttonElement,
               pageUrl: window.location.href
             }
          })
        );
    } 
    // Note: Clicks inside boardSelector will be handled by showBoardSelector logic later
  });

  // Keep overlay if mouse moves onto it
  box.addEventListener("mouseover", () => {
      if (activeOverlay?.timerId) {
          clearTimeout(activeOverlay.timerId);
          activeOverlay.timerId = null;
      }
  });

  // Remove overlay if mouse moves out of it
  box.addEventListener("mouseout", () => {
      removeOverlay();
  });

  // Add the overlay DIRECTLY to the body
  document.body.append(box);

  // Track the new overlay
  activeOverlay = { img, box, timerId: null };

  // Start removal timer when mouse leaves the image
  img.addEventListener("mouseout", () => {
      removeOverlay();
  }, { once: true }); // Add listener once per overlay creation

}

// Debounce mouseover handler slightly
let mouseoverTimeout: number | null = null;
document.addEventListener("mouseover", e => {
  if (mouseoverTimeout) clearTimeout(mouseoverTimeout);

  mouseoverTimeout = setTimeout(() => {
      const el = e.target as HTMLElement;
      // ---- Add logging here ----
      // console.log("Mouseover timeout fired. Target element:", el);
      // -------------------------

      // Ensure we are hovering an image directly, not the overlay itself
      if (el.tagName === "IMG" && !el.closest('.arena-overlay')) {
          // console.log("Target is IMG and not overlay, calling createOverlay."); // Log success
          createOverlay(el as HTMLImageElement);
      }
      // If hovering something else, ensure removal logic might trigger
      else if (el.tagName !== "IMG") {
          // console.log("Target is not IMG:", el.tagName);
      } else if (el.closest('.arena-overlay')) {
          // console.log("Target is inside an existing overlay.");
      } else if (!el.closest('.arena-overlay') && !(el.tagName === 'IMG')) { // Keep original else-if logic if needed for other cases
          // If mouse moves rapidly over non-image/non-overlay elements,
          // ensure any pending removal timer isn't cancelled incorrectly.
          // The removeOverlay() called via 'mouseout' on img/box handles most cases.
      }
  }, 50) as any as number; // Short delay to prevent flickering
});

// Handle cases where mouse leaves the window
document.addEventListener('mouseleave', () => {
    removeOverlay(true);
});

// --- Board Selector Logic (NEW) ---

// Utility to debounce function calls
function debounce<F extends (...args: any[]) => any>(func: F, waitFor: number) {
    let timeoutId: number | null = null;
  
    return (...args: Parameters<F>): Promise<ReturnType<F>> =>
      new Promise(resolve => {
        if (timeoutId) {
          clearTimeout(timeoutId);
        }
  
        timeoutId = setTimeout(() => resolve(func(...args)), waitFor) as any as number;
      });
  }

// Helper to create list items
function createBoardListItem(board: Board, onClick: (board: Board) => void): HTMLLIElement {
    const li = document.createElement("li");
    li.textContent = board.title;
    li.dataset.boardId = board.id.toString();
    li.dataset.boardTitle = board.title;
    li.addEventListener("click", () => onClick(board));
    return li;
}

// The main UI function
export function showBoardSelector(
    token: string,
    recentBoards: Board[],
    triggerButton: HTMLButtonElement // Button that triggered the selector
): Promise<Board | null> {
    const overlayBox = triggerButton.closest('.arena-overlay') as HTMLDivElement | null;
    if (!overlayBox) {
        console.error("Cannot find parent overlay element.");
        return Promise.resolve(null); // Return rejected promise or null
    }

    const boardSelectorEl = overlayBox.querySelector('.arena-board-selector') as HTMLDivElement | null;
    const saveButton = overlayBox.querySelector('.arena-save-button') as HTMLButtonElement | null;
    const recentListEl = overlayBox.querySelector('.arena-recent-list') as HTMLUListElement | null;
    const searchInputEl = overlayBox.querySelector('.arena-search-input') as HTMLInputElement | null;
    const searchResultsListEl = overlayBox.querySelector('.arena-search-results-list') as HTMLUListElement | null;
    const searchResultsTitleEl = overlayBox.querySelector('.arena-search-results-title') as HTMLDivElement | null;
    const searchMessageEl = overlayBox.querySelector('.arena-search-message') as HTMLDivElement | null;
    const cancelButton = overlayBox.querySelector('.arena-cancel-button') as HTMLButtonElement | null;

    if (!boardSelectorEl || !saveButton || !recentListEl || !searchInputEl || !searchResultsListEl || !searchResultsTitleEl || !searchMessageEl || !cancelButton) {
        console.error("Board selector UI elements not found!");
        return Promise.resolve(null);
    }

    // Store the original inline style for left
    const originalOverlayLeft = overlayBox.style.left;

    // --- Reposition Overlay if Dialog would be off-screen --- 
    const overlayWidthEstimate = 200; // Estimate width when selector is active
    const currentOverlayRect = overlayBox.getBoundingClientRect();
    const paddingEstimate = 10; // Estimate padding added by --active class
    if (currentOverlayRect.left + overlayWidthEstimate + paddingEstimate > window.innerWidth) {
        const newLeft = window.innerWidth - overlayWidthEstimate - paddingEstimate - 50;
        overlayBox.style.left = `${window.scrollX + newLeft}px`;
    }
    // --- End Repositioning --- 

    // Ensure initial save button is hidden, selector is shown
    saveButton.style.display = 'none';
    boardSelectorEl.style.display = 'block';
    overlayBox.classList.add('arena-overlay--active'); // Add active class

    // --- Promise setup for returning selection --- 
    let resolvePromise: (value: Board | null) => void;
    const selectionPromise = new Promise<Board | null>((resolve) => {
        resolvePromise = resolve;
    });

    // --- Click Outside Handler --- 
    const clickOutsideHandler = (event: MouseEvent) => {
        // Check if the click target is outside the overlay box
        if (!overlayBox.contains(event.target as Node)) {
            cancelHandler(); // Reuse the cancel logic
        }
    };

    // --- Cleanup function --- 
    const cleanup = (selectedBoard: Board | null) => {
        // Remove specific listeners added here
        searchInputEl.removeEventListener("input", debouncedSearchHandler);
        cancelButton.removeEventListener("click", cancelHandler);
        document.removeEventListener("click", clickOutsideHandler, true); // Remove global listener (useCapture must match)
        // Remove items from lists to prevent listener leaks if re-shown
        recentListEl.innerHTML = '';
        searchResultsListEl.innerHTML = ''; 
        // Hide selector, show save button
        boardSelectorEl.style.display = 'none';
        saveButton.style.display = 'block';
        overlayBox.classList.remove('arena-overlay--active'); // Remove active class
        
        // Restore original overlay position
        overlayBox.style.left = originalOverlayLeft;

        // Resolve the main promise
        resolvePromise(selectedBoard);
    };

    // --- Event Handlers --- 
    const handleBoardSelection = (board: Board) => {
        cleanup(board);
    };

    const cancelHandler = () => {
        cleanup(null);
    };

    const searchHandler = async () => {
        const searchTerm = searchInputEl.value.trim();
        searchResultsListEl.innerHTML = ''; // Clear previous results
        searchMessageEl.textContent = '';
        searchResultsTitleEl.style.display = 'none';

        if (!searchTerm) {
            searchMessageEl.textContent = 'Type to search.';
            return;
        }

        searchMessageEl.textContent = 'Searching...';
        const results = await searchArenaBoards(token, searchTerm);
        searchMessageEl.textContent = ''; // Clear message

        if (results.length > 0) {
            searchResultsTitleEl.style.display = 'block';
            results.forEach(board => {
                searchResultsListEl.appendChild(createBoardListItem(board, handleBoardSelection));
            });
        } else {
            searchMessageEl.textContent = `No boards found for "${searchTerm}".`;
        }
    };

    // Debounce search calls
    const debouncedSearchHandler = debounce(searchHandler, 300);

    // --- Initialization --- 
    
    // Populate recent boards
    recentListEl.innerHTML = ''; // Clear first
    if (recentBoards.length > 0) {
        recentBoards.forEach(board => {
            recentListEl.appendChild(createBoardListItem(board, handleBoardSelection));
        });
    } else {
        // Optional: show message if no recents
        const li = document.createElement("li");
        li.textContent = "No recent boards.";
        li.style.fontStyle = "italic";
        li.style.color = "#aaa";
        recentListEl.appendChild(li);
    }

    // Add listeners
    searchInputEl.addEventListener("input", debouncedSearchHandler);
    cancelButton.addEventListener("click", cancelHandler);
    // Add global listener *after* a slight delay to prevent the initial click from closing it immediately
    // Use capture phase to catch clicks early
    setTimeout(() => {
        document.addEventListener("click", clickOutsideHandler, true);
    }, 0);

    // Set focus to search input for immediate typing
    searchInputEl.focus(); 
    searchInputEl.select(); // Select text if any exists

    // Return the promise that will resolve on selection/cancel
    return selectionPromise;
}