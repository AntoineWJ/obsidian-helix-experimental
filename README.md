I'm not a TypeScript developer; the additions were created with generous use of AI. Some of the problems seem to originate from the codemirror-helix and cannot be solved at the extension level.

The key-blocking fix works by checking for the cm-hx-block-cursor CSS class to detect whether Helix is in normal or select mode, since the internal API for this (modeField) isn't exported by codemirror-helix. 
