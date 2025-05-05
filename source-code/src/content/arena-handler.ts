import {
    ensureApiToken,
    getRecentBoards,
    saveToBoard,
    populateInitialRecentBoards,
    // Assuming Board type is exported or defined elsewhere, if not, add it here
    // searchArenaBoards // Not called directly from here
} from "../arena-api";
import { showBoardSelector } from "./core-overlay"; // We will create this function next

// Define expected detail structure for clarity
interface ArenaEventDetail {
  imgSrc: string;
  buttonElement: HTMLButtonElement;
  pageUrl: string;
}

// Define Board type if not exported from api
// type Board = { id: number; title: string }; // Removed - unused locally, inferred from imports

document.addEventListener("image:arena", (async (e: Event) => { // Use generic Event and cast inside
  // Type assertion for CustomEvent
  const customEvent = e as CustomEvent<ArenaEventDetail>;
  const { imgSrc, buttonElement, pageUrl } = customEvent.detail;

  // Find the status span and icon elements
  const statusSpan = buttonElement.querySelector('.arena-status-text') as HTMLSpanElement | null;
  const iconElement = buttonElement.querySelector('.arena-logo-icon') as HTMLImageElement | null;

  // Check if elements exist (should always be true based on core-overlay change)
  if (!statusSpan || !iconElement) {
    console.error("Arena handler: Could not find status span or icon element in button.");
    // Fallback or just disable?
    buttonElement.disabled = true;
    return;
  }

  const originalDisabled = buttonElement.disabled;
  
  // Function to set button state
  const setButtonState = (state: 'idle' | 'loading' | 'token' | 'saving' | 'success' | 'error') => {
    buttonElement.disabled = state !== 'idle';
    iconElement.style.display = state === 'idle' ? 'inline-block' : 'none';
    statusSpan.style.display = state !== 'idle' ? 'block' : 'none'; // Show span for all non-idle states

    switch (state) {
      case 'idle':
        statusSpan.textContent = '';
        buttonElement.disabled = originalDisabled; // Restore original disabled state
        break;
      case 'loading':
        statusSpan.textContent = '...';
        break;
      case 'token':
        statusSpan.textContent = '🔑';
        break;
      case 'saving':
        statusSpan.textContent = '💾';
        break;
      case 'success':
        statusSpan.textContent = '✅';
        break;
      case 'error':
        statusSpan.textContent = '❌';
        break;
    }
  };

  setButtonState('loading');

  try {
      // 1. Get Token
      const token = await ensureApiToken();
      if (!token) {
          setButtonState('token');
          setTimeout(() => setButtonState('idle'), 1500);
          return; 
      }

      // 1.5. Populate Initial Recents (if necessary)
      await populateInitialRecentBoards(token);

      // 2. Get Recent Boards (potentially updated by step 1.5)
      const recentBoards = await getRecentBoards();

      // 3. Show UI and Get Selection
      const selectedBoard = await showBoardSelector(token, recentBoards, buttonElement);

      if (!selectedBoard) {
          setButtonState('idle'); 
          return;
      }

      // 4. Save to Selected Board
      setButtonState('saving');
      const result = await saveToBoard(token, selectedBoard, imgSrc, pageUrl);

      if (result.success) {
          setButtonState('success');
      } else {
          setButtonState('error');
          setTimeout(() => setButtonState('idle'), 1500);
          return; // Don't reset immediately on error
      }

      // Reset button after a short delay on success
      setTimeout(() => setButtonState('idle'), 1000);

  } catch (error) {
      console.error("Error in Arena handler:", error);
      setButtonState('error');
      setTimeout(() => setButtonState('idle'), 1500);
  }

}));