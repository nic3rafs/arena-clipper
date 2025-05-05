import { searchArenaBoards, type Board, ensureApiToken, getRecentBoards, saveToBoard, populateInitialRecentBoards } from "../arena-api"; // Need this for searching AND event handling
import '../style.css'; // Import the CSS file directly
import browser from "webextension-polyfill"; // Import the browser object

// Define Board type if needed (might be better in a shared types file later)
// type Board = { id: number; title: string }; // Removed - now imported

let activeOverlay: { img: HTMLImageElement, box: HTMLDivElement } | null = null;
let removalTimerId: number | null = null;
let isShowingFeedback = false; // Flag to prevent removal during feedback
const REMOVAL_DELAY = 10; // Delay before removing overlay

// --- Timer Management --- 
function clearRemovalTimer() {
    if (removalTimerId) {
        clearTimeout(removalTimerId);
        removalTimerId = null;
    }
}

function startRemovalTimer() {
    if (isShowingFeedback) { 
        return; 
    }
    clearRemovalTimer();
    if (activeOverlay) {
        removalTimerId = setTimeout(() => {
            if (activeOverlay?.box.parentNode) {
                activeOverlay.box.parentNode.removeChild(activeOverlay.box);
            }
            if (activeOverlay?.img) {
                 delete activeOverlay.img.dataset.arenaOverlay;
            }
            activeOverlay = null;
            removalTimerId = null;
        }, REMOVAL_DELAY) as any as number;
    }
}

// --- Overlay Creation --- 
function createOverlay(img: HTMLImageElement) {
    // If overlay already exists for this image, just ensure it doesn't get removed
    if (activeOverlay?.img === img) {
        clearRemovalTimer(); 
        return;
    }

    // If overlay exists for a different image, remove it immediately and clear its timer
    if (activeOverlay && activeOverlay.img !== img) {
         clearRemovalTimer();
         if (activeOverlay.box.parentNode) {
             activeOverlay.box.parentNode.removeChild(activeOverlay.box);
         }
         if (activeOverlay.img) {
            delete activeOverlay.img.dataset.arenaOverlay;
         }
         activeOverlay = null;
    }

    // --- Create the new overlay --- 
    img.dataset.arenaOverlay = "1";

    const box = document.createElement("div");
    box.className = "arena-overlay";
    box.style.position = "absolute";

    // Position Calculation
    const buttonWidthEstimate = 40;
    const imgRect = img.getBoundingClientRect();
    const scrollX = window.scrollX;
    const scrollY = window.scrollY;
    let finalTop = scrollY + imgRect.top + 5;
    let finalLeft = scrollX + imgRect.right - buttonWidthEstimate;
    finalTop = Math.max(0, finalTop);
    finalLeft = Math.max(0, finalLeft);
    box.style.top = finalTop + "px";
    box.style.left = finalLeft + "px";

    // Button
    const btn = document.createElement("button");
    btn.className = "arena-save-button";
    btn.dataset.evt = "arena";
    btn.setAttribute("aria-label", "Save to Are.na");

    // Logo Icon
    const logoUrl = browser.runtime.getURL("arena-logo.svg");
    const imgElement = document.createElement("img");
    imgElement.src = logoUrl;
    imgElement.alt = "Save to Are.na";
    imgElement.classList.add("arena-logo-icon");

    // Status Span
    const statusSpan = document.createElement("span");
    statusSpan.classList.add("arena-status-text");
    statusSpan.style.display = "none";

    btn.append(imgElement);
    btn.append(statusSpan);
    box.append(btn);

    // Board Selector UI
    const boardSelector = document.createElement("div");
    boardSelector.className = "arena-board-selector";
    boardSelector.style.display = "none";
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

    // Event Listener for Click (Dispatching)
    box.addEventListener("click", e => {
      const tgt = e.target as HTMLElement;
      const saveButtonClicked = tgt.closest<HTMLButtonElement>('.arena-save-button');
      if (saveButtonClicked && saveButtonClicked.dataset.evt) {
          e.stopPropagation();
          e.preventDefault();
          const buttonElement = saveButtonClicked as HTMLButtonElement;
          document.dispatchEvent(
            new CustomEvent(`image:${buttonElement.dataset.evt}`, {
              detail: {
                 imgSrc: img.src,
                 buttonElement: buttonElement,
                 pageUrl: window.location.href
               }
            })
          );
      } 
    });
    
    document.body.append(box);
    activeOverlay = { img, box };
    clearRemovalTimer();
}

