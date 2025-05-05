/// <reference types="vite/client" />

// Add declaration for CSS module imports
declare module '*.css' {
    const content: { [className: string]: string };
    export default content;
} 