// --- Document Event Listeners --- 
let docMouseoverTimeout: number | null = null;
const DOC_DEBOUNCE_DELAY = 30;

document.addEventListener("mouseover", e => {
    if (docMouseoverTimeout) clearTimeout(docMouseoverTimeout);
    const targetElement = e.target as HTMLElement;
    docMouseoverTimeout = setTimeout(() => {
        if (targetElement.tagName === "IMG" && !targetElement.closest('.arena-overlay')) {
            createOverlay(targetElement as HTMLImageElement);
        } else if (targetElement.closest('.arena-overlay')) {
            clearRemovalTimer();
        } else {
            startRemovalTimer();
        }
    }, DOC_DEBOUNCE_DELAY) as any as number;
});

document.addEventListener('mouseleave', () => {
    startRemovalTimer();
});

// --- Board Selector Logic --- 

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

function createBoardListItem(board: Board, onClick: (board: Board) => void): HTMLLIElement {
    const li = document.createElement("li");
    li.textContent = board.title;
    li.dataset.boardId = board.id.toString();
    li.dataset.boardTitle = board.title;
    li.addEventListener("click", () => onClick(board));
    return li;
}

export function showBoardSelector(
    token: string,
    recentBoards: Board[],
    triggerButton: HTMLButtonElement
): Promise<Board | null> {
    const overlayBox = triggerButton.closest('.arena-overlay') as HTMLDivElement | null;
    if (!overlayBox) {
        console.error("Cannot find parent overlay element.");
        return Promise.resolve(null);
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

    const originalOverlayLeft = overlayBox.style.left;

    // Reposition Overlay if Dialog would be off-screen
    const overlayWidthEstimate = 200;
    const currentOverlayRect = overlayBox.getBoundingClientRect();
    const paddingEstimate = 10;
    if (currentOverlayRect.left + overlayWidthEstimate + paddingEstimate > window.innerWidth) {
        const newLeft = window.innerWidth - overlayWidthEstimate - paddingEstimate - 50;
        overlayBox.style.left = `${window.scrollX + newLeft}px`;
    }

    saveButton.style.display = 'none';
    boardSelectorEl.style.display = 'block';
    overlayBox.classList.add('arena-overlay--active');

    let resolvePromise: (value: Board | null) => void;
    const selectionPromise = new Promise<Board | null>((resolve) => {
        resolvePromise = resolve;
    });

    const clickOutsideHandler = (event: MouseEvent) => {
        if (!overlayBox.contains(event.target as Node)) {
            cancelHandler();
        }
    };

    const cleanup = (selectedBoard: Board | null) => {
        searchInputEl.removeEventListener("input", debouncedSearchHandler);
        cancelButton.removeEventListener("click", cancelHandler);
        document.removeEventListener("click", clickOutsideHandler, true);
        recentListEl.innerHTML = '';
        searchResultsListEl.innerHTML = ''; 
        boardSelectorEl.style.display = 'none';
        saveButton.style.display = 'block';
        overlayBox.classList.remove('arena-overlay--active');
        overlayBox.style.left = originalOverlayLeft;
        resolvePromise(selectedBoard);
    };

    const handleBoardSelection = (board: Board) => {
        cleanup(board);
    };

    const cancelHandler = () => {
        cleanup(null);
    };

    const searchHandler = async () => {
        const searchTerm = searchInputEl.value.trim();
        searchResultsListEl.innerHTML = '';
        searchMessageEl.textContent = '';
        searchResultsTitleEl.style.display = 'none';
        if (!searchTerm) {
            searchMessageEl.textContent = 'Type to search.';
            return;
        }
        searchMessageEl.textContent = 'Searching...';
        const results = await searchArenaBoards(token, searchTerm);
        searchMessageEl.textContent = '';
        if (results.length > 0) {
            searchResultsTitleEl.style.display = 'block';
            results.forEach(board => {
                searchResultsListEl.appendChild(createBoardListItem(board, handleBoardSelection));
            });
        } else {
            searchMessageEl.textContent = `No boards found for "${searchTerm}".`;
        }
    };

    const debouncedSearchHandler = debounce(searchHandler, 300);
    
    recentListEl.innerHTML = '';
    if (recentBoards.length > 0) {
        recentBoards.forEach(board => {
            recentListEl.appendChild(createBoardListItem(board, handleBoardSelection));
        });
    } else {
        const li = document.createElement("li");
        li.textContent = "No recent boards.";
        li.style.fontStyle = "italic";
        li.style.color = "#aaa";
        recentListEl.appendChild(li);
    }

    searchInputEl.addEventListener("input", debouncedSearchHandler);
    cancelButton.addEventListener("click", cancelHandler);
    setTimeout(() => {
        document.addEventListener("click", clickOutsideHandler, true);
    }, 0);

    searchInputEl.focus(); 
    searchInputEl.select();

    return selectionPromise;
}

// --- Arena Event Handling Logic (Moved from arena-handler.ts) ---

interface ArenaEventDetail {
    imgSrc: string;
    buttonElement: HTMLButtonElement;
    pageUrl: string;
}

document.addEventListener("image:arena", (async (e: Event) => {
    const customEvent = e as CustomEvent<ArenaEventDetail>;
    const { imgSrc, buttonElement, pageUrl } = customEvent.detail;
  
    const statusSpan = buttonElement.querySelector('.arena-status-text') as HTMLSpanElement | null;
    const iconElement = buttonElement.querySelector('.arena-logo-icon') as HTMLImageElement | null;
  
    if (!statusSpan || !iconElement) {
      console.error("Arena handler: Could not find status span or icon element in button.");
      buttonElement.disabled = true;
      return;
    }
  
    const originalDisabled = buttonElement.disabled;
    
    const setButtonState = (state: 'idle' | 'loading' | 'token' | 'saving' | 'success' | 'error') => {
      isShowingFeedback = ['loading', 'token', 'saving', 'success', 'error'].includes(state);
      if (isShowingFeedback) {
        clearRemovalTimer();
      }

      buttonElement.disabled = state !== 'idle';
      iconElement.style.display = state === 'idle' ? 'inline-block' : 'none';
      statusSpan.style.display = state !== 'idle' ? 'block' : 'none';
      
      switch (state) {
        case 'idle':
          statusSpan.textContent = '';
          buttonElement.disabled = originalDisabled;
          isShowingFeedback = false;
          break;
        case 'loading': statusSpan.textContent = '...'; break;
        case 'token': statusSpan.textContent = '🔑'; break;
        case 'saving': statusSpan.textContent = '💾'; break;
        case 'success': statusSpan.textContent = '✅'; break;
        case 'error': statusSpan.textContent = '❌'; break;
      }
    };

    const hideFeedbackAndRemove = () => {
        isShowingFeedback = false;
        if (activeOverlay?.box.parentNode && activeOverlay.box === buttonElement.closest('.arena-overlay')) {
            activeOverlay.box.parentNode.removeChild(activeOverlay.box);
            delete activeOverlay.img.dataset.arenaOverlay;
            activeOverlay = null;
        }
    };

    setButtonState('loading');
  
    try {
        const token = await ensureApiToken();
        if (!token) {
            setButtonState('token');
            setTimeout(hideFeedbackAndRemove, 1500);
            return; 
        }
  
        await populateInitialRecentBoards(token);
        const recentBoards = await getRecentBoards();
        const selectedBoard = await showBoardSelector(token, recentBoards, buttonElement);
  
        if (!selectedBoard) {
            setButtonState('idle');
            return;
        }
  
        setButtonState('saving');
        const result = await saveToBoard(token, selectedBoard, imgSrc, pageUrl);
  
        if (result.success) {
            setButtonState('success');
            setTimeout(hideFeedbackAndRemove, 1000); 
        } else {
            setButtonState('error');
            setTimeout(hideFeedbackAndRemove, 1500);
        }
  
    } catch (error) {
        console.error("Error in Arena handler:", error);
        setButtonState('error');
        setTimeout(hideFeedbackAndRemove, 1500);
    }
  
}